'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

const DAY_NAMES = ['Vasárnap', 'Hétfő', 'Kedd', 'Szerda', 'Csütörtök', 'Péntek', 'Szombat']
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0] // H-V sorrend

interface DaySchedule {
  day_of_week: number
  is_closed: boolean
  open_time: string
  close_time: string
  break_start: string
  break_end: string
}

interface TenantHours {
  day_of_week: number
  is_closed: boolean
  open_time: string
  close_time: string
}

interface Holiday {
  id: string
  date: string
  label: string
}

const defaultDay = (dow: number): DaySchedule => ({
  day_of_week: dow,
  is_closed: true,
  open_time: '09:00',
  close_time: '18:00',
  break_start: '',
  break_end: '',
})

export default function StaffSchedulePage() {
  const [staffId, setStaffId] = useState<string | null>(null)
  const [canManageSchedule, setCanManageSchedule] = useState(false)
  const [canManageHolidays, setCanManageHolidays] = useState(false)
  const [schedule, setSchedule] = useState<Record<number, DaySchedule>>({})
  const [tenantHours, setTenantHours] = useState<Record<number, TenantHours>>({})
  const [holidays, setHolidays] = useState<Holiday[]>([])
  const [slotInterval, setSlotInterval] = useState(0)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [loading, setLoading] = useState(true)
  const [newHolidayDate, setNewHolidayDate] = useState('')
  const [newHolidayLabel, setNewHolidayLabel] = useState('')
  const [addingHoliday, setAddingHoliday] = useState(false)
  const [holidayError, setHolidayError] = useState('')
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])
  const [holidaySuccess, setHolidaySuccess] = useState(false)

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: staffRow } = await supabase
        .from('staff')
        .select('id, tenant_id, slot_interval, can_manage_schedule, can_manage_holidays, is_owner')
        .eq('user_id', user.id)
        .single()

      if (!staffRow) return
      setStaffId(staffRow.id)
      setSlotInterval(staffRow.slot_interval || 0)
      // Tulajdonos mindig szerkeszthet
      setCanManageSchedule(!!staffRow.is_owner || !!staffRow.can_manage_schedule)
      setCanManageHolidays(!!staffRow.is_owner || !!staffRow.can_manage_holidays)

      const [staffHoursRes, tenantHoursRes, holidaysRes] = await Promise.all([
        supabase.from('staff_hours').select('*').eq('staff_id', staffRow.id),
        supabase.from('opening_hours').select('*').eq('tenant_id', staffRow.tenant_id),
        supabase.from('staff_holidays').select('*').eq('staff_id', staffRow.id).order('date'),
      ])

      // Tenant hours mint alap
      const tHours: Record<number, TenantHours> = {}
      for (const h of tenantHoursRes.data || []) {
        tHours[h.day_of_week] = h
      }
      setTenantHours(tHours)

      // Staff hours — ha van beállítva, azt; ha nincs, a tenant alapján init
      const sched: Record<number, DaySchedule> = {}
      for (const dow of DAY_ORDER) {
        const staffH = (staffHoursRes.data || []).find((h: DaySchedule) => h.day_of_week === dow)
        if (staffH) {
          sched[dow] = {
            day_of_week: dow,
            is_closed: staffH.is_closed,
            open_time: staffH.open_time || '09:00',
            close_time: staffH.close_time || '18:00',
            break_start: staffH.break_start || '',
            break_end: staffH.break_end || '',
          }
        } else {
          const tH = tHours[dow]
          sched[dow] = {
            day_of_week: dow,
            is_closed: tH ? tH.is_closed : true,
            open_time: tH?.open_time?.slice(0, 5) || '09:00',
            close_time: tH?.close_time?.slice(0, 5) || '18:00',
            break_start: '',
            break_end: '',
          }
        }
      }
      setSchedule(sched)
      setHolidays(holidaysRes.data || [])
      setLoading(false)
    }
    load()
  }, [])

  const updateDay = (dow: number, field: keyof DaySchedule, value: string | boolean) => {
    setSchedule(prev => ({ ...prev, [dow]: { ...prev[dow], [field]: value } }))
  }

  const handleSave = async () => {
    if (!staffId) return
    setSaving(true)
    setSaved(false)

    // Slot interval mentése
    await supabase.from('staff').update({ slot_interval: slotInterval }).eq('id', staffId)

    // Staff hours upsert
    const rows = DAY_ORDER.map(dow => ({
      staff_id: staffId,
      day_of_week: dow,
      is_closed: schedule[dow]?.is_closed ?? true,
      open_time: schedule[dow]?.open_time || null,
      close_time: schedule[dow]?.close_time || null,
      break_start: schedule[dow]?.break_start || null,
      break_end: schedule[dow]?.break_end || null,
    }))

    await supabase.from('staff_hours').upsert(rows, { onConflict: 'staff_id,day_of_week' })

    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  const handleAddHoliday = async () => {
    if (!staffId || !newHolidayDate) return
    setAddingHoliday(true)
    setHolidayError('')
    setHolidaySuccess(false)
    const { data, error } = await supabase
      .from('staff_holidays')
      .insert({ staff_id: staffId, date: newHolidayDate, label: newHolidayLabel || 'Szabadnap' })
      .select()
      .single()
    if (error) {
      setHolidayError(`Hiba: ${error.message}`)
    } else if (data) {
      setHolidays(prev => [...prev, data].sort((a, b) => a.date.localeCompare(b.date)))
      setNewHolidayDate('')
      setNewHolidayLabel('')
      setHolidaySuccess(true)
      setTimeout(() => setHolidaySuccess(false), 3000)
    }
    setAddingHoliday(false)
  }

  const handleDeleteHoliday = async (id: string) => {
    const { error } = await supabase.from('staff_holidays').delete().eq('id', id)
    if (!error) setHolidays(prev => prev.filter(h => h.id !== id))
    else setHolidayError(`Törlési hiba: ${error.message}`)
  }

  if (loading) return <p style={{ color: '#6b7280' }}>Betöltés...</p>

  return (
    <div>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#111827', marginBottom: '1.5rem' }}>
        🗓️ Beosztásom
      </h1>

      {/* Heti beosztás */}
      <div style={{ backgroundColor: 'white', padding: isMobile ? '1rem' : '1.5rem', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', marginBottom: '1.5rem', maxWidth: '680px', width: '100%', boxSizing: 'border-box', opacity: canManageSchedule ? 1 : 0.6, pointerEvents: canManageSchedule ? 'auto' : 'none' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.25rem' }}>
          <h2 style={{ fontSize: '1rem', fontWeight: '700', color: '#111827', margin: 0 }}>Heti munkabeosztás</h2>
          {!canManageSchedule && (
            <span style={{ fontSize: '0.72rem', backgroundColor: '#fee2e2', color: '#ef4444', padding: '0.15rem 0.5rem', borderRadius: '999px', fontWeight: '600' }}>
              🔒 Nincs jogosultságod
            </span>
          )}
        </div>
        <p style={{ fontSize: '0.8rem', color: '#9ca3af', marginBottom: '1.25rem' }}>
          Ez csak a saját beosztásodat állítja — a főnök nyitvatartását nem írja felül. A vendégek csak a főnök nyitvatartásán belüli, és neked is szabad időpontokat látják.
        </p>

        {DAY_ORDER.map(dow => {
          const day = schedule[dow] || defaultDay(dow)
          const tenantDay = tenantHours[dow]
          const tenantClosed = tenantDay?.is_closed ?? true

          return (
            <div key={dow} style={{ borderBottom: '1px solid #f3f4f6', paddingBottom: '1rem', marginBottom: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? '0.75rem' : '1rem', flexWrap: 'wrap' }}>
                {/* Nap neve + toggle */}
                <div style={{ width: isMobile ? '80px' : '110px', flexShrink: 0 }}>
                  <p style={{ fontWeight: '600', color: '#111827', fontSize: isMobile ? '0.82rem' : '0.9rem', margin: 0 }}>{DAY_NAMES[dow]}</p>
                  {tenantClosed && (
                    <p style={{ fontSize: '0.7rem', color: '#ef4444', margin: 0 }}>Főnök: zárva</p>
                  )}
                </div>

                {/* Dolgozik-e kapcsoló */}
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: tenantClosed ? 'not-allowed' : 'pointer', opacity: tenantClosed ? 0.5 : 1 }}>
                  <div
                    onClick={() => !tenantClosed && updateDay(dow, 'is_closed', !day.is_closed)}
                    style={{
                      width: '44px', height: '24px', borderRadius: '12px',
                      backgroundColor: (!day.is_closed && !tenantClosed) ? '#2563eb' : '#d1d5db',
                      position: 'relative', cursor: tenantClosed ? 'not-allowed' : 'pointer', transition: 'background 0.2s',
                    }}
                  >
                    <div style={{
                      position: 'absolute', top: '2px',
                      left: (!day.is_closed && !tenantClosed) ? '22px' : '2px',
                      width: '20px', height: '20px', borderRadius: '50%',
                      backgroundColor: 'white', transition: 'left 0.2s',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.2)'
                    }} />
                  </div>
                  {!isMobile && (
                    <span style={{ fontSize: '0.85rem', color: '#374151' }}>
                      {(!day.is_closed && !tenantClosed) ? 'Dolgozom' : 'Nem dolgozom'}
                    </span>
                  )}
                </label>

                {/* Időpontok */}
                {!day.is_closed && !tenantClosed && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                    <input type="time" value={day.open_time} onChange={e => updateDay(dow, 'open_time', e.target.value)}
                      style={{ border: '1px solid #d1d5db', borderRadius: '6px', padding: '0.3rem 0.4rem', fontSize: isMobile ? '0.8rem' : '0.85rem', color: '#111827' }} />
                    <span style={{ color: '#9ca3af', fontSize: '0.85rem' }}>–</span>
                    <input type="time" value={day.close_time} onChange={e => updateDay(dow, 'close_time', e.target.value)}
                      style={{ border: '1px solid #d1d5db', borderRadius: '6px', padding: '0.3rem 0.4rem', fontSize: isMobile ? '0.8rem' : '0.85rem', color: '#111827' }} />
                  </div>
                )}
              </div>

              {/* Szünet */}
              {!day.is_closed && !tenantClosed && (
                <div style={{ marginTop: '0.6rem', marginLeft: isMobile ? '0' : '126px', display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '0.8rem', color: '#6b7280' }}>Szünet:</span>
                  <input type="time" value={day.break_start} onChange={e => updateDay(dow, 'break_start', e.target.value)}
                    style={{ border: '1px solid #e5e7eb', borderRadius: '6px', padding: '0.3rem 0.4rem', fontSize: isMobile ? '0.8rem' : '0.8rem', color: '#111827' }}
                    placeholder="–" />
                  <span style={{ color: '#9ca3af', fontSize: '0.8rem' }}>–</span>
                  <input type="time" value={day.break_end} onChange={e => updateDay(dow, 'break_end', e.target.value)}
                    style={{ border: '1px solid #e5e7eb', borderRadius: '6px', padding: '0.3rem 0.4rem', fontSize: isMobile ? '0.8rem' : '0.8rem', color: '#111827' }}
                    placeholder="–" />
                  {(day.break_start || day.break_end) && (
                    <button onClick={() => { updateDay(dow, 'break_start', ''); updateDay(dow, 'break_end', '') }}
                      style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', fontSize: '0.8rem' }}>✕ töröl</button>
                  )}
                </div>
              )}
            </div>
          )
        })}

        {/* Slot intervallum */}
        <div style={{ marginTop: '0.5rem' }}>
          <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '600', color: '#374151', marginBottom: '0.5rem' }}>
            Időpont intervallum
          </label>
          <p style={{ fontSize: '0.75rem', color: '#9ca3af', marginBottom: '0.75rem' }}>
            Milyen sűrűn jelenjenek meg a szabad időpontok? (0 = szolgáltatás hosszával egyenlő)
          </p>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            {[0, 15, 20, 30, 45, 60].map(v => (
              <button key={v} onClick={() => setSlotInterval(v)}
                style={{
                  padding: '0.5rem 1rem', borderRadius: '8px', fontSize: '0.85rem', fontWeight: '600',
                  border: '2px solid', cursor: 'pointer',
                  borderColor: slotInterval === v ? '#2563eb' : '#e5e7eb',
                  backgroundColor: slotInterval === v ? '#eff6ff' : 'white',
                  color: slotInterval === v ? '#1d4ed8' : '#374151',
                }}>
                {v === 0 ? 'Automatikus' : `${v} perc`}
              </button>
            ))}
          </div>
        </div>

        <div style={{ marginTop: '1.5rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <button onClick={handleSave} disabled={saving}
            style={{ backgroundColor: '#2563eb', color: 'white', padding: '0.75rem 2rem', borderRadius: '8px', border: 'none', cursor: 'pointer', fontWeight: '600', opacity: saving ? 0.5 : 1 }}>
            {saving ? 'Mentés...' : '💾 Mentés'}
          </button>
          {saved && <span style={{ color: '#22c55e', fontSize: '0.875rem', fontWeight: '600' }}>✅ Mentve!</span>}
        </div>
      </div>

      {/* Szabadnapok */}
      <div style={{ backgroundColor: 'white', padding: isMobile ? '1rem' : '1.5rem', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', maxWidth: '680px', width: '100%', boxSizing: 'border-box', opacity: canManageHolidays ? 1 : 0.6, pointerEvents: canManageHolidays ? 'auto' : 'none' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.25rem' }}>
          <h2 style={{ fontSize: '1rem', fontWeight: '700', color: '#111827', margin: 0 }}>Szabadnapjaim</h2>
          {!canManageHolidays && (
            <span style={{ fontSize: '0.72rem', backgroundColor: '#fee2e2', color: '#ef4444', padding: '0.15rem 0.5rem', borderRadius: '999px', fontWeight: '600' }}>
              🔒 Nincs jogosultságod
            </span>
          )}
        </div>
        <p style={{ fontSize: '0.8rem', color: '#9ca3af', marginBottom: '1.25rem' }}>
          Ezeken a napokon nem fogadhatsz foglalást — csak a te naptáradra vonatkozik.
        </p>

        {/* Új szabadnap hozzáadása */}
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1.25rem', alignItems: 'flex-end' }}>
          <div style={{ flex: isMobile ? '1 1 100%' : 'none' }}>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '500', color: '#374151', marginBottom: '0.35rem' }}>Dátum</label>
            <input type="date" value={newHolidayDate} onChange={e => setNewHolidayDate(e.target.value)}
              min={new Date().toISOString().split('T')[0]}
              style={{ border: '1px solid #d1d5db', borderRadius: '8px', padding: '0.5rem 0.75rem', fontSize: '0.875rem', color: '#111827', width: isMobile ? '100%' : 'auto', boxSizing: 'border-box' }} />
          </div>
          <div style={{ flex: isMobile ? '1 1 100%' : 'none' }}>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '500', color: '#374151', marginBottom: '0.35rem' }}>Megnevezés (opcionális)</label>
            <input type="text" value={newHolidayLabel} onChange={e => setNewHolidayLabel(e.target.value)}
              placeholder="pl. Betegszabadság"
              style={{ border: '1px solid #d1d5db', borderRadius: '8px', padding: '0.5rem 0.75rem', fontSize: '0.875rem', color: '#111827', width: isMobile ? '100%' : '200px', boxSizing: 'border-box' }} />
          </div>
          <button onClick={handleAddHoliday} disabled={!newHolidayDate || addingHoliday}
            style={{ backgroundColor: '#2563eb', color: 'white', padding: '0.5rem 1.25rem', borderRadius: '8px', border: 'none', cursor: 'pointer', fontWeight: '600', fontSize: '0.875rem', opacity: !newHolidayDate ? 0.5 : 1, width: isMobile ? '100%' : 'auto' }}>
            {addingHoliday ? 'Mentés...' : '➕ Hozzáad'}
          </button>
        </div>

        {holidayError && <p style={{ color: '#ef4444', fontSize: '0.875rem', marginBottom: '0.75rem' }}>❌ {holidayError}</p>}
        {holidaySuccess && <p style={{ color: '#22c55e', fontSize: '0.875rem', marginBottom: '0.75rem' }}>✅ Szabadnap hozzáadva!</p>}

        {/* Szabadnapok listája */}
        {holidays.length === 0 ? (
          <p style={{ color: '#9ca3af', fontSize: '0.875rem', textAlign: 'center', padding: '1rem' }}>Még nincs szabadnap beállítva.</p>
        ) : (
          holidays.map(h => (
            <div key={h.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem 1rem', backgroundColor: '#fef9ec', border: '1px solid #fde68a', borderRadius: '8px', marginBottom: '0.5rem' }}>
              <div>
                <p style={{ fontWeight: '600', color: '#111827', margin: 0, fontSize: '0.9rem' }}>
                  {new Date(h.date + 'T12:00:00').toLocaleDateString('hu-HU', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })}
                </p>
                {h.label && <p style={{ fontSize: '0.8rem', color: '#92400e', margin: 0 }}>{h.label}</p>}
              </div>
              <button onClick={() => handleDeleteHoliday(h.id)}
                style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '1.1rem' }}>🗑️</button>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
