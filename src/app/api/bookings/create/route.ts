import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseServer'
import { getGoogleAccessToken } from '@/lib/googleAuth'

export async function POST(request: Request) {
  const { tenantId, serviceId, staffId, date, slot, duration, firstName, lastName, email, phone, notes } = await request.json()

  // Blacklist ellenőrzés (email VAGY telefonszám alapján, tenant-szinten)
  if (tenantId && (email || phone?.trim())) {
    const orParts: string[] = []
    if (email) orParts.push(`email.eq.${email.toLowerCase().trim()}`)
    if (phone?.trim()) orParts.push(`phone.eq.${phone.trim()}`)

    const { data: blacklisted } = await supabaseAdmin
      .from('staff_blacklist')
      .select('id')
      .eq('tenant_id', tenantId)
      .or(orParts.join(','))
      .limit(1)

    if (blacklisted && blacklisted.length > 0) {
      return NextResponse.json({ error: 'Ez az email cím vagy telefonszám nem tud foglalni ehhez az üzlethez.' }, { status: 403 })
    }
  }

  // Havi foglalás limit csomagonként
  const BOOKING_LIMITS: Record<string, number> = { free: 100, basic: 300, pro: 1000, business: 5000 }

  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString()

  const { data: tenantPlan } = await supabaseAdmin
    .from('tenants').select('plan').eq('id', tenantId).single()

  const currentPlan = tenantPlan?.plan || 'free'
  const bookingLimit = BOOKING_LIMITS[currentPlan] ?? 100

  const { count } = await supabaseAdmin
    .from('bookings')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .neq('status', 'cancelled')
    .gte('start_time', monthStart)
    .lt('start_time', monthEnd)

  if ((count ?? 0) >= bookingLimit) {
    return NextResponse.json(
      { error: 'free_plan_limit', message: `Ez a vállalkozás elérte a havi ${bookingLimit} foglalás korlátját. Kérjük, próbálkozz később.` },
      { status: 403 }
    )
  }

  const [tenantResult, serviceResult, staffResult] = await Promise.all([
    supabaseAdmin.from('tenants').select('name, timezone, google_refresh_token, google_calendar_id').eq('id', tenantId).single(),
    supabaseAdmin.from('services').select('name, buffer_minutes').eq('id', serviceId).single(),
    staffId
      ? supabaseAdmin.from('staff').select('*').eq('id', staffId).single()
      : supabaseAdmin.from('staff').select('*').eq('tenant_id', tenantId).not('google_refresh_token', 'is', null).limit(1).single(),
  ])

  const tenant = tenantResult.data
  const selectedService = serviceResult.data
  const bufferMinutes = selectedService?.buffer_minutes || 0
  const staff = staffResult.data
  const timezone = tenant?.timezone || 'Europe/Budapest'

  // Token és calendar ID meghatározása — staff tokent próbálja először, fallback a tenant tokenre
  let refreshToken: string | null = null
  let calendarId: string | null = null

  if (staff?.google_refresh_token) {
    refreshToken = staff.google_refresh_token
    calendarId = staff.google_calendar_id
  } else if (staff?.is_owner || !staffId) {
    refreshToken = tenant?.google_refresh_token ?? null
    calendarId = tenant?.google_calendar_id ?? null
  }

  if (!refreshToken || !calendarId) {
    return NextResponse.json({ error: 'Nincs elérhető naptár ehhez a munkatárshoz.' }, { status: 400 })
  }

  let accessToken = await getGoogleAccessToken(refreshToken)

  // Ha a munkás saját tokenje lejárt, próbáljuk a tenant tokent
  if (!accessToken && staff?.google_refresh_token && (staff?.is_owner || !staffId) && tenant?.google_refresh_token) {
    console.log('[create] Staff token failed, trying tenant token as fallback')
    refreshToken = tenant.google_refresh_token
    calendarId = tenant.google_calendar_id
    accessToken = await getGoogleAccessToken(tenant.google_refresh_token)
  }

  if (!accessToken) {
    return NextResponse.json({ error: 'Google token lejárt. A naptár összekötést meg kell újítani a beállításokban.' }, { status: 400 })
  }

  // Időpont kiszámítása
  const startDateTime = `${date}T${slot}:00`
  const [slotHour, slotMin] = slot.split(':').map(Number)

  // Tényleges vége (DB-be ez kerül)
  const endMin = slotMin + duration
  const endHour = slotHour + Math.floor(endMin / 60)
  const endMinFinal = endMin % 60
  const endTime = `${endHour.toString().padStart(2, '0')}:${endMinFinal.toString().padStart(2, '0')}`
  const endDateTime = `${date}T${endTime}:00`

  // Google Calendar vége = tényleges vége + buffer (így a naptár blokkolja a pufferidőt is)
  const calEndMin = slotMin + duration + bufferMinutes
  const calEndHour = slotHour + Math.floor(calEndMin / 60)
  const calEndMinFinal = calEndMin % 60
  const calEndTime = `${calEndHour.toString().padStart(2, '0')}:${calEndMinFinal.toString().padStart(2, '0')}`
  const calEndDateTime = `${date}T${calEndTime}:00`

  // Google Calendar esemény
  const calResponse = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId!)}/events`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        summary: `${lastName} ${firstName} - ${selectedService?.name || ''}`,
        description: `Telefon: ${phone}\nEmail: ${email}${notes ? `\nMegjegyzés: ${notes}` : ''}${bufferMinutes > 0 ? `\n\n⏱ ${bufferMinutes} perc buffer (takarítás/felkészülés)` : ''}`,
        start: { dateTime: startDateTime, timeZone: timezone },
        end: { dateTime: calEndDateTime, timeZone: timezone },
      }),
    }
  )

  const calData = await calResponse.json()
  if (!calData.id) {
    console.error('[Google Calendar] Event creation failed:', JSON.stringify(calData))
    const gcalError = calData?.error?.message || calData?.error?.status || 'Ismeretlen hiba'
    return NextResponse.json({ error: `Google Calendar hiba: ${gcalError}` }, { status: 400 })
  }

  const { data: booking, error } = await supabaseAdmin
    .from('bookings')
    .insert({
      tenant_id: tenantId,
      service_id: serviceId,
      staff_id: staff?.id || null,
      google_event_id: calData.id,
      customer_first_name: firstName,
      customer_last_name: lastName,
      customer_email: email,
      customer_phone: phone,
      start_time: startDateTime,
      end_time: endDateTime,
      status: 'confirmed',
      notes: notes || null,
    })
    .select()
    .single()

  if (error) {
    // Dupla foglalás constraint hiba
    if (error.message?.includes('no_overlap') || error.message?.includes('exclusion') || error.code === '23P01') {
      return NextResponse.json({ error: 'slot_taken', message: 'Ez az időpont sajnos már foglalt.' }, { status: 409 })
    }
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  // Várólistáról eltávolítás ha ő foglalta le
  if (email) {
    await supabaseAdmin
      .from('waitlist')
      .update({ status: 'booked' })
      .eq('tenant_id', tenantId)
      .eq('customer_email', email.toLowerCase())
      .in('status', ['waiting', 'notified'])
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'

  await fetch(`${siteUrl}/api/email/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      to: email,
      customerName: `${lastName} ${firstName}`,
      serviceName: selectedService?.name || '',
      date,
      slot,
      duration,
      businessName: tenant?.name || '',
      cancelToken: booking?.cancel_token || '',
      tenantId,
      staffName: staff?.name || null,
      staffPhoto: staff?.profile_photo || null,
    }),
  })

  if (staffId && staff?.email) {
    await fetch(`${siteUrl}/api/email/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: staff.email,
        emailType: 'staff_notification',
        notificationType: 'new_booking',
        customerName: `${lastName} ${firstName}`,
        customerEmail: email,
        customerPhone: phone,
        serviceName: selectedService?.name || '',
        date,
        slot,
        businessName: tenant?.name || '',
      }),
    })
  }

  return NextResponse.json({ success: true })
}
