'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

export default function StaffSettingsPage() {
  const router = useRouter()
  const [staffId, setStaffId] = useState<string | null>(null)
  const [tenantId, setTenantId] = useState<string | null>(null)
  const [googleConnected, setGoogleConnected] = useState(false)
  const [googleError, setGoogleError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const getData = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/'); return }

      const { data: staff } = await supabase
        .from('staff')
        .select('id, tenant_id, google_refresh_token')
        .eq('user_id', user.id)
        .single()

      if (staff) {
        setStaffId(staff.id)
        setTenantId(staff.tenant_id)
        setGoogleConnected(!!staff.google_refresh_token)
      }

      const params = new URLSearchParams(window.location.search)
      if (params.get('success') === 'google_connected') setGoogleConnected(true)
      if (params.get('error')) setGoogleError('Google összekötés sikertelen!')

      setLoading(false)
    }
    getData()
  }, [router])

  if (loading) return <p style={{ color: '#6b7280' }}>Betöltés...</p>

  return (
    <div>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#111827', marginBottom: '1.5rem' }}>📅 Google Naptár</h1>

      <div style={{ backgroundColor: 'white', padding: '1.5rem', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', maxWidth: '500px', width: '100%', boxSizing: 'border-box' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem' }}>
          <div style={{ width: '48px', height: '48px', borderRadius: '10px', backgroundColor: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem' }}>📅</div>
          <div>
            <p style={{ fontWeight: '600', color: '#111827' }}>Google Naptár összekötése</p>
            <p style={{ color: '#9ca3af', fontSize: '0.8rem' }}>
              {googleConnected ? '✅ Összekötve' : 'Nincs összekötve'}
            </p>
          </div>
        </div>

        <p style={{ color: '#6b7280', fontSize: '0.875rem', marginBottom: '1.25rem', lineHeight: 1.6 }}>
          Kösd össze a Google Naptáradat hogy a foglalások automatikusan megjelenjenek ott, és a naptáradban lévő eseményeid blokkolják a szabad időpontokat.
        </p>

        {googleError && <p style={{ color: '#ef4444', fontSize: '0.875rem', marginBottom: '0.75rem' }}>{googleError}</p>}

        <button
          onClick={() => window.location.href = `/api/google/auth?tenantId=${tenantId}&staffId=${staffId}`}
          style={{ width: '100%', padding: '0.75rem', backgroundColor: '#4285f4', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '0.875rem', fontWeight: '600' }}>
          🔗 {googleConnected ? 'Újra összekötés' : 'Google Naptár összekötése'}
        </button>

        {googleConnected && (
          <div style={{ marginTop: '1rem', backgroundColor: '#ecfdf5', borderRadius: '8px', padding: '0.875rem', border: '1px solid #bbf7d0' }}>
            <p style={{ color: '#15803d', fontSize: '0.875rem', fontWeight: '600' }}>✅ Google Naptár sikeresen összekötve</p>
            <p style={{ color: '#16a34a', fontSize: '0.8rem', marginTop: '0.25rem' }}>A foglalások automatikusan megjelennek a naptáradban.</p>
          </div>
        )}
      </div>
    </div>
  )
}
