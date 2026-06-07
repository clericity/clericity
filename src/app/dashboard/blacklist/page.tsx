'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { useLanguage } from '@/hooks/useLanguage'

interface BlacklistEntry {
  id: string
  email: string
  phone?: string | null
  reason: string | null
  created_at: string
}

export default function AdminBlacklistPage() {
  const router = useRouter()
  const { t } = useLanguage()
  const [entries, setEntries] = useState<BlacklistEntry[]>([])
  const [staffId, setStaffId] = useState<string | null>(null)
  const [tenantId, setTenantId] = useState<string | null>(null)
  const [newEmail, setNewEmail] = useState('')
  const [newPhone, setNewPhone] = useState('')
  const [newReason, setNewReason] = useState('')
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/auth'); return }

      const { data: profile } = await supabase
        .from('profiles').select('tenant_id').eq('id', user.id).single()
      if (!profile?.tenant_id) return

      setTenantId(profile.tenant_id)

      const { data: ownerStaff } = await supabase
        .from('staff').select('id').eq('tenant_id', profile.tenant_id).eq('is_owner', true).single()

      if (!ownerStaff) { setLoading(false); return }
      setStaffId(ownerStaff.id)

      const { data } = await supabase
        .from('staff_blacklist')
        .select('*')
        .eq('staff_id', ownerStaff.id)
        .order('created_at', { ascending: false })

      setEntries(data || [])
      setLoading(false)
    }
    load()
  }, [router])

  const handleAdd = async () => {
    if (!staffId || !tenantId || !newEmail.trim()) return
    setAdding(true)
    setError('')

    const { data, error } = await supabase
      .from('staff_blacklist')
      .insert({ staff_id: staffId, tenant_id: tenantId, email: newEmail.toLowerCase().trim(), phone: newPhone.trim() || null, reason: newReason.trim() || null })
      .select().single()

    if (error) {
      setError(error.message.includes('unique') ? 'Ez az email már szerepel a tiltólistán.' : error.message)
    } else {
      setEntries([data, ...entries])
      setNewEmail('')
      setNewPhone('')
      setNewReason('')
    }
    setAdding(false)
  }

  const handleRemove = async (id: string) => {
    await supabase.from('staff_blacklist').delete().eq('id', id)
    setEntries(entries.filter(e => e.id !== id))
  }

  if (loading) return <p style={{ color: '#6b7280' }}>{t.dash.loading}</p>

  return <BlacklistUI title={t.dash.blacklist_title} entries={entries} newEmail={newEmail} setNewEmail={setNewEmail} newPhone={newPhone} setNewPhone={setNewPhone} newReason={newReason} setNewReason={setNewReason} adding={adding} error={error} onAdd={handleAdd} onRemove={handleRemove} />
}

