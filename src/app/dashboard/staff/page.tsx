'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { useLanguage } from '@/hooks/useLanguage'

interface Staff {
  id: string
  name: string
  email: string | null
  phone: string | null
  age?: number | null
  bio?: string | null
  profile_photo?: string | null
  reference_photos?: string[]
  user_id?: string | null
  is_owner?: boolean
  can_manage_schedule?: boolean
  can_manage_holidays?: boolean
  is_active?: boolean
  inactive_until?: string | null
}

const DURATION_PRESETS = [
  { label: '1 nap',   days: 1 },
  { label: '3 nap',   days: 3 },
  { label: '1 hét',   days: 7 },
  { label: '2 hét',   days: 14 },
  { label: '1 hónap', days: 30 },
]

function isCurrentlyActive(s: Staff): boolean {
  if (s.is_active !== false) return true
  if (s.inactive_until && new Date(s.inactive_until) <= new Date()) return true
  return false
}

export default function StaffPage() {
  const router = useRouter()
  const { t } = useLanguage()
  const [staffList, setStaffList] = useState<Staff[]>([])
  const [tenantId, setTenantId] = useState<string | null>(null)
  const [plan, setPlan] = useState<string>('free')
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 640)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [initialPassword, setInitialPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [createdCredentials, setCreatedCredentials] = useState<{ name: string; email: string; password: string } | null>(null)
  const [error, setError] = useState('')
  const [selectedStaff, setSelectedStaff] = useState<Staff | null>(null)
  const [inactiveModal, setInactiveModal] = useState<{ staffId: string; staffName: string } | null>(null)
  const [inactiveDays, setInactiveDays] = useState<number>(7)
  const [useCustomDate, setUseCustomDate] = useState(false)
  const [customInactiveDate, setCustomInactiveDate] = useState('')
  const [indefinite, setIndefinite] = useState(false)
  const [inactiveSaving, setInactiveSaving] = useState(false)

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
        const [staffRes, tenantRes] = await Promise.all([
          supabase.from('staff').select('*').eq('tenant_id', profile.tenant_id),
          supabase.from('tenants').select('plan').eq('id', profile.tenant_id).single(),
        ])
        setStaffList(staffRes.data || [])
        setPlan(tenantRes.data?.plan || 'free')
      }
    }
    getData()
  }, [router])

  const handleAdd = async () => {
    if (!tenantId || !name || !email || !initialPassword) {
      setError('Név, email és jelszó megadása kötelező')
      return
    }
    setLoading(true)
    setError('')
    setSuccess(false)

    const res = await fetch('/api/staff/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tenantId, name, email, phone, initialPassword }),
    })
    const result = await res.json()

    if (result.error) {
      setError(result.error)
    } else {
      setStaffList([...staffList, result.staff])
      setCreatedCredentials({ name, email, password: initialPassword })
      setName('')
      setEmail('')
      setPhone('')
      setInitialPassword('')
      setSuccess(true)
    }
    setLoading(false)
  }

  const handleTogglePermission = async (staffId: string, field: 'can_manage_schedule' | 'can_manage_holidays', value: boolean) => {
    await supabase.from('staff').update({ [field]: value }).eq('id', staffId)
    setStaffList(prev => prev.map(s => s.id === staffId ? { ...s, [field]: value } : s))
  }

  const handleActivate = async (staffId: string) => {
    await supabase.from('staff').update({ is_active: true, inactive_until: null }).eq('id', staffId)
    setStaffList(prev => prev.map(s => s.id === staffId ? { ...s, is_active: true, inactive_until: null } : s))
  }

  const handleDeactivate = async () => {
    if (!inactiveModal) return
    setInactiveSaving(true)
    let inactiveUntil: string | null = null
    if (!indefinite) {
      if (useCustomDate && customInactiveDate) {
        const d = new Date(customInactiveDate + 'T23:59:59')
        inactiveUntil = d.toISOString()
      } else {
        const d = new Date()
        d.setDate(d.getDate() + inactiveDays)
        inactiveUntil = d.toISOString()
      }
    }
    await supabase.from('staff').update({ is_active: false, inactive_until: inactiveUntil }).eq('id', inactiveModal.staffId)
    setStaffList(prev => prev.map(s => s.id === inactiveModal.staffId ? { ...s, is_active: false, inactive_until: inactiveUntil } : s))
    setInactiveSaving(false)
    setInactiveModal(null)
    setUseCustomDate(false)
    setCustomInactiveDate('')
    setIndefinite(false)
    setInactiveDays(7)
  }

  const handleDelete = async (id: string) => {
    if (!tenantId) return
    if (!confirm(t.dash.staff_delete_confirm)) return

    const res = await fetch('/api/staff/delete', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ staffId: id, tenantId }),
    })
    const result = await res.json()

    if (result.error) {
      alert('Hiba a törlés során: ' + result.error)
    } else {
      setStaffList(staffList.filter(s => s.id !== id))
      if (selectedStaff?.id === id) setSelectedStaff(null)
    }
  }

  return (
    <div>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#111827', marginBottom: '1.5rem' }}>
        {t.dash.staff_title}
      </h1>

      {(() => {
        const nonOwnerCount = staffList.filter(s => !s.is_owner).length
        const basicLimitReached = plan === 'basic' && nonOwnerCount >= 1
        const isLocked = plan === 'free' || basicLimitReached

        const lockBanner = isLocked ? (
          <div style={{ backgroundColor: '#fffbeb', border: '1px solid #fde68a', borderRadius: '12px', padding: '1.25rem 1.5rem', marginBottom: '1.5rem', maxWidth: '600px', display: 'flex', alignItems: 'flex-start', gap: '1rem' }}>
            <span style={{ fontSize: '1.5rem', flexShrink: 0 }}>🔒</span>
            <div>
              <p style={{ fontWeight: '700', color: '#92400e', fontSize: '0.95rem', margin: '0 0 0.3rem' }}>
                {plan === 'free' ? `${t.auth.plan_free} — 1` : `${t.auth.plan_basic} — 2`}
              </p>
              <p style={{ color: '#78350f', fontSize: '0.85rem', margin: '0 0 0.75rem', lineHeight: 1.6 }}>
                {plan === 'free'
                  ? 'Az ingyenes csomagban csak te (a tulajdonos) működsz munkásként. Extra munkatárs hozzáadásához válts magasabb csomagra.'
                  : 'Az Alap csomagban maximum 2 felhasználó lehet (tulajdonos + 1 munkás). Több munkás hozzáadásához válts Pro csomagra.'}
              </p>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <span style={{ backgroundColor: '#fef3c7', color: '#92400e', fontSize: '0.8rem', fontWeight: '600', padding: '0.25rem 0.75rem', borderRadius: '999px', border: '1px solid #fde68a' }}>Ingyenes: 1 munkás</span>
                <span style={{ backgroundColor: '#dbeafe', color: '#1d4ed8', fontSize: '0.8rem', fontWeight: '600', padding: '0.25rem 0.75rem', borderRadius: '999px', border: '1px solid #bfdbfe' }}>Alap 10€: 2 munkás</span>
                <span style={{ backgroundColor: '#dcfce7', color: '#15803d', fontSize: '0.8rem', fontWeight: '600', padding: '0.25rem 0.75rem', borderRadius: '999px', border: '1px solid #bbf7d0' }}>Pro 16€: 5 munkás</span>
              </div>
            </div>
          </div>
        ) : null

        return (
          <>
            {lockBanner}
            {/* Új munkatárs hozzáadása */}
            <div style={{ backgroundColor: isLocked ? '#f9fafb' : 'white', padding: isMobile ? '1rem' : '1.5rem', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', marginBottom: '1.5rem', maxWidth: '600px', opacity: isLocked ? 0.5 : 1, pointerEvents: isLocked ? 'none' : 'auto' }}>
              <h2 style={{ fontSize: '1rem', fontWeight: '600', color: '#111827', marginBottom: '1rem' }}>
                {t.dash.add_staff} {isLocked && <span style={{ fontSize: '0.75rem', color: '#9ca3af', fontWeight: '400' }}>({t.dash.no_results})</span>}
              </h2>

        <div style={{ marginBottom: '1rem' }}>
          <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', color: '#374151', marginBottom: '0.5rem' }}>
            {t.dash.staff_name_ph} *
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={{ width: '100%', border: '1px solid #d1d5db', borderRadius: '8px', padding: '0.625rem 1rem', color: '#111827', outline: 'none', boxSizing: 'border-box' }}
            placeholder={t.dash.staff_name_ph}
          />
        </div>

        <div style={{ marginBottom: '1.25rem' }}>
          <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', color: '#374151', marginBottom: '0.5rem' }}>
            {t.dash.staff_email_ph}
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={{ width: '100%', border: '1px solid #d1d5db', borderRadius: '8px', padding: '0.625rem 1rem', color: '#111827', outline: 'none', boxSizing: 'border-box' }}
            placeholder="janos@example.com"
          />
        </div>

        <div style={{ marginBottom: '1.25rem' }}>
          <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', color: '#374151', marginBottom: '0.5rem' }}>
            {t.dash.staff_phone_ph}
          </label>
          <input type="tel" value={phone} onChange={e => setPhone(e.target.value.replace(/[^\d+\s\-()]/g, ''))}
            style={{ width: '100%', border: '1px solid #d1d5db', borderRadius: '8px', padding: '0.625rem 1rem', color: '#111827', outline: 'none', boxSizing: 'border-box' }}
            placeholder="+36 30 123 4567" />
        </div>

        <div style={{ marginBottom: '0.5rem' }}>
          <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', color: '#374151', marginBottom: '0.5rem' }}>
            {t.dash.staff_password_ph} *
          </label>
          <div style={{ position: 'relative' }}>
            <input
              type={showPassword ? 'text' : 'password'}
              value={initialPassword}
              onChange={e => setInitialPassword(e.target.value)}
              style={{ width: '100%', border: '1px solid #d1d5db', borderRadius: '8px', padding: '0.625rem 2.5rem 0.625rem 1rem', color: '#111827', outline: 'none', boxSizing: 'border-box' }}
              placeholder="Min. 6 karakter"
            />
            <button type="button" onClick={() => setShowPassword(!showPassword)}
              style={{ position: 'absolute', right: '0.75rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', fontSize: '0.85rem' }}>
              {showPassword ? '🙈' : '👁️'}
            </button>
          </div>
          <p style={{ fontSize: '0.75rem', color: '#9ca3af', marginTop: '0.25rem' }}>
            A munkás ezt fogja kapni belépéshez, saját maga megváltoztathatja.
          </p>
        </div>

        {error && <p style={{ color: '#ef4444', fontSize: '0.875rem', marginBottom: '1rem' }}>{error}</p>}

        {success && createdCredentials && (
          <div style={{ backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '10px', padding: '1.25rem', marginBottom: '1rem' }}>
            <p style={{ fontWeight: '700', color: '#15803d', fontSize: '0.9rem', marginBottom: '0.75rem' }}>{t.dash.staff_created}</p>
            <p style={{ fontSize: '0.8rem', color: '#374151', marginBottom: '0.5rem' }}>{t.dash.credentials_title} — <strong>{createdCredentials.name}</strong></p>
            <div style={{ backgroundColor: 'white', border: '1px solid #d1fae5', borderRadius: '8px', padding: '0.875rem', fontFamily: 'monospace', fontSize: '0.85rem' }}>
              <div style={{ marginBottom: '0.375rem' }}>
                <span style={{ color: '#6b7280' }}>{t.dash.staff_email_ph}: </span>
                <strong style={{ color: '#111827' }}>{createdCredentials.email}</strong>
              </div>
              <div>
                <span style={{ color: '#6b7280' }}>{t.auth.password}: </span>
                <strong style={{ color: '#111827' }}>{createdCredentials.password}</strong>
              </div>
            </div>
            <p style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.5rem' }}>
              🔑 {t.dash.credentials_note}
            </p>
            <button
              onClick={() => { setSuccess(false); setCreatedCredentials(null) }}
              style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: '#6b7280', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>
              {t.dash.close_btn}
            </button>
          </div>
        )}

        <button onClick={handleAdd} disabled={loading}
          style={{ backgroundColor: '#2563eb', color: 'white', padding: '0.75rem 2rem', borderRadius: '8px', border: 'none', cursor: 'pointer', fontWeight: '500', opacity: loading ? 0.5 : 1, width: isMobile ? '100%' : undefined }}>
          {loading ? t.dash.saving : t.dash.add_staff}
        </button>
      </div>
          </>
        )
      })()}

      {/* Munkatársak listája */}
      <div style={{ maxWidth: '600px' }}>
        <h2 style={{ fontSize: '1rem', fontWeight: '600', color: '#111827', marginBottom: '1rem' }}>
          {t.dash.staff_title}
        </h2>

        {staffList.length === 0 ? (
          <div style={{ backgroundColor: 'white', padding: '1.5rem', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', textAlign: 'center', color: '#6b7280' }}>
            {t.dash.no_staff}
          </div>
        ) : (
          staffList.map((staff) => (
            <div key={staff.id} style={{ backgroundColor: 'white', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', marginBottom: '0.75rem', overflow: 'hidden' }}>
              {/* Fejléc sor */}
              <div style={{ padding: isMobile ? '0.875rem 1rem' : '1rem 1.5rem', display: 'flex', flexDirection: isMobile ? 'column' : 'row', alignItems: isMobile ? 'stretch' : 'center', justifyContent: 'space-between', gap: isMobile ? '0.75rem' : '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.875rem', minWidth: 0 }}>
                  <div style={{ width: '44px', height: '44px', borderRadius: '50%', backgroundColor: '#f3f4f6', overflow: 'hidden', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {staff.profile_photo
                      ? <Image src={staff.profile_photo} alt={staff.name} width={44} height={44} style={{ objectFit: 'cover', borderRadius: '50%' }} />
                      : <span style={{ fontSize: '1.25rem' }}>👤</span>
                    }
                  </div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                      <p style={{ fontWeight: '600', color: '#111827', margin: 0 }}>{staff.name}</p>
                      {staff.is_owner && (
                        <span style={{ backgroundColor: '#fef3c7', color: '#92400e', fontSize: '0.72rem', fontWeight: '700', padding: '0.2rem 0.6rem', borderRadius: '999px', border: '1px solid #fde68a' }}>
                          {t.dash.owner_label}
                        </span>
                      )}
                      {!isCurrentlyActive(staff) && (
                        <span style={{ backgroundColor: '#fee2e2', color: '#dc2626', fontSize: '0.72rem', fontWeight: '700', padding: '0.2rem 0.6rem', borderRadius: '999px', border: '1px solid #fca5a5' }}>
                          🔴 Inaktív{staff.inactive_until ? ` – ${new Date(staff.inactive_until).toLocaleDateString('hu-HU', { month: 'short', day: 'numeric' })}-ig` : ''}
                        </span>
                      )}
                    </div>
                    <p style={{ fontSize: '0.8rem', color: '#6b7280', margin: 0 }}>{staff.email || 'Nincs email'}</p>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0, alignItems: 'center', flexWrap: isMobile ? 'wrap' : undefined }}>
                  {isCurrentlyActive(staff) ? (
                    <button
                      onClick={() => { setInactiveModal({ staffId: staff.id, staffName: staff.name }); setIndefinite(false); setUseCustomDate(false); setCustomInactiveDate(''); setInactiveDays(7) }}
                      style={{ backgroundColor: '#f0fdf4', color: '#15803d', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '0.5rem 0.875rem', cursor: 'pointer', fontSize: '0.8rem', fontWeight: '600', whiteSpace: 'nowrap' }}
                    >
                      🟢 Aktív
                    </button>
                  ) : (
                    <button
                      onClick={() => handleActivate(staff.id)}
                      style={{ backgroundColor: '#fef2f2', color: '#dc2626', border: '1px solid #fca5a5', borderRadius: '8px', padding: '0.5rem 0.875rem', cursor: 'pointer', fontSize: '0.8rem', fontWeight: '600', whiteSpace: 'nowrap' }}
                    >
                      🔴 Visszakapcsol
                    </button>
                  )}
                  <button
                    onClick={() => setSelectedStaff(staff)}
                    style={{ backgroundColor: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe', borderRadius: '8px', padding: '0.5rem 1rem', cursor: 'pointer', fontSize: '0.875rem', fontWeight: '500', flex: isMobile ? 1 : undefined }}
                  >
                    {'👁️ ' + t.dash.profile_title.replace('👑 ', '')}
                  </button>
                  {!staff.is_owner && (
                    <button
                      onClick={() => handleDelete(staff.id)}
                      style={{ backgroundColor: '#fee2e2', color: '#ef4444', border: 'none', borderRadius: '8px', padding: '0.5rem 1rem', cursor: 'pointer', fontSize: '0.875rem', flex: isMobile ? 1 : undefined }}
                    >
                      🗑️ {isMobile && 'Törlés'}
                    </button>
                  )}
                </div>
              </div>

              {/* Jogosultságok — csak nem-owner munkásoknál */}
              {!staff.is_owner && <div style={{ borderTop: '1px solid #f3f4f6', padding: isMobile ? '0.75rem 1rem' : '0.875rem 1.5rem', backgroundColor: '#fafafa', display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: isMobile ? '0.625rem' : '2rem', flexWrap: 'wrap' }}>
                <p style={{ fontSize: '0.75rem', fontWeight: '600', color: '#6b7280', margin: 0, alignSelf: isMobile ? undefined : 'center', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t.dash.permissions_label}</p>

                {/* Nyitvatartás toggle */}
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', cursor: 'pointer' }}>
                  <div
                    onClick={() => handleTogglePermission(staff.id, 'can_manage_schedule', !staff.can_manage_schedule)}
                    style={{
                      width: '40px', height: '22px', borderRadius: '11px', position: 'relative',
                      backgroundColor: staff.can_manage_schedule ? '#2563eb' : '#d1d5db',
                      cursor: 'pointer', transition: 'background 0.2s', flexShrink: 0,
                    }}
                  >
                    <div style={{
                      position: 'absolute', top: '2px',
                      left: staff.can_manage_schedule ? '20px' : '2px',
                      width: '18px', height: '18px', borderRadius: '50%',
                      backgroundColor: 'white', transition: 'left 0.2s',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                    }} />
                  </div>
                  <span style={{ fontSize: '0.8rem', color: '#374151' }}>{t.dash.can_manage_schedule}</span>
                </label>

                {/* Szabadnapok toggle */}
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', cursor: 'pointer' }}>
                  <div
                    onClick={() => handleTogglePermission(staff.id, 'can_manage_holidays', !staff.can_manage_holidays)}
                    style={{
                      width: '40px', height: '22px', borderRadius: '11px', position: 'relative',
                      backgroundColor: staff.can_manage_holidays ? '#2563eb' : '#d1d5db',
                      cursor: 'pointer', transition: 'background 0.2s', flexShrink: 0,
                    }}
                  >
                    <div style={{
                      position: 'absolute', top: '2px',
                      left: staff.can_manage_holidays ? '20px' : '2px',
                      width: '18px', height: '18px', borderRadius: '50%',
                      backgroundColor: 'white', transition: 'left 0.2s',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                    }} />
                  </div>
                  <span style={{ fontSize: '0.8rem', color: '#374151' }}>{t.dash.can_manage_holidays}</span>
                </label>
              </div>}
            </div>
          ))
        )}
      </div>

      {/* Inaktív beállítás modal */}
      {inactiveModal && (
        <div onClick={() => setInactiveModal(null)} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <div onClick={e => e.stopPropagation()} style={{ backgroundColor: 'white', borderRadius: '16px', width: '100%', maxWidth: '400px', padding: '1.5rem', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
            <h2 style={{ fontSize: '1.1rem', fontWeight: '700', color: '#111827', marginBottom: '0.25rem' }}>Inaktív beállítás</h2>
            <p style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '1.25rem' }}>{inactiveModal.staffName} nem jelenik meg a foglalási oldalon</p>

            {/* Időtartam presets */}
            {!indefinite && !useCustomDate && (
              <div style={{ marginBottom: '1rem' }}>
                <p style={{ fontSize: '0.75rem', fontWeight: '600', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>Mennyi ideig?</p>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  {DURATION_PRESETS.map(p => (
                    <button key={p.days} onClick={() => setInactiveDays(p.days)}
                      style={{ padding: '0.4rem 0.875rem', borderRadius: '8px', border: '2px solid', fontSize: '0.85rem', fontWeight: '600', cursor: 'pointer',
                        borderColor: inactiveDays === p.days ? '#2563eb' : '#e5e7eb',
                        backgroundColor: inactiveDays === p.days ? '#eff6ff' : 'white',
                        color: inactiveDays === p.days ? '#2563eb' : '#374151' }}>
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Saját dátum */}
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem', cursor: 'pointer', fontSize: '0.875rem', color: '#374151' }}>
              <input type="checkbox" checked={useCustomDate} onChange={e => { setUseCustomDate(e.target.checked); if (e.target.checked) setIndefinite(false) }} style={{ accentColor: '#2563eb' }} />
              Saját dátum megadása
            </label>
            {useCustomDate && (
              <input type="date" value={customInactiveDate} onChange={e => setCustomInactiveDate(e.target.value)}
                min={new Date().toISOString().slice(0, 10)}
                style={{ width: '100%', border: '1px solid #d1d5db', borderRadius: '8px', padding: '0.5rem 0.75rem', fontSize: '0.875rem', marginBottom: '0.75rem', boxSizing: 'border-box' }} />
            )}

            {/* Határozatlan ideig */}
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.25rem', cursor: 'pointer', fontSize: '0.875rem', color: '#374151' }}>
              <input type="checkbox" checked={indefinite} onChange={e => { setIndefinite(e.target.checked); if (e.target.checked) setUseCustomDate(false) }} style={{ accentColor: '#2563eb' }} />
              Határozatlan ideig inaktív
            </label>

            {/* Előnézet */}
            <div style={{ backgroundColor: '#fef2f2', border: '1px solid #fca5a5', borderRadius: '8px', padding: '0.75rem', marginBottom: '1.25rem', fontSize: '0.85rem', color: '#dc2626' }}>
              {indefinite
                ? '🔴 Inaktív marad, amíg manuálisan vissza nem kapcsolod'
                : useCustomDate && customInactiveDate
                  ? `🔴 Inaktív lesz: ${new Date(customInactiveDate + 'T00:00:00').toLocaleDateString('hu-HU', { year: 'numeric', month: 'long', day: 'numeric' })}-ig`
                  : `🔴 Inaktív lesz: ${new Date(Date.now() + inactiveDays * 86400000).toLocaleDateString('hu-HU', { year: 'numeric', month: 'long', day: 'numeric' })}-ig`
              }
            </div>

            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button onClick={() => setInactiveModal(null)} style={{ flex: 1, padding: '0.75rem', border: '1px solid #e5e7eb', borderRadius: '8px', backgroundColor: 'white', color: '#374151', cursor: 'pointer', fontWeight: '600', fontSize: '0.875rem' }}>
                Mégse
              </button>
              <button onClick={handleDeactivate} disabled={inactiveSaving || (useCustomDate && !customInactiveDate)}
                style={{ flex: 1, padding: '0.75rem', border: 'none', borderRadius: '8px', backgroundColor: '#dc2626', color: 'white', cursor: 'pointer', fontWeight: '700', fontSize: '0.875rem', opacity: (inactiveSaving || (useCustomDate && !customInactiveDate)) ? 0.5 : 1 }}>
                {inactiveSaving ? 'Mentés...' : 'Inaktiválás'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Profil modal */}
      {selectedStaff && (
        <div
          onClick={() => setSelectedStaff(null)}
          style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 50, display: 'flex', alignItems: isMobile ? 'flex-end' : 'center', justifyContent: 'center', padding: isMobile ? '0' : '1rem' }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ backgroundColor: 'white', borderRadius: isMobile ? '16px 16px 0 0' : '16px', width: '100%', maxWidth: isMobile ? '100%' : '480px', maxHeight: isMobile ? '92vh' : '90vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.3)', marginTop: isMobile ? 'auto' : undefined }}
          >
            {/* Fejléc banner */}
            <div style={{ height: '80px', background: 'linear-gradient(135deg, #2563eb, #7c3aed)', borderRadius: '16px 16px 0 0', position: 'relative' }}>
              <button
                onClick={() => setSelectedStaff(null)}
                style={{ position: 'absolute', top: '12px', right: '12px', width: '28px', height: '28px', borderRadius: '50%', backgroundColor: 'rgba(255,255,255,0.2)', border: 'none', cursor: 'pointer', color: 'white', fontSize: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                ✕
              </button>
            </div>

            <div style={{ padding: '0 1.5rem 1.5rem' }}>
              {/* Profilkép */}
              <div style={{ marginTop: '-40px', marginBottom: '0.75rem', position: 'relative', zIndex: 1 }}>
                <div style={{ width: '80px', height: '80px', borderRadius: '50%', border: '3px solid white', backgroundColor: '#f3f4f6', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.15)' }}>
                  {selectedStaff.profile_photo
                    ? <Image src={selectedStaff.profile_photo} alt={selectedStaff.name} width={80} height={80} style={{ objectFit: 'cover', borderRadius: '50%' }} />
                    : <span style={{ fontSize: '2.5rem' }}>👤</span>
                  }
                </div>
              </div>

              {/* Név + kor */}
              <h2 style={{ fontSize: '1.25rem', fontWeight: '700', color: '#111827', margin: '0 0 0.25rem' }}>{selectedStaff.name}</h2>
              {selectedStaff.age && (
                <p style={{ fontSize: '0.875rem', color: '#6b7280', margin: '0 0 1rem' }}>{selectedStaff.age} éves</p>
              )}

              {/* Elérhetőségek */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1.25rem' }}>
                {selectedStaff.email && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem', color: '#374151' }}>
                    <span>✉️</span> {selectedStaff.email}
                  </div>
                )}
                {selectedStaff.phone && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem', color: '#374151' }}>
                    <span>📞</span> {selectedStaff.phone}
                  </div>
                )}
              </div>

              {/* Bemutatkozás */}
              {selectedStaff.bio && (
                <div style={{ marginBottom: '1.5rem' }}>
                  <h3 style={{ fontSize: '0.8rem', fontWeight: '600', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 0.5rem' }}>Bemutatkozás</h3>
                  <p style={{ fontSize: '0.9rem', color: '#374151', lineHeight: 1.6, margin: 0, whiteSpace: 'pre-wrap' }}>{selectedStaff.bio}</p>
                </div>
              )}

              {/* Referencia fotók */}
              {selectedStaff.reference_photos && selectedStaff.reference_photos.length > 0 && (
                <div>
                  <h3 style={{ fontSize: '0.8rem', fontWeight: '600', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 0.75rem' }}>
                    Referencia munkák ({selectedStaff.reference_photos.length})
                  </h3>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem' }}>
                    {selectedStaff.reference_photos.map((url, i) => (
                      <div key={i} style={{ position: 'relative', aspectRatio: '1', borderRadius: '10px', overflow: 'hidden' }}>
                        <Image src={url} alt={`Referencia ${i + 1}`} fill style={{ objectFit: 'cover' }} />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Ha nincs semmi extra adat */}
              {!selectedStaff.bio && (!selectedStaff.reference_photos || selectedStaff.reference_photos.length === 0) && (
                <p style={{ fontSize: '0.875rem', color: '#9ca3af', textAlign: 'center', padding: '1rem 0' }}>
                  Ez a munkás még nem töltötte ki a profilját.
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
