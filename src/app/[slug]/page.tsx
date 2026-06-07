'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useParams } from 'next/navigation'
import Image from 'next/image'


const MONTHS = ['Január', 'Február', 'Március', 'Április', 'Május', 'Június', 'Július', 'Augusztus', 'Szeptember', 'Október', 'November', 'December']
const DAY_LABELS = ['H', 'K', 'Sze', 'Cs', 'P', 'Szo', 'V']

export default function BookingPage() {
  const params = useParams()
  const slug = params.slug as string

  const [daysLoading, setDaysLoading] = useState(false)
  const [tenant, setTenant] = useState<Record<string, string> | null>(null)
  const [services, setServices] = useState<Record<string, string | number>[]>([])
  const [selectedService, setSelectedService] = useState<Record<string, string | number> | null>(null)
  const [availableDays, setAvailableDays] = useState<number[]>([])
  const [selectedDate, setSelectedDate] = useState('')
  const [selectedSlot, setSelectedSlot] = useState('')
  const [bookingHorizon, setBookingHorizon] = useState(30)
  const [slots, setSlots] = useState<string[]>([])
  const [slotsLoading, setSlotsLoading] = useState(false)
  const [slotsReason, setSlotsReason] = useState('')
  const [closedDays, setClosedDays] = useState<number[]>([])
  const [holidayDates, setHolidayDates] = useState<string[]>([])
  const [partialHolidayDates, setPartialHolidayDates] = useState<string[]>([])
  const [step, setStep] = useState(1)
  const [notFound, setNotFound] = useState(false)
  const today = new Date()
  const [currentMonth, setCurrentMonth] = useState(today.getMonth())
  const [currentYear, setCurrentYear] = useState(today.getFullYear())
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [bookingLoading, setBookingLoading] = useState(false)
  const [bookingSuccess, setBookingSuccess] = useState(false)
  const [bookingError, setBookingError] = useState('')
  const [waitlistMode, setWaitlistMode] = useState(false)
  const [waitlistLoading, setWaitlistLoading] = useState(false)
  const [waitlistSuccess, setWaitlistSuccess] = useState(false)
  const [waitlistError, setWaitlistError] = useState('')
  const [staffList, setStaffList] = useState<{ id: string; name: string; profile_photo: string | null; bio: string | null }[]>([])
  const [selectedStaff, setSelectedStaff] = useState<{ id: string; name: string; profile_photo: string | null; bio: string | null } | null>(null)
  const [staffEarliestSlots, setStaffEarliestSlots] = useState<Record<string, { date: string; slots: string[] } | null>>({})
  const [loadingEarliestSlots, setLoadingEarliestSlots] = useState(false)
  const slotsRef = useRef<HTMLDivElement>(null)
  const continueRef = useRef<HTMLButtonElement>(null)

  // Load tenant + services + hours + holidays
  useEffect(() => {
    const getData = async () => {
      const { data: tenantData } = await supabase.from('tenants').select('*').eq('slug', slug).single()
      if (!tenantData) { setNotFound(true); return }
      setTenant(tenantData)

      const { data: servicesData } = await supabase.from('services').select('*').eq('tenant_id', tenantData.id)
      setServices(servicesData || [])

      const { data: hoursData } = await supabase.from('opening_hours').select('day_of_week, is_closed').eq('tenant_id', tenantData.id)
      if (hoursData) {
        const allDays = [0, 1, 2, 3, 4, 5, 6]
        const openDays = hoursData.filter((d: Record<string, boolean | number>) => !d.is_closed).map((d: Record<string, boolean | number>) => d.day_of_week as number)
        setClosedDays(allDays.filter(d => !openDays.includes(d)))
      }
      setBookingHorizon(tenantData.booking_horizon || 30)

      const { data: holidayData } = await supabase.from('holidays').select('date, start_time, end_time').eq('tenant_id', tenantData.id)
      setHolidayDates((holidayData || []).map((h: Record<string, string>) => h.date))
      setPartialHolidayDates((holidayData || []).filter((h: Record<string, string | null>) => h.start_time !== null).map((h: Record<string, string>) => h.date))

      const { data: staffData } = await supabase.from('staff').select('id, name, profile_photo, bio').eq('tenant_id', tenantData.id).order('is_owner', { ascending: false })
      const loaded = (staffData || []).map((s: Record<string, string>) => ({ id: s.id, name: s.name, profile_photo: s.profile_photo || null, bio: s.bio || null }))
      setStaffList(loaded)
      if (loaded.length === 1) setSelectedStaff(loaded[0])
    }
    getData()
  }, [slug])

  // Load slots when date or service changes
  useEffect(() => {
    if (!selectedDate || !selectedService || !tenant) return
    const fetchSlots = async () => {
      setSlotsLoading(true)
      setSlotsReason('')
      setSlots([])
      setWaitlistMode(false)
      setWaitlistSuccess(false)
      setWaitlistError('')
      const staffParam = selectedStaff ? `&staffId=${selectedStaff.id}` : ''
      const r = await fetch(`/api/google/slots?tenantId=${tenant.id}&date=${selectedDate}&duration=${selectedService.duration_minutes}&interval=${selectedService.slot_interval || 0}${staffParam}`)
      const data = await r.json()
      setSlots(data.slots || [])
      setSlotsReason(data.reason || '')
      setSlotsLoading(false)
      setTimeout(() => slotsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50)
    }
    fetchSlots()
  }, [selectedDate, selectedService, tenant, selectedStaff])

  // Load available days when month or service changes
  useEffect(() => {
    if (!tenant || !selectedService) return
    const fetchAvailableDays = async () => {
      setDaysLoading(true)
      const staffParam = selectedStaff ? `&staffId=${selectedStaff.id}` : ''
      const r = await fetch(`/api/google/available-days?tenantId=${tenant.id}&year=${currentYear}&month=${currentMonth + 1}&duration=${selectedService.duration_minutes}&interval=${selectedService.slot_interval || 0}&horizon=${bookingHorizon}${staffParam}`)
      const data = await r.json()
      setAvailableDays(data.availableDays || [])
      setDaysLoading(false)
    }
    fetchAvailableDays()
  }, [tenant, selectedService, currentMonth, currentYear, bookingHorizon, selectedStaff])

  // Load earliest 2 slots per staff when step 2 opens
  useEffect(() => {
    if (step !== 2 || !selectedService || !tenant || staffList.length === 0) return
    const fetchAll = async () => {
      setStaffEarliestSlots({})
      setLoadingEarliestSlots(true)
      const results: Record<string, { date: string; slots: string[] } | null> = {}
      await Promise.all(staffList.map(async (s) => {
        for (let offset = 0; offset < 3; offset++) {
          const d = new Date()
          d.setMonth(d.getMonth() + offset)
          const year = d.getFullYear()
          const month = d.getMonth() + 1
          const r = await fetch(`/api/google/available-days?tenantId=${tenant.id}&year=${year}&month=${month}&duration=${selectedService.duration_minutes}&interval=${selectedService.slot_interval || 0}&horizon=${bookingHorizon}&staffId=${s.id}`)
          const data = await r.json()
          const days: number[] = data.availableDays || []
          if (days.length > 0) {
            const now = new Date()
            const isCurrentMonth = year === now.getFullYear() && month === now.getMonth() + 1
            const minDay = isCurrentMonth ? now.getDate() : 1
            const futureDays = days.filter(day => day >= minDay)
            if (futureDays.length > 0) {
              const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(futureDays[0]).padStart(2, '0')}`
              const sr = await fetch(`/api/google/slots?tenantId=${tenant.id}&date=${dateStr}&duration=${selectedService.duration_minutes}&interval=${selectedService.slot_interval || 0}&staffId=${s.id}`)
              const sd = await sr.json()
              const firstSlots: string[] = (sd.slots || []).slice(0, 2)
              if (firstSlots.length > 0) {
                results[s.id] = { date: dateStr, slots: firstSlots }
                return
              }
            }
          }
        }
        results[s.id] = null
      }))
      setStaffEarliestSlots(results)
      setLoadingEarliestSlots(false)
    }
    fetchAll()
  }, [step, selectedService, tenant, staffList, bookingHorizon])

  const handleBooking = async () => {
    if (!tenant || !selectedService || !selectedDate || !selectedSlot) return
    setBookingLoading(true)
    setBookingError('')
    const res = await fetch('/api/bookings/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tenantId: tenant.id, serviceId: selectedService.id, staffId: selectedStaff?.id, date: selectedDate, slot: selectedSlot, duration: selectedService.duration_minutes, firstName, lastName, email, phone }),
    })
    const data = await res.json()
    if (data.error) setBookingError(data.error)
    else setBookingSuccess(true)
    setBookingLoading(false)
  }

  const handleWaitlist = async () => {
    if (!tenant || !email) return
    setWaitlistLoading(true)
    setWaitlistError('')
    const res = await fetch('/api/waitlist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tenantId: tenant.id,
        staffId: selectedStaff?.id,
        serviceId: selectedService?.id,
        firstName,
        lastName,
        email,
        phone,
      }),
    })
    const data = await res.json()
    if (data.error) setWaitlistError(data.error)
    else setWaitlistSuccess(true)
    setWaitlistLoading(false)
  }

  const formatDateStr = (year: number, month: number, day: number) => {
    const m = (month + 1).toString().padStart(2, '0')
    const d = day.toString().padStart(2, '0')
    return `${year}-${m}-${d}`
  }

  const getDaysInMonth = (month: number, year: number) => new Date(year, month + 1, 0).getDate()
  const getFirstDayOfMonth = (month: number, year: number) => {
    const day = new Date(year, month, 1).getDay()
    return day === 0 ? 6 : day - 1
  }

  const isDisabled = (day: number) => {
    const date = new Date(currentYear, currentMonth, day)
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate())
    if (date < todayStart) return true
    if (closedDays.includes(date.getDay())) return true
    const dateStr = formatDateStr(currentYear, currentMonth, day)
    if (holidayDates.includes(dateStr) && !partialHolidayDates.includes(dateStr)) return true
    const horizonEnd = new Date(today.getFullYear(), today.getMonth(), today.getDate() + bookingHorizon)
    if (date > horizonEnd) return true
    return false
  }

  const isBookedOut = (day: number) => {
    if (isDisabled(day)) return false
    return availableDays.length > 0 && !availableDays.includes(day)
  }

  const formatShortDate = (dateStr: string) => {
    const [year, month, day] = dateStr.split('-').map(Number)
    const d = new Date(year, month - 1, day)
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate())
    const tomorrowStart = new Date(todayStart.getTime() + 86400000)
    if (d.getTime() === todayStart.getTime()) return 'Ma'
    if (d.getTime() === tomorrowStart.getTime()) return 'Holnap'
    return `${month}. ${day}.`
  }

  const handleQuickBook = (staff: typeof staffList[0], date: string, slot: string) => {
    setSelectedStaff(staff)
    setSelectedDate(date)
    setSelectedSlot(slot)
    goToStep(4)
  }

  const handlePrevMonth = () => {
    if (currentMonth === today.getMonth() && currentYear === today.getFullYear()) return
    if (currentMonth === 0) { setCurrentMonth(11); setCurrentYear(y => y - 1) }
    else setCurrentMonth(m => m - 1)
  }

  const handleNextMonth = () => {
    if (currentMonth === 11) { setCurrentMonth(0); setCurrentYear(y => y + 1) }
    else setCurrentMonth(m => m + 1)
  }

  const isPrevDisabled = currentMonth === today.getMonth() && currentYear === today.getFullYear()
  const daysInMonth = getDaysInMonth(currentMonth, currentYear)
  const firstDay = getFirstDayOfMonth(currentMonth, currentYear)

  const primaryColor = (tenant as Record<string, string>)?.booking_primary_color || '#1e3a8a'
  const accentColor = (tenant as Record<string, string>)?.booking_accent_color || '#2563eb'

  const globalEarliest = staffList.reduce<{ staff: typeof staffList[0]; date: string; slot: string } | null>((best, s) => {
    const info = staffEarliestSlots[s.id]
    if (!info || info.slots.length === 0) return best
    const candidate = { staff: s, date: info.date, slot: info.slots[0] }
    if (!best) return candidate
    if (info.date < best.date || (info.date === best.date && info.slots[0] < best.slot)) return candidate
    return best
  }, null)
  const transitionType = (tenant as Record<string, string>)?.booking_transition || 'swipe'
  const serviceLayout = (tenant as Record<string, string>)?.service_layout || 'list'
  const staffLayout = (tenant as Record<string, string>)?.staff_layout || 'list'
  const [slideState, setSlideState] = useState<{ from: number; to: number; phase: 'setup' | 'moving' } | null>(null)
  const [activeAnim, setActiveAnim] = useState<string>('fade')

  const goToStep = useCallback((newStep: number) => {
    if (slideState) return
    const RANDOM_EFFECTS = ['swipe','fade','slide-up','zoom','slide-down','bounce','flip','pop','wipe','tilt','spin','drop','elastic','ripple']
    const effective = transitionType === 'random'
      ? RANDOM_EFFECTS[Math.floor(Math.random() * RANDOM_EFFECTS.length)]
      : transitionType
    if (transitionType === 'random') setActiveAnim(effective)
    if (effective === 'swipe') {
      const fromStep = step
      setStep(newStep)
      setSlideState({ from: fromStep, to: newStep, phase: 'setup' })
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setSlideState(s => s ? { ...s, phase: 'moving' } : null)
        })
      })
      setTimeout(() => setSlideState(null), 400)
    } else {
      setStep(newStep)
    }
  }, [slideState, step, transitionType])

  // ─── Special states ───────────────────────────────────────────────────────────

  if (notFound) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0f172a' }}>
      <p style={{ color: 'white', fontSize: '1.5rem' }}>404 — Ez az oldal nem található</p>
    </div>
  )

  if (!tenant) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0f172a' }}>
      <p style={{ color: 'white' }}>Betöltés...</p>
    </div>
  )

  if (bookingSuccess) return (
    <div style={{ minHeight: '100vh', background: `linear-gradient(135deg, #0f172a, ${primaryColor})`, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
      <div style={{ textAlign: 'center', maxWidth: '400px' }}>
        <div style={{ width: '80px', height: '80px', borderRadius: '50%', backgroundColor: '#22c55e', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.5rem', fontSize: '2.5rem' }}>✓</div>
        <h2 style={{ color: 'white', fontSize: '2rem', fontWeight: '800', marginBottom: '0.75rem' }}>Foglalás kész!</h2>
        <p style={{ color: '#93c5fd', marginBottom: '2rem', lineHeight: 1.7 }}>
          Visszaigazolást küldtünk a <strong style={{ color: 'white' }}>{email}</strong> címre.
        </p>
        <div style={{ backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: '16px', padding: '1.5rem', textAlign: 'left' }}>
          <p style={{ color: '#93c5fd', fontSize: '0.8rem', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Foglalás részletei</p>
          <p style={{ color: 'white', fontWeight: '700', fontSize: '1.1rem' }}>{selectedService?.name as string}</p>
          <p style={{ color: '#93c5fd', marginTop: '0.25rem' }}>{selectedDate} · {selectedSlot}</p>
          <p style={{ color: '#93c5fd' }}>{lastName} {firstName}</p>
        </div>
      </div>
    </div>
  )

  // ─── Main render ──────────────────────────────────────────────────────────────

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc', position: 'relative' }}>
      {/* Logo háttér vízjel */}
      {tenant.logo_url && tenant.logo_in_background && (
        <div style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none', zIndex: 0 }}>
          <Image src={tenant.logo_url as string} alt="" width={520} height={400} sizes="55vw" style={{ width: `${Number(tenant.logo_bg_size) || 55}%`, maxWidth: '520px', height: 'auto', opacity: Number(tenant.logo_bg_opacity) || 0.08, objectFit: 'contain', userSelect: 'none' }} />
        </div>
      )}
      <style>{`
        @keyframes bkFadeIn    { from{opacity:0} to{opacity:1} }
        @keyframes bkSlideUp   { from{transform:translateY(22px);opacity:0} to{transform:translateY(0);opacity:1} }
        @keyframes bkZoomIn    { from{transform:scale(0.96);opacity:0} to{transform:scale(1);opacity:1} }
        @keyframes bkSlideDown { from{transform:translateY(-22px);opacity:0} to{transform:translateY(0);opacity:1} }
        @keyframes bkBounce    { 0%{transform:scale(0.85);opacity:0} 70%{transform:scale(1.07)} 100%{transform:scale(1);opacity:1} }
        @keyframes bkFlip      { from{transform:rotateY(90deg);opacity:0} to{transform:rotateY(0deg);opacity:1} }
        @keyframes bkPop       { 0%{transform:scale(0.7);opacity:0} 70%{transform:scale(1.08)} 100%{transform:scale(1);opacity:1} }
        @keyframes bkWipe      { from{transform:translateX(-40px);opacity:0} to{transform:translateX(0);opacity:1} }
        @keyframes bkTilt      { from{transform:skewX(12deg) translateX(-15px);opacity:0} to{transform:skewX(0deg) translateX(0);opacity:1} }
        @keyframes bkSpin      { from{transform:rotate(-130deg) scale(0.6);opacity:0} to{transform:rotate(0deg) scale(1);opacity:1} }
        @keyframes bkDrop      { 0%{transform:translateY(-28px) scale(1.04);opacity:0} 80%{transform:translateY(2px) scale(0.98)} 100%{transform:translateY(0) scale(1);opacity:1} }
        @keyframes bkElastic   { 0%{transform:scale(0.5);opacity:0} 55%{transform:scale(1.12)} 75%{transform:scale(0.93)} 90%{transform:scale(1.04)} 100%{transform:scale(1);opacity:1} }
        @keyframes bkRipple    { 0%{transform:scale(0.4);opacity:0} 60%{transform:scale(1.06)} 80%{transform:scale(0.97)} 100%{transform:scale(1);opacity:1} }

        /* ── Mobile optimalizáció ── */
        .bk-hero          { padding: 2.5rem 2rem; }
        .bk-hero-title    { font-size: 1.75rem; }
        .bk-hero-logo     { width: 64px; height: 64px; }
        .bk-content       { padding: 2rem 1rem; }
        .bk-card          { padding: 1.5rem; }
        .bk-calendar      { padding: 1.5rem; }
        .bk-name-row      { display: flex; gap: 1rem; }
        .bk-slot-btn      { padding: 0.625rem 1.25rem; font-size: 0.9rem; }
        .bk-continue-btn  { font-size: 1.1rem; padding: 1rem; }
        .bk-day-num       { font-size: 0.9rem; min-height: 36px; }
        @media (max-width: 480px) {
          .bk-hero         { padding: 1.25rem 1rem !important; }
          .bk-hero-title   { font-size: 1.25rem !important; }
          .bk-hero-logo    { width: 46px !important; height: 46px !important; }
          .bk-content      { padding: 1rem 0.75rem !important; }
          .bk-card         { padding: 1rem !important; }
          .bk-calendar     { padding: 1rem !important; }
          .bk-name-row     { flex-direction: column !important; gap: 0.75rem !important; }
          .bk-slot-btn     { padding: 0.75rem 1rem !important; font-size: 1rem !important; min-height: 44px; }
          .bk-continue-btn { font-size: 1rem !important; padding: 0.9rem !important; }
          .bk-day-num      { font-size: 0.8rem !important; min-height: 40px !important; }
        }
      `}</style>

      {/* Hero header */}
      <div className="bk-hero" style={{ background: `linear-gradient(135deg, #0f172a 0%, ${primaryColor} 100%)`, position: 'relative', zIndex: 1 }}>
        <div style={{ maxWidth: '700px', margin: '0 auto', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem', textAlign: 'center' }}>
          {tenant.logo_url && (tenant.logo_in_header as unknown) !== false && tenant.logo_in_header !== 'false' && (
            <Image className="bk-hero-logo" src={tenant.logo_url as string} alt={tenant.name as string} width={64} height={64}
              style={{ borderRadius: '50%', objectFit: 'cover', border: '3px solid rgba(255,255,255,0.2)', flexShrink: 0 }} />
          )}
          <div>
            <h1 className="bk-hero-title" style={{ color: 'white', fontWeight: '800', marginBottom: '0.25rem' }}>{tenant.name as string}</h1>
            {tenant.description && <p style={{ color: '#93c5fd', fontSize: '0.9rem', marginTop: 0 }}>{tenant.description as string}</p>}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="bk-content" style={{ maxWidth: '700px', margin: '0 auto', position: 'relative', zIndex: 1 }}>
        {(() => {
          const renderStep = (n: number): React.ReactNode => (<>

        {/* ── STEP 1: Service selection ── */}
        {n === 1 && (
          <div>
            <p style={{ fontSize: '0.8rem', fontWeight: '700', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '1rem' }}>
              Milyen szolgáltatást keresel?
            </p>
            <div style={serviceLayout === 'grid' ? { display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.75rem' } : {}}>
              {(services as Record<string, string | number>[]).map(service => (
                <div key={service.id as string}
                  onClick={() => {
                    setSelectedService(service)
                    if (staffList.length > 1) goToStep(2)
                    else goToStep(3)
                  }}
                  style={serviceLayout === 'grid'
                    ? { backgroundColor: 'rgba(255,255,255,0.82)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)', borderRadius: '16px', padding: '1.25rem', cursor: 'pointer', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', border: `2px solid ${service.color ? service.color + '40' : 'transparent'}`, display: 'flex', flexDirection: 'column', gap: '0.75rem', borderTop: service.color ? `4px solid ${service.color}` : undefined }
                    : { backgroundColor: 'rgba(255,255,255,0.82)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)', borderRadius: '16px', padding: '1.5rem', marginBottom: '0.75rem', cursor: 'pointer', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', border: `2px solid ${service.color ? service.color + '40' : 'transparent'}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderLeft: service.color ? `4px solid ${service.color}` : undefined }
                  }
                  onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.borderColor = service.color as string || accentColor; (e.currentTarget as HTMLDivElement).style.boxShadow = '0 4px 20px rgba(0,0,0,0.12)' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.borderColor = service.color ? (service.color as string) + '40' : 'transparent'; (e.currentTarget as HTMLDivElement).style.boxShadow = '0 2px 8px rgba(0,0,0,0.06)' }}
                >
                  {serviceLayout === 'grid' ? (
                    <>
                      <div style={{ width: '44px', height: '44px', borderRadius: '12px', backgroundColor: service.color ? (service.color as string) + '20' : '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.4rem', overflow: 'hidden', flexShrink: 0 }}>
                        {service.icon_url ? <Image src={service.icon_url as string} alt="" width={44} height={44} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : '✂️'}
                      </div>
                      <div style={{ flex: 1 }}>
                        <p style={{ fontWeight: '700', color: '#111827', fontSize: '0.95rem', marginBottom: '0.2rem' }}>{service.name as string}</p>
                        {service.description && <p style={{ fontSize: '0.8rem', color: '#6b7280', lineHeight: 1.5, marginBottom: '0.35rem', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }} dangerouslySetInnerHTML={{ __html: service.description as string }} />}
                        <p style={{ fontSize: '0.8rem', color: '#6b7280' }}>⏱ {service.duration_minutes as number} perc</p>
                        {service.price && <p style={{ fontWeight: '800', color: accentColor, fontSize: '1rem', marginTop: '0.25rem' }}>{(service.price as number).toLocaleString('hu-HU')} {service.currency === 'EUR' ? '€' : 'Ft'}</p>}
                      </div>
                    </>
                  ) : (
                    <>
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem', flex: 1 }}>
                        <div style={{ width: '48px', height: '48px', borderRadius: '12px', backgroundColor: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem', flexShrink: 0, overflow: 'hidden' }}>
                          {service.icon_url ? <Image src={service.icon_url as string} alt="" width={48} height={48} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : '✂️'}
                        </div>
                        <div style={{ flex: 1 }}>
                          <p style={{ fontWeight: '700', color: '#111827', fontSize: '1rem', marginBottom: '0.2rem' }}>{service.name as string}</p>
                          {service.description && <p style={{ fontSize: '0.85rem', color: '#6b7280', lineHeight: 1.55, marginBottom: '0.3rem' }} dangerouslySetInnerHTML={{ __html: service.description as string }} />}
                          <p style={{ fontSize: '0.875rem', color: '#9ca3af' }}>⏱ {service.duration_minutes as number} perc</p>
                        </div>
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: '0.75rem' }}>
                        {service.price && <p style={{ fontWeight: '800', color: accentColor, fontSize: '1.25rem' }}>{(service.price as number).toLocaleString('hu-HU')} {service.currency === 'EUR' ? '€' : 'Ft'}</p>}
                        <p style={{ fontSize: '0.75rem', color: '#9ca3af', marginTop: '0.2rem' }}>Kattints →</p>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── STEP 2: Staff selection ── */}
        {n === 2 && (
          <div>
            <button onClick={() => goToStep(1)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280', fontSize: '0.875rem', marginBottom: '1.5rem' }}>← Vissza</button>
            <p style={{ fontSize: '0.8rem', fontWeight: '700', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '1rem' }}>Ki foglalkozzon veled?</p>

            {/* ── Speciális opciók ── */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem', marginBottom: '1rem' }}>

              {/* Mindegy melyik */}
              <div onClick={() => { setSelectedStaff(staffList[Math.floor(Math.random() * staffList.length)]); goToStep(3) }}
                style={{ backgroundColor: 'rgba(255,255,255,0.82)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)', borderRadius: '16px', padding: '1rem 1.25rem', cursor: 'pointer', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', border: `2px solid transparent`, display: 'flex', alignItems: 'center', gap: '1rem' }}
                onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.borderColor = accentColor }}
                onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.borderColor = 'transparent' }}
              >
                <div style={{ width: '48px', height: '48px', borderRadius: '50%', backgroundColor: `${accentColor}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.4rem', flexShrink: 0 }}>👥</div>
                <div style={{ flex: 1 }}>
                  <p style={{ fontWeight: '700', color: '#111827', fontSize: '0.95rem', marginBottom: '2px' }}>Mindegy melyik munkás</p>
                  <p style={{ fontSize: '0.8rem', color: '#6b7280' }}>Bármelyik szabad munkatárshoz foglalhatsz</p>
                </div>
                <span style={{ color: '#9ca3af', fontSize: '1.1rem' }}>→</span>
              </div>

              {/* Aki leghamarabb ráér */}
              <div
                onClick={() => globalEarliest && handleQuickBook(globalEarliest.staff, globalEarliest.date, globalEarliest.slot)}
                style={{ backgroundColor: 'rgba(255,255,255,0.82)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)', borderRadius: '16px', padding: '1rem 1.25rem', cursor: globalEarliest ? 'pointer' : 'default', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', border: `2px solid transparent`, display: 'flex', alignItems: 'center', gap: '1rem', opacity: !loadingEarliestSlots && !globalEarliest ? 0.5 : 1 }}
                onMouseEnter={e => { if (globalEarliest) (e.currentTarget as HTMLDivElement).style.borderColor = accentColor }}
                onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.borderColor = 'transparent' }}
              >
                <div style={{ width: '48px', height: '48px', borderRadius: '50%', backgroundColor: '#fef3c715', border: '1px solid #fde68a', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.4rem', flexShrink: 0 }}>⚡</div>
                <div style={{ flex: 1 }}>
                  <p style={{ fontWeight: '700', color: '#111827', fontSize: '0.95rem', marginBottom: '2px' }}>Aki leghamarabb ráér</p>
                  {loadingEarliestSlots
                    ? <p style={{ fontSize: '0.8rem', color: '#9ca3af' }}>Betöltés...</p>
                    : globalEarliest
                      ? <p style={{ fontSize: '0.8rem', color: '#6b7280' }}>📅 <strong style={{ color: accentColor }}>{formatShortDate(globalEarliest.date)} {globalEarliest.slot}</strong> — {globalEarliest.staff.name}</p>
                      : <p style={{ fontSize: '0.8rem', color: '#9ca3af' }}>Nincs elérhető időpont</p>
                  }
                </div>
                {globalEarliest && <span style={{ color: '#9ca3af', fontSize: '1.1rem' }}>→</span>}
              </div>
            </div>

            {/* Elválasztó */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
              <div style={{ flex: 1, height: '1px', backgroundColor: '#e5e7eb' }} />
              <p style={{ fontSize: '0.72rem', color: '#9ca3af', whiteSpace: 'nowrap' }}>vagy konkrét munkatárs</p>
              <div style={{ flex: 1, height: '1px', backgroundColor: '#e5e7eb' }} />
            </div>

            {/* ── Munkás kártyák ── */}
            <div style={staffLayout === 'grid' ? { display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.75rem' } : { display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {staffList.map(s => {
                const earliest = staffEarliestSlots[s.id]
                return (
                  <div key={s.id}
                    onClick={() => { setSelectedStaff(s); goToStep(3) }}
                    style={{ backgroundColor: 'rgba(255,255,255,0.82)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)', borderRadius: '16px', cursor: 'pointer', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', border: `2px solid ${selectedStaff?.id === s.id ? accentColor : 'transparent'}`, display: 'flex', flexDirection: staffLayout === 'grid' ? 'column' : 'row', alignItems: 'center', gap: staffLayout === 'grid' ? '0.5rem' : '1rem', padding: staffLayout === 'grid' ? '1.25rem 0.75rem' : '1rem 1.25rem', textAlign: staffLayout === 'grid' ? 'center' : 'left' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.borderColor = accentColor }}
                    onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.borderColor = selectedStaff?.id === s.id ? accentColor : 'transparent' }}
                  >
                    {s.profile_photo
                      ? <div style={{ width: staffLayout === 'grid' ? '60px' : '52px', height: staffLayout === 'grid' ? '60px' : '52px', borderRadius: '50%', overflow: 'hidden', flexShrink: 0, border: `2px solid ${accentColor}30` }}>
                          <Image src={s.profile_photo} alt={s.name} width={60} height={60} style={{ objectFit: 'cover', width: '100%', height: '100%' }} />
                        </div>
                      : <div style={{ width: staffLayout === 'grid' ? '60px' : '52px', height: staffLayout === 'grid' ? '60px' : '52px', borderRadius: '50%', backgroundColor: `${accentColor}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: staffLayout === 'grid' ? '1.6rem' : '1.4rem', flexShrink: 0 }}>👤</div>
                    }
                    <div style={{ flex: staffLayout === 'grid' ? undefined : 1, minWidth: 0, width: '100%' }}>
                      <p style={{ fontWeight: '700', color: '#111827', fontSize: staffLayout === 'grid' ? '0.88rem' : '0.95rem', marginBottom: s.bio && staffLayout === 'list' ? '0.2rem' : '0.375rem' }}>{s.name}</p>
                      {s.bio && staffLayout === 'list' && <p style={{ fontSize: '0.8rem', color: '#6b7280', lineHeight: 1.5, marginBottom: '0.375rem', display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical', overflow: 'hidden' }} dangerouslySetInnerHTML={{ __html: s.bio }} />}
                      {/* Legkorábbi időpontok */}
                      <div style={{ display: 'flex', gap: '0.375rem', flexWrap: 'wrap', justifyContent: staffLayout === 'grid' ? 'center' : 'flex-start' }} onClick={e => e.stopPropagation()}>
                        {loadingEarliestSlots && earliest === undefined && (
                          <span style={{ fontSize: '0.7rem', color: '#9ca3af' }}>betöltés...</span>
                        )}
                        {earliest && earliest.slots.map(slot => (
                          <button key={slot}
                            onClick={e => { e.stopPropagation(); handleQuickBook(s, earliest.date, slot) }}
                            style={{ fontSize: '0.72rem', fontWeight: '600', padding: '0.2rem 0.5rem', borderRadius: '6px', border: `1px solid ${accentColor}40`, backgroundColor: `${accentColor}10`, color: accentColor, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                            📅 {formatShortDate(earliest.date)} {slot}
                          </button>
                        ))}
                        {earliest === null && (
                          <span style={{ fontSize: '0.7rem', color: '#9ca3af' }}>Nincs szabad időpont</span>
                        )}
                      </div>
                    </div>
                    {staffLayout === 'list' && (
                      <div style={{ width: '24px', height: '24px', borderRadius: '50%', border: `2px solid ${selectedStaff?.id === s.id ? accentColor : '#e5e7eb'}`, backgroundColor: selectedStaff?.id === s.id ? accentColor : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        {selectedStaff?.id === s.id && <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: 'white' }} />}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* ── STEP 3: Date + time slot ── */}
        {n === 3 && (
          <div>
            <button onClick={() => goToStep(staffList.length > 1 ? 2 : 1)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280', fontSize: '0.875rem', marginBottom: '1.5rem' }}>← Vissza</button>

            {/* Selected service + staff card */}
            <div style={{ borderRadius: '16px', marginBottom: '1.5rem', overflow: 'hidden', boxShadow: '0 2px 12px rgba(0,0,0,0.08)', border: `1px solid ${selectedService?.color ? (selectedService.color as string) + '40' : '#e5e7eb'}` }}>
              {/* Color accent top bar */}
              <div style={{ height: '4px', backgroundColor: selectedService?.color as string || accentColor }} />
              {/* Service info */}
              <div style={{ backgroundColor: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)', padding: '1.125rem 1.25rem', display: 'flex', alignItems: 'flex-start', gap: '0.875rem' }}>
                <div style={{ width: '48px', height: '48px', borderRadius: '12px', backgroundColor: selectedService?.color ? (selectedService.color as string) + '18' : '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem', flexShrink: 0, overflow: 'hidden', border: `1px solid ${selectedService?.color ? (selectedService.color as string) + '30' : '#dbeafe'}` }}>
                  {selectedService?.icon_url ? <Image src={selectedService.icon_url as string} alt="" width={48} height={48} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : '✂️'}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: '0.72rem', color: '#9ca3af', marginBottom: '2px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Kiválasztott szolgáltatás</p>
                  <p style={{ fontWeight: '700', color: '#111827', fontSize: '1rem', marginBottom: selectedService?.description ? '0.3rem' : 0 }}>{selectedService?.name as string}</p>
                  {selectedService?.description && (
                    <div style={{ fontSize: '0.8rem', color: '#6b7280', lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }} dangerouslySetInnerHTML={{ __html: selectedService.description as string }} />
                  )}
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  {selectedService?.price ? (
                    <p style={{ fontWeight: '800', fontSize: '1.1rem', color: selectedService?.color as string || accentColor }}>
                      {(selectedService.price as number).toLocaleString('hu-HU')} {selectedService.currency === 'EUR' ? '€' : 'Ft'}
                    </p>
                  ) : null}
                  <p style={{ fontSize: '0.8rem', color: '#9ca3af', marginTop: '2px' }}>⏱ {selectedService?.duration_minutes as number} perc</p>
                </div>
              </div>
              {/* Staff row */}
              {selectedStaff && (
                <div style={{ backgroundColor: 'rgba(248,250,252,0.95)', borderTop: '1px solid #f1f5f9', padding: '0.75rem 1.25rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  {selectedStaff.profile_photo
                    ? <div style={{ width: '36px', height: '36px', borderRadius: '50%', overflow: 'hidden', flexShrink: 0, border: `2px solid ${selectedService?.color as string || accentColor}40` }}>
                        <Image src={selectedStaff.profile_photo} alt={selectedStaff.name} width={36} height={36} style={{ objectFit: 'cover', width: '100%', height: '100%' }} />
                      </div>
                    : <div style={{ width: '36px', height: '36px', borderRadius: '50%', backgroundColor: selectedService?.color ? (selectedService.color as string) + '18' : '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.1rem', flexShrink: 0 }}>👤</div>
                  }
                  <div>
                    <p style={{ fontSize: '0.7rem', color: '#9ca3af', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '1px' }}>Munkatárs</p>
                    <p style={{ fontWeight: '700', color: '#111827', fontSize: '0.9rem' }}>{selectedStaff.name}</p>
                  </div>
                </div>
              )}
            </div>

            <p style={{ fontSize: '0.8rem', fontWeight: '700', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '1rem' }}>Mikor jönnél?</p>

            {/* Calendar */}
            <div className="bk-calendar" style={{ backgroundColor: 'rgba(255,255,255,0.82)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)', borderRadius: '16px', marginBottom: '1rem', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
                <button onClick={handlePrevMonth} disabled={isPrevDisabled}
                  style={{ width: '36px', height: '36px', borderRadius: '50%', border: '2px solid #111827', backgroundColor: 'white', cursor: isPrevDisabled ? 'not-allowed' : 'pointer', opacity: isPrevDisabled ? 0.3 : 1, fontSize: '1.1rem', fontWeight: '700', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#111827' }}>←</button>
                <h3 style={{ fontWeight: '800', color: '#111827', fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  {MONTHS[currentMonth]} {currentYear}
                  {daysLoading && <span style={{ fontSize: '0.75rem', color: '#9ca3af', fontWeight: '400' }}>betöltés...</span>}
                </h3>
                <button onClick={handleNextMonth}
                  style={{ width: '36px', height: '36px', borderRadius: '50%', border: '2px solid #111827', backgroundColor: 'white', cursor: 'pointer', fontSize: '1.1rem', fontWeight: '700', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#111827' }}>→</button>
              </div>

              {/* Day labels */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px', marginBottom: '0.5rem' }}>
                {DAY_LABELS.map(d => (
                  <div key={d} style={{ textAlign: 'center', fontSize: '0.75rem', fontWeight: '700', color: '#9ca3af', padding: '0.25rem' }}>{d}</div>
                ))}
              </div>

              {/* Day grid */}
              <div style={{ position: 'relative' }}>
                {daysLoading && (
                  <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.8)', borderRadius: '8px', zIndex: 10 }}>
                    <p style={{ color: '#6b7280', fontSize: '2rem', fontWeight: '500' }}>⏳ Betöltés...</p>
                  </div>
                )}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px', opacity: daysLoading ? 0.5 : 1, pointerEvents: daysLoading ? 'none' : 'auto' }}>
                  {Array.from({ length: firstDay }).map((_, i) => <div key={`e-${i}`} />)}
                  {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(day => {
                    const dateStr = formatDateStr(currentYear, currentMonth, day)
                    const disabled = isDisabled(day)
                    const bookedOut = isBookedOut(day)
                    const isSelected = selectedDate === dateStr
                    const isHoliday = holidayDates.includes(dateStr)
                    const isToday = today.getDate() === day && today.getMonth() === currentMonth && today.getFullYear() === currentYear
                    return (
                      <button key={day}
                        onClick={() => { if (!disabled) { setSelectedDate(dateStr); setSelectedSlot('') } }}
                        className="bk-day-num"
                        style={{ aspectRatio: '1', borderRadius: '50%', border: 'none', cursor: disabled ? 'not-allowed' : 'pointer', backgroundColor: isSelected ? accentColor : isHoliday ? '#fee2e2' : bookedOut ? '#fff7ed' : isToday ? '#eff6ff' : 'transparent', color: isSelected ? 'white' : isHoliday ? '#ef4444' : disabled ? '#c4c4c4' : bookedOut ? '#d97706' : isToday ? accentColor : '#111827', fontWeight: isSelected || isToday ? '700' : '400', display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', textDecoration: disabled && !isHoliday ? 'line-through' : 'none' }}
                        onMouseEnter={e => { if (!disabled && !isSelected) (e.currentTarget as HTMLButtonElement).style.backgroundColor = bookedOut ? '#fef3c7' : '#f3f4f6' }}
                        onMouseLeave={e => { if (!disabled && !isSelected) (e.currentTarget as HTMLButtonElement).style.backgroundColor = isHoliday ? '#fee2e2' : bookedOut ? '#fff7ed' : 'transparent' }}
                      >{day}</button>
                    )
                  })}
                </div>
              </div>
            </div>

            {/* Slots */}
            {selectedDate && (
              <div ref={slotsRef} style={{ backgroundColor: 'rgba(255,255,255,0.82)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)', borderRadius: '16px', padding: '1.25rem', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
                <p style={{ fontSize: '0.8rem', fontWeight: '700', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '1rem' }}>Szabad időpontok</p>
                {slotsLoading && <div style={{ textAlign: 'center', padding: '2rem', color: '#9ca3af' }}>Betöltés...</div>}
                {!slotsLoading && slotsReason === 'closed' && <div style={{ textAlign: 'center', padding: '1rem', color: '#ef4444' }}>🔴 Ezen a napon zárva vagyunk</div>}
                {!slotsLoading && slotsReason === 'holiday' && <div style={{ textAlign: 'center', padding: '1rem', color: '#ef4444' }}>🏖️ Ezen a napon szabadnap van</div>}
                {!slotsLoading && slotsReason === 'no_calendar' && <div style={{ textAlign: 'center', padding: '1rem', color: '#ef4444' }}>Nincs elérhető naptár</div>}
                {!slotsLoading && slots.length === 0 && !slotsReason && (
                  waitlistSuccess ? (
                    <div style={{ textAlign: 'center', padding: '1.5rem' }}>
                      <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>✓</div>
                      <p style={{ fontWeight: '700', color: '#111827', marginBottom: '0.25rem' }}>Sikeresen feliratkoztál!</p>
                      <p style={{ fontSize: '0.85rem', color: '#6b7280' }}>Értesítünk, amint szabad időpont nyílik.</p>
                    </div>
                  ) : waitlistMode ? (
                    <div>
                      <p style={{ fontSize: '0.85rem', color: '#6b7280', marginBottom: '1rem', textAlign: 'center' }}>
                        Add meg adataidat és értesítünk, amint szabad időpont nyílik ezen a napon.
                      </p>
                      <div className="bk-name-row" style={{ marginBottom: '0.75rem' }}>
                        <div style={{ flex: 1 }}>
                          <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '600', color: '#374151', marginBottom: '0.4rem' }}>Vezetéknév</label>
                          <input type="text" value={lastName} onChange={e => setLastName(e.target.value)}
                            style={{ width: '100%', border: '1px solid #d1d5db', borderRadius: '10px', padding: '0.65rem 0.875rem', color: '#111827', outline: 'none', boxSizing: 'border-box', fontSize: '0.9rem' }}
                            placeholder="Kovács" />
                        </div>
                        <div style={{ flex: 1 }}>
                          <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '600', color: '#374151', marginBottom: '0.4rem' }}>Keresztnév</label>
                          <input type="text" value={firstName} onChange={e => setFirstName(e.target.value)}
                            style={{ width: '100%', border: '1px solid #d1d5db', borderRadius: '10px', padding: '0.65rem 0.875rem', color: '#111827', outline: 'none', boxSizing: 'border-box', fontSize: '0.9rem' }}
                            placeholder="János" />
                        </div>
                      </div>
                      <div style={{ marginBottom: '0.75rem' }}>
                        <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '600', color: '#374151', marginBottom: '0.4rem' }}>Email cím *</label>
                        <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                          style={{ width: '100%', border: '1px solid #d1d5db', borderRadius: '10px', padding: '0.65rem 0.875rem', color: '#111827', outline: 'none', boxSizing: 'border-box', fontSize: '0.9rem' }}
                          placeholder="kovacs.janos@email.com" />
                      </div>
                      <div style={{ marginBottom: '1rem' }}>
                        <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '600', color: '#374151', marginBottom: '0.4rem' }}>Telefonszám</label>
                        <input type="tel" value={phone} onChange={e => setPhone(e.target.value)}
                          style={{ width: '100%', border: '1px solid #d1d5db', borderRadius: '10px', padding: '0.65rem 0.875rem', color: '#111827', outline: 'none', boxSizing: 'border-box', fontSize: '0.9rem' }}
                          placeholder="+36 30 123 4567" />
                      </div>
                      {waitlistError && <p style={{ color: '#ef4444', fontSize: '0.85rem', marginBottom: '0.75rem' }}>{waitlistError}</p>}
                      <div style={{ display: 'flex', gap: '0.625rem' }}>
                        <button onClick={() => setWaitlistMode(false)}
                          style={{ flex: '0 0 auto', padding: '0.75rem 1rem', borderRadius: '10px', border: '1px solid #d1d5db', backgroundColor: 'white', color: '#374151', cursor: 'pointer', fontWeight: '600', fontSize: '0.875rem' }}>
                          Mégse
                        </button>
                        <button onClick={handleWaitlist} disabled={waitlistLoading || !email}
                          style={{ flex: 1, padding: '0.75rem', borderRadius: '10px', border: 'none', backgroundColor: waitlistLoading || !email ? '#e5e7eb' : accentColor, color: waitlistLoading || !email ? '#9ca3af' : 'white', cursor: waitlistLoading || !email ? 'not-allowed' : 'pointer', fontWeight: '700', fontSize: '0.875rem' }}>
                          {waitlistLoading ? 'Feliratkozás...' : 'Feliratkozás a várólistára →'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div style={{ textAlign: 'center', padding: '1rem' }}>
                      <p style={{ color: '#9ca3af', marginBottom: '1rem' }}>Nincs szabad időpont ezen a napon</p>
                      <button onClick={() => setWaitlistMode(true)}
                        style={{ padding: '0.75rem 1.5rem', borderRadius: '10px', border: `2px solid ${accentColor}`, backgroundColor: 'transparent', color: accentColor, cursor: 'pointer', fontWeight: '700', fontSize: '0.9rem' }}>
                        📋 Feliratkozás a várólistára
                      </button>
                    </div>
                  )
                )}
                {!slotsLoading && slots.length > 0 && (
                  <>
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                      {slots.map(slot => (
                        <button key={slot} onClick={() => { setSelectedSlot(slot); setTimeout(() => continueRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 50) }}
                          className="bk-slot-btn"
                          style={{ borderRadius: '10px', border: '2px solid', borderColor: selectedSlot === slot ? accentColor : '#e5e7eb', backgroundColor: selectedSlot === slot ? accentColor : 'rgba(255,255,255,0.88)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)', color: selectedSlot === slot ? 'white' : '#374151', cursor: 'pointer', fontWeight: '600' }}>
                          {slot}
                        </button>
                      ))}
                    </div>
                    {slots.length <= 3 && (
                      <p style={{ marginTop: '0.75rem', fontSize: '0.8rem', color: '#ef4444', fontWeight: '600' }}>
                        🔥 Csak {slots.length} szabad időpont maradt erre a napra!
                      </p>
                    )}
                  </>
                )}
              </div>
            )}

            {selectedSlot && (
              <button ref={continueRef} onClick={() => goToStep(4)}
                className="bk-continue-btn"
                style={{ width: '100%', marginTop: '1rem', backgroundColor: accentColor, color: 'white', borderRadius: '14px', border: 'none', cursor: 'pointer', fontWeight: '700', boxShadow: '0 4px 15px rgba(0,0,0,0.2)' }}>
                Tovább az adatok megadásához →
              </button>
            )}
          </div>
        )}

        {/* ── STEP 4: Booking form ── */}
        {n === 4 && (
          <div>
            <button onClick={() => goToStep(3)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280', fontSize: '0.875rem', marginBottom: '1.5rem' }}>← Vissza</button>

            {/* Summary card */}
            <div style={{ backgroundColor: primaryColor, borderRadius: '16px', padding: '1.25rem 1.5rem', marginBottom: '1.5rem' }}>
              <p style={{ color: '#93c5fd', fontSize: '0.75rem', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '1rem' }}>Foglalás összefoglalója</p>

              {/* Munkatárs sor */}
              {selectedStaff && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem', paddingBottom: '1rem', borderBottom: '1px solid rgba(255,255,255,0.12)' }}>
                  {selectedStaff.profile_photo
                    ? <div style={{ width: '44px', height: '44px', borderRadius: '50%', overflow: 'hidden', flexShrink: 0, border: '2px solid rgba(255,255,255,0.3)' }}>
                        <Image src={selectedStaff.profile_photo} alt={selectedStaff.name} width={44} height={44} style={{ objectFit: 'cover', width: '100%', height: '100%' }} />
                      </div>
                    : <div style={{ width: '44px', height: '44px', borderRadius: '50%', backgroundColor: 'rgba(255,255,255,0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.25rem', flexShrink: 0 }}>👤</div>
                  }
                  <div>
                    <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.72rem', marginBottom: '2px' }}>Munkatárs</p>
                    <p style={{ color: 'white', fontWeight: '700', fontSize: '0.95rem' }}>{selectedStaff.name}</p>
                  </div>
                </div>
              )}

              {/* Szolgáltatás + ár */}
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.75rem', marginBottom: '0.75rem' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.72rem', marginBottom: '2px' }}>Szolgáltatás</p>
                  <p style={{ color: 'white', fontWeight: '700', fontSize: '1rem', marginBottom: selectedService?.description ? '0.3rem' : 0 }}>{selectedService?.name as string}</p>
                  {selectedService?.description && (
                    <div style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.6)', lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }} dangerouslySetInnerHTML={{ __html: selectedService.description as string }} />
                  )}
                </div>
                {selectedService?.price ? (
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.72rem', marginBottom: '2px' }}>Összeg</p>
                    <p style={{ color: 'white', fontWeight: '800', fontSize: '1.15rem' }}>
                      {(selectedService.price as number).toLocaleString('hu-HU')} {selectedService.currency === 'EUR' ? '€' : 'Ft'}
                    </p>
                  </div>
                ) : null}
              </div>

              {/* Időpont */}
              <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                <div>
                  <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.72rem', marginBottom: '2px' }}>Időpont</p>
                  <p style={{ color: 'white', fontSize: '0.875rem', fontWeight: '600' }}>📅 {selectedDate} · 🕐 {selectedSlot}</p>
                </div>
                <div>
                  <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.72rem', marginBottom: '2px' }}>Időtartam</p>
                  <p style={{ color: 'white', fontSize: '0.875rem', fontWeight: '600' }}>⏱ {selectedService?.duration_minutes as number} perc</p>
                </div>
              </div>
            </div>

            <p style={{ fontSize: '0.8rem', fontWeight: '700', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '1rem' }}>Add meg adataidat</p>

            <div className="bk-card" style={{ backgroundColor: 'rgba(255,255,255,0.82)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)', borderRadius: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
              <div className="bk-name-row" style={{ marginBottom: '1rem' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '600', color: '#374151', marginBottom: '0.4rem' }}>Vezetéknév *</label>
                  <input type="text" value={lastName} onChange={e => setLastName(e.target.value)}
                    style={{ width: '100%', border: '1px solid #d1d5db', borderRadius: '10px', padding: '0.75rem 1rem', color: '#111827', outline: 'none', boxSizing: 'border-box', fontSize: '0.9rem' }}
                    placeholder="Kovács" />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '600', color: '#374151', marginBottom: '0.4rem' }}>Keresztnév *</label>
                  <input type="text" value={firstName} onChange={e => setFirstName(e.target.value)}
                    style={{ width: '100%', border: '1px solid #d1d5db', borderRadius: '10px', padding: '0.75rem 1rem', color: '#111827', outline: 'none', boxSizing: 'border-box', fontSize: '0.9rem' }}
                    placeholder="János" />
                </div>
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '600', color: '#374151', marginBottom: '0.4rem' }}>Email cím *</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                  style={{ width: '100%', border: '1px solid #d1d5db', borderRadius: '10px', padding: '0.75rem 1rem', color: '#111827', outline: 'none', boxSizing: 'border-box', fontSize: '0.9rem' }}
                  placeholder="kovacs.janos@email.com" />
              </div>

              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '600', color: '#374151', marginBottom: '0.4rem' }}>Telefonszám</label>
                <input type="tel" value={phone} onChange={e => setPhone(e.target.value)}
                  style={{ width: '100%', border: '1px solid #d1d5db', borderRadius: '10px', padding: '0.75rem 1rem', color: '#111827', outline: 'none', boxSizing: 'border-box', fontSize: '0.9rem' }}
                  placeholder="+36 30 123 4567" />
              </div>

              {/* Lemondási szabályzat — csak ha be van kapcsolva a beállításokban */}
              {tenant.cancellation_policy_enabled && tenant.cancellation_policy_text && (
                <div style={{ backgroundColor: '#fff7ed', border: '1px solid #fed7aa', borderRadius: '10px', padding: '0.875rem 1rem', marginBottom: '1rem' }}>
                  <p style={{ fontSize: '0.8rem', fontWeight: '700', color: '#c2410c', marginBottom: '0.375rem', margin: '0 0 0.375rem' }}>📋 Lemondási szabályzat</p>
                  <p style={{ fontSize: '0.78rem', color: '#7c2d12', lineHeight: 1.6, margin: 0 }}>{tenant.cancellation_policy_text as string}</p>
                </div>
              )}

              {/* Adatvédelmi tájékoztató */}
              <p style={{ fontSize: '0.75rem', color: '#9ca3af', textAlign: 'center', marginBottom: '1rem', lineHeight: 1.6 }}>
                A foglalással elfogadod az{' '}
                <a href="/privacy-policy" target="_blank" rel="noopener noreferrer" style={{ color: accentColor, textDecoration: 'underline' }}>adatvédelmi tájékoztatót</a>.
              </p>

              {bookingError && <p style={{ color: '#ef4444', fontSize: '0.875rem', marginBottom: '1rem' }}>{bookingError}</p>}

              <button onClick={handleBooking} disabled={bookingLoading || !lastName || !firstName || !email}
                className="bk-continue-btn"
                style={{ width: '100%', backgroundColor: bookingLoading || !lastName || !firstName || !email ? '#e5e7eb' : accentColor, color: bookingLoading || !lastName || !firstName || !email ? '#9ca3af' : 'white', borderRadius: '14px', border: 'none', cursor: bookingLoading || !lastName || !firstName || !email ? 'not-allowed' : 'pointer', fontWeight: '700', boxShadow: bookingLoading || !lastName || !firstName || !email ? 'none' : '0 4px 15px rgba(0,0,0,0.2)' }}>
                {bookingLoading ? 'Foglalás...' : 'Foglalás →'}
              </button>
            </div>
          </div>
        )}
          </>)

          // Non-swipe transitions: key forces remount + CSS animation
          const effectiveForRender = transitionType === 'random' ? activeAnim : transitionType
          if (effectiveForRender !== 'swipe') {
            const animMap: Record<string, string> = {
              'fade':       'bkFadeIn    0.3s  ease                     both',
              'slide-up':   'bkSlideUp   0.3s  cubic-bezier(0.4,0,0.2,1) both',
              'zoom':       'bkZoomIn    0.28s cubic-bezier(0.4,0,0.2,1) both',
              'slide-down': 'bkSlideDown 0.3s  cubic-bezier(0.4,0,0.2,1) both',
              'bounce':     'bkBounce    0.45s cubic-bezier(0.4,0,0.2,1) both',
              'flip':       'bkFlip      0.35s ease                     both',
              'pop':        'bkPop       0.4s  cubic-bezier(0.4,0,0.2,1) both',
              'wipe':       'bkWipe      0.32s cubic-bezier(0.4,0,0.2,1) both',
              'tilt':       'bkTilt      0.38s ease                     both',
              'spin':       'bkSpin      0.42s cubic-bezier(0.4,0,0.2,1) both',
              'drop':       'bkDrop      0.42s cubic-bezier(0.4,0,0.2,1) both',
              'elastic':    'bkElastic   0.5s  cubic-bezier(0.4,0,0.2,1) both',
              'ripple':     'bkRipple    0.45s cubic-bezier(0.4,0,0.2,1) both',
            }
            const anim = animMap[effectiveForRender] || 'none'
            return <div key={step} style={{ animation: anim }}>{renderStep(step)}</div>
          }

          if (!slideState) return renderStep(step)
          const isForward = slideState.to > slideState.from
          return (
            <div style={{ overflow: 'hidden' }}>
              <div style={{
                display: 'flex',
                width: '200%',
                transition: slideState.phase === 'moving' ? 'transform 0.38s cubic-bezier(0.4,0,0.2,1)' : 'none',
                transform: `translateX(${slideState.phase === 'setup' ? (isForward ? '0%' : '-50%') : (isForward ? '-50%' : '0%')})`,
                willChange: 'transform',
              }}>
                <div style={{ width: '50%', flexShrink: 0, boxSizing: 'border-box' }}>
                  {renderStep(isForward ? slideState.from : slideState.to)}
                </div>
                <div style={{ width: '50%', flexShrink: 0, boxSizing: 'border-box' }}>
                  {renderStep(isForward ? slideState.to : slideState.from)}
                </div>
              </div>
            </div>
          )
        })()}
      </div>
    </div>
  )
}