export function BlacklistUI({ title, entries, newEmail, setNewEmail, newPhone, setNewPhone, newReason, setNewReason, adding, error, onAdd, onRemove, selectedIds, onToggleId, onBulkRemove }: {
  title: string
  entries: BlacklistEntry[]
  newEmail: string
  setNewEmail: (v: string) => void
  newPhone: string
  setNewPhone: (v: string) => void
  newReason: string
  setNewReason: (v: string) => void
  adding: boolean
  error: string
  onAdd: () => void
  onRemove: (id: string) => void
  selectedIds?: Set<string>
  onToggleId?: (id: string) => void
  onBulkRemove?: (ids: string[]) => void
}) {
  const { lang, t } = useLanguage()
  const dateLocale = lang === 'en' ? 'en-US' : lang === 'sk' ? 'sk-SK' : 'hu-HU'
  return (
    <div>
      <div style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#111827', margin: 0 }}>{title}</h1>
      </div>

      {/* Hozzáadás */}
      <div style={{ backgroundColor: 'white', padding: '1.5rem', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', marginBottom: '1.5rem', maxWidth: '580px' }}>
        <h2 style={{ fontSize: '0.95rem', fontWeight: '700', color: '#111827', marginBottom: '1rem' }}>Új bejegyzés hozzáadása</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem', marginBottom: '0.75rem' }}>
          <div style={{ display: 'flex', gap: '0.625rem', flexWrap: 'wrap' }}>
            <input
              type="email"
              value={newEmail}
              onChange={e => setNewEmail(e.target.value)}
              placeholder="pelda@email.com"
              style={{ flex: '1 1 180px', border: '1px solid #d1d5db', borderRadius: '8px', padding: '0.625rem 1rem', color: '#111827', outline: 'none', boxSizing: 'border-box', fontSize: '0.875rem' }}
              onKeyDown={e => e.key === 'Enter' && onAdd()}
            />
            <input
              type="tel"
              value={newPhone}
              onChange={e => setNewPhone(e.target.value)}
              placeholder="+36 30 123 4567"
              style={{ flex: '1 1 150px', border: '1px solid #d1d5db', borderRadius: '8px', padding: '0.625rem 1rem', color: '#111827', outline: 'none', boxSizing: 'border-box', fontSize: '0.875rem' }}
            />
          </div>
          <div style={{ display: 'flex', gap: '0.625rem', flexWrap: 'wrap' }}>
            <input
              type="text"
              value={newReason}
              onChange={e => setNewReason(e.target.value)}
              placeholder="Indok (opcionális)..."
              style={{ flex: 1, minWidth: '160px', border: '1px solid #d1d5db', borderRadius: '8px', padding: '0.625rem 1rem', color: '#111827', outline: 'none', boxSizing: 'border-box', fontSize: '0.875rem' }}
            />
            <button
              onClick={onAdd}
              disabled={!newEmail.trim() || adding}
              style={{ backgroundColor: '#dc2626', color: 'white', padding: '0.625rem 1.25rem', borderRadius: '8px', border: 'none', cursor: 'pointer', fontWeight: '600', fontSize: '0.875rem', opacity: !newEmail.trim() ? 0.5 : 1, flexShrink: 0 }}
            >
              🚫 {t.dash.add_btn}
            </button>
          </div>
        </div>
        <p style={{ fontSize: '0.75rem', color: '#9ca3af', margin: 0 }}>Az email cím kötelező. A telefonszám megadásával mindkét adat alapján tiltjuk a foglalást.</p>
        {error && <p style={{ color: '#ef4444', fontSize: '0.8rem', marginTop: '0.5rem' }}>{error}</p>}
      </div>

      {/* Bulk action bar */}
      {onToggleId && entries.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', flexWrap: 'wrap', marginBottom: '1rem', maxWidth: '580px', backgroundColor: (selectedIds?.size ?? 0) > 0 ? '#eff6ff' : '#f9fafb', border: `1px solid ${(selectedIds?.size ?? 0) > 0 ? '#bfdbfe' : '#e5e7eb'}`, borderRadius: '10px', padding: '0.625rem 1rem' }}>
          <input type="checkbox" checked={entries.length > 0 && entries.every(e => selectedIds?.has(e.id))} onChange={() => onToggleId?.('__all__')} style={{ width: '15px', height: '15px', cursor: 'pointer', accentColor: '#2563eb' }} />
          <span style={{ fontSize: '0.82rem', fontWeight: '600', color: (selectedIds?.size ?? 0) > 0 ? '#1d4ed8' : '#9ca3af' }}>
            {(selectedIds?.size ?? 0) > 0 ? `${selectedIds!.size} kiválasztva` : 'Jelölj ki bejegyzéseket'}
          </span>
          {onBulkRemove && (selectedIds?.size ?? 0) > 0 && (
            <button onClick={() => onBulkRemove(Array.from(selectedIds!))}
              style={{ backgroundColor: '#fee2e2', color: '#dc2626', padding: '0.35rem 0.875rem', borderRadius: '7px', border: '1px solid #fca5a5', cursor: 'pointer', fontWeight: '600', fontSize: '0.8rem' }}>
              🗑️ Törlés
            </button>
          )}
        </div>
      )}

      {/* Lista */}
      {entries.length === 0 ? (
        <div style={{ backgroundColor: 'white', padding: '3rem', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', textAlign: 'center', color: '#9ca3af', maxWidth: '580px' }}>
          {t.dash.no_results}
        </div>
      ) : (
        <div style={{ backgroundColor: 'white', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', overflow: 'hidden', maxWidth: '580px' }}>
          {entries.map((e, i) => (
            <div key={e.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.875rem 1.25rem', borderBottom: i < entries.length - 1 ? '1px solid #f3f4f6' : 'none', gap: '1rem', backgroundColor: selectedIds?.has(e.id) ? '#eff6ff' : 'white' }}>
              {onToggleId && <input type="checkbox" checked={selectedIds?.has(e.id) ?? false} onChange={() => onToggleId(e.id)} style={{ width: '15px', height: '15px', cursor: 'pointer', accentColor: '#2563eb', flexShrink: 0 }} />}
              <div style={{ minWidth: 0, flex: 1 }}>
                <p style={{ fontWeight: '600', color: '#111827', margin: '0 0 1px', fontSize: '0.9rem' }}>📧 {e.email}</p>
                {e.phone && <p style={{ color: '#374151', fontSize: '0.82rem', margin: '0 0 1px' }}>📞 {e.phone}</p>}
                {e.reason && <p style={{ color: '#6b7280', fontSize: '0.8rem', margin: '0 0 1px' }}>{e.reason}</p>}
                <p style={{ color: '#9ca3af', fontSize: '0.75rem', margin: 0 }}>
                  {new Date(e.created_at).toLocaleDateString(dateLocale)}
                </p>
              </div>
              <button onClick={() => onRemove(e.id)}
                style={{ backgroundColor: '#fee2e2', color: '#ef4444', border: 'none', borderRadius: '8px', padding: '0.4rem 0.875rem', cursor: 'pointer', fontSize: '0.8rem', fontWeight: '600', flexShrink: 0 }}>
                {t.dash.delete_btn}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
