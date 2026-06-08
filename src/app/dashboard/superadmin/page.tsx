'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

const PLANS = [
  { key: 'free',     label: 'Free',     color: '#92400e', bg: '#fef3c7', border: '#fde68a' },
  { key: 'basic',    label: 'Basic',    color: '#1d4ed8', bg: '#dbeafe', border: '#bfdbfe' },
  { key: 'pro',      label: 'Pro',      color: '#6d28d9', bg: '#ede9fe', border: '#c4b5fd' },
  { key: 'business', label: 'Business', color: '#065f46', bg: '#d1fae5', border: '#6ee7b7' },
]

const DURATIONS = [
  { label: '30 nap',  days: 30 },
  { label: '60 nap',  days: 60 },
  { label: '90 nap',  days: 90 },
  { label: '180 nap', days: 180 },
  { label: '365 nap', days: 365 },
]

interface Tenant {
  id: string
  name: string
  slug: string
  email: string | null
  phone: string | null
  plan: string
  plan_expires_at: string | null
  plan_activated_at: string | null
  created_at: string
  staff_count?: number
  booking_count?: number
}

interface StaffRow {
  id: string
  name: string
  email: string
  phone: string | null
  tenant_id: string
  tenant_name?: string
  created_at: string
  is_owner: boolean
  can_manage_schedule: boolean
  can_manage_holidays: boolean
}

interface PlanModal {
  tenantId: string
  tenantName: string
  currentPlan: string
  currentExpiry: string | null
}

