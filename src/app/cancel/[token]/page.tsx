'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'

interface Booking {
  id: string
  customer_first_name: string
  customer_last_name: string
  start_time: string
  status: string
  google_event_id: string
  staff_id: string
  tenant_id: string
  services: { name: string } | null
  tenants: { name: string; plan?: string } | null
}

export default function CancelPage() {
  const params = useParams()
  const token = params.token as string

  const [booking, setBooking] = useState<Booking | null>(null)
  const [loading, setLoading] = useState(true)
  const [cancelling, setCancelling] = useState(false)
  const [cancelled, setCancelled] = useState(false)
  const [error, setError] = useState('')
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    const getData = async () => {
      const res = await fetch(`/api/bookings/cancel-info?token=${token}`)
      const data = await res.json()

      if (!data || data.error) { setNotFound(true); setLoading(false); return }
      setBooking(data)
      if (data.status === 'cancelled') setCancelled(true)
      setLoading(false)
    }
    getData()
  }, [token])

  const handleCancel = async () => {
    if (!booking) return
    setCancelling(true)

    const res = await fetch('/api/bookings/cancel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    })

    const data = await res.json()
    if (data.error) {
      setError(data.error)
    } else {
      setCancelled(true)
    }
    setCancelling(false)
  }

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleDateString('hu-HU', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })
  }

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleTimeString('hu-HU', { hour: '2-digit', minute: '2-digit' })
  }

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc' }}>
      <p style={{ color: '#6b7280' }}>Betöltés...</p>
    </div>
  )

  if (notFound) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc' }}>
      <div style={{ textAlign: 'center' }}>
        <p style={{ fontSize: '3rem', marginBottom: '1rem' }}>❌</p>
        <h2 style={{ color: '#111827', fontWeight: '700' }}>Foglalás nem található</h2>
        <p style={{ color: '#6b7280' }}>Ez a lemondási link érvénytelen vagy már lejárt.</p>
      </div>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
      <div style={{ maxWidth: '460px', width: '100%' }}>

        {/* Fejléc */}
        <div style={{ background: 'linear-gradient(135deg, #0f172a, #1e3a8a)', borderRadius: '16px 16px 0 0', padding: '1.5rem', textAlign: 'center' }}>
          <h1 style={{ color: 'white', fontWeight: '800', fontSize: '1.5rem', margin: 0 }}>CLERICITY</h1>
          <p style={{ color: '#93c5fd', fontSize: '0.875rem', margin: '0.25rem 0 0' }}>Foglalás lemondása</p>
        </div>

        <div style={{ backgroundColor: 'white', borderRadius: '0 0 16px 16px', padding: '2rem', boxShadow: '0 4px 20px rgba(0,0,0,0.08)' }}>

          {cancelled ? (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>✅</div>
              <h2 style={{ color: '#111827', fontWeight: '700', marginBottom: '0.5rem' }}>Foglalás lemondva</h2>
              <p style={{ color: '#6b7280', fontSize: '0.875rem' }}>A foglalást sikeresen lemondtuk. Reméljük hamarosan viszontlátjuk!</p>
            </div>
          ) : (
            <>
              <h2 style={{ color: '#111827', fontWeight: '700', marginBottom: '0.5rem', fontSize: '1.1rem' }}>
                Biztosan le szeretnéd mondani?
              </h2>
              <p style={{ color: '#6b7280', fontSize: '0.875rem', marginBottom: '1.5rem' }}>
                Az alábbi foglalást fogod lemondani:
              </p>

              <div style={{ backgroundColor: '#f8fafc', borderRadius: '12px', padding: '1.25rem', marginBottom: '1.5rem', border: '1px solid #e5e7eb' }}>
                <p style={{ fontWeight: '700', color: '#111827', marginBottom: '0.5rem' }}>
                  {booking?.services && 'name' in booking.services ? booking.services.name : ''}
                </p>
                <p style={{ color: '#6b7280', fontSize: '0.875rem', marginBottom: '0.25rem' }}>
                  📅 {booking?.start_time ? formatDate(booking.start_time) : ''}
                </p>
                <p style={{ color: '#6b7280', fontSize: '0.875rem', marginBottom: '0.25rem' }}>
                  🕐 {booking?.start_time ? formatTime(booking.start_time) : ''}
                </p>
                <p style={{ color: '#6b7280', fontSize: '0.875rem' }}>
                  👤 {booking?.customer_last_name} {booking?.customer_first_name}
                </p>
              </div>

              {error && <p style={{ color: '#ef4444', fontSize: '0.875rem', marginBottom: '1rem' }}>{error}</p>}

              {(booking?.tenants as { plan?: string } | null)?.plan === 'free' || !(booking?.tenants as { plan?: string } | null)?.plan ? (
                <div style={{ backgroundColor: '#fffbeb', border: '2px solid #fde68a', borderRadius: '12px', padding: '1.25rem', textAlign: 'center' }}>
                  <p style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>🔒</p>
                  <p style={{ fontWeight: '700', color: '#92400e', fontSize: '0.95rem', margin: '0 0 0.4rem' }}>Online lemondás nem elérhető</p>
                  <p style={{ color: '#78350f', fontSize: '0.85rem', lineHeight: 1.6, margin: 0 }}>
                    Ez a vállalkozás az ingyenes csomagot használja, amelyben az online lemondás nem elérhető. Kérjük, lépj kapcsolatba velük közvetlenül a lemondáshoz.
                  </p>
                </div>
              ) : (
                <div style={{ display: 'flex', gap: '0.75rem' }}>
                  <button
                    onClick={handleCancel}
                    disabled={cancelling}
                    style={{ flex: 1, backgroundColor: '#ef4444', color: 'white', padding: '0.875rem', borderRadius: '10px', border: 'none', cursor: 'pointer', fontWeight: '700', fontSize: '1rem', opacity: cancelling ? 0.5 : 1 }}
                  >
                    {cancelling ? 'Lemondás...' : '❌ Igen, mondom le'}
                  </button>
                  <button
                    onClick={() => window.history.back()}
                    style={{ flex: 1, backgroundColor: '#f3f4f6', color: '#374151', padding: '0.875rem', borderRadius: '10px', border: '1px solid #e5e7eb', cursor: 'pointer', fontWeight: '600', fontSize: '1rem' }}
                  >
                    Vissza
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}