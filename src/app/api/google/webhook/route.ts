import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseServer'
import { getGoogleAccessToken } from '@/lib/googleAuth'
import { registerCalendarWatch, generateWebhookToken } from '@/lib/googleWatch'

export async function POST(request: Request) {
  const channelId = request.headers.get('X-Goog-Channel-ID')
  const channelToken = request.headers.get('X-Goog-Channel-Token')
  const resourceState = request.headers.get('X-Goog-Resource-State')

  if (!channelId) {
    return NextResponse.json({ error: 'No channel ID' }, { status: 400 })
  }

  // Token ellenőrzés — minden kérésnél, a sync handshake előtt is
  const expectedToken = generateWebhookToken(channelId)
  if (!channelToken || channelToken !== expectedToken) {
    console.warn(`[webhook] Invalid token for channel ${channelId}`)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Első handshake értesítő — nincs teendő
  if (resourceState === 'sync') {
    return NextResponse.json({ ok: true })
  }

  // Melyik staff/tenant-hoz tartozik ez a channel?
  const { data: staffData } = await supabaseAdmin
    .from('staff')
    .select('*')
    .eq('google_channel_id', channelId)
    .maybeSingle()

  const { data: tenantData } = staffData ? { data: null } : await supabaseAdmin
    .from('tenants')
    .select('*')
    .eq('google_channel_id', channelId)
    .maybeSingle()

  const entity = staffData || tenantData
  if (!entity) {
    return NextResponse.json({ error: 'Unknown channel' }, { status: 404 })
  }

  const isStaff = !!staffData
  const refreshToken: string = entity.google_refresh_token
  const calendarId: string = entity.google_calendar_id
  const syncToken: string | null = entity.google_sync_token
  const tenantId: string = isStaff ? entity.tenant_id : entity.id
  const entityId: string = entity.id

  if (!refreshToken || !calendarId) {
    return NextResponse.json({ error: 'No credentials' }, { status: 400 })
  }

  const context = isStaff
    ? { type: 'staff' as const, staffId: entityId }
    : { type: 'tenant' as const, tenantId: entityId }

  const accessToken = await getGoogleAccessToken(refreshToken, context)
  if (!accessToken) {
    return NextResponse.json({ error: 'Token expired' }, { status: 400 })
  }

  // Watch lejárat közeleg (7 napon belül) → megújítás
  if (entity.google_channel_expiry) {
    const expiry = new Date(entity.google_channel_expiry)
    const daysLeft = (expiry.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
    if (daysLeft < 7) {
      const target = isStaff
        ? { type: 'staff' as const, staffId: entityId, refreshToken, calendarId }
        : { type: 'tenant' as const, tenantId: entityId, refreshToken, calendarId }
      registerCalendarWatch(target).catch(e => console.error('[webhook] Watch renewal failed:', e))
    }
  }

  // Változott események lekérése (inkrementális sync)
  let eventsUrl = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?singleEvents=true`
  if (syncToken) {
    eventsUrl += `&syncToken=${encodeURIComponent(syncToken)}`
  } else {
    eventsUrl += `&timeMin=${new Date().toISOString()}&maxResults=250`
  }

  const eventsRes = await fetch(eventsUrl, { headers: { Authorization: `Bearer ${accessToken}` } })
  const eventsData = await eventsRes.json()

  // 410 Gone = syncToken lejárt → teljes újraszinkron
  if (eventsData.error?.code === 410) {
    const fullUrl = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?singleEvents=true&timeMin=${new Date().toISOString()}&maxResults=250`
    const fullRes = await fetch(fullUrl, { headers: { Authorization: `Bearer ${accessToken}` } })
    const fullData = await fullRes.json()
    if (fullData.nextSyncToken) {
      await saveSyncToken(isStaff, entityId, fullData.nextSyncToken)
    }
    return NextResponse.json({ ok: true, note: 'sync_reset' })
  }

  if (eventsData.nextSyncToken) {
    await saveSyncToken(isStaff, entityId, eventsData.nextSyncToken)
  }

  const changedEvents: Record<string, unknown>[] = eventsData.items || []

  for (const event of changedEvents) {
    await processChangedEvent(event, tenantId)
  }

  return NextResponse.json({ ok: true })
}

async function saveSyncToken(isStaff: boolean, entityId: string, token: string) {
  const table = isStaff ? 'staff' : 'tenants'
  await supabaseAdmin.from(table).update({ google_sync_token: token }).eq('id', entityId)
}

async function processChangedEvent(
  event: Record<string, unknown>,
  tenantId: string
) {
  const googleEventId = event.id as string
  if (!googleEventId) return

  // Keresünk egy megerősített foglalást ezzel az event_id-vel
  const { data: booking } = await supabaseAdmin
    .from('bookings')
    .select('*, services(name), tenants(name, timezone, email_from_name)')
    .eq('google_event_id', googleEventId)
    .eq('status', 'confirmed')
    .maybeSingle()

  if (!booking) return

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
  const customerName = `${booking.customer_last_name} ${booking.customer_first_name}`
  const serviceName = (booking.services as { name: string } | null)?.name || ''
  const businessName = (booking.tenants as { name: string } | null)?.name || ''
  const timezone: string = (booking.tenants as { timezone?: string } | null)?.timezone || 'Europe/Budapest'

  // TÖRÖLT esemény a Google Naptárban
  if (event.status === 'cancelled') {
    await supabaseAdmin
      .from('bookings')
      .update({ status: 'cancelled' })
      .eq('google_event_id', googleEventId)

    if (booking.customer_email) {
      const cancelDate = booking.start_time.slice(0, 10)
      const cancelSlot = booking.start_time.slice(11, 16)
      await fetch(`${siteUrl}/api/email/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: booking.customer_email,
          emailType: 'cancel',
          customerName,
          serviceName,
          date: cancelDate,
          slot: cancelSlot,
          businessName,
          tenantId,
        }),
      })
      console.log(`[webhook] Cancellation email sent for booking ${booking.id}`)
    }
    return
  }

  // Megváltozott időpont?
  const eventStart = event.start as { dateTime?: string; date?: string } | undefined
  if (!eventStart?.dateTime) return // egész napos esemény, kihagyjuk

  const newStartDate = new Date(eventStart.dateTime)

  // Google-ben lévő időpont konvertálása a tenant timezone-ra
  const gcalDateLocal = new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(newStartDate)
  const gcalTimeLocal = new Intl.DateTimeFormat('hu-HU', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(newStartDate)

  // DB-ben tárolt dátum és időpont (lokális formátumban)
  const dbDate = booking.start_time.slice(0, 10)
  const dbTime = booking.start_time.slice(11, 16)

  if (gcalDateLocal === dbDate && gcalTimeLocal === dbTime) return // Nem változott az időpont

  // Időpont módosítva → frissítjük a DB-t és reschedule emailt küldünk
  const eventEnd = event.end as { dateTime?: string } | undefined
  const newEndStr = eventEnd?.dateTime
    ? `${new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(new Date(eventEnd.dateTime))}T${new Intl.DateTimeFormat('hu-HU', { timeZone: timezone, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(eventEnd.dateTime))}:00`
    : booking.end_time

  await supabaseAdmin
    .from('bookings')
    .update({
      start_time: `${gcalDateLocal}T${gcalTimeLocal}:00`,
      end_time: newEndStr,
    })
    .eq('id', booking.id)

  if (booking.customer_email) {
    const dateFormatted = newStartDate.toLocaleDateString('hu-HU', {
      timeZone: timezone,
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      weekday: 'long',
    })

    await fetch(`${siteUrl}/api/email/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: booking.customer_email,
        emailType: 'reschedule',
        customerName,
        serviceName,
        date: dateFormatted,
        slot: gcalTimeLocal,
        businessName,
        cancelToken: booking.cancel_token,
        tenantId,
      }),
    })
    console.log(`[webhook] Reschedule email sent for booking ${booking.id}: ${dbDate} ${dbTime} → ${gcalDateLocal} ${gcalTimeLocal}`)
  }
}
