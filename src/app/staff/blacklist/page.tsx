'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { BlacklistUI } from '@/app/dashboard/blacklist/page'

export default function StaffBlacklistPage() {
  const [entries, setEntries] = useState<{ id: string; email: string; phone?: string | null; reason: string | null; created_at: string }[]>([])
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
      if (!user) return

      const { data: staffRow } = await supabase
        .from('staff').select('id, tenant_id').eq('user_id', user.id).single()
      if (!staffRow) { setLoading(false); return }

      setStaffId(staffRow.id)
      setTenantId(staffRow.tenant_id)

      const { data } = await supabase
        .from('staff_blacklist')
        .select('*')
        .eq('staff_id', staffRow.id)
        .order('created_at', { ascending: false })

      setEntries(data || [])
      setLoading(false)
    }
    load()
  }, [])

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

  if (loading) return <p style={{ color: '#6b7280' }}>Betöltés...</p>

  return <BlacklistUI title="🚫 Tiltólistám" entries={entries} newEmail={newEmail} setNewEmail={setNewEmail} newPhone={newPhone} setNewPhone={setNewPhone} newReason={newReason} setNewReason={setNewReason} adding={adding} error={error} onAdd={handleAdd} onRemove={handleRemove} />
}