export default function SuperAdminPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [authorized, setAuthorized] = useState(false)
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [staff, setStaff] = useState<StaffRow[]>([])
  const [tab, setTab] = useState<'tenants' | 'staff'>('tenants')
  const [modal, setModal] = useState<PlanModal | null>(null)
  const [selectedPlan, setSelectedPlan] = useState('free')
  const [selectedDays, setSelectedDays] = useState(30)
  const [customDate, setCustomDate] = useState('')
  const [useCustomDate, setUseCustomDate] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState('')
  const [search, setSearch] = useState('')
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/'); return }

      const { data: profile } = await supabase
        .from('profiles').select('role').eq('id', user.id).single()

      if (profile?.role !== 'super_admin') {
        router.push('/dashboard')
        return
      }
      setAuthorized(true)

      // Fetch all tenants
      const { data: tenantData } = await supabase
        .from('tenants')
        .select('id, name, slug, email, phone, plan, plan_expires_at, plan_activated_at, created_at')
        .order('created_at', { ascending: false })

      // Fetch all staff
      const { data: staffData } = await supabase
        .from('staff')
        .select('id, name, email, phone, tenant_id, created_at, is_owner, can_manage_schedule, can_manage_holidays')
        .order('name', { ascending: true })

      const staffList: StaffRow[] = (staffData || []).map(s => ({
        ...s,
        tenant_name: tenantData?.find(t => t.id === s.tenant_id)?.name || '—',
      }))

      // Enrich tenants with staff + booking counts
      const staffCountMap = new Map<string, number>()
      for (const s of staffData || []) {
        staffCountMap.set(s.tenant_id, (staffCountMap.get(s.tenant_id) || 0) + 1)
      }

      // Booking counts per tenant
      const enriched: Tenant[] = await Promise.all(
        (tenantData || []).map(async (t) => {
          const { count } = await supabase
            .from('bookings')
            .select('id', { count: 'exact', head: true })
            .eq('tenant_id', t.id)
          return {
            ...t,
            staff_count: staffCountMap.get(t.id) || 0,
            booking_count: count || 0,
          }
        })
      )

      setTenants(enriched)
      setStaff(staffList)
      setLoading(false)
    }
    init()
  }, [router])

  const openModal = (t: Tenant) => {
    setModal({ tenantId: t.id, tenantName: t.name, currentPlan: t.plan, currentExpiry: t.plan_expires_at })
    setSelectedPlan(t.plan || 'free')
    setSelectedDays(30)
    setCustomDate('')
    setUseCustomDate(false)
    setSaveMsg('')
  }

  const handleSavePlan = async () => {
    if (!modal) return
    setSaving(true)
    setSaveMsg('')

    let expiresAt: string | null = null
    if (selectedPlan !== 'free') {
      if (useCustomDate && customDate) {
        expiresAt = new Date(customDate + 'T23:59:59').toISOString()
      } else {
        const d = new Date()
        d.setDate(d.getDate() + selectedDays)
        expiresAt = d.toISOString()
      }
    }

    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch('/api/superadmin/set-plan', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session?.access_token}`,
      },
      body: JSON.stringify({ tenantId: modal.tenantId, plan: selectedPlan, expiresAt }),
    })

    const result = await res.json()
    if (result.error) {
      setSaveMsg('❌ Hiba: ' + result.error)
    } else {
      setSaveMsg('✅ Csomag beállítva!')
      setTenants(prev => prev.map(t =>
        t.id === modal.tenantId
          ? { ...t, plan: selectedPlan, plan_expires_at: expiresAt }
          : t
      ))
      setTimeout(() => setModal(null), 1200)
    }
    setSaving(false)
  }

  const getPlanInfo = (key: string) => PLANS.find(p => p.key === key) || PLANS[0]

  const getPlanStatus = (t: Tenant) => {
    if (!t.plan_expires_at || t.plan === 'free') return null
    const now = new Date()
    const exp = new Date(t.plan_expires_at)
    const graceEnd = new Date(exp); graceEnd.setDate(graceEnd.getDate() + 3)
    const days = Math.ceil((exp.getTime() - now.getTime()) / 86400000)
    if (now > graceEnd) return { label: '🔴 Lejárt', color: '#dc2626', bg: '#fee2e2', urgency: 'expired' as const }
    if (now > exp)      return { label: '🟠 Türelmi idő', color: '#b45309', bg: '#fef3c7', urgency: 'grace' as const }
    if (days <= 7)      return { label: `🔴 ${days} nap`, color: '#dc2626', bg: '#fee2e2', urgency: 'critical' as const }
    if (days <= 14)     return { label: `🟠 ${days} nap`, color: '#b45309', bg: '#fff7ed', urgency: 'warning' as const }
    return { label: exp.toLocaleDateString('hu-HU', { year: 'numeric', month: 'short', day: 'numeric' }), color: '#15803d', bg: '#dcfce7', urgency: 'ok' as const }
  }

  const getCardBorder = (t: Tenant) => {
    const s = getPlanStatus(t)
    if (!s) return '1px solid #f1f5f9'
    if (s.urgency === 'expired' || s.urgency === 'critical') return '2px solid #fca5a5'
    if (s.urgency === 'grace'   || s.urgency === 'warning')  return '2px solid #fed7aa'
    return '1px solid #f1f5f9'
  }

  const getCardBg = (t: Tenant) => {
    const s = getPlanStatus(t)
    if (!s) return 'white'
    if (s.urgency === 'expired' || s.urgency === 'critical') return '#fff5f5'
    if (s.urgency === 'grace'   || s.urgency === 'warning')  return '#fffbf5'
    return 'white'
  }

  const filteredTenants = search
    ? tenants.filter(t =>
        t.name.toLowerCase().includes(search.toLowerCase()) ||
        t.slug.toLowerCase().includes(search.toLowerCase()) ||
        (t.email || '').toLowerCase().includes(search.toLowerCase())
      )
    : tenants

  const filteredStaff = search
    ? staff.filter(s =>
        s.name.toLowerCase().includes(search.toLowerCase()) ||
        s.email.toLowerCase().includes(search.toLowerCase()) ||
        (s.tenant_name || '').toLowerCase().includes(search.toLowerCase())
      )
    : staff

  const activePlans = tenants.filter(t => t.plan !== 'free' && t.plan_expires_at && new Date(t.plan_expires_at) > new Date()).length

  if (loading) return <p style={{ color: '#6b7280' }}>Betöltés...</p>
  if (!authorized) return null

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: '1.75rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.25rem' }}>
          <span style={{ fontSize: '1.5rem' }}>🛡️</span>
          <h1 style={{ fontSize: '1.5rem', fontWeight: '800', color: '#111827', margin: 0 }}>Super Admin Panel</h1>
        </div>
        <p style={{ color: '#6b7280', fontSize: '0.875rem' }}>Összes tenant, staff és előfizetés kezelése</p>
      </div>

      {/* Stats bar */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)', gap: '0.75rem', marginBottom: '1.75rem' }}>
        {[
          { label: 'Összes tenant', value: tenants.length, icon: '🏢', color: '#2563eb' },
          { label: 'Aktív előfizetés', value: activePlans, icon: '✅', color: '#059669' },
          { label: 'Összes staff', value: staff.length, icon: '👤', color: '#7c3aed' },
          { label: 'Ingyenes tenants', value: tenants.filter(t => t.plan === 'free').length, icon: '🆓', color: '#92400e' },
        ].map(s => (
          <div key={s.label} style={{ backgroundColor: 'white', borderRadius: '12px', padding: '1rem 1.25rem', boxShadow: '0 1px 3px rgba(0,0,0,0.08)', borderLeft: `4px solid ${s.color}` }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
              <p style={{ fontSize: '0.75rem', color: '#6b7280', fontWeight: '500', margin: 0 }}>{s.label}</p>
              <span style={{ fontSize: '1.1rem' }}>{s.icon}</span>
            </div>
            <p style={{ fontSize: '1.75rem', fontWeight: '800', color: s.color, lineHeight: 1, margin: 0 }}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Tabs + search */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {[
            { key: 'tenants', label: `🏢 Tenants (${tenants.length})` },
            { key: 'staff',   label: `👤 Staff (${staff.length})` },
          ].map(t => (
            <button key={t.key} onClick={() => { setTab(t.key as 'tenants' | 'staff'); setSearch('') }}
              style={{ padding: '0.5rem 1.25rem', borderRadius: '8px', border: '2px solid', cursor: 'pointer', fontSize: '0.875rem', fontWeight: tab === t.key ? '700' : '400', borderColor: tab === t.key ? '#2563eb' : '#e5e7eb', backgroundColor: tab === t.key ? '#eff6ff' : 'white', color: tab === t.key ? '#2563eb' : '#6b7280' }}>
              {t.label}
            </button>
          ))}
        </div>
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Keresés..."
          style={{ border: '1px solid #d1d5db', borderRadius: '8px', padding: '0.5rem 1rem', fontSize: '0.875rem', color: '#111827', outline: 'none', width: isMobile ? '100%' : '240px', boxSizing: 'border-box' }}
        />
      </div>

      {/* ── TENANTS TAB ── */}
      {tab === 'tenants' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
          {filteredTenants.length === 0 && (
            <div style={{ backgroundColor: 'white', padding: '2.5rem', borderRadius: '12px', textAlign: 'center', color: '#9ca3af', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
              Nincs találat.
            </div>
          )}
          {filteredTenants.map(t => {
            const planInfo = getPlanInfo(t.plan || 'free')
            const status = getPlanStatus(t)
            return (
              <div key={t.id} style={{ backgroundColor: getCardBg(t), borderRadius: '12px', padding: isMobile ? '1rem' : '1.25rem 1.5rem', boxShadow: '0 1px 3px rgba(0,0,0,0.08)', border: getCardBorder(t) }}>
                <div style={{ display: 'flex', alignItems: isMobile ? 'flex-start' : 'center', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap' }}>

                  {/* Bal oldal - tenant info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', marginBottom: '0.35rem', flexWrap: 'wrap' }}>
                      <p style={{ fontWeight: '700', color: '#111827', fontSize: '1rem', margin: 0 }}>{t.name}</p>
                      {/* Plan badge */}
                      <span style={{ fontSize: '0.7rem', fontWeight: '700', padding: '0.15rem 0.6rem', borderRadius: '999px', backgroundColor: planInfo.bg, color: planInfo.color, border: `1px solid ${planInfo.border}` }}>
                        {planInfo.label.toUpperCase()}
                      </span>
                      {/* Status badge */}
                      {status && (
                        <span style={{ fontSize: '0.7rem', fontWeight: '700', padding: '0.15rem 0.6rem', borderRadius: '999px', backgroundColor: status.bg, color: status.color }}>
                          {status.label}
                        </span>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: isMobile ? '0.5rem' : '1.5rem', flexWrap: 'wrap' }}>
                      <p style={{ fontSize: '0.8rem', color: '#6b7280', margin: 0 }}>🔗 {t.slug}</p>
                      {t.email && <p style={{ fontSize: '0.8rem', color: '#6b7280', margin: 0 }}>📧 {t.email}</p>}
                      {t.phone && <p style={{ fontSize: '0.8rem', color: '#6b7280', margin: 0 }}>📞 {t.phone}</p>}
                    </div>
                    <div style={{ display: 'flex', gap: isMobile ? '0.5rem' : '1.5rem', marginTop: '0.3rem', flexWrap: 'wrap' }}>
                      <p style={{ fontSize: '0.75rem', color: '#9ca3af', margin: 0 }}>👥 {t.staff_count} staff</p>
                      <p style={{ fontSize: '0.75rem', color: '#9ca3af', margin: 0 }}>📅 {t.booking_count} foglalás</p>
                      <p style={{ fontSize: '0.75rem', color: '#9ca3af', margin: 0 }}>
                        🗓️ {t.created_at ? new Date(t.created_at).toLocaleDateString('hu-HU', { year: 'numeric', month: 'short', day: 'numeric' }) : '—'}
                      </p>
                    </div>
                  </div>

                  {/* Jobb oldal - set plan gomb */}
                  <button
                    onClick={() => openModal(t)}
                    style={{ backgroundColor: '#2563eb', color: 'white', padding: '0.5rem 1.25rem', borderRadius: '8px', border: 'none', cursor: 'pointer', fontSize: '0.8rem', fontWeight: '700', flexShrink: 0, whiteSpace: 'nowrap' }}>
                    ⚡ Csomag beállítás
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── STAFF TAB ── */}
      {tab === 'staff' && (
        <div style={{ backgroundColor: 'white', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)', overflow: 'hidden' }}>
          {filteredStaff.length === 0 ? (
            <div style={{ padding: '2.5rem', textAlign: 'center', color: '#9ca3af' }}>Nincs találat.</div>
          ) : isMobile ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
              {filteredStaff.map((s, i) => (
                <div key={s.id} style={{ padding: '0.875rem 1rem', borderBottom: i < filteredStaff.length - 1 ? '1px solid #f3f4f6' : 'none' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem', flexWrap: 'wrap' }}>
                    <p style={{ fontWeight: '700', color: '#111827', margin: 0, fontSize: '0.9rem' }}>{s.name}</p>
                    {s.is_owner
                      ? <span style={{ fontSize: '0.65rem', fontWeight: '700', padding: '0.1rem 0.5rem', borderRadius: '999px', backgroundColor: '#ede9fe', color: '#6d28d9' }}>👑 Admin</span>
                      : <span style={{ fontSize: '0.65rem', fontWeight: '700', padding: '0.1rem 0.5rem', borderRadius: '999px', backgroundColor: '#f3f4f6', color: '#6b7280' }}>Staff</span>
                    }
                  </div>
                  <p style={{ fontSize: '0.8rem', color: '#374151', margin: '0 0 0.1rem' }}>📧 {s.email}</p>
                  {s.phone && <p style={{ fontSize: '0.8rem', color: '#374151', margin: '0 0 0.1rem' }}>📞 {s.phone}</p>}
                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', margin: '0.2rem 0' }}>
                    {s.can_manage_schedule  && <span style={{ fontSize: '0.62rem', padding: '0.1rem 0.4rem', borderRadius: '999px', backgroundColor: '#dbeafe', color: '#1d4ed8', fontWeight: '600' }}>Beosztás</span>}
                    {s.can_manage_holidays  && <span style={{ fontSize: '0.62rem', padding: '0.1rem 0.4rem', borderRadius: '999px', backgroundColor: '#dcfce7', color: '#15803d', fontWeight: '600' }}>Szabadnap</span>}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <p style={{ fontSize: '0.75rem', color: '#6b7280', margin: 0 }}>🏢 {s.tenant_name}</p>
                    <p style={{ fontSize: '0.75rem', color: '#9ca3af', margin: 0 }}>
                      {s.created_at ? new Date(s.created_at).toLocaleDateString('hu-HU', { year: 'numeric', month: 'short', day: 'numeric' }) : '—'}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1.8fr 1.8fr 1.2fr 1.5fr 1.5fr 0.8fr', gap: '0.75rem', padding: '0.75rem 1.5rem', backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                {['Név', 'Email', 'Telefon', 'Tenant', 'Jogosultság', 'Regisztr.'].map(h => (
                  <p key={h} style={{ fontSize: '0.68rem', fontWeight: '700', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>{h}</p>
                ))}
              </div>
              {filteredStaff.map((s, i) => (
                <div key={s.id} style={{ display: 'grid', gridTemplateColumns: '1.8fr 1.8fr 1.2fr 1.5fr 1.5fr 0.8fr', gap: '0.75rem', padding: '0.875rem 1.5rem', alignItems: 'center', borderBottom: i < filteredStaff.length - 1 ? '1px solid #f3f4f6' : 'none' }}>
                  {/* Név + role badge */}
                  <div style={{ minWidth: 0 }}>
                    <p style={{ fontWeight: '600', color: '#111827', margin: '0 0 0.2rem', fontSize: '0.875rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.name}</p>
                    {s.is_owner
                      ? <span style={{ fontSize: '0.62rem', fontWeight: '700', padding: '0.1rem 0.5rem', borderRadius: '999px', backgroundColor: '#ede9fe', color: '#6d28d9' }}>👑 Admin</span>
                      : <span style={{ fontSize: '0.62rem', fontWeight: '700', padding: '0.1rem 0.5rem', borderRadius: '999px', backgroundColor: '#f3f4f6', color: '#6b7280' }}>Staff</span>
                    }
                  </div>
                  {/* Email */}
                  <p style={{ color: '#374151', margin: 0, fontSize: '0.8rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.email}</p>
                  {/* Telefon */}
                  <p style={{ color: '#374151', margin: 0, fontSize: '0.8rem', whiteSpace: 'nowrap' }}>{s.phone || '—'}</p>
                  {/* Tenant */}
                  <p style={{ color: '#6b7280', margin: 0, fontSize: '0.8rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.tenant_name}</p>
                  {/* Jogosultságok */}
                  <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap' }}>
                    {s.is_owner && <span style={{ fontSize: '0.6rem', padding: '0.1rem 0.4rem', borderRadius: '999px', backgroundColor: '#ede9fe', color: '#6d28d9', fontWeight: '700' }}>Minden</span>}
                    {!s.is_owner && s.can_manage_schedule  && <span style={{ fontSize: '0.6rem', padding: '0.1rem 0.4rem', borderRadius: '999px', backgroundColor: '#dbeafe', color: '#1d4ed8', fontWeight: '600' }}>Beosztás</span>}
                    {!s.is_owner && s.can_manage_holidays  && <span style={{ fontSize: '0.6rem', padding: '0.1rem 0.4rem', borderRadius: '999px', backgroundColor: '#dcfce7', color: '#15803d', fontWeight: '600' }}>Szabadnap</span>}
                    {!s.is_owner && !s.can_manage_schedule && !s.can_manage_holidays && <span style={{ fontSize: '0.6rem', padding: '0.1rem 0.4rem', borderRadius: '999px', backgroundColor: '#f3f4f6', color: '#9ca3af', fontWeight: '600' }}>Alap</span>}
                  </div>
                  {/* Dátum */}
                  <p style={{ color: '#9ca3af', margin: 0, fontSize: '0.75rem' }}>
                    {s.created_at ? new Date(s.created_at).toLocaleDateString('hu-HU', { month: 'short', day: 'numeric' }) : '—'}
                  </p>
                </div>
              ))}
            </>
          )}
        </div>
      )}

      {/* ── PLAN MODAL ── */}
      {modal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}
          onClick={e => e.target === e.currentTarget && setModal(null)}>
          <div style={{ backgroundColor: 'white', borderRadius: '16px', padding: isMobile ? '1.5rem' : '2rem', width: '100%', maxWidth: '480px', boxShadow: '0 24px 64px rgba(0,0,0,0.25)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
              <div>
                <h2 style={{ fontSize: '1.1rem', fontWeight: '800', color: '#111827', margin: '0 0 0.2rem' }}>⚡ Csomag beállítás</h2>
                <p style={{ fontSize: '0.85rem', color: '#6b7280', margin: 0 }}>{modal.tenantName}</p>
              </div>
              <button onClick={() => setModal(null)}
                style={{ background: 'none', border: 'none', fontSize: '1.25rem', cursor: 'pointer', color: '#9ca3af', lineHeight: 1 }}>✕</button>
            </div>

            {/* Plan választó */}
            <p style={{ fontSize: '0.8rem', fontWeight: '700', color: '#374151', marginBottom: '0.625rem' }}>Csomag kiválasztása</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.5rem', marginBottom: '1.25rem' }}>
              {PLANS.map(p => (
                <button key={p.key} onClick={() => setSelectedPlan(p.key)}
                  style={{ padding: '0.625rem 0.75rem', borderRadius: '10px', border: `2px solid ${selectedPlan === p.key ? p.color : '#e5e7eb'}`, backgroundColor: selectedPlan === p.key ? p.bg : 'white', color: selectedPlan === p.key ? p.color : '#374151', cursor: 'pointer', fontWeight: selectedPlan === p.key ? '700' : '500', fontSize: '0.875rem', textAlign: 'left' }}>
                  {selectedPlan === p.key ? '✓ ' : ''}{p.label}
                </button>
              ))}
            </div>

            {/* Időtartam (csak ha nem free) */}
            {selectedPlan !== 'free' && (
              <div style={{ marginBottom: '1.25rem' }}>
                <p style={{ fontSize: '0.8rem', fontWeight: '700', color: '#374151', marginBottom: '0.625rem' }}>Érvényesség</p>
                <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
                  {!useCustomDate && DURATIONS.map(d => (
                    <button key={d.days} onClick={() => setSelectedDays(d.days)}
                      style={{ padding: '0.4rem 0.875rem', borderRadius: '8px', border: `2px solid ${selectedDays === d.days ? '#2563eb' : '#e5e7eb'}`, backgroundColor: selectedDays === d.days ? '#eff6ff' : 'white', color: selectedDays === d.days ? '#1d4ed8' : '#374151', cursor: 'pointer', fontWeight: selectedDays === d.days ? '700' : '400', fontSize: '0.8rem' }}>
                      {d.label}
                    </button>
                  ))}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: useCustomDate ? '0.5rem' : 0 }}>
                  <input type="checkbox" id="custom-date" checked={useCustomDate} onChange={e => setUseCustomDate(e.target.checked)} style={{ cursor: 'pointer', accentColor: '#2563eb' }} />
                  <label htmlFor="custom-date" style={{ fontSize: '0.82rem', color: '#374151', cursor: 'pointer' }}>Egyedi dátum megadása</label>
                </div>
                {useCustomDate && (
                  <input type="date" value={customDate} onChange={e => setCustomDate(e.target.value)}
                    min={new Date().toISOString().split('T')[0]}
                    style={{ width: '100%', border: '1px solid #d1d5db', borderRadius: '8px', padding: '0.5rem 0.75rem', fontSize: '0.875rem', color: '#111827', boxSizing: 'border-box', marginTop: '0.5rem' }} />
                )}
                {/* Előnézet */}
                <div style={{ marginTop: '0.75rem', backgroundColor: '#f9fafb', borderRadius: '8px', padding: '0.625rem 0.875rem', border: '1px solid #e5e7eb' }}>
                  <p style={{ fontSize: '0.8rem', color: '#374151', margin: 0 }}>
                    📅 Lejárat: <strong>
                      {useCustomDate && customDate
                        ? new Date(customDate).toLocaleDateString('hu-HU', { year: 'numeric', month: 'long', day: 'numeric' })
                        : (() => { const d = new Date(); d.setDate(d.getDate() + selectedDays); return d.toLocaleDateString('hu-HU', { year: 'numeric', month: 'long', day: 'numeric' }) })()
                      }
                    </strong>
                  </p>
                </div>
              </div>
            )}

            {saveMsg && (
              <p style={{ fontSize: '0.875rem', color: saveMsg.startsWith('✅') ? '#16a34a' : '#dc2626', marginBottom: '0.75rem' }}>{saveMsg}</p>
            )}

            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button onClick={handleSavePlan} disabled={saving || (selectedPlan !== 'free' && useCustomDate && !customDate)}
                style={{ flex: 1, backgroundColor: saving ? '#9ca3af' : '#2563eb', color: 'white', padding: '0.75rem', borderRadius: '10px', border: 'none', cursor: saving ? 'not-allowed' : 'pointer', fontWeight: '700', fontSize: '0.95rem' }}>
                {saving ? 'Mentés...' : '💾 Csomag beállítása'}
              </button>
              <button onClick={() => setModal(null)}
                style={{ padding: '0.75rem 1.25rem', backgroundColor: '#f3f4f6', color: '#374151', borderRadius: '10px', border: '1px solid #e5e7eb', cursor: 'pointer', fontWeight: '600' }}>
                Mégse
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
