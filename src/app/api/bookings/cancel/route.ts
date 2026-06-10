import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseServer'
import { getGoogleAccessToken } from '@/lib/googleAuth'
import { getIP, checkRateLimit, rateLimitResponse } from '@/lib/rateLimit'
import { isValidUUID } from '@/lib/validate'

export async function POST(request: Request) {
  if (!checkRateLimit(getIP(request), 'bookings/cancel', 10, 10 * 60 * 1000)) {
    return rateLimitResponse()
  }

  const { token } = await request.json()

  if (!isValidUUID(token)) {
    return NextResponse.json({ error: 'Érvénytelen token.' }, { status: 400 })
  }

  // Foglalás lekérése token alapján
  const { data: booking, error: bookingError } = await supabaseAdmin
    .from('bookings')
    .select('*, staff:staff_id(*), services(name), tenants(name, google_refresh_token, google_calendar_id)')
    .eq('cancel_token', token)
    .single()

  if (bookingError || !booking) {
    return NextResponse.json({ error: 'Foglalás nem található' }, { status: 404 })
  }

  if (booking.status === 'cancelled') {
    return NextResponse.json({ error: 'Ez a foglalás már le van mondva' }, { status: 400 })
  }

  // DB frissítés ELŐBB (webhook ne küldjön dupla emailt a Google törlésre)
  const { error } = await supabaseAdmin
    .from('bookings')
    .update({ status: 'cancelled' })
    .eq('cancel_token', token)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  // Google Calendar esemény törlése — ugyanolyan fallback logika mint create-nél
  if (booking.google_event_id) {
    try {
      const staff = booking.staff as { google_refresh_token?: string; google_calendar_id?: string; is_owner?: boolean } | null
      const tenant = booking.tenants as { google_refresh_token?: string; google_calendar_id?: string } | null

      let refreshToken: string | null = null
      let calendarId: string | null = null

      if (staff?.google_refresh_token) {
        refreshToken = staff.google_refresh_token
        calendarId = staff.google_calendar_id ?? null
      } else if (tenant?.google_refresh_token) {
        refreshToken = tenant.google_refresh_token
        calendarId = tenant.google_calendar_id ?? null
      }

      if (refreshToken && calendarId) {
        const accessToken = await getGoogleAccessToken(refreshToken)
        if (accessToken) {
          await fetch(
            `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${booking.google_event_id}`,
            {
              method: 'DELETE',
              headers: { Authorization: `Bearer ${accessToken}` },
            }
          )
        }
      }
    } catch (e) {
      console.error('Google Calendar törlés hiba:', e)
    }
  }

  // Lemondási visszaigazoló email küldése
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
  const cancelDate = booking.start_time.slice(0, 10)
  const cancelSlot = booking.start_time.slice(11, 16)
  const cancelServiceName = (booking.services as { name: string } | null)?.name || ''
  const cancelBusinessName = (booking.tenants as { name: string } | null)?.name || ''
  const cancelCustomerName = `${booking.customer_last_name} ${booking.customer_first_name}`

  await fetch(`${siteUrl}/api/email/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      to: booking.customer_email,
      customerName: cancelCustomerName,
      serviceName: cancelServiceName,
      date: cancelDate,
      slot: cancelSlot,
      businessName: cancelBusinessName,
      tenantId: booking.tenant_id,
      emailType: 'cancel',
    }),
  })

  const staffEmail = (booking.staff as { email?: string } | null)?.email
  if (staffEmail) {
    await fetch(`${siteUrl}/api/email/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: staffEmail,
        emailType: 'staff_notification',
        notificationType: 'cancel',
        customerName: cancelCustomerName,
        customerEmail: booking.customer_email,
        customerPhone: booking.customer_phone,
        serviceName: cancelServiceName,
        date: cancelDate,
        slot: cancelSlot,
        businessName: cancelBusinessName,
      }),
    })
  }

  // Várólistások értesítése — csak akik ugyanerre a munkásra (vagy bármely munkásra) várnak
  let waitlistQuery = supabaseAdmin
    .from('waitlist')
    .select('*')
    .eq('tenant_id', booking.tenant_id)
    .in('status', ['waiting', 'notified'])
    .or(`service_id.is.null,service_id.eq.${booking.service_id}`)
    .order('created_at', { ascending: true })

  if (booking.staff_id) {
    waitlistQuery = waitlistQuery.or(`staff_id.is.null,staff_id.eq.${booking.staff_id}`)
  }

  const { data: waitlistEntries } = await waitlistQuery

  if (waitlistEntries && waitlistEntries.length > 0) {
    const [tenantData, serviceData] = await Promise.all([
      supabaseAdmin.from('tenants').select('name, slug').eq('id', booking.tenant_id).single(),
      supabaseAdmin.from('services').select('name, duration_minutes').eq('id', booking.service_id).single(),
    ])

    const tenant = tenantData.data
    const service = serviceData.data
    const slug = tenant?.slug || ''

    // Felszabadult időpont adatai
    const freedDate = booking.start_time.slice(0, 10) // YYYY-MM-DD
    const freedSlot = booking.start_time.slice(11, 16) // HH:MM

    for (const entry of waitlistEntries) {
      // Ha a várólistás más szolgáltatást akart, ellenőrzük hogy belefér-e az időbe
      if (entry.service_id && entry.service_id !== booking.service_id) {
        const { data: wantedService } = await supabaseAdmin
          .from('services').select('duration_minutes').eq('id', entry.service_id).single()
        // Ha a kívánt szolgáltatás hosszabb mint a felszabadult slot, kihagyjuk
        if (wantedService && wantedService.duration_minutes > (service?.duration_minutes || 0)) continue
      }

      const customerName = [entry.customer_last_name, entry.customer_first_name].filter(Boolean).join(' ') || entry.customer_email

      // Előtöltött foglalási link
      const params = new URLSearchParams({
        preService: booking.service_id,
        preDate: freedDate,
        preSlot: freedSlot,
        ...(booking.staff_id && { preStaff: booking.staff_id }),
      })
      const bookingUrl = slug ? `${siteUrl}/${slug}?${params.toString()}` : siteUrl

      await fetch(`${siteUrl}/api/email/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: entry.customer_email,
          emailType: 'waitlist_notify',
          customerName,
          businessName: tenant?.name || '',
          bookingUrl,
          freedDate,
          freedSlot,
          serviceName: service?.name || '',
          serviceDuration: service?.duration_minutes || 0,
          tenantId: booking.tenant_id,
        }),
      })

      await supabaseAdmin
        .from('waitlist')
        .update({ status: 'notified', notified_at: new Date().toISOString() })
        .eq('id', entry.id)
    }
  }

  return NextResponse.json({ success: true })
}