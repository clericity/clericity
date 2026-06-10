import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseServer'
import { getGoogleAccessToken } from '@/lib/googleAuth'
import { getAuthUser, getUserTenantId, unauthorizedResponse, forbiddenResponse } from '@/lib/auth'
import { writeAuditLog } from '@/lib/audit'

export async function POST(request: Request) {
  const user = await getAuthUser(request)
  if (!user) return unauthorizedResponse()

  const { bookingId } = await request.json()
  if (!bookingId) return NextResponse.json({ error: 'Hiányzó bookingId' }, { status: 400 })

  const { data: booking, error: fetchErr } = await supabaseAdmin
    .from('bookings')
    .select('id, tenant_id, google_event_id, staff_id, start_time')
    .eq('id', bookingId)
    .single()

  if (fetchErr || !booking) {
    console.error('[delete] booking not found', fetchErr)
    return NextResponse.json({ error: 'Foglalás nem található' }, { status: 404 })
  }

  const userTenantId = await getUserTenantId(user.id)
  if (booking.tenant_id !== userTenantId) return forbiddenResponse()

  console.log('[delete] booking:', { id: booking.id, google_event_id: booking.google_event_id, staff_id: booking.staff_id, tenant_id: booking.tenant_id })

  // Google credentials: staff → tenant fallback
  let refreshToken: string | null = null
  let calendarId: string | null = null

  if (booking.staff_id) {
    const { data: staff } = await supabaseAdmin
      .from('staff')
      .select('google_refresh_token, google_calendar_id')
      .eq('id', booking.staff_id)
      .single()
    refreshToken = staff?.google_refresh_token || null
    calendarId = staff?.google_calendar_id || null
    console.log('[delete] staff creds:', { hasToken: !!refreshToken, calendarId })
  }

  if (!refreshToken && booking.tenant_id) {
    const { data: tenant } = await supabaseAdmin
      .from('tenants')
      .select('google_refresh_token, google_calendar_id')
      .eq('id', booking.tenant_id)
      .single()
    refreshToken = tenant?.google_refresh_token || null
    calendarId = tenant?.google_calendar_id || null
    console.log('[delete] tenant creds:', { hasToken: !!refreshToken, calendarId })
  }

  let gcalResult = 'skipped'

  if (booking.google_event_id && refreshToken && calendarId) {
    try {
      const accessToken = await getGoogleAccessToken(refreshToken)
      const gcalRes = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${booking.google_event_id}`,
        { method: 'DELETE', headers: { Authorization: `Bearer ${accessToken}` } }
      )
      if (gcalRes.ok || gcalRes.status === 410) {
        gcalResult = 'deleted'
        console.log('[delete] gcal event deleted:', booking.google_event_id)
      } else {
        const body = await gcalRes.text()
        gcalResult = `error ${gcalRes.status}: ${body}`
        console.error('[delete] gcal delete failed:', gcalRes.status, body)
      }
    } catch (e) {
      gcalResult = `exception: ${e instanceof Error ? e.message : String(e)}`
      console.error('[delete] gcal exception:', e)
    }
  } else {
    console.log('[delete] gcal skip reason:', {
      hasEventId: !!booking.google_event_id,
      hasToken: !!refreshToken,
      hasCalendarId: !!calendarId,
    })
  }

  await supabaseAdmin.from('bookings').delete().eq('id', bookingId)

  await writeAuditLog({
    tenantId: booking.tenant_id,
    userId: user.id,
    action: 'booking.delete',
    entityType: 'booking',
    entityId: bookingId,
    metadata: { start_time: booking.start_time, staff_id: booking.staff_id ?? null },
  })

  return NextResponse.json({ success: true, gcalResult })
}
