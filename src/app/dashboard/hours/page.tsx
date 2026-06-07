'use client'

import { useEffect, useState, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { useLanguage } from '@/hooks/useLanguage'

interface OpeningHour {
  id: string
  day_of_week: number
  open_time: string | null
  close_time: string | null
  is_closed: boolean
  break_start: string | null
  break_end: string | null
}
interface Holiday {
  id: string
  date: string
  label: string
  start_time: string | null
  end_time: string | null
}

const DAY_VALUES = [1, 2, 3, 4, 5, 6, 0]

const HOURS = Array.from({ length: 24 }, (_, i) => {
  const h = i.toString().padStart(2, '0')
  return [`${h}:00`, `${h}:15`, `${h}:30`, `${h}:45`]
}).flat()


function TimePicker({ value, onChange, disabled, width }: { value: string, onChange: (val: string) => void, disabled?: boolean, width?: string }) {
  const [open, setOpen] = useState(false)
const [inputValue, setInputValue] = useState(value)
const ref = useRef<HTMLDivElement>(null)
const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    setInputValue(val)
    if (/^\d{2}:\d{2}$/.test(val)) {
      onChange(val)
    }
  }

  return (
    <div ref={ref} style={{ position: 'relative', width: width || '110px' }}>
      <div style={{ display: 'flex', border: '1px solid #d1d5db', borderRadius: '8px', overflow: 'hidden', opacity: disabled ? 0.4 : 1 }}>
        <input
          type="text"
          value={disabled ? '--:--' : inputValue}
          onChange={handleInputChange}
          placeholder="00:00"
          maxLength={5}
          disabled={disabled}
          style={{ flex: 1, padding: '0.4rem 0.5rem', color: '#111827', border: 'none', outline: 'none', fontSize: '0.875rem', backgroundColor: disabled ? '#f9fafb' : 'white', cursor: disabled ? 'not-allowed' : 'text', width: '60px' }}
        />
        <button
          onClick={() => !disabled && setOpen(!open)}
          disabled={disabled}
          style={{ padding: '0.4rem 0.5rem', backgroundColor: '#f9fafb', border: 'none', borderLeft: '1px solid #d1d5db', cursor: disabled ? 'not-allowed' : 'pointer', color: '#6b7280', fontSize: '0.65rem' }}
        >▼</button>
      </div>
      {open && !disabled && (
        <div
          ref={listRef}
          style={{
            position: 'absolute', top: '100%', left: 0, right: 0, backgroundColor: 'white',
            border: '1px solid #d1d5db', borderRadius: '8px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)', zIndex: 100,
            maxHeight: '200px', overflowY: 'auto', marginTop: '4px', width: width || '110px',
          }}>
        {HOURS.map(hour => (
            <button
              key={hour}
              ref={el => { if (el && hour === inputValue) el.scrollIntoView({ block: 'center' }) }}
              onClick={() => {
                onChange(hour)
                setInputValue(hour)
                setOpen(false)
              }}
              style={{
                display: 'block', width: '100%', padding: '0.4rem 0.75rem', border: 'none',
                backgroundColor: inputValue === hour ? '#eff6ff' : 'white',
                color: inputValue === hour ? '#2563eb' : '#111827',
                cursor: 'pointer', textAlign: 'left', fontSize: '0.875rem',
                fontWeight: inputValue === hour ? '600' : '400',
              }}
            >{hour}</button>
          ))}
        </div>
      )}
    </div>
  )
}

interface DayRowState {
  open_time: string
  close_time: string
  is_closed: boolean
  saved: boolean
  id: string | null
  break_start: string
  break_end: string
  has_break: boolean
}

