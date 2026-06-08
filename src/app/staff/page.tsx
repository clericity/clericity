'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

interface Booking {
  id: string
  customer_first_name: string
  customer_last_name: string
  start_time: string
  end_time: string
  services: { name: string }[] | null
}

export default function StaffHomePage() {
  const router = useRouter()
  const [staffName, setStaffName] = useState('')
  const [todayBookings, setTodayBookings] = useState<Booking[]>([])
  const [stats, setStats] = useState({ today: 0, week: 0, upcoming: 0 })
  const [loading, setLoading] = useState(true)
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  useEffect(() => {
    const getData = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // Staff rekord keresése user_id alapján
      const { data: staff } = await supabase
        .from('staff')
        .select('id, name')
        .eq('user_id', user.id)
        .single()

      if (!staff) { setLoading(false); return }
      setStaffName(staff.name)

      const now = new Date()
      const todayStr = now.toLocaleDateString('en-CA')
      const weekAgo = new Date(now); weekAgo.setDate(weekAgo.getDate() - 7)

      const [todayRes, weekRes, upcomingRes] = await Promise.all([
        supabase.from('bookings')
          .select('id, customer_first_name, customer_last_name, start_time, end_time, services(name)')
          .eq('staff_id', staff.id)
          .eq('status', 'confirmed')
          .gte('start_time', `${todayStr}T00:00:00`)
          .lte('start_time', `${todayStr}T23:59:59`)
          .order('start_time', { ascending: true }),
        supabase.from('bookings')
          .select('id', { count: 'exact', head: true })
          .eq('staff_id', staff.id)
          .eq('status', 'confirmed')
          .gte('start_time', weekAgo.toISOString()),
        supabase.from('bookings')
          .select('id', { count: 'exact', head: true })
          .eq('staff_id', staff.id)
          .eq('status', 'confirmed')
          .gte('start_time', now.toISOString()),
      ])

      setTodayBookings(todayRes.data || [])
      setStats({ today: todayRes.data?.length || 0, week: weekRes.count || 0, upcoming: upcomingRes.count || 0 })
      setLoading(false)
    }
    getData()
  }, [])

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Jó reggelt' : hour < 18 ? 'Jó napot' : 'Jó estét'

  if (loading) return <p style={{ color: '#6b7280' }}>Betöltés...</p>

  return (
    <div>
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: '800', color: '#111827', marginBottom: '0.25rem' }}>
          {greeting}, {staffName?.split(' ').pop()}! 👋
        </h1>
        <p style={{ color: '#6b7280', fontSize: '0.9rem' }}>
          {new Date().toLocaleDateString('hu-HU', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })}
        </p>
      </div>

      {/* Stat kártyák */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem', marginBottom: '2rem' }}>
        {[
          { label: 'Ma', value: stats.today, icon: '📅', color: '#2563eb', bg: '#eff6ff' },
          { label: 'Közelgő', value: stats.upcoming, icon: '⏳', color: '#7c3aed', bg: '#f5f3ff' },
          { label: 'Ezen a héten', value: stats.week, icon: '📊', color: '#059669', bg: '#ecfdf5' },
        ].map(stat => (
          <div key={stat.label} style={{ backgroundColor: 'white', borderRadius: '12px', padding: isMobile ? '0.875rem 0.75rem' : '1.25rem', boxShadow: '0 1px 3px rgba(0,0,0,0.08)', borderLeft: `4px solid ${stat.color}` }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
              <p style={{ fontSize: isMobile ? '0.7rem' : '0.8rem', color: '#6b7280', fontWeight: '500' }}>{stat.label}</p>
              <span style={{ fontSize: isMobile ? '1rem' : '1.25rem' }}>{stat.icon}</span>
            </div>
            <p style={{ fontSize: isMobile ? '1.5rem' : '2rem', fontWeight: '800', color: stat.color, lineHeight: 1 }}>{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Mai foglalások */}
      <div style={{ backgroundColor: 'white', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)', overflow: 'hidden' }}>
        <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid #f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ fontSize: '1rem', fontWeight: '700', color: '#111827' }}>📅 Mai foglalásaim</h2>
          <button onClick={() => router.push('/staff/bookings')}
            style={{ fontSize: '0.8rem', color: '#2563eb', background: 'none', border: 'none', cursor: 'pointer', fontWeight: '600' }}>
            Összes →
          </button>
        </div>

        {todayBookings.length === 0 ? (
          <div style={{ padding: '3rem', textAlign: 'center' }}>
            <p style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🎉</p>
            <p style={{ color: '#6b7280', fontWeight: '500' }}>Ma nincs több foglalásod</p>
          </div>
        ) : (
          todayBookings.map((b, i) => {
            const isPast = new Date(b.start_time) < new Date()
            return (
              <div key={b.id} style={{ display: 'flex', alignItems: 'center', gap: isMobile ? '0.75rem' : '1rem', padding: isMobile ? '0.875rem 1rem' : '1rem 1.5rem', borderBottom: i < todayBookings.length - 1 ? '1px solid #f9fafb' : 'none', opacity: isPast ? 0.5 : 1 }}>
                <div style={{ width: '48px', textAlign: 'center', flexShrink: 0 }}>
                  <p style={{ fontSize: '0.9rem', fontWeight: '800', color: isPast ? '#9ca3af' : '#1d4ed8' }}>{b.start_time.slice(11, 16)}</p>
                  <p style={{ fontSize: '0.7rem', color: '#9ca3af' }}>{b.end_time.slice(11, 16)}</p>
                </div>
                <div style={{ width: '3px', height: '36px', borderRadius: '2px', backgroundColor: isPast ? '#e5e7eb' : '#2563eb', flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontWeight: '700', color: '#111827', fontSize: '0.9rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{b.customer_last_name} {b.customer_first_name}</p>
                  <p style={{ fontSize: '0.8rem', color: '#6b7280', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{b.services?.[0]?.name || '—'}</p>
                </div>
                {isPast && <span style={{ fontSize: '0.75rem', color: '#9ca3af', backgroundColor: '#f3f4f6', padding: '0.2rem 0.625rem', borderRadius: '100px', flexShrink: 0 }}>kész</span>}
              </div>
            )
          })
        )}
      </div>

      {/* Gyors linkek */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginTop: '1.5rem' }}>
        {[
          { label: 'Profil beállítása', icon: '👤', path: '/staff/profile' },
          { label: 'Google Naptár', icon: '📅', path: '/staff/settings' },
        ].map(link => (
          <button key={link.path} onClick={() => router.push(link.path)}
            style={{ backgroundColor: 'white', borderRadius: '10px', padding: '1rem', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', border: '1px solid #f1f5f9', cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <span style={{ fontSize: '1.25rem' }}>{link.icon}</span>
            <span style={{ fontSize: '0.85rem', fontWeight: '600', color: '#374151' }}>{link.label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
