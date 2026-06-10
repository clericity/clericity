import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseServer'
import { getGoogleAccessToken } from '@/lib/googleAuth'
import { getIP, checkRateLimit, rateLimitResponse } from '@/lib/rateLimit'

function timeToMinutes(time: string): number {
  const [h, m] = time.slice(0, 5).split(':').map(Number)
  return h * 60 + m
}

export async function GET(request: Request) {
  if (!checkRateLimit(getIP(request), 'google/slots', 60, 5 * 60 * 1000)) {
    return rateLimitResponse()
  }
  const { searchParams } = new URL(request.url)
  const tenantId = searchParams.get('tenantId')
  const date = searchParams.get('date')
  const staffId = searchParams.get('staffId')
  const durationMinutes = parseInt(searchParams.get('duration') || '30')
  const slotInterval = parseInt(searchParams.get('interval') || '0')
  const bufferMinutes = parseInt(searchParams.get('buffer') || '0')

  if (!tenantId || !date) {
    return NextResponse.json({ error: 'Missing params' }, { status: 400 })
  }

  const dayOfWeek = new Date(date).getDay()

  const [holidaysResult, tenantHoursResult, tenantResult] = await Promise.all([
    supabaseAdmin.from('holidays').select('*').eq('tenant_id', tenantId).filter('date', 'eq', date),
    supabaseAdmin.from('opening_hours').select('*').eq('tenant_id', tenantId).eq('day_of_week', dayOfWeek).eq('is_closed', false).single(),
    supabaseAdmin.from('tenants').select('timezone, google_refresh_token, google_calendar_id').eq('id', tenantId).single(),
  ])

  const holidays = holidaysResult.data
  const tenantHours = tenantHoursResult.data
  const tenantData = tenantResult.data
  const timezone = tenantData?.timezone || 'Europe/Budapest'
  const holiday = holidays && holidays.length > 0 ? holidays[0] : null

  if (holiday && !holiday.start_time && !holiday.end_time) {
    return NextResponse.json({ slots: [], reason: 'holiday' })
  }

  // Főnyitvatartás zárva → mindig zárva (staff sem dolgozhat)
  if (!tenantHours) {
    return NextResponse.json({ slots: [], reason: 'closed' })
  }

  // Staff saját beosztása és szabadnapjai lekérése
  let staffHours: { is_closed: boolean; open_time: string; close_time: string; break_start: string | null; break_end: string | null } | null = null
  let staffSlotInterval = slotInterval
  let isStaffHoliday = false

  if (staffId) {
    const [staffHoursRes, staffHolidayRes, staffRow] = await Promise.all([
      supabaseAdmin.from('staff_hours').select('*').eq('staff_id', staffId).eq('day_of_week', dayOfWeek).single(),
      supabaseAdmin.from('staff_holidays').select('id').eq('staff_id', staffId).eq('date', date).limit(1),
      supabaseAdmin.from('staff').select('slot_interval').eq('id', staffId).single(),
    ])
    if (staffHoursRes.data) staffHours = staffHoursRes.data
    if (staffHolidayRes.data && staffHolidayRes.data.length > 0) isStaffHoliday = true
    if (staffRow.data?.slot_interval) staffSlotInterval = staffRow.data.slot_interval
  }

  // Ha a munkásnak ez szabadnapja
  if (isStaffHoliday) {
    return NextResponse.json({ slots: [], reason: 'closed' })
  }

  // Ha a munkás nem dolgozik ezen a napon (saját beosztás szerint)
  if (staffHours?.is_closed) {
    return NextResponse.json({ slots: [], reason: 'closed' })
  }

  // Token kiválasztása
  let refreshToken: string | null = null
  let calendarId: string | null = null

  if (staffId) {
    const { data: selectedStaff } = await supabaseAdmin
      .from('staff').select('google_refresh_token, google_calendar_id, is_owner').eq('id', staffId).single()

    if (selectedStaff?.google_refresh_token) {
      // Munkásnak van saját naptára
      refreshToken = selectedStaff.google_refresh_token
      calendarId = selectedStaff.google_calendar_id
    } else if (selectedStaff?.is_owner) {
      // Owner → tenant szintű naptár
      refreshToken = tenantData?.google_refresh_token ?? null
      calendarId = tenantData?.google_calendar_id ?? null
    } else {
      // Munkásnak nincs összekötve a naptára
      return NextResponse.json({ slots: [], reason: 'no_calendar' })
    }
  } else {
    // Nincs staffId → tenant token
    refreshToken = tenantData?.google_refresh_token ?? null
    calendarId = tenantData?.google_calendar_id ?? null
  }

  if (!refreshToken) {
    return NextResponse.json({ slots: [], reason: 'no_calendar' })
  }

  const accessToken = await getGoogleAccessToken(refreshToken)

  const startOfDay = `${date}T00:00:00Z`
  const endOfDay = `${date}T23:59:59Z`

  const calResponse = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId || 'primary')}/events?timeMin=${startOfDay}&timeMax=${endOfDay}&singleEvents=true`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  )
  const calData = await calResponse.json()
  const busyEvents = calData.items || []

  const busyInMinutes = busyEvents
    .filter((e: { start?: { dateTime?: string }, end?: { dateTime?: string } }) => e.start?.dateTime && e.end?.dateTime)
    .map((e: { start: { dateTime: string }, end: { dateTime: string } }) => {
      const startLocal = new Date(e.start.dateTime).toLocaleString('en-US', { timeZone: timezone })
      const endLocal = new Date(e.end.dateTime).toLocaleString('en-US', { timeZone: timezone })
      const startDate = new Date(startLocal)
      const endDate = new Date(endLocal)
      return {
        start: startDate.getHours() * 60 + startDate.getMinutes(),
        end: endDate.getHours() * 60 + endDate.getMinutes(),
      }
    })

  // Nyitvatartás: staff saját beosztása ha van, egyébként tenant
  const openMins = timeToMinutes(staffHours?.open_time || tenantHours.open_time)
  const closeMins = timeToMinutes(staffHours?.close_time || tenantHours.close_time)

  // Szünet: staff saját szünete ha van, egyébként tenant
  const breakSrc = staffHours ?? tenantHours
  const breakStartMins = breakSrc?.break_start ? timeToMinutes(breakSrc.break_start) : null
  const breakEndMins = breakSrc?.break_end ? timeToMinutes(breakSrc.break_end) : null

  // Slot lépésköz
  const stepMinutes = staffSlotInterval > 0 ? staffSlotInterval : (slotInterval > 0 ? slotInterval : durationMinutes)

  const now = new Date()
  const todayStr = now.toLocaleDateString('en-CA', { timeZone: 'Europe/Budapest' })
  const currentMinsNow = date === todayStr ? now.getHours() * 60 + now.getMinutes() : -1

  const slots: string[] = []
  let currentMins = openMins

  while (currentMins + durationMinutes <= closeMins) {
    const slotEndMins = currentMins + durationMinutes

    const isPastSlot = currentMinsNow !== -1 && currentMins <= currentMinsNow
    const isBusyCalendar = busyInMinutes.some((e: { start: number, end: number }) =>
      currentMins < e.end + bufferMinutes && slotEndMins > e.start
    )

    let isBusyHoliday = false
    if (holiday && holiday.start_time && holiday.end_time) {
      const holidayStart = timeToMinutes(holiday.start_time)
      const holidayEnd = timeToMinutes(holiday.end_time)
      isBusyHoliday = currentMins < holidayEnd && slotEndMins > holidayStart
    }

    let isBusyBreak = false
    if (breakStartMins !== null && breakEndMins !== null) {
      isBusyBreak = currentMins < breakEndMins && slotEndMins > breakStartMins
    }

    if (!isPastSlot && !isBusyCalendar && !isBusyHoliday && !isBusyBreak) {
      const h = Math.floor(currentMins / 60).toString().padStart(2, '0')
      const m = (currentMins % 60).toString().padStart(2, '0')
      slots.push(`${h}:${m}`)
    }

    currentMins += stepMinutes
  }

  return NextResponse.json({ slots })
}
