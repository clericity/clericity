import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseServer'
import { getGoogleAccessToken } from '@/lib/googleAuth'
import { getIP, checkRateLimit, rateLimitResponse } from '@/lib/rateLimit'
import { isValidUUID, isValidDate, isValidTime } from '@/lib/validate'
import { writeAuditLog } from '@/lib/audit'

export async function POST(request: Request) {
  if (!checkRateLimit(getIP(request), 'bookings/reschedule', 10, 10 * 60 * 1000)) {
    return rateLimitResponse()
  }

  const { token, date, slot, duration } = await request.json()

  if (!isValidUUID(token)) {
    return NextResponse.json({ error: 'Érvénytelen token.' }, { status: 400 })
  }
  if (!isValidDate(date) || !isValidTime(slot)) {
    return NextResponse.json({ error: 'Érvénytelen dátum vagy időpont.' }, { status: 400 })
  }
  const parsedDuration = Number(duration)
  if (!Number.isInteger(parsedDuration) || parsedDuration < 5 || parsedDuration > 480) {
    return NextResponse.json({ error: 'Érvénytelen időtartam.' }, { status: 400 })
  }

  // Foglalás lekérése token alapján
  const { data: booking, error: bookingError } = await supabaseAdmin
    .from('bookings')
    .select('*, staff:staff_id(*), tenants(name, timezone, email_from_name, email_subject, email_body), services(name)')
    .eq('cancel_token', token)
    .single()

  if (bookingError || !booking) {
    return NextResponse.json({ error: 'Foglalás nem található' }, { status: 404 })
  }

  if (booking.status === 'cancelled') {
    return NextResponse.json({ error: 'Ez a foglalás már le van mondva' }, { status: 400 })
  }

  const staff = booking.staff
  const tenant = booking.tenants
  const timezone = tenant?.timezone || 'Europe/Budapest'

  if (!staff?.google_refresh_token || !staff?.google_calendar_id) {
    return NextResponse.json({ error: 'Nincs elérhető naptár' }, { status: 400 })
  }

  const accessToken = await getGoogleAccessToken(staff.google_refresh_token)

  // google_event_id nullra állítva ELŐBB → webhook ne küldjön dupla emailt a törlésre
  if (booking.google_event_id) {
    await supabaseAdmin
      .from('bookings')
      .update({ google_event_id: null })
      .eq('id', booking.id)

    try {
      await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(staff.google_calendar_id)}/events/${booking.google_event_id}`,
        { method: 'DELETE', headers: { Authorization: `Bearer ${accessToken}` } }
      )
    } catch (e) {
      console.error('Régi esemény törlési hiba:', e)
    }
  }

  // Új időpont kiszámítása
  const startDateTime = `${date}T${slot}:00`
  const [slotHour, slotMin] = slot.split(':').map(Number)
  const endMin = slotMin + duration
  const endHour = slotHour + Math.floor(endMin / 60)
  const endTime = `${endHour.toString().padStart(2, '0')}:${(endMin % 60).toString().padStart(2, '0')}`
  const endDateTime = `${date}T${endTime}:00`

  // Új Google Calendar esemény létrehozása
  const event = {
    summary: `${booking.customer_last_name} ${booking.customer_first_name} - ${booking.customer_email}`,
    description: `Telefon: ${booking.customer_phone}\nEmail: ${booking.customer_email}\n(Átütemezett foglalás)`,
    start: { dateTime: startDateTime, timeZone: timezone },
    end: { dateTime: endDateTime, timeZone: timezone },
  }

  const calResponse = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(staff.google_calendar_id)}/events`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(event),
    }
  )
  const calData = await calResponse.json()

  if (!calData.id) {
    return NextResponse.json({ error: 'Google Calendar hiba' }, { status: 400 })
  }

  // Foglalás frissítése az adatbázisban
  const { error: updateError } = await supabaseAdmin
    .from('bookings')
    .update({
      start_time: startDateTime,
      end_time: endDateTime,
      google_event_id: calData.id,
    })
    .eq('id', booking.id)

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 400 })
  }

  await writeAuditLog({
    tenantId: booking.tenant_id,
    userId: null,
    action: 'booking.reschedule',
    entityType: 'booking',
    entityId: booking.id,
    metadata: { old_start_time: booking.start_time, new_start_time: startDateTime },
  })

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
  const rescheduleCustomerName = `${booking.customer_last_name} ${booking.customer_first_name}`
  const rescheduleServiceName = booking.services?.name || ''

  // Visszaigazoló email küldése az új időponttal
  await fetch(`${siteUrl}/api/email/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      to: booking.customer_email,
      customerName: rescheduleCustomerName,
      serviceName: rescheduleServiceName,
      date,
      slot,
      duration,
      businessName: tenant?.name || '',
      cancelToken: token,
      tenantId: booking.tenant_id,
      emailType: 'reschedule',
    }),
  })

  const staffEmail = (staff as { email?: string } | null)?.email
  if (staffEmail) {
    await fetch(`${siteUrl}/api/email/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: staffEmail,
        emailType: 'staff_notification',
        notificationType: 'reschedule',
        customerName: rescheduleCustomerName,
        customerEmail: booking.customer_email,
        customerPhone: booking.customer_phone,
        serviceName: rescheduleServiceName,
        date,
        slot,
        businessName: tenant?.name || '',
      }),
    })
  }

  return NextResponse.json({ success: true })
}
