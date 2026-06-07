import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseServer'
import { getGoogleAccessToken } from '@/lib/googleAuth'

// Normalizálja az időpontot RFC 3339 formátumra
function toRFC3339(dateStr: string): string {
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) throw new Error(`Érvénytelen dátum: ${dateStr}`)
  return d.toISOString()
}

interface ImportedEvent {
  name: string
  email: string
  phone?: string
  next_appointment: string
}

export async function POST(request: Request) {
  const { bookingIds, importedEvents, tenantId } = await request.json() as {
    bookingIds: string[]
    importedEvents: ImportedEvent[]
    tenantId: string
  }

  // Google credentials — tenant tábla, aztán owner staff
  const [{ data: tenantRow }, { data: ownerStaff }] = await Promise.all([
    supabaseAdmin.from('tenants').select('google_refresh_token, google_calendar_id, timezone').eq('id', tenantId).single(),
    supabaseAdmin.from('staff').select('google_refresh_token, google_calendar_id').eq('tenant_id', tenantId).eq('is_owner', true).single(),
  ])

  const refreshToken = tenantRow?.google_refresh_token || ownerStaff?.google_refresh_token
  const calendarIdRaw = tenantRow?.google_calendar_id || ownerStaff?.google_calendar_id

  if (!refreshToken || !calendarIdRaw) {
    return NextResponse.json({ error: 'Nincs összekapcsolt Google Calendar. Kösd össze a Beállítások menüben.' }, { status: 400 })
  }

  let accessToken: string
  try {
    const token = await getGoogleAccessToken(refreshToken)
    if (!token) throw new Error('Nem sikerült Google access tokent szerezni.')
    accessToken = token
  } catch (e) {
    return NextResponse.json({ error: `Google hitelesítés sikertelen: ${e instanceof Error ? e.message : String(e)}` }, { status: 401 })
  }

  const calendarId = encodeURIComponent(calendarIdRaw)
  const created: string[] = []
  const errors: string[] = []

  async function createEvent(summary: string, description: string, startIso: string, endIso: string, label: string): Promise<string | null> {
    const event = {
      summary,
      description,
      start: { dateTime: startIso },
      end: { dateTime: endIso },
    }
    const res = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events`,
      { method: 'POST', headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify(event) }
    )
    if (res.ok) {
      const data = await res.json()
      created.push(label)
      return data.id as string
    } else {
      const body = await res.json().catch(() => ({}))
      const msg = body?.error?.message || res.status
      console.error(`[gcal] hiba "${label}": ${res.status}`, JSON.stringify(body))
      errors.push(`${label} (${msg})`)
      return null
    }
  }

  // Foglalások
  if (bookingIds.length > 0) {
    const { data: bookings } = await supabaseAdmin
      .from('bookings')
      .select('id, customer_first_name, customer_last_name, customer_email, customer_phone, start_time, end_time, services(name)')
      .in('id', bookingIds)

    for (const b of bookings || []) {
      try {
        const svc = (b.services as unknown as { name: string } | null)?.name || ''
        const name = `${b.customer_last_name} ${b.customer_first_name}`.trim()
        const desc = `📧 ${b.customer_email}${b.customer_phone ? `\n📞 ${b.customer_phone}` : ''}`
        const eventId = await createEvent(name + (svc ? ` – ${svc}` : ''), desc, toRFC3339(b.start_time), toRFC3339(b.end_time), name)
        // Mentjük az event ID-t a bookinghoz, hogy törléskor tudjuk törölni a Calendarból
        if (eventId) {
          await supabaseAdmin.from('bookings').update({ google_event_id: eventId }).eq('id', b.id)
        }
      } catch (e) {
        errors.push(`${b.customer_last_name} ${b.customer_first_name} (${e instanceof Error ? e.message : String(e)})`)
      }
    }
  }

  // Importált ügyfelek
  for (const c of importedEvents || []) {
    try {
      const start = toRFC3339(c.next_appointment)
      const end = new Date(new Date(start).getTime() + 60 * 60 * 1000).toISOString()
      const desc = `📧 ${c.email}${c.phone ? `\n📞 ${c.phone}` : ''}`
      await createEvent(c.name, desc, start, end, c.name)
    } catch (e) {
      errors.push(`${c.name} (${e instanceof Error ? e.message : String(e)})`)
    }
  }

  return NextResponse.json({ created: created.length, errors })
}