export default function HoursPage() {
  const router = useRouter()
  const { t } = useLanguage()
  const DAYS = DAY_VALUES.map((v, i) => ({ value: v, label: t.dash.days_of_week[i] }))
  const MONTH_NAMES = t.dash.month_names
  const [tenantId, setTenantId] = useState<string | null>(null)
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 640)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [holidays, setHolidays] = useState<Holiday[]>([])
  const [selectedDates, setSelectedDates] = useState<string[]>([])
  const [holidayLabel, setHolidayLabel] = useState(() => t.dash.holiday_default_label)
  const [holidayLoading, setHolidayLoading] = useState(false)
  const [holidaySuccess, setHolidaySuccess] = useState(false)
  const [calMonth, setCalMonth] = useState(new Date().getMonth())
  const [calYear, setCalYear] = useState(new Date().getFullYear())
  const [isFullDay, setIsFullDay] = useState(true)
  const [holidayStartTime, setHolidayStartTime] = useState('09:00')
  const [holidayEndTime, setHolidayEndTime] = useState('17:00')
  const [closedDayNumbers, setClosedDayNumbers] = useState<number[]>([])
  const [bookingHorizon, setBookingHorizon] = useState(30)
const [horizonLoading, setHorizonLoading] = useState(false)
const [horizonSuccess, setHorizonSuccess] = useState(false)

  const [dayStates, setDayStates] = useState<Record<number, DayRowState>>(
    Object.fromEntries(DAYS.map(d => [d.value, { open_time: '09:00', close_time: '17:00', is_closed: false, saved: false, id: null, break_start: '12:00', break_end: '13:00', has_break: false }]))
  )

  useEffect(() => {
    const getData = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/auth'); return }

      const { data: profile } = await supabase
        .from('profiles')
        .select('tenant_id')
        .eq('id', user.id)
        .single()

      if (profile?.tenant_id) {
        setTenantId(profile.tenant_id)

        const { data: tenantData } = await supabase
  .from('tenants')
  .select('booking_horizon')
  .eq('id', profile.tenant_id)
  .single()

if (tenantData?.booking_horizon) {
  setBookingHorizon(tenantData.booking_horizon)
}

        const { data: hoursData } = await supabase
          .from('opening_hours')
          .select('*')
          .eq('tenant_id', profile.tenant_id)

        if (hoursData && hoursData.length > 0) {
          const newStates: Record<number, DayRowState> = Object.fromEntries(DAY_VALUES.map(v => [v, { open_time: '09:00', close_time: '17:00', is_closed: false, saved: false, id: null, break_start: '12:00', break_end: '13:00', has_break: false }]))
          const closedNums: number[] = []
          hoursData.forEach((h: OpeningHour) => {
            newStates[h.day_of_week] = {
              open_time: h.open_time?.slice(0, 5) || '09:00',
              close_time: h.close_time?.slice(0, 5) || '17:00',
              is_closed: h.is_closed,
              saved: true,
              id: h.id,
              break_start: h.break_start?.slice(0, 5) || '12:00',
              break_end: h.break_end?.slice(0, 5) || '13:00',
              has_break: !!(h.break_start && h.break_end),
            }
            if (h.is_closed) closedNums.push(h.day_of_week)
          })
          setDayStates(newStates)
          setClosedDayNumbers(closedNums)
        }

        const { data: holidayData } = await supabase
          .from('holidays')
          .select('*')
          .eq('tenant_id', profile.tenant_id)
          .order('date', { ascending: true })
        setHolidays(holidayData || [])
      }
    }
    getData()
  }, [router])

  const updateDay = (day: number, field: keyof DayRowState, value: string | boolean) => {
    setDayStates(prev => ({ ...prev, [day]: { ...prev[day], [field]: value } }))
  }

  const handleSave = async () => {
    if (!tenantId) return
    setLoading(true)
    setSuccess(false)

    const closedNums: number[] = []
    for (const day of DAYS) {
      const state = dayStates[day.value]
      const record = {
        tenant_id: tenantId,
        day_of_week: day.value,
        open_time: state.is_closed ? null : state.open_time,
        close_time: state.is_closed ? null : state.close_time,
        is_closed: state.is_closed,
        break_start: state.is_closed || !state.has_break ? null : state.break_start,
        break_end: state.is_closed || !state.has_break ? null : state.break_end,
      }
      if (state.is_closed) closedNums.push(day.value)

      if (state.id) {
        await supabase.from('opening_hours').update(record).eq('id', state.id)
      } else {
        const { data } = await supabase.from('opening_hours').insert(record).select().single()
        if (data) {
          setDayStates(prev => ({ ...prev, [day.value]: { ...prev[day.value], id: data.id, saved: true } }))
        }
      }
    }
    setClosedDayNumbers(closedNums)
    setLoading(false)
    setSuccess(true)
  }

  const formatHolidayDate = (year: number, month: number, day: number) => {
    const m = (month + 1).toString().padStart(2, '0')
    const d = day.toString().padStart(2, '0')
    return `${year}-${m}-${d}`
  }

  const isAlreadyClosed = (dateStr: string) => {
    const date = new Date(dateStr)
    const dayOfWeek = date.getDay()
    return closedDayNumbers.includes(dayOfWeek)
  }

  const toggleHolidayDate = (dateStr: string) => {
    const todayStart = new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate())
    if (new Date(dateStr) < todayStart) return
    if (holidays.some(h => h.date === dateStr)) return
    if (isAlreadyClosed(dateStr)) return
    setSelectedDates(prev =>
      prev.includes(dateStr) ? prev.filter(d => d !== dateStr) : [...prev, dateStr]
    )
  }

  const handleSaveHolidays = async () => {
    if (!tenantId || selectedDates.length === 0) return
    setHolidayLoading(true)
    setHolidaySuccess(false)

    const inserts = selectedDates.map(date => ({
      tenant_id: tenantId,
      date,
      label: holidayLabel,
      start_time: isFullDay ? null : holidayStartTime,
      end_time: isFullDay ? null : holidayEndTime,
    }))

    const { data, error } = await supabase
      .from('holidays')
      .insert(inserts)
      .select()

    if (!error && data) {
      setHolidays([...holidays, ...data])
      setSelectedDates([])
      setHolidaySuccess(true)
    }
    setHolidayLoading(false)
  }

  const handleDeleteHoliday = async (id: string) => {
    const { error } = await supabase.from('holidays').delete().eq('id', id)
    if (!error) setHolidays(holidays.filter(h => h.id !== id))
  }

  const handleSaveHorizon = async () => {
    if (!tenantId) return
    setHorizonLoading(true)
    setHorizonSuccess(false)

    await supabase
      .from('tenants')
      .update({ booking_horizon: bookingHorizon })
      .eq('id', tenantId)

    setHorizonLoading(false)
    setHorizonSuccess(true)
  }

  const calDaysInMonth = (month: number, year: number) => new Date(year, month + 1, 0).getDate()
  const calFirstDay = (month: number, year: number) => {
    const day = new Date(year, month, 1).getDay()
    return day === 0 ? 6 : day - 1
  }

  return (
    <div>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#111827', marginBottom: '1.5rem' }}>
        {t.dash.hours_title}
      </h1>

      {/* Nyitvatartás táblázat */}
      <div style={{ backgroundColor: 'white', padding: isMobile ? '1rem' : '1.5rem', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', maxWidth: '650px', marginBottom: '2rem' }}>
        <h2 style={{ fontSize: '1rem', fontWeight: '600', color: '#111827', marginBottom: '1.25rem' }}>
          {t.dash.hours_title}
        </h2>

        {!isMobile && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.75rem', paddingBottom: '0.5rem', borderBottom: '1px solid #f3f4f6' }}>
            <div style={{ width: '100px', fontSize: '0.75rem', fontWeight: '600', color: '#9ca3af', textTransform: 'uppercase' }}>📅</div>
            <div style={{ width: '110px', fontSize: '0.75rem', fontWeight: '600', color: '#9ca3af', textTransform: 'uppercase' }}>{t.dash.open_time}</div>
            <div style={{ width: '110px', fontSize: '0.75rem', fontWeight: '600', color: '#9ca3af', textTransform: 'uppercase' }}>{t.dash.close_time}</div>
            <div style={{ fontSize: '0.75rem', fontWeight: '600', color: '#9ca3af', textTransform: 'uppercase' }}>{t.dash.closed_label}</div>
          </div>
        )}

        {DAYS.map(day => {
          const state = dayStates[day.value]

          if (isMobile) {
            return (
              <div key={day.value} style={{ backgroundColor: state.is_closed ? '#fef2f2' : '#fafafa', borderRadius: '10px', marginBottom: '0.5rem', overflow: 'hidden', border: '1px solid', borderColor: state.is_closed ? '#fecaca' : '#f3f4f6' }}>
                {/* Nap neve + zárva toggle */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.625rem 0.875rem' }}>
                  <span style={{ fontSize: '0.9rem', fontWeight: '700', color: state.is_closed ? '#ef4444' : state.saved ? '#16a34a' : '#111827' }}>
                    {state.saved ? (state.is_closed ? '🔴 ' : '🟢 ') : ''}{day.label}
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ fontSize: '0.75rem', color: state.is_closed ? '#ef4444' : '#9ca3af' }}>{state.is_closed ? t.dash.closed_label : t.dash.open_time}</span>
                    <button
                      onClick={() => updateDay(day.value, 'is_closed', !state.is_closed)}
                      style={{ width: '44px', height: '24px', borderRadius: '12px', border: 'none', backgroundColor: state.is_closed ? '#ef4444' : '#d1d5db', cursor: 'pointer', position: 'relative', flexShrink: 0 }}
                    >
                      <div style={{ position: 'absolute', top: '2px', left: state.is_closed ? '22px' : '2px', width: '20px', height: '20px', borderRadius: '50%', backgroundColor: 'white', transition: 'left 0.2s' }} />
                    </button>
                  </div>
                </div>
                {/* Időpontok + szünet gomb */}
                {!state.is_closed && (
                  <div style={{ padding: '0 0.875rem 0.625rem', borderTop: '1px solid #f3f4f6' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', paddingTop: '0.5rem' }}>
                      <TimePicker key={`open-${day.value}-${state.open_time}`} value={state.open_time} onChange={(val) => updateDay(day.value, 'open_time', val)} width="100%" />
                      <span style={{ color: '#9ca3af', fontSize: '0.85rem', flexShrink: 0 }}>—</span>
                      <TimePicker key={`close-${day.value}-${state.close_time}`} value={state.close_time} onChange={(val) => updateDay(day.value, 'close_time', val)} width="100%" />
                      <button
                        onClick={() => updateDay(day.value, 'has_break', !state.has_break)}
                        style={{ padding: '0.3rem 0.6rem', borderRadius: '6px', border: '1px solid', borderColor: state.has_break ? '#f59e0b' : '#e5e7eb', backgroundColor: state.has_break ? '#fef3c7' : 'white', color: state.has_break ? '#d97706' : '#9ca3af', cursor: 'pointer', fontSize: '0.7rem', fontWeight: '600', whiteSpace: 'nowrap', flexShrink: 0 }}
                      >
                        {state.has_break ? '☕' : '+ ☕'}
                      </button>
                    </div>
                    {state.has_break && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.4rem', paddingTop: '0.4rem', borderTop: '1px dashed #fde68a' }}>
                        <span style={{ fontSize: '0.72rem', color: '#d97706', fontWeight: '600', flexShrink: 0, minWidth: '42px' }}>{t.dash.break_label}</span>
                        <TimePicker key={`break-start-${day.value}-${state.break_start}`} value={state.break_start} onChange={(val) => updateDay(day.value, 'break_start', val)} width="100%" />
                        <span style={{ color: '#9ca3af', fontSize: '0.85rem', flexShrink: 0 }}>—</span>
                        <TimePicker key={`break-end-${day.value}-${state.break_end}`} value={state.break_end} onChange={(val) => updateDay(day.value, 'break_end', val)} width="100%" />
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          }

          return (
            <div key={day.value}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '0.625rem 0.5rem', borderBottom: state.has_break ? 'none' : '1px solid #f9fafb', backgroundColor: state.is_closed ? '#fef2f2' : 'white', borderRadius: state.has_break ? '8px 8px 0 0' : '8px', marginBottom: state.has_break ? '0' : '0.25rem' }}>
                <div style={{ width: '100px' }}>
                  <span style={{ fontSize: '0.875rem', fontWeight: '600', color: state.is_closed ? '#ef4444' : state.saved ? '#16a34a' : '#111827' }}>
                    {state.saved ? (state.is_closed ? '🔴 ' : '🟢 ') : ''}{day.label}
                  </span>
                </div>
                <TimePicker key={`open-${day.value}-${state.open_time}`} value={state.open_time} onChange={(val) => updateDay(day.value, 'open_time', val)} disabled={state.is_closed} />
                <TimePicker key={`close-${day.value}-${state.close_time}`} value={state.close_time} onChange={(val) => updateDay(day.value, 'close_time', val)} disabled={state.is_closed} />
                <button
                  onClick={() => updateDay(day.value, 'is_closed', !state.is_closed)}
                  style={{ width: '44px', height: '24px', borderRadius: '12px', border: 'none', backgroundColor: state.is_closed ? '#ef4444' : '#d1d5db', cursor: 'pointer', position: 'relative', flexShrink: 0 }}
                >
                  <div style={{ position: 'absolute', top: '2px', left: state.is_closed ? '22px' : '2px', width: '20px', height: '20px', borderRadius: '50%', backgroundColor: 'white', transition: 'left 0.2s' }} />
                </button>
                {!state.is_closed && (
                  <button
                    onClick={() => updateDay(day.value, 'has_break', !state.has_break)}
                    style={{ padding: '0.25rem 0.75rem', borderRadius: '6px', border: '1px solid', borderColor: state.has_break ? '#f59e0b' : '#e5e7eb', backgroundColor: state.has_break ? '#fef3c7' : 'white', color: state.has_break ? '#d97706' : '#9ca3af', cursor: 'pointer', fontSize: '0.75rem', fontWeight: '500', whiteSpace: 'nowrap', flexShrink: 0 }}
                  >
                    {state.has_break ? `☕ ${t.dash.break_btn}` : `+ ${t.dash.break_btn}`}
                  </button>
                )}
              </div>

              {/* Szünet sor */}
              {state.has_break && !state.is_closed && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '0.4rem 0.5rem 0.625rem', backgroundColor: '#fffbeb', borderRadius: '0 0 8px 8px', marginBottom: '0.25rem', borderTop: '1px dashed #fde68a' }}>
                  <div style={{ width: '100px' }}>
                    <span style={{ fontSize: '0.75rem', color: '#d97706', fontWeight: '500' }}>{t.dash.break_label}</span>
                  </div>
                  <TimePicker key={`break-start-${day.value}-${state.break_start}`} value={state.break_start} onChange={(val) => updateDay(day.value, 'break_start', val)} />
                  <TimePicker key={`break-end-${day.value}-${state.break_end}`} value={state.break_end} onChange={(val) => updateDay(day.value, 'break_end', val)} />
                  <span style={{ fontSize: '0.75rem', color: '#9ca3af' }}>{t.dash.break_time_desc}</span>
                </div>
              )}
            </div>
          )
        })}

        {success && <p style={{ color: '#22c55e', fontSize: '0.875rem', margin: '1rem 0' }}>{t.dash.hours_saved}</p>}

        <button
          onClick={handleSave}
          disabled={loading}
          style={{ marginTop: '1.25rem', backgroundColor: '#2563eb', color: 'white', padding: '0.75rem 2rem', borderRadius: '8px', border: 'none', cursor: 'pointer', fontWeight: '500', opacity: loading ? 0.5 : 1, width: isMobile ? '100%' : undefined }}
        >
          {loading ? t.dash.saving : `💾 ${t.dash.save_btn}`}
        </button>
      </div>

{/* ELŐRE FOGLALÁS BEÁLLÍTÁSA */}
      <div style={{ maxWidth: '650px', marginTop: '2rem', marginBottom: '2rem' }}>
        <h2 style={{ fontSize: '1.1rem', fontWeight: '700', color: '#111827', marginBottom: '0.5rem' }}>
          {t.dash.horizon_title}
        </h2>
        <p style={{ color: '#6b7280', fontSize: '0.875rem', marginBottom: '1.5rem' }}>
          {t.dash.horizon_label}
        </p>

        <div style={{ backgroundColor: 'white', padding: '1.5rem', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              {[7, 14, 30, 60, 90].map(days => (
                <button
                  key={days}
                  onClick={() => setBookingHorizon(days)}
                  style={{
                    padding: '0.5rem 1rem', borderRadius: '8px', border: '2px solid',
                    borderColor: bookingHorizon === days ? '#2563eb' : '#e5e7eb',
                    backgroundColor: bookingHorizon === days ? '#eff6ff' : 'white',
                    color: bookingHorizon === days ? '#2563eb' : '#6b7280',
                    cursor: 'pointer', fontWeight: bookingHorizon === days ? '700' : '400',
                    fontSize: '0.875rem',
                  }}
                >
                  {days} {t.dash.horizon_suffix}
                </button>
              ))}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <input
                type="number"
                value={bookingHorizon}
                onChange={e => setBookingHorizon(parseInt(e.target.value) || 30)}
                min="1"
                max="365"
                style={{ width: '80px', border: '1px solid #d1d5db', borderRadius: '8px', padding: '0.5rem 0.75rem', color: '#111827', outline: 'none', boxSizing: 'border-box' }}
              />
              <span style={{ color: '#6b7280', fontSize: '0.875rem' }}>{t.dash.horizon_suffix}</span>
            </div>
          </div>

          <p style={{ fontSize: '0.8rem', color: '#9ca3af', marginTop: '0.75rem' }}>
            <strong style={{ color: '#374151' }}>{bookingHorizon} {t.dash.horizon_suffix}</strong>
          </p>

          {horizonSuccess && <p style={{ color: '#22c55e', fontSize: '0.875rem', marginTop: '0.75rem' }}>{t.dash.horizon_saved}</p>}

          <button
            onClick={handleSaveHorizon}
            disabled={horizonLoading}
            style={{ marginTop: '1rem', backgroundColor: '#2563eb', color: 'white', padding: '0.625rem 1.5rem', borderRadius: '8px', border: 'none', cursor: 'pointer', fontWeight: '500', fontSize: '0.875rem', opacity: horizonLoading ? 0.5 : 1, width: isMobile ? '100%' : undefined }}
          >
            {horizonLoading ? t.dash.saving : `💾 ${t.dash.save_btn}`}
          </button>
        </div>
      </div>


      {/* SZABADNAPOK */}
      <div style={{ maxWidth: '650px' }}>
        <h2 style={{ fontSize: '1.1rem', fontWeight: '700', color: '#111827', marginBottom: '0.5rem' }}>
          {t.dash.holidays_title}
        </h2>
        <p style={{ color: '#6b7280', fontSize: '0.875rem', marginBottom: '1.5rem' }}>
          {t.dash.holidays_desc}
        </p>

        <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: '1.5rem' }}>
          {/* Naptár */}
          <div style={{ flex: 1, minWidth: isMobile ? undefined : '280px' }}>
            <div style={{ backgroundColor: 'white', borderRadius: '16px', padding: '1.5rem', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
                <button
                  onClick={() => {
                    if (calMonth === new Date().getMonth() && calYear === new Date().getFullYear()) return
                    if (calMonth === 0) { setCalMonth(11); setCalYear(y => y - 1) }
                    else setCalMonth(m => m - 1)
                  }}
                  style={{ width: '36px', height: '36px', borderRadius: '50%', border: '2px solid #111827', backgroundColor: 'white', cursor: 'pointer', fontSize: '1.1rem', fontWeight: '700', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#111827', opacity: calMonth === new Date().getMonth() && calYear === new Date().getFullYear() ? 0.3 : 1 }}
                >←</button>
                <h3 style={{ fontWeight: '800', color: '#111827', fontSize: '1rem' }}>
                  {MONTH_NAMES[calMonth]} {calYear}
                </h3>
                <button
                  onClick={() => {
                    if (calMonth === 11) { setCalMonth(0); setCalYear(y => y + 1) }
                    else setCalMonth(m => m + 1)
                  }}
                  style={{ width: '36px', height: '36px', borderRadius: '50%', border: '2px solid #111827', backgroundColor: 'white', cursor: 'pointer', fontSize: '1.1rem', fontWeight: '700', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#111827' }}
                >→</button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px', marginBottom: '0.5rem' }}>
                {t.dash.cal_days_short.map(d => (
                  <div key={d} style={{ textAlign: 'center', fontSize: '0.75rem', fontWeight: '700', color: '#9ca3af' }}>{d}</div>
                ))}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px' }}>
                {Array.from({ length: calFirstDay(calMonth, calYear) }).map((_, i) => <div key={`e-${i}`} />)}
                {Array.from({ length: calDaysInMonth(calMonth, calYear) }, (_, i) => i + 1).map(day => {
                  const dateStr = formatHolidayDate(calYear, calMonth, day)
                  const todayStart = new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate())
                  const isPast = new Date(dateStr) < todayStart
                  const isSelected = selectedDates.includes(dateStr)
                  const isHoliday = holidays.some(h => h.date === dateStr)
                  const isClosed = isAlreadyClosed(dateStr)
                  const isToday = new Date().getDate() === day && new Date().getMonth() === calMonth && new Date().getFullYear() === calYear
                  const isDisabled = isPast || isClosed || isHoliday

                  return (
                    <button
                      key={day}
                      onClick={() => toggleHolidayDate(dateStr)}
                      style={{
                        aspectRatio: '1', borderRadius: '50%', border: 'none',
                        cursor: isDisabled ? 'not-allowed' : 'pointer',
                        backgroundColor: isHoliday ? '#fee2e2' : isSelected ? '#fef3c7' : isClosed ? '#f3f4f6' : isToday ? '#eff6ff' : 'transparent',
                        color: isHoliday ? '#ef4444' : isSelected ? '#d97706' : isClosed ? '#d1d5db' : isPast ? '#d1d5db' : isToday ? '#2563eb' : '#111827',
                        fontWeight: isHoliday || isSelected || isToday ? '700' : '400',
                        fontSize: '0.875rem', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        width: '100%',
                        opacity: isPast ? 0.4 : 1,
                      }}
                    >
                      {day}
                    </button>
                  )
                })}
              </div>
            </div>

            <div style={{ display: 'flex', gap: '1rem', marginTop: '0.75rem', fontSize: '0.75rem', color: '#6b7280', flexWrap: 'wrap' }}>
              <span>{t.dash.cal_legend_holiday}</span>
              <span>{t.dash.cal_legend_selected}</span>
              <span>{t.dash.cal_legend_today}</span>
              <span>{t.dash.cal_legend_closed}</span>
            </div>
          </div>

          {/* Jobb oldal */}
          <div style={{ width: isMobile ? '100%' : '240px', flexShrink: 0 }}>
            <div style={{ backgroundColor: 'white', padding: '1.25rem', borderRadius: '16px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', marginBottom: '1rem' }}>
              <p style={{ fontWeight: '700', color: '#111827', marginBottom: '0.75rem', fontSize: '0.9rem' }}>
                {t.dash.selected_days}: {selectedDates.length} {t.dash.horizon_suffix}
              </p>

              {selectedDates.length > 0 && (
                <div style={{ marginBottom: '0.75rem', maxHeight: '100px', overflowY: 'auto' }}>
                  {selectedDates.sort().map(date => (
                    <p key={date} style={{ fontSize: '0.8rem', color: '#374151', padding: '0.2rem 0' }}>📅 {date}</p>
                  ))}
                </div>
              )}

              <div style={{ marginBottom: '0.75rem' }}>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '500', color: '#374151', marginBottom: '0.4rem' }}>{t.dash.holiday_name_label}</label>
                <input
                  type="text"
                  value={holidayLabel}
                  onChange={e => setHolidayLabel(e.target.value)}
                  style={{ width: '100%', border: '1px solid #d1d5db', borderRadius: '8px', padding: '0.5rem 0.75rem', color: '#111827', outline: 'none', boxSizing: 'border-box', fontSize: '0.8rem' }}
                  placeholder={t.dash.holiday_name_ph}
                />
              </div>

              {/* Egész nap / Részleges */}
              <div style={{ marginBottom: '0.75rem' }}>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '500', color: '#374151', marginBottom: '0.4rem' }}>{t.dash.holiday_type_label}</label>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button
                    onClick={() => setIsFullDay(true)}
                    style={{ flex: 1, padding: '0.4rem', borderRadius: '6px', border: '2px solid', borderColor: isFullDay ? '#2563eb' : '#e5e7eb', backgroundColor: isFullDay ? '#eff6ff' : 'white', color: isFullDay ? '#2563eb' : '#6b7280', cursor: 'pointer', fontSize: '0.75rem', fontWeight: '600' }}
                  >
                    {t.dash.holiday_full_day}
                  </button>
                  <button
                    onClick={() => setIsFullDay(false)}
                    style={{ flex: 1, padding: '0.4rem', borderRadius: '6px', border: '2px solid', borderColor: !isFullDay ? '#2563eb' : '#e5e7eb', backgroundColor: !isFullDay ? '#eff6ff' : 'white', color: !isFullDay ? '#2563eb' : '#6b7280', cursor: 'pointer', fontSize: '0.75rem', fontWeight: '600' }}
                  >
                    {t.dash.holiday_partial}
                  </button>
                </div>
              </div>

              {/* Időpont választó ha nem egész nap */}
              {!isFullDay && (
                <div style={{ marginBottom: '0.75rem' }}>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '500', color: '#374151', marginBottom: '0.4rem' }}>{t.dash.holiday_time_from_to}</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <TimePicker value={holidayStartTime} onChange={setHolidayStartTime} />
                    <span style={{ color: '#6b7280', fontSize: '0.8rem' }}>—</span>
                    <TimePicker value={holidayEndTime} onChange={setHolidayEndTime} />
                  </div>
                </div>
              )}

              {holidaySuccess && <p style={{ color: '#22c55e', fontSize: '0.8rem', marginBottom: '0.5rem' }}>{t.dash.saved}</p>}

              <button
                onClick={handleSaveHolidays}
                disabled={holidayLoading || selectedDates.length === 0}
                style={{ width: '100%', backgroundColor: selectedDates.length === 0 ? '#e5e7eb' : '#2563eb', color: selectedDates.length === 0 ? '#9ca3af' : 'white', padding: '0.625rem', borderRadius: '8px', border: 'none', cursor: selectedDates.length === 0 ? 'not-allowed' : 'pointer', fontWeight: '600', fontSize: '0.8rem' }}
              >
                {holidayLoading ? t.dash.saving : `💾 ${t.dash.save_btn}`}
              </button>
            </div>

            {/* Lista */}
            <div style={{ backgroundColor: 'white', padding: '1.25rem', borderRadius: '16px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
              <p style={{ fontWeight: '700', color: '#111827', marginBottom: '0.75rem', fontSize: '0.9rem' }}>{t.dash.holidays_set_title}</p>
              {holidays.length === 0 ? (
                <p style={{ color: '#9ca3af', fontSize: '0.8rem' }}>{t.dash.holidays_none}</p>
              ) : (
                holidays.map(holiday => (
                  <div key={holiday.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.4rem 0', borderBottom: '1px solid #f3f4f6' }}>
                    <div>
                      <p style={{ fontSize: '0.8rem', fontWeight: '600', color: '#111827' }}>{holiday.date}</p>
                      <p style={{ fontSize: '0.7rem', color: '#9ca3af' }}>
                        {holiday.label}
                        {holiday.start_time && holiday.end_time && ` · ${holiday.start_time.slice(0,5)}—${holiday.end_time.slice(0,5)}`}
                      </p>
                    </div>
                    <button
                      onClick={() => handleDeleteHoliday(holiday.id)}
                      style={{ backgroundColor: '#fee2e2', color: '#ef4444', border: 'none', borderRadius: '6px', padding: '0.2rem 0.5rem', cursor: 'pointer', fontSize: '0.7rem' }}
                    >🗑️</button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}