import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseServer'
import { getGoogleAccessToken } from '@/lib/googleAuth'

function timeToMinutes(time: string): number {
  const [h, m] = time.slice(0, 5).split(':').map(Number)
  return h * 60 + m
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const tenantId = searchParams.get('tenantId')
  const staffId = searchParams.get('staffId')
  const year = parseInt(searchParams.get('year') || '0')
  const month = parseInt(searchParams.get('month') || '0')
  const duration = parseInt(searchParams.get('duration') || '30')
  const interval = parseInt(searchParams.get('interval') || '0')
  const buffer = parseInt(searchParams.get('buffer') || '0')
  const horizon = parseInt(searchParams.get('horizon') || '30')

  if (!tenantId || !year || month === 0) {
    return NextResponse.json({ availableDays: [] })
  }

  const timezone = 'Europe/Budapest'

  const [tenantHoursRes, holidaysRes, tenantRes] = await Promise.all([
    supabaseAdmin.from('opening_hours').select('*').eq('tenant_id', tenantId).eq('is_closed', false),
    supabaseAdmin.from('holidays').select('date, start_time, end_time').eq('tenant_id', tenantId),
    supabaseAdmin.from('tenants').select('google_refresh_token, google_calendar_id').eq('id', tenantId).single(),
  ])

  const openingHours = tenantHoursRes.data || []
  const holidays = holidaysRes.data || []
  const tenantCal = tenantRes.data

  if (openingHours.length === 0) return NextResponse.json({ availableDays: [] })

  const openDayNumbers = openingHours.map((h: { day_of_week: number }) => h.day_of_week)
  const fullHolidayDates = holidays.filter((h: { start_time: string | null }) => !h.start_time).map((h: { date: string }) => h.date)

  // Staff saját beosztása és szabadnapjai
  const staffHoursMap: Record<number, { is_closed: boolean; open_time: string; close_time: string; break_start: string | null; break_end: string | null }> = {}
  let staffHolidayDates: string[] = []
  let staffSlotInterval = interval

  if (staffId) {
    const [staffHoursRes, staffHolidaysRes, staffRow] = await Promise.all([
      supabaseAdmin.from('staff_hours').select('*').eq('staff_id', staffId),
      supabaseAdmin.from('staff_holidays').select('date').eq('staff_id', staffId),
      supabaseAdmin.from('staff').select('slot_interval').eq('id', staffId).single(),
    ])
    for (const h of staffHoursRes.data || []) staffHoursMap[h.day_of_week] = h
    staffHolidayDates = (staffHolidaysRes.data || []).map((h: { date: string }) => h.date)
    if (staffRow.data?.slot_interval) staffSlotInterval = staffRow.data.slot_interval
  }

  // Token kiválasztása
  let refreshToken: string | null = null
  let calendarId: string | null = null

  if (staffId) {
    const { data: selectedStaff } = await supabaseAdmin
      .from('staff').select('google_refresh_token, google_calendar_id, is_owner').eq('id', staffId).single()

    if (selectedStaff?.google_refresh_token) {
      refreshToken = selectedStaff.google_refresh_token
      calendarId = selectedStaff.google_calendar_id
    } else if (selectedStaff?.is_owner) {
      refreshToken = tenantCal?.google_refresh_token ?? null
      calendarId = tenantCal?.google_calendar_id ?? null
    } else {
      // Munkásnak nincs összekötve a naptára → nincs szabad nap
      return NextResponse.json({ availableDays: [] })
    }
  } else {
    refreshToken = tenantCal?.google_refresh_token ?? null
    calendarId = tenantCal?.google_calendar_id ?? null
  }

  if (!refreshToken) return NextResponse.json({ availableDays: [] })

  const accessToken = await getGoogleAccessToken(refreshToken)
  const daysInMonth = new Date(year, month, 0).getDate()
  const today = new Date()
  const todayStr = today.toLocaleDateString('en-CA', { timeZone: timezone })

  const startOfMonth = `${year}-${month.toString().padStart(2, '0')}-01T00:00:00Z`
  const endOfMonth = `${year}-${month.toString().padStart(2, '0')}-${daysInMonth}T23:59:59Z`

  const calResponse = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId || 'primary')}/events?timeMin=${startOfMonth}&timeMax=${endOfMonth}&singleEvents=true`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  )
  const calData = await calResponse.json()
  const busyEvents = calData.items || []

  const horizonDate = new Date(today)
  horizonDate.setDate(horizonDate.getDate() + horizon)
  const horizonStr = horizonDate.toLocaleDateString('en-CA', { timeZone: timezone })

  const availableDays: number[] = []

  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`
    const dateObj = new Date(dateStr)
    const dayOfWeek = dateObj.getDay()

    if (dateStr < todayStr) continue
    if (dateStr > horizonStr) continue
    if (!openDayNumbers.includes(dayOfWeek)) continue
    if (fullHolidayDates.includes(dateStr)) continue
    if (staffHolidayDates.includes(dateStr)) continue

    const staffDay = staffHoursMap[dayOfWeek]
    if (staffDay?.is_closed) continue

    const tenantDay = openingHours.find((h: { day_of_week: number }) => h.day_of_week === dayOfWeek)
    if (!tenantDay) continue

    const openMins = timeToMinutes(staffDay?.open_time || tenantDay.open_time)
    const closeMins = timeToMinutes(staffDay?.close_time || tenantDay.close_time)

    const breakSrc = staffDay ?? tenantDay
    const breakStartMins = breakSrc?.break_start ? timeToMinutes(breakSrc.break_start) : null
    const breakEndMins = breakSrc?.break_end ? timeToMinutes(breakSrc.break_end) : null

    const stepMinutes = staffSlotInterval > 0 ? staffSlotInterval : (interval > 0 ? interval : duration)

    const dayBusy = busyEvents
      .filter((e: { start?: { dateTime?: string }, end?: { dateTime?: string } }) => e.start?.dateTime && e.end?.dateTime)
      .filter((e: { start: { dateTime: string } }) => new Date(e.start.dateTime).toLocaleDateString('en-CA', { timeZone: timezone }) === dateStr)
      .map((e: { start: { dateTime: string }, end: { dateTime: string } }) => {
        const startLocal = new Date(e.start.dateTime).toLocaleString('en-US', { timeZone: timezone })
        const endLocal = new Date(e.end.dateTime).toLocaleString('en-US', { timeZone: timezone })
        return {
          start: new Date(startLocal).getHours() * 60 + new Date(startLocal).getMinutes(),
          end: new Date(endLocal).getHours() * 60 + new Date(endLocal).getMinutes(),
        }
      })

    const dayHoliday = holidays.find((h: { date: string, start_time: string | null }) => h.date === dateStr && h.start_time)

    let hasSlot = false
    let currentMins = openMins

    if (dateStr === todayStr) {
      const nowMins = today.getHours() * 60 + today.getMinutes()
      currentMins = Math.max(openMins, nowMins + 1)
    }

    while (currentMins + duration <= closeMins) {
      const slotEndMins = currentMins + duration

      const isBusyCal = dayBusy.some((e: { start: number, end: number }) =>
        currentMins < e.end + buffer && slotEndMins > e.start
      )

      let isBusyHol = false
      if (dayHoliday && dayHoliday.start_time && dayHoliday.end_time) {
        const hStart = timeToMinutes(dayHoliday.start_time)
        const hEnd = timeToMinutes(dayHoliday.end_time)
        isBusyHol = currentMins < hEnd && slotEndMins > hStart
      }

      let isBusyBreak = false
      if (breakStartMins !== null && breakEndMins !== null) {
        isBusyBreak = currentMins < breakEndMins && slotEndMins > breakStartMins
      }

      if (!isBusyCal && !isBusyHol && !isBusyBreak) {
        hasSlot = true
        break
      }

      currentMins += stepMinutes
    }

    if (hasSlot) availableDays.push(day)
  }

  return NextResponse.json({ availableDays })
}
