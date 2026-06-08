'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { ClientList } from '@/app/dashboard/clients/page'
import { BlacklistUI } from '@/app/dashboard/blacklist/page'

interface Booking {
  id: string
  customer_first_name: string
  customer_last_name: string
  customer_email: string
  customer_phone: string
  start_time: string
  end_time: string
  status: string
  services: { name: string }[] | null
}

interface Client {
  email: string
  first_name: string
  last_name: string
  phone: string
  booking_count: number
  last_booking: string
}

interface BlacklistEntry {
  id: string
  email: string
  reason: string | null
  created_at: string
}

interface WaitlistEntry {
  id: string
  customer_first_name: string | null
  customer_last_name: string | null
  customer_email: string
  customer_phone: string | null
  status: string
  created_at: string
  services: { name: string }[] | null
}

type Tab = 'upcoming' | 'past' | 'all' | 'clients' | 'blacklist' | 'waitlist'

export default function StaffBookingsPage() {
  const [tab, setTab] = useState<Tab>('upcoming')
  const [staffId, setStaffId] = useState<string | null>(null)
  const [tenantId, setTenantId] = useState<string | null>(null)

  const [bookings, setBookings] = useState<Booking[]>([])
  const [loading, setLoading] = useState(true)

  const [clients, setClients] = useState<Client[]>([])
  const [clientSearch, setClientSearch] = useState('')
  const [clientsLoaded, setClientsLoaded] = useState(false)

  const [blacklist, setBlacklist] = useState<BlacklistEntry[]>([])
  const [blacklistLoaded, setBlacklistLoaded] = useState(false)
  const [waitlist, setWaitlist] = useState<WaitlistEntry[]>([])
  const [waitlistLoaded, setWaitlistLoaded] = useState(false)
  const [newEmail, setNewEmail] = useState('')
  const [newPhone, setNewPhone] = useState('')
  const [newReason, setNewReason] = useState('')
  const [adding, setAdding] = useState(false)
  const [blError, setBlError] = useState('')
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: staffRow } = await supabase
        .from('staff').select('id, tenant_id').eq('user_id', user.id).single()
      if (!staffRow) { setLoading(false); return }

      setStaffId(staffRow.id)
      setTenantId(staffRow.tenant_id)

      const { data } = await supabase
        .from('bookings')
        .select('id, customer_first_name, customer_last_name, customer_email, customer_phone, start_time, end_time, status, services(name)')
        .eq('staff_id', staffRow.id)
        .gte('start_time', new Date(new Date().setMonth(new Date().getMonth() - 1)).toISOString())
        .order('start_time', { ascending: true })
        .limit(100)

      setBookings(data || [])
      setLoading(false)
    }
    init()
  }, [])

  useEffect(() => {
    if (clientsLoaded || !staffId || tab !== 'clients') return
    const run = async () => {
      const { data: bks } = await supabase
        .from('bookings')
        .select('customer_first_name, customer_last_name, customer_email, customer_phone, start_time')
        .eq('staff_id', staffId)
        .order('start_time', { ascending: false })
      const map = new Map<string, Client>()
      for (const b of bks || []) {
        const email = b.customer_email?.toLowerCase() || ''
        if (!email) continue
        if (map.has(email)) { map.get(email)!.booking_count++ }
        else map.set(email, { email, first_name: b.customer_first_name || '', last_name: b.customer_last_name || '', phone: b.customer_phone || '', booking_count: 1, last_booking: b.start_time })
      }
      const list = Array.from(map.values()).sort((a, b) => new Date(b.last_booking).getTime() - new Date(a.last_booking).getTime())
      setClients(list)
      setClientsLoaded(true)
    }
    void run()
  }, [clientsLoaded, staffId, tab])

  useEffect(() => {
    if (blacklistLoaded || !staffId || tab !== 'blacklist') return
    const run = async () => {
      const { data } = await supabase.from('staff_blacklist').select('*').eq('staff_id', staffId).order('created_at', { ascending: false })
      setBlacklist(data || [])
      setBlacklistLoaded(true)
    }
    void run()
  }, [blacklistLoaded, staffId, tab])

  useEffect(() => {
    if (waitlistLoaded || !staffId || tab !== 'waitlist') return
    const run = async () => {
      const { data } = await supabase.from('waitlist').select('*, services(name)').eq('staff_id', staffId).order('created_at', { ascending: false })
      setWaitlist(data || [])
      setWaitlistLoaded(true)
    }
    void run()
  }, [waitlistLoaded, staffId, tab])

  const q = clientSearch.toLowerCase()
  const filteredClients = q ? clients.filter(c => c.email.includes(q) || c.first_name.toLowerCase().includes(q) || c.last_name.toLowerCase().includes(q) || c.phone.includes(q)) : clients

  const handleAddBlacklist = async () => {
    if (!staffId || !tenantId || !newEmail.trim()) return
    setAdding(true); setBlError('')
    const { data, error } = await supabase.from('staff_blacklist')
      .insert({ staff_id: staffId, tenant_id: tenantId, email: newEmail.toLowerCase().trim(), phone: newPhone.trim() || null, reason: newReason.trim() || null })
      .select().single()
    if (error) setBlError(error.message.includes('unique') ? 'Ez az email már szerepel a tiltólistán.' : error.message)
    else { setBlacklist([data, ...blacklist]); setNewEmail(''); setNewPhone(''); setNewReason('') }
    setAdding(false)
  }

  const handleRemoveBlacklist = async (id: string) => {
    await supabase.from('staff_blacklist').delete().eq('id', id)
    setBlacklist(blacklist.filter(e => e.id !== id))
  }

  const exportCSV = () => {
    const header = 'Vezetéknév,Keresztnév,Email,Telefon,Foglalások száma,Utolsó foglalás'
    const rows = filteredClients.map(c => `"${c.last_name}","${c.first_name}","${c.email}","${c.phone}","${c.booking_count}","${new Date(c.last_booking).toLocaleDateString('hu-HU')}"`)
    const blob = new Blob(['﻿' + [header, ...rows].join('\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob); const a = document.createElement('a')
    a.href = url; a.download = `sajat_ugyfelek_${new Date().toISOString().slice(0, 10)}.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  const now = new Date()
  const filtered = bookings.filter(b => {
    const start = new Date(b.start_time)
    if (tab === 'upcoming') return start >= now && b.status === 'confirmed'
    if (tab === 'past') return start < now || b.status === 'cancelled'
    return true
  })

  const tabs = [
    { value: 'upcoming', label: '📋 Közelgő' },
    { value: 'past', label: '🕐 Múlt' },
    { value: 'all', label: '📑 Összes' },
    { value: 'clients', label: '👥 Ügyfelek' },
    { value: 'blacklist', label: '🚫 Tiltólista' },
    { value: 'waitlist', label: `⏳ Várólistám${waitlist.filter(w => w.status === 'waiting').length > 0 ? ` (${waitlist.filter(w => w.status === 'waiting').length})` : ''}` },
  ]

  return (
    <div>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#111827', marginBottom: '1.5rem' }}>📅 Foglalásaim</h1>

      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        {tabs.map(t => (
          <button key={t.value} onClick={() => setTab(t.value as Tab)}
            style={{ padding: '0.5rem 1.25rem', borderRadius: '8px', border: '2px solid', borderColor: tab === t.value ? '#2563eb' : '#e5e7eb', backgroundColor: tab === t.value ? '#eff6ff' : 'white', color: tab === t.value ? '#2563eb' : '#6b7280', cursor: 'pointer', fontWeight: tab === t.value ? '600' : '400', fontSize: '0.875rem' }}>
            {t.label}
          </button>
        ))}
      </div>

      {(tab === 'upcoming' || tab === 'past' || tab === 'all') && (
        loading ? <p style={{ color: '#6b7280' }}>Betöltés...</p> :
        filtered.length === 0 ? (
          <div style={{ backgroundColor: 'white', padding: '2rem', borderRadius: '12px', textAlign: 'center', color: '#6b7280', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
            Nincs foglalás ebben a kategóriában.
          </div>
        ) : filtered.map(b => (
          <div key={b.id} style={{ backgroundColor: 'white', padding: isMobile ? '1rem' : '1.25rem 1.5rem', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', marginBottom: '0.75rem', borderLeft: `4px solid ${b.status === 'cancelled' ? '#ef4444' : '#22c55e'}`, opacity: b.status === 'cancelled' ? 0.7 : 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
              <p style={{ fontWeight: '700', color: '#111827' }}>{b.customer_last_name} {b.customer_first_name}</p>
              <span style={{ fontSize: '0.75rem', padding: '0.2rem 0.75rem', borderRadius: '100px', backgroundColor: b.status === 'cancelled' ? '#fee2e2' : '#dcfce7', color: b.status === 'cancelled' ? '#ef4444' : '#16a34a', fontWeight: '600' }}>
                {b.status === 'cancelled' ? 'Lemondva' : 'Visszaigazolva'}
              </span>
            </div>
            <p style={{ fontSize: '0.875rem', color: '#374151', marginBottom: '0.25rem' }}>
              📅 {new Date(b.start_time).toLocaleDateString('hu-HU', { year: 'numeric', month: 'long', day: 'numeric', weekday: isMobile ? undefined : 'long' })} · {b.start_time.slice(11, 16)} — {b.end_time.slice(11, 16)}
            </p>
            {b.services?.[0] && <p style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.25rem' }}>✂️ {b.services[0].name}</p>}
            {isMobile ? (
              <div>
                <p style={{ fontSize: '0.8rem', color: '#6b7280', marginBottom: '0.15rem' }}>📧 {b.customer_email}</p>
                <p style={{ fontSize: '0.8rem', color: '#6b7280' }}>📞 {b.customer_phone}</p>
              </div>
            ) : (
              <p style={{ fontSize: '0.875rem', color: '#6b7280' }}>📧 {b.customer_email} · 📞 {b.customer_phone}</p>
            )}
          </div>
        ))
      )}

      {tab === 'clients' && (
        <ClientList title="👥 Ügyfeleim" clients={clients} filtered={filteredClients} search={clientSearch} setSearch={setClientSearch} exportCSV={exportCSV} />
      )}

      {tab === 'blacklist' && (
        <BlacklistUI title="🚫 Tiltólistám" entries={blacklist} newEmail={newEmail} setNewEmail={setNewEmail} newPhone={newPhone} setNewPhone={setNewPhone} newReason={newReason} setNewReason={setNewReason} adding={adding} error={blError} onAdd={handleAddBlacklist} onRemove={handleRemoveBlacklist} />
      )}

      {tab === 'waitlist' && (
        <div>
          <div style={{ marginBottom: '1.5rem' }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: '700', color: '#111827', margin: 0 }}>⏳ Várólistám</h2>
            <p style={{ fontSize: '0.875rem', color: '#6b7280', marginTop: '0.25rem' }}>Vendégek akik a te naptáradban várnak szabad időpontra.</p>
          </div>
          {!waitlistLoaded ? (
            <p style={{ color: '#6b7280' }}>Betöltés...</p>
          ) : waitlist.length === 0 ? (
            <div style={{ backgroundColor: 'white', padding: '2rem', borderRadius: '12px', textAlign: 'center', color: '#6b7280', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
              Jelenleg senki nem vár a te naptáradban.
            </div>
          ) : isMobile ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', padding: '1rem' }}>
                {waitlist.map(entry => (
                  <div key={entry.id} style={{ backgroundColor: '#f9fafb', borderRadius: '10px', padding: '0.875rem 1rem', border: '1px solid #e5e7eb' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
                      <p style={{ fontWeight: '600', color: '#111827', margin: 0, fontSize: '0.9rem' }}>
                        {[entry.customer_last_name, entry.customer_first_name].filter(Boolean).join(' ') || '—'}
                      </p>
                      <span style={{
                        fontSize: '0.72rem', fontWeight: '700', padding: '0.2rem 0.6rem', borderRadius: '999px',
                        backgroundColor: entry.status === 'waiting' ? '#fef3c7' : entry.status === 'notified' ? '#dbeafe' : '#dcfce7',
                        color: entry.status === 'waiting' ? '#92400e' : entry.status === 'notified' ? '#1d4ed8' : '#15803d',
                      }}>
                        {entry.status === 'waiting' ? '⏳ Vár' : entry.status === 'notified' ? '📧 Értesítve' : '✅ Foglalt'}
                      </span>
                    </div>
                    <p style={{ color: '#374151', margin: 0, fontSize: '0.8rem', marginBottom: '0.2rem' }}>{entry.customer_email}</p>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <p style={{ color: '#6b7280', margin: 0, fontSize: '0.8rem' }}>{entry.services?.[0]?.name || '—'}</p>
                      <p style={{ color: '#9ca3af', margin: 0, fontSize: '0.75rem' }}>
                        {new Date(entry.created_at).toLocaleDateString('hu-HU', { month: 'short', day: 'numeric' })}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ backgroundColor: 'white', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', overflow: 'hidden' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 2fr 2fr 1fr 1fr', gap: '1rem', padding: '0.75rem 1.5rem', backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                {['Név', 'Email', 'Szolgáltatás', 'Státusz', 'Feliratkozott'].map(h => (
                  <p key={h} style={{ fontSize: '0.75rem', fontWeight: '700', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>{h}</p>
                ))}
              </div>
              {waitlist.map((entry, i) => (
                <div key={entry.id} style={{ display: 'grid', gridTemplateColumns: '2fr 2fr 2fr 1fr 1fr', gap: '1rem', padding: '1rem 1.5rem', alignItems: 'center', borderBottom: i < waitlist.length - 1 ? '1px solid #f3f4f6' : 'none' }}>
                  <p style={{ fontWeight: '600', color: '#111827', margin: 0, fontSize: '0.875rem' }}>
                    {[entry.customer_last_name, entry.customer_first_name].filter(Boolean).join(' ') || '—'}
                  </p>
                  <p style={{ color: '#374151', margin: 0, fontSize: '0.8rem', wordBreak: 'break-all' }}>{entry.customer_email}</p>
                  <p style={{ color: '#6b7280', margin: 0, fontSize: '0.8rem' }}>{entry.services?.[0]?.name || '—'}</p>
                  <span style={{
                    fontSize: '0.75rem', fontWeight: '700', padding: '0.2rem 0.6rem', borderRadius: '999px', display: 'inline-block',
                    backgroundColor: entry.status === 'waiting' ? '#fef3c7' : entry.status === 'notified' ? '#dbeafe' : '#dcfce7',
                    color: entry.status === 'waiting' ? '#92400e' : entry.status === 'notified' ? '#1d4ed8' : '#15803d',
                  }}>
                    {entry.status === 'waiting' ? '⏳ Vár' : entry.status === 'notified' ? '📧 Értesítve' : '✅ Foglalt'}
                  </span>
                  <p style={{ color: '#9ca3af', margin: 0, fontSize: '0.75rem' }}>
                    {new Date(entry.created_at).toLocaleDateString('hu-HU', { month: 'short', day: 'numeric' })}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
