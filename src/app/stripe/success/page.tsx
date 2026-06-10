'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function StripeSuccessPage() {
  const router = useRouter()

  useEffect(() => {
    const t = setTimeout(() => router.push('/dashboard/billing'), 3000)
    return () => clearTimeout(t)
  }, [router])

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f0fdf4', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ backgroundColor: 'white', padding: '3rem 2rem', borderRadius: '16px', boxShadow: '0 4px 20px rgba(0,0,0,0.08)', textAlign: 'center', maxWidth: '400px' }}>
        <div style={{ fontSize: '3.5rem', marginBottom: '1rem' }}>🎉</div>
        <h1 style={{ fontSize: '1.5rem', fontWeight: '800', color: '#111827', marginBottom: '0.5rem' }}>Sikeres fizetés!</h1>
        <p style={{ color: '#6b7280', fontSize: '0.9rem', lineHeight: 1.6, marginBottom: '1.5rem' }}>
          Az előfizetésed aktiválva lett. Pár másodpercen belül átirányítunk a dashboardra.
        </p>
        <div style={{ width: '40px', height: '4px', backgroundColor: '#22c55e', borderRadius: '2px', margin: '0 auto', animation: 'grow 3s linear forwards' }} />
      </div>
    </div>
  )
}
