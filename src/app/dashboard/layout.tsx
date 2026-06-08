'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter, usePathname } from 'next/navigation'
import Image from 'next/image'
import { useLanguage } from '@/hooks/useLanguage'
import LanguageSwitcher from '@/components/LanguageSwitcher'

interface Profile {
  full_name: string
  role: string
  tenant_id: string
}

const SUPER_ADMIN_EMAIL = 'clericity.booking@gmail.com'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const { lang, setLang, t } = useLanguage()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [isMobile, setIsMobile] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [subscriptionStatus, setSubscriptionStatus] = useState<'active' | 'grace' | 'expired' | 'free'>('free')
  const [daysLeft, setDaysLeft] = useState<number | null>(null)
  const [isSuperAdmin, setIsSuperAdmin] = useState(false)

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  useEffect(() => {
    const getProfile = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/')
        return
      }
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single()
      if (data?.role === 'staff') {
        router.push('/staff')
        return
      }
      setProfile(data)
      if (data?.role === 'super_admin' && user.email === SUPER_ADMIN_EMAIL) {
        setIsSuperAdmin(true)
      }

      if (data?.tenant_id) {
        const { data: tenant } = await supabase
          .from('tenants')
          .select('plan, plan_expires_at')
          .eq('id', data.tenant_id)
          .single()

        if (!tenant || tenant.plan === 'free' || !tenant.plan_expires_at) {
          setSubscriptionStatus('free')
        } else {
          const now = new Date()
          const expires = new Date(tenant.plan_expires_at)
          const graceEnd = new Date(expires)
          graceEnd.setDate(graceEnd.getDate() + 3)
          const msLeft = expires.getTime() - now.getTime()
          const days = Math.ceil(msLeft / (1000 * 60 * 60 * 24))

          if (now <= expires) {
            setSubscriptionStatus('active')
            setDaysLeft(days)
          } else if (now <= graceEnd) {
            setSubscriptionStatus('grace')
            setDaysLeft(Math.ceil((graceEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)))
          } else {
            setSubscriptionStatus('expired')
          }
        }
      }
    }
    getProfile()
  }, [router])

  const menuItems = [
    { id: 'home', label: `🏠 ${t.dash.menu_home}`, path: '/dashboard' },
    { id: 'settings', label: `⚙️ ${t.dash.menu_settings}`, path: '/dashboard/settings' },
    { id: 'staff', label: `👤 ${t.dash.menu_staff}`, path: '/dashboard/staff' },
    { id: 'services', label: `✂️ ${t.dash.menu_services}`, path: '/dashboard/services' },
    { id: 'hours', label: `🕐 ${t.dash.menu_hours}`, path: '/dashboard/hours' },
    { id: 'bookings', label: `📅 ${t.dash.menu_bookings}`, path: '/dashboard/bookings' },
    { id: 'billing', label: `💳 ${t.dash.tab_billing}`, path: '/dashboard/billing' },
    { id: 'qrcode', label: `📱 ${t.dash.menu_qrcode}`, path: '/dashboard/qrcode' },
    ...(isSuperAdmin ? [{ id: 'superadmin', label: '🛡️ Super Admin', path: '/dashboard/superadmin' }] : []),
  ]

  const sidebarContent = (
    <>
      <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid #334155' }}>
        <Image src="/clericity-logo.png" alt="CLERICITY" width={110} height={36} style={{ objectFit: 'contain', width: '110px', height: 'auto', marginBottom: '0.5rem' }} loading="eager" />
        <p style={{ fontSize: '0.75rem', color: '#94a3b8', margin: '0 0 0.5rem' }}>{profile?.full_name}</p>
        <LanguageSwitcher lang={lang} setLang={setLang} dark />
      </div>

      <nav style={{ flex: 1, padding: '1rem', overflowY: 'auto' }}>
        {menuItems.map((item) => (
          <div key={item.id}>
            {item.id === 'superadmin' && (
              <div style={{ borderTop: '1px solid #334155', margin: '0.5rem 0' }} />
            )}
            <button
              onClick={() => { setSidebarOpen(false); router.push(item.path) }}
              style={{
                display: 'block', width: '100%', textAlign: 'left',
                padding: '0.75rem 1rem', borderRadius: '8px', border: 'none',
                cursor: 'pointer', marginBottom: '0.25rem',
                backgroundColor: pathname === item.path ? (item.id === 'superadmin' ? '#7c3aed' : '#3b82f6') : 'transparent',
                color: pathname === item.path ? 'white' : (item.id === 'superadmin' ? '#c4b5fd' : '#94a3b8'),
                fontSize: '0.875rem',
                fontWeight: item.id === 'superadmin' ? '700' : '400',
              }}
            >
              {item.label}
            </button>
          </div>
        ))}
      </nav>

      <div style={{ padding: '1rem', borderTop: '1px solid #334155' }}>
        <button
          onClick={() => supabase.auth.signOut().then(() => router.push('/'))}
          style={{ width: '100%', padding: '0.75rem', backgroundColor: '#ef4444', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '0.875rem' }}
        >
          {t.dash.logout}
        </button>
      </div>
    </>
  )

  return (
    <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: '#f3f4f6' }}>

      {/* ── Mobil top bar ── */}
      {isMobile && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, height: '56px', backgroundColor: '#1e293b', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 1rem', zIndex: 300 }}>
          <Image src="/clericity-logo.png" alt="CLERICITY" width={90} height={30} style={{ objectFit: 'contain' }} />
          <button onClick={() => setSidebarOpen(v => !v)} style={{ background: 'none', border: 'none', color: 'white', fontSize: '1.4rem', cursor: 'pointer', lineHeight: 1 }}>
            {sidebarOpen ? '✕' : '☰'}
          </button>
        </div>
      )}

      {/* ── Overlay ── */}
      {isMobile && sidebarOpen && (
        <div onClick={() => setSidebarOpen(false)} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 350 }} />
      )}

      {/* ── Sidebar ── */}
      {isMobile ? (
        <div style={{
          position: 'fixed', top: '56px', left: 0, bottom: 0, width: '240px',
          backgroundColor: '#1e293b', color: 'white', display: 'flex', flexDirection: 'column',
          transform: sidebarOpen ? 'translateX(0)' : 'translateX(-100%)',
          transition: 'transform 0.25s ease',
          zIndex: 400,
        }}>
          {sidebarContent}
        </div>
      ) : (
        <div style={{ width: '240px', backgroundColor: '#1e293b', color: 'white', display: 'flex', flexDirection: 'column' }}>
          {sidebarContent}
        </div>
      )}

      {/* ── Tartalom ── */}
      <div style={{ flex: 1, padding: isMobile ? '1rem' : '2rem', marginTop: isMobile ? '56px' : 0, minWidth: 0, position: 'relative' }}>

        {/* Grace period figyelmeztető sáv */}
        {subscriptionStatus === 'grace' && (
          <div style={{ backgroundColor: '#fef3c7', border: '1px solid #fde68a', borderRadius: '10px', padding: '0.875rem 1.25rem', marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '1.25rem' }}>⚠️</span>
            <div style={{ flex: 1 }}>
              <p style={{ fontWeight: '700', color: '#92400e', margin: '0 0 0.15rem', fontSize: '0.9rem' }}>{t.dash.grace_title}</p>
              <p style={{ color: '#78350f', fontSize: '0.8rem', margin: 0 }}>{t.dash.grace_desc_1} {daysLeft} {t.dash.grace_desc_2}</p>
            </div>
            <button onClick={() => router.push('/dashboard/settings')}
              style={{ backgroundColor: '#d97706', color: 'white', border: 'none', borderRadius: '8px', padding: '0.5rem 1.25rem', cursor: 'pointer', fontWeight: '700', fontSize: '0.85rem', whiteSpace: 'nowrap' }}>
              {t.dash.grace_renew}
            </button>
          </div>
        )}

        {/* Lejárt előfizetés — lock screen */}
        {subscriptionStatus === 'expired' && !pathname.startsWith('/dashboard/settings') && !pathname.startsWith('/dashboard/superadmin') ? (
          <div style={{ position: 'fixed', inset: 0, zIndex: 500, backgroundColor: 'rgba(15,23,42,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem' }}>
            <div style={{ backgroundColor: 'white', borderRadius: '20px', padding: '2.5rem 2rem', maxWidth: '460px', width: '100%', textAlign: 'center', boxShadow: '0 24px 64px rgba(0,0,0,0.4)' }}>
              <div style={{ width: '72px', height: '72px', borderRadius: '50%', backgroundColor: '#fee2e2', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.25rem', fontSize: '2rem' }}>🔒</div>
              <h2 style={{ fontSize: '1.4rem', fontWeight: '800', color: '#0f172a', marginBottom: '0.75rem' }}>{t.dash.expired_title}</h2>
              <p style={{ color: '#64748b', fontSize: '0.9rem', lineHeight: 1.7, marginBottom: '1.5rem' }}>
                {t.dash.expired_body}
              </p>
              <div style={{ backgroundColor: '#f8fafc', borderRadius: '12px', padding: '1rem', marginBottom: '1.5rem', border: '1px solid #e2e8f0' }}>
                <p style={{ fontSize: '0.85rem', color: '#374151', fontWeight: '600', margin: '0 0 0.25rem' }}>{t.dash.expired_renew_label}</p>
                <p style={{ fontSize: '0.8rem', color: '#64748b', margin: 0 }}>{t.dash.expired_contact}</p>
              </div>
              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', flexWrap: 'wrap' }}>
                <button
                  onClick={() => router.push('/dashboard/settings')}
                  style={{ backgroundColor: '#2563eb', color: 'white', border: 'none', borderRadius: '10px', padding: '0.875rem 1.75rem', cursor: 'pointer', fontWeight: '700', fontSize: '0.95rem', boxShadow: '0 4px 14px rgba(37,99,235,0.35)' }}>
                  {t.dash.expired_billing}
                </button>
                <a href="mailto:kusalarudika@gmail.com?subject=CLERICITY előfizetés megújítás"
                  style={{ display: 'inline-block', backgroundColor: 'white', color: '#374151', border: '2px solid #e5e7eb', borderRadius: '10px', padding: '0.875rem 1.75rem', cursor: 'pointer', fontWeight: '600', fontSize: '0.95rem', textDecoration: 'none' }}>
                  {t.dash.expired_email_btn}
                </a>
              </div>
            </div>
          </div>
        ) : null}

        {/* Hátralévő napok figyelmeztetés (7 napon belül) */}
        {subscriptionStatus === 'active' && daysLeft !== null && daysLeft <= 7 && (
          <div style={{ backgroundColor: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '10px', padding: '0.75rem 1.25rem', marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <span>ℹ️</span>
            <p style={{ color: '#1d4ed8', fontSize: '0.85rem', margin: 0 }}>
              {t.dash.expiring_1} <strong>{daysLeft}</strong> {t.dash.expiring_2}
            </p>
            <button onClick={() => router.push('/dashboard/settings')}
              style={{ background: 'none', border: '1px solid #2563eb', borderRadius: '6px', color: '#2563eb', padding: '0.3rem 0.875rem', cursor: 'pointer', fontWeight: '600', fontSize: '0.8rem', whiteSpace: 'nowrap', marginLeft: 'auto' }}>
              {t.dash.billing_btn}
            </button>
          </div>
        )}

        {children}
      </div>
    </div>
  )
}
