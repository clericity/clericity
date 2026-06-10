'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter, usePathname } from 'next/navigation'
import Image from 'next/image'

interface StaffProfile {
  full_name: string
  tenant_id: string
}

export default function StaffLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const [profile, setProfile] = useState<StaffProfile | null>(null)
  const [isMobile, setIsMobile] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  useEffect(() => {
    const getProfile = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/staff/login'); return }

      const { data } = await supabase
        .from('profiles')
        .select('full_name, tenant_id, role')
        .eq('id', user.id)
        .single()

      if (!data || data.role !== 'staff') { router.push('/staff/login'); return }
      setProfile(data)
    }
    getProfile()
  }, [router])

  const menuItems = [
    { id: 'home', label: '🏠 Főoldal', path: '/staff' },
    { id: 'bookings', label: '📅 Foglalásaim', path: '/staff/bookings' },
    { id: 'schedule', label: '🗓️ Beosztásom', path: '/staff/schedule' },
    { id: 'profile', label: '👤 Profilom', path: '/staff/profile' },
    { id: 'settings', label: '🔗 Google Naptár', path: '/staff/settings' },
  ]

  const sidebarContent = (
    <>
      <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid #334155' }}>
        <Image src="/clericity-logo.png" alt="CLERICITY" width={100} height={32} style={{ objectFit: 'contain', marginBottom: '0.5rem' }} />
        <p style={{ fontSize: '0.7rem', color: '#64748b', margin: 0, fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Munkás panel</p>
        <p style={{ fontSize: '0.8rem', color: '#94a3b8', margin: '0.25rem 0 0' }}>{profile?.full_name}</p>
      </div>

      <nav style={{ flex: 1, padding: '1rem' }}>
        {menuItems.map(item => (
          <button key={item.id} onClick={() => { setSidebarOpen(false); router.push(item.path) }}
            style={{
              display: 'block', width: '100%', textAlign: 'left',
              padding: '0.75rem 1rem', borderRadius: '8px', border: 'none',
              cursor: 'pointer', marginBottom: '0.25rem',
              backgroundColor: pathname === item.path ? '#3b82f6' : 'transparent',
              color: pathname === item.path ? 'white' : '#94a3b8',
              fontSize: '0.875rem',
            }}>
            {item.label}
          </button>
        ))}
      </nav>

      <div style={{ padding: '1rem', borderTop: '1px solid #334155' }}>
        <button
          onClick={() => supabase.auth.signOut().then(() => router.push('/'))}
          style={{ width: '100%', padding: '0.75rem', backgroundColor: '#ef4444', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '0.875rem' }}>
          🚪 Kijelentkezés
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
      <div style={{ flex: 1, padding: isMobile ? '1rem' : '2rem', marginTop: isMobile ? '56px' : 0, minWidth: 0 }}>
        {children}
      </div>
    </div>
  )
}
