'use client'

import { useRouter } from 'next/navigation'

export default function StripeCancelPage() {
  const router = useRouter()

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f9fafb', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ backgroundColor: 'white', padding: '3rem 2rem', borderRadius: '16px', boxShadow: '0 4px 20px rgba(0,0,0,0.08)', textAlign: 'center', maxWidth: '400px' }}>
        <div style={{ fontSize: '3.5rem', marginBottom: '1rem' }}>↩️</div>
        <h1 style={{ fontSize: '1.5rem', fontWeight: '800', color: '#111827', marginBottom: '0.5rem' }}>Fizetés megszakítva</h1>
        <p style={{ color: '#6b7280', fontSize: '0.9rem', lineHeight: 1.6, marginBottom: '1.5rem' }}>
          Nem történt semmilyen terhelés. Bármikor visszatérhetsz és előfizethetsz.
        </p>
        <button
          onClick={() => router.push('/dashboard/billing')}
          style={{ backgroundColor: '#2563eb', color: 'white', padding: '0.75rem 2rem', borderRadius: '8px', border: 'none', cursor: 'pointer', fontWeight: '600', fontSize: '0.9rem' }}
        >
          ← Vissza a számlázáshoz
        </button>
      </div>
    </div>
  )
}
