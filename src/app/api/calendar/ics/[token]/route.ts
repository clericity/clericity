import { supabaseAdmin } from '@/lib/supabaseServer'
import { NextRequest } from 'next/server'

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ token: string }> }
) {
  const { token } = await context.params

  const { data: booking } = await supabaseAdmin
    .from('bookings')
    .select('*, services(name), tenants(name)')
    .eq('cancel_token', token)
    .single()

  if (!booking) {
    return new Response('Not found', { status: 404 })
  }

  const toIcsDate = (str: string) =>
    str.replace(/[-:]/g, '').slice(0, 15)

  const startStr = toIcsDate(booking.start_time)
  const endStr = toIcsDate(booking.end_time)

  const serviceName =
    (booking.services as { name: string } | null)?.name || 'Foglalás'

  const businessName =
    (booking.tenants as { name: string } | null)?.name || 'Clericity'

  const customerName =
    `${booking.customer_last_name} ${booking.customer_first_name}`

  const stamp = toIcsDate(new Date().toISOString()) + 'Z'

  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Clericity//Booking//HU',
    'BEGIN:VEVENT',
    `UID:${booking.id}@clericity`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${startStr}`,
    `DTEND:${endStr}`,
    `SUMMARY:${serviceName} – ${businessName}`,
    `DESCRIPTION:Vendég: ${customerName}\\nEmail: ${booking.customer_email}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n')

  return new Response(ics, {
    headers: {
      'Content-Type': 'text/calendar;charset=utf-8',
      'Content-Disposition': 'attachment; filename="foglalas.ics"',
    },
  })
}