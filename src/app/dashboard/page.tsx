'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { useLanguage } from '@/hooks/useLanguage'

interface Booking {
  id: string
  customer_first_name: string
  customer_last_name: string
  start_time: string
  end_time: string
  status: string
  services: { name: string }[] | null
}

interface Stats {
  todayCount: number
  weekCount: number
  monthCount: number
  upcomingCount: number
}

export default function Dashboard() {
  const router = useRouter()
  const { lang, t } = useLanguage()
  const [todayBookings, setTodayBookings] = useState<Booking[]>([])
  const [stats, setStats] = useState<Stats>({ todayCount: 0, weekCount: 0, monthCount: 0, upcomingCount: 0 })
  const [loading, setLoading] = useState(true)
  const [profileName, setProfileName] = useState('')

  useEffect(() => {
    const getData = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/'); return }

      const { data: profile } = await supabase
        .from('profiles')
        .select('tenant_id, full_name')
        .eq('id', user.id)
        .single()

      if (!profile?.tenant_id) { setLoading(false); return }

      setProfileName(profile.full_name || '')

      const now = new Date()
      const todayStr = now.toLocaleDateString('en-CA')
      const weekAgo = new Date(now); weekAgo.setDate(weekAgo.getDate() - 7)
      const monthAgo = new Date(now); monthAgo.setMonth(monthAgo.getMonth() - 1)

      const [todayRes, weekRes, monthRes, upcomingRes] = await Promise.all([
        supabase.from('bookings')
          .select('id, customer_first_name, customer_last_name, start_time, end_time, status, services(name)')
          .eq('tenant_id', profile.tenant_id)
          .eq('status', 'confirmed')
          .gte('start_time', `${todayStr}T00:00:00`)
          .lte('start_time', `${todayStr}T23:59:59`)
          .order('start_time', { ascending: true }),
        supabase.from('bookings')
          .select('id', { count: 'exact', head: true })
          .eq('tenant_id', profile.tenant_id)
          .eq('status', 'confirmed')
          .gte('start_time', weekAgo.toISOString()),
        supabase.from('bookings')
          .select('id', { count: 'exact', head: true })
          .eq('tenant_id', profile.tenant_id)
          .eq('status', 'confirmed')
          .gte('start_time', monthAgo.toISOString()),
        supabase.from('bookings')
          .select('id', { count: 'exact', head: true })
          .eq('tenant_id', profile.tenant_id)
          .eq('status', 'confirmed')
          .gte('start_time', now.toISOString()),
      ])

      setTodayBookings(todayRes.data || [])
      setStats({
        todayCount: todayRes.data?.length || 0,
        weekCount: weekRes.count || 0,
        monthCount: monthRes.count || 0,
        upcomingCount: upcomingRes.count || 0,
      })
      setLoading(false)
    }
    getData()
  }, [router])

  const formatTime = (str: string) => str.slice(11, 16)

  const hour = new Date().getHours()
  const greeting = hour < 12 ? t.dash.greeting_morning : hour < 18 ? t.dash.greeting_day : t.dash.greeting_evening
  const dateLocale = lang === 'en' ? 'en-US' : lang === 'sk' ? 'sk-SK' : 'hu-HU'

  if (loading) return <p style={{ color: '#6b7280' }}>{t.dash.loading}</p>

  return (
    <div>
      {/* Fejléc */}
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: '800', color: '#111827', marginBottom: '0.25rem' }}>
          {greeting}, {profileName?.split(' ')[0] || 'Admin'}! 👋
        </h1>
        <p style={{ color: '#6b7280', fontSize: '0.9rem' }}>
          {new Date().toLocaleDateString(dateLocale, { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })}
        </p>
      </div>

      {/* Stat kártyák */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
        {[
          { label: t.dash.stat_today, value: stats.todayCount, icon: '📅', color: '#2563eb', bg: '#eff6ff' },
          { label: t.dash.stat_upcoming, value: stats.upcomingCount, icon: '⏳', color: '#7c3aed', bg: '#f5f3ff' },
          { label: t.dash.stat_week, value: stats.weekCount, icon: '📊', color: '#059669', bg: '#ecfdf5' },
          { label: t.dash.stat_month, value: stats.monthCount, icon: '📈', color: '#d97706', bg: '#fffbeb' },
        ].map(stat => (
          <div key={stat.label} style={{ backgroundColor: 'white', borderRadius: '12px', padding: '1.25rem', boxShadow: '0 1px 3px rgba(0,0,0,0.08)', borderLeft: `4px solid ${stat.color}` }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
              <p style={{ fontSize: '0.8rem', color: '#6b7280', fontWeight: '500' }}>{stat.label}</p>
              <span style={{ fontSize: '1.25rem' }}>{stat.icon}</span>
            </div>
            <p style={{ fontSize: '2rem', fontWeight: '800', color: stat.color, lineHeight: 1 }}>{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Mai foglalások */}
      <div style={{ backgroundColor: 'white', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)', overflow: 'hidden' }}>
        <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid #f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ fontSize: '1rem', fontWeight: '700', color: '#111827' }}>{t.dash.today_title}</h2>
          <button
            onClick={() => router.push('/dashboard/bookings')}
            style={{ fontSize: '0.8rem', color: '#2563eb', background: 'none', border: 'none', cursor: 'pointer', fontWeight: '600' }}
          >
            {t.dash.view_all}
          </button>
        </div>

        {todayBookings.length === 0 ? (
          <div style={{ padding: '3rem', textAlign: 'center' }}>
            <p style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🎉</p>
            <p style={{ color: '#6b7280', fontWeight: '500' }}>{t.dash.no_today}</p>
          </div>
        ) : (
          <div>
            {todayBookings.map((b, i) => {
              const isPast = new Date(b.start_time) < new Date()
              return (
                <div key={b.id} style={{
                  display: 'flex', alignItems: 'center', gap: '1rem',
                  padding: '1rem 1.5rem',
                  borderBottom: i < todayBookings.length - 1 ? '1px solid #f9fafb' : 'none',
                  opacity: isPast ? 0.5 : 1,
                }}>
                  <div style={{ width: '52px', textAlign: 'center', flexShrink: 0 }}>
                    <p style={{ fontSize: '0.95rem', fontWeight: '800', color: isPast ? '#9ca3af' : '#1d4ed8' }}>{formatTime(b.start_time)}</p>
                    <p style={{ fontSize: '0.7rem', color: '#9ca3af' }}>{formatTime(b.end_time)}</p>
                  </div>
                  <div style={{ width: '3px', height: '36px', borderRadius: '2px', backgroundColor: isPast ? '#e5e7eb' : '#2563eb', flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>
                    <p style={{ fontWeight: '700', color: '#111827', fontSize: '0.9rem' }}>
                      {b.customer_last_name} {b.customer_first_name}
                    </p>
                    <p style={{ fontSize: '0.8rem', color: '#6b7280' }}>
                      {b.services?.[0]?.name || '—'}
                    </p>
                  </div>
                  {isPast && (
                    <span style={{ fontSize: '0.75rem', color: '#9ca3af', backgroundColor: '#f3f4f6', padding: '0.2rem 0.625rem', borderRadius: '100px' }}>{t.dash.done_badge}</span>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Gyors linkek */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem', marginTop: '1.5rem' }}>
        {[
          { label: t.dash.quick_add_service, icon: '✂️', path: '/dashboard/services' },
          { label: t.dash.quick_hours, icon: '🕐', path: '/dashboard/hours' },
          { label: t.dash.quick_email, icon: '📧', path: '/dashboard/email' },
          { label: t.dash.quick_qr, icon: '📱', path: '/dashboard/qrcode' },
        ].map(link => (
          <button key={link.path} onClick={() => router.push(link.path)}
            style={{ backgroundColor: 'white', borderRadius: '10px', padding: '1rem', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', border: '1px solid #f1f5f9', cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', gap: '0.75rem' }}
          >
            <span style={{ fontSize: '1.25rem' }}>{link.icon}</span>
            <span style={{ fontSize: '0.85rem', fontWeight: '600', color: '#374151' }}>{link.label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
