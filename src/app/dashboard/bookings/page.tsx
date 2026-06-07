'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { ClientList, ImportModal } from '@/app/dashboard/clients/page'
import { BlacklistUI } from '@/app/dashboard/blacklist/page'
import { useLanguage } from '@/hooks/useLanguage'

interface Booking {
  id: string
  customer_first_name: string
  customer_last_name: string
  customer_email: string
  customer_phone: string
  start_time: string
  end_time: string
  status: string
  notes: string | null
  google_event_id?: string | null
  services: { name: string }[] | null
  staff: { name: string }[] | null
}

interface Client {
  email: string
  first_name: string
  last_name: string
  phone: string
  booking_count: number
  last_booking: string
  next_appointment?: string
  source?: 'import'
  import_source?: string
}

interface BlacklistEntry {
  id: string
  email: string
  reason: string | null
  created_at: string
}

interface WaitlistEntry {
  id: string
  staff_id: string | null
  customer_first_name: string | null
  customer_last_name: string | null
  customer_email: string
  customer_phone: string | null
  status: string
  created_at: string
  notified_at: string | null
  services: { name: string } | null
  staff: { name: string } | null
}

type Tab = 'upcoming' | 'past' | 'all' | 'clients' | 'blacklist' | 'waitlist'

export default function BookingsPage() {
  const router = useRouter()
  const { lang, t } = useLanguage()
  const [tab, setTab] = useState<Tab>('upcoming')
  const [tenantId, setTenantId] = useState<string | null>(null)
  const [ownerStaffId, setOwnerStaffId] = useState<string | null>(null)
  const [plan, setPlan] = useState('free')
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 640)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  // Selection
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set())
  const [bulkLoading, setBulkLoading] = useState(false)
  const [tabSearch, setTabSearch] = useState('')
  const [filterOpen, setFilterOpen] = useState(false)
  const [filterType, setFilterType] = useState<'all' | 'booking' | 'imported'>('all')
  const [filterStatus, setFilterStatus] = useState<'all' | 'confirmed' | 'cancelled'>('all')
  const [filterWaitStatus, setFilterWaitStatus] = useState<'all' | 'waiting' | 'notified' | 'booked'>('all')
  const [clientFilterSource, setClientFilterSource] = useState<'all' | 'booking' | 'import'>('all')
  const [clientFilterBlacklist, setClientFilterBlacklist] = useState<'all' | 'blacklisted' | 'normal'>('all')
  const [clientSortField, setClientSortField] = useState<'name' | 'last_visit' | 'next_appointment'>('last_visit')
  const [clientSortDir, setClientSortDir] = useState<'asc' | 'desc'>('desc')
  const filterRef = useRef<HTMLDivElement | null>(null)
  const isFilterActive = filterType !== 'all' || filterStatus !== 'all' || filterWaitStatus !== 'all' || clientFilterSource !== 'all' || clientFilterBlacklist !== 'all' || clientSortField !== 'last_visit' || clientSortDir !== 'desc'
  useEffect(() => {
    const reset = () => { setSelectedItems(new Set()); setTabSearch(''); setFilterType('all'); setFilterStatus('all'); setFilterWaitStatus('all'); setClientFilterSource('all'); setClientFilterBlacklist('all'); setClientSortField('last_visit'); setClientSortDir('desc') }
    reset()
  }, [tab])
  useEffect(() => {
    const handler = (e: MouseEvent) => { if (filterRef.current && !filterRef.current.contains(e.target as Node)) setFilterOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])
  type DeletePending =
    | { kind: 'booking'; id: string; label: string }
    | { kind: 'imported'; email: string; label: string }
    | { kind: 'bulk'; bookingIds: string[]; importedEmails: string[]; count: number }
  const [deletePending, setDeletePending] = useState<DeletePending | null>(null)
  const toggleItem = (id: string) => setSelectedItems(prev => { const s = new Set(prev); if (s.has(id)) s.delete(id); else s.add(id); return s })
  const toggleAll = (ids: string[]) => setSelectedItems(prev => ids.every(id => prev.has(id)) ? new Set() : new Set(ids))

  // Bookings
  const [bookings, setBookings] = useState<Booking[]>([])
  const [bookingsLoading, setBookingsLoading] = useState(true)

  // Waitlist
  const [waitlist, setWaitlist] = useState<WaitlistEntry[]>([])
  const [waitlistLoaded, setWaitlistLoaded] = useState(false)

  // Clients
  const [clients, setClients] = useState<Client[]>([])
  const [importedClients, setImportedClients] = useState<Client[]>([])
  const [filteredClients, setFilteredClients] = useState<Client[]>([])
  const [clientsLoaded, setClientsLoaded] = useState(false)
  const [showImportModal, setShowImportModal] = useState(false)

  // Blacklist
  const [blacklist, setBlacklist] = useState<BlacklistEntry[]>([])
  const [blacklistLoaded, setBlacklistLoaded] = useState(false)
  const [blacklistedClientEmails, setBlacklistedClientEmails] = useState<Set<string>>(new Set())
  const [newEmail, setNewEmail] = useState('')
  const [newPhone, setNewPhone] = useState('')
  const [newReason, setNewReason] = useState('')
  const [adding, setAdding] = useState(false)
  const [blError, setBlError] = useState('')

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/auth'); return }

      const { data: profile } = await supabase
        .from('profiles').select('tenant_id').eq('id', user.id).single()
      if (!profile?.tenant_id) return

      setTenantId(profile.tenant_id)

      const nowIso = new Date().toISOString()
      const lastMonthIso = new Date(new Date().setMonth(new Date().getMonth() - 1)).toISOString()
      const sel = 'id, customer_first_name, customer_last_name, customer_email, customer_phone, start_time, end_time, status, notes, google_event_id, services(name), staff(name)'

      const [upcomingRes, pastRes, ownerRes, tenantRes, importedRes] = await Promise.all([
        // Összes jövőbeli foglalás (limit nélkül)
        supabase.from('bookings').select(sel)
          .eq('tenant_id', profile.tenant_id)
          .gte('start_time', nowIso)
          .order('start_time', { ascending: true }),
        // Elmúlt 1 hónap (max 100)
        supabase.from('bookings').select(sel)
          .eq('tenant_id', profile.tenant_id)
          .gte('start_time', lastMonthIso)
          .lt('start_time', nowIso)
          .order('start_time', { ascending: false })
          .limit(100),
        supabase.from('staff').select('id').eq('tenant_id', profile.tenant_id).eq('is_owner', true).single(),
        supabase.from('tenants').select('plan').eq('id', profile.tenant_id).single(),
        supabase.from('imported_clients')
          .select('email, first_name, last_name, phone, source, last_visit, imported_at, next_appointment')
          .eq('tenant_id', profile.tenant_id)
          .order('last_visit', { ascending: false, nullsFirst: false }),
      ])

      setBookings([...(upcomingRes.data || []), ...(pastRes.data || [])])
      setPlan(tenantRes.data?.plan || 'free')
      setBookingsLoading(false)
      const ownerId = ownerRes.data?.id || null
      setOwnerStaffId(ownerId)
      if (ownerId) {
        const { data: bl } = await supabase.from('staff_blacklist').select('email').eq('staff_id', ownerId)
        setBlacklistedClientEmails(new Set((bl || []).map((b: { email: string }) => b.email.toLowerCase())))
      }
      if (importedRes.data) {
        setImportedClients(importedRes.data.map((c: Record<string, string>) => ({
          email: c.email, first_name: c.first_name || '', last_name: c.last_name || '',
          phone: c.phone || '', booking_count: 0,
          last_booking: c.last_visit || c.imported_at || '',
          next_appointment: c.next_appointment || undefined,
          source: 'import' as const, import_source: c.source,
        })))
      }
    }
    init()
  }, [router])

  // Realtime: új foglalás → közelgő fül + kliens lista azonnal frissül
  useEffect(() => {
    if (!tenantId) return
    const channel = supabase
      .channel(`bookings-rt-${tenantId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'bookings', filter: `tenant_id=eq.${tenantId}` },
        async (payload) => {
          const b = payload.new as { id: string; customer_email: string; customer_first_name: string; customer_last_name: string; customer_phone: string; start_time: string; end_time: string; status: string; notes: string }
          // Teljes sor lekérése join-okkal (service + staff neve)
          const { data: full } = await supabase
            .from('bookings')
            .select('id, customer_first_name, customer_last_name, customer_email, customer_phone, start_time, end_time, status, notes, google_event_id, services(name), staff(name)')
            .eq('id', b.id)
            .single()
          if (full) setBookings(prev => [...prev, full])
          // Kliens lista frissítése
          const email = b.customer_email?.toLowerCase()
          if (!email) return
          const isFuture = new Date(b.start_time) > new Date()
          const isConfirmed = !b.status || b.status === 'confirmed'
          setClients(prev => {
            const idx = prev.findIndex(c => c.email.toLowerCase() === email)
            if (idx !== -1) {
              return prev.map((c, i) => i !== idx ? c : {
                ...c,
                booking_count: c.booking_count + 1,
                next_appointment: isFuture && isConfirmed && (!c.next_appointment || new Date(b.start_time) < new Date(c.next_appointment)) ? b.start_time : c.next_appointment,
                last_booking: !isFuture && isConfirmed && (!c.last_booking || new Date(b.start_time) > new Date(c.last_booking)) ? b.start_time : c.last_booking,
              })
            }
            return [...prev, {
              email,
              first_name: b.customer_first_name || '',
              last_name: b.customer_last_name || '',
              phone: b.customer_phone || '',
              booking_count: 1,
              last_booking: !isFuture && isConfirmed ? b.start_time : '',
              next_appointment: isFuture && isConfirmed ? b.start_time : undefined,
            }]
          })
        })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [tenantId])

  const loadWaitlist = useCallback(async () => {
    if (waitlistLoaded || !tenantId) return
    const { data } = await supabase
      .from('waitlist')
      .select('*, services(name), staff(name)')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
    setWaitlist(data || [])
    setWaitlistLoaded(true)
  }, [waitlistLoaded, tenantId])

  const loadClients = useCallback(async () => {
    if (clientsLoaded || !tenantId || !ownerStaffId) return
    const { data: bks } = await supabase
      .from('bookings')
      .select('customer_first_name, customer_last_name, customer_email, customer_phone, start_time, status')
      .eq('tenant_id', tenantId)
      .eq('staff_id', ownerStaffId)
      .order('start_time', { ascending: false })

    const now = new Date()
    const map = new Map<string, Client>()
    for (const b of bks || []) {
      const email = b.customer_email?.toLowerCase() || ''
      if (!email) continue
      const confirmed = b.status === 'confirmed'
      const future = new Date(b.start_time) > now
      if (!map.has(email)) {
        map.set(email, { email, first_name: b.customer_first_name || '', last_name: b.customer_last_name || '', phone: b.customer_phone || '', booking_count: 1, last_booking: (!future && confirmed) ? b.start_time : '', next_appointment: (future && confirmed) ? b.start_time : undefined })
      } else {
        const c = map.get(email)!
        c.booking_count++
        if (confirmed && !future && (!c.last_booking || new Date(b.start_time) > new Date(c.last_booking))) c.last_booking = b.start_time
        if (confirmed && future && (!c.next_appointment || new Date(b.start_time) < new Date(c.next_appointment))) c.next_appointment = b.start_time
      }
    }
    const list = Array.from(map.values()).sort((a, b) => new Date(b.last_booking || 0).getTime() - new Date(a.last_booking || 0).getTime())
    setClients(list)
    setFilteredClients(list)
    setClientsLoaded(true)
  }, [clientsLoaded, tenantId, ownerStaffId])

  const fetchImportedClients = useCallback(async () => {
    if (!tenantId) return
    const { data, error } = await supabase
      .from('imported_clients')
      .select('email, first_name, last_name, phone, source, last_visit, imported_at, next_appointment')
      .eq('tenant_id', tenantId)
      .order('last_visit', { ascending: false, nullsFirst: false })
    if (error) { console.error('imported_clients load error:', error.message); return }
    setImportedClients((data || []).map((c: Record<string, string>) => ({
      email: c.email,
      first_name: c.first_name || '',
      last_name: c.last_name || '',
      phone: c.phone || '',
      booking_count: 0,
      last_booking: c.last_visit || c.imported_at || '',
      next_appointment: c.next_appointment || undefined,
      source: 'import' as const,
      import_source: c.source,
    })))
  }, [tenantId])

  // Lejárt next_appointment → last_visit (importált) + last_booking (booking ügyfelek)
  const cleanupPastAppointments = useCallback(async () => {
    if (!tenantId) return
    const now = new Date().toISOString()
    const { data: past } = await supabase
      .from('imported_clients')
      .select('id, next_appointment, last_visit')
      .eq('tenant_id', tenantId)
      .not('next_appointment', 'is', null)
      .lt('next_appointment', now)
    if (past && past.length > 0) {
      for (const c of past) {
        const newLastVisit = !c.last_visit || new Date(c.next_appointment) > new Date(c.last_visit)
          ? c.next_appointment : c.last_visit
        await supabase.from('imported_clients')
          .update({ last_visit: newLastVisit, next_appointment: null })
          .eq('id', c.id)
      }
      await fetchImportedClients()
    }
    // Booking ügyfelek state frissítése
    const nowDate = new Date()
    setClients(prev => prev.map(c => {
      if (c.next_appointment && new Date(c.next_appointment) < nowDate) {
        return {
          ...c,
          last_booking: !c.last_booking || new Date(c.next_appointment) > new Date(c.last_booking)
            ? c.next_appointment : c.last_booking,
          next_appointment: undefined,
        }
      }
      return c
    }))
  }, [tenantId, fetchImportedClients])

  useEffect(() => {
    if (!tenantId) return
    const run = async () => { await cleanupPastAppointments() }
    run()
    const interval = setInterval(cleanupPastAppointments, 60 * 1000)
    return () => clearInterval(interval)
  }, [tenantId, cleanupPastAppointments])

  const loadBlacklist = useCallback(async () => {
    if (blacklistLoaded || !ownerStaffId) return
    const { data } = await supabase
      .from('staff_blacklist').select('*').eq('staff_id', ownerStaffId).order('created_at', { ascending: false })
    setBlacklist(data || [])
    setBlacklistLoaded(true)
  }, [blacklistLoaded, ownerStaffId])

  useEffect(() => {
    const run = async () => {
      if (tab === 'clients' || tab === 'past' || tab === 'all') await fetchImportedClients()
      if (tab === 'clients') await loadClients()
      if (tab === 'blacklist') await loadBlacklist()
      if (tab === 'waitlist') await loadWaitlist()
    }
    run()
  }, [tab, loadClients, fetchImportedClients, loadBlacklist, loadWaitlist])

  useEffect(() => {
    const compute = () => {
      const bookingEmails = new Set(clients.map(c => c.email.toLowerCase()))
      let merged = [...clients, ...importedClients.filter(c => !bookingEmails.has(c.email.toLowerCase()))]
      const q = tabSearch.toLowerCase()
      if (q) merged = merged.filter(c => c.email.includes(q) || c.first_name.toLowerCase().includes(q) || c.last_name.toLowerCase().includes(q) || (c.phone || '').includes(q))
      if (clientFilterSource === 'booking') merged = merged.filter(c => !c.source)
      if (clientFilterSource === 'import') merged = merged.filter(c => c.source === 'import')
      if (clientFilterBlacklist === 'blacklisted') merged = merged.filter(c => blacklistedClientEmails.has(c.email.toLowerCase()))
      if (clientFilterBlacklist === 'normal') merged = merged.filter(c => !blacklistedClientEmails.has(c.email.toLowerCase()))
      merged.sort((a, b) => {
        let cmp = 0
        if (clientSortField === 'name') {
          cmp = `${a.last_name} ${a.first_name}`.trim().localeCompare(`${b.last_name} ${b.first_name}`.trim(), 'hu')
        } else if (clientSortField === 'last_visit') {
          cmp = new Date(a.last_booking || 0).getTime() - new Date(b.last_booking || 0).getTime()
        } else {
          const noA = !a.next_appointment, noB = !b.next_appointment
          if (noA && noB) return 0
          if (noA) return 1
          if (noB) return -1
          cmp = new Date(a.next_appointment!).getTime() - new Date(b.next_appointment!).getTime()
        }
        return clientSortDir === 'asc' ? cmp : -cmp
      })
      setFilteredClients(merged)
    }
    compute()
  }, [tabSearch, clients, importedClients, clientFilterSource, clientFilterBlacklist, blacklistedClientEmails, clientSortField, clientSortDir])

  const handleAddBlacklist = async () => {
    if (!ownerStaffId || !tenantId || !newEmail.trim()) return
    setAdding(true); setBlError('')
    const { data, error } = await supabase.from('staff_blacklist')
      .insert({ staff_id: ownerStaffId, tenant_id: tenantId, email: newEmail.toLowerCase().trim(), phone: newPhone.trim() || null, reason: newReason.trim() || null })
      .select().single()
    if (error) setBlError(error.message.includes('unique') ? 'Ez az email már szerepel a tiltólistán.' : error.message)
    else { setBlacklist([data, ...blacklist]); setNewEmail(''); setNewPhone(''); setNewReason('') }
    setAdding(false)
  }

  const handleDeleteBooking = async (id: string) => {
    const res = await fetch('/api/bookings/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bookingId: id }),
    })
    const data = await res.json().catch(() => ({}))
    if (data.gcalResult && data.gcalResult !== 'deleted' && data.gcalResult !== 'skipped') {
      setGcalStatus({ ok: false, msg: `Google Calendar törlés: ${data.gcalResult}` })
    }
    setBookings(prev => prev.filter(b => b.id !== id))
  }

  const [gcalStatus, setGcalStatus] = useState<{ ok: boolean; msg: string } | null>(null)

  const addToGoogleCalendar = async (ids: Set<string>, list: CombinedEntry[]) => {
    if (!tenantId) return
    setGcalStatus(null)
    setBulkLoading(true)

    const bookingIds: string[] = []
    const importedEvents: { name: string; email: string; phone?: string; next_appointment: string }[] = []

    for (const entry of list) {
      if (entry.kind === 'booking') {
        if (ids.has(entry.data.id)) bookingIds.push(entry.data.id)
      } else {
        const c = entry.data as Client
        const impId = Array.from(ids).find(id => id.includes(c.email))
        if (impId && c.next_appointment) {
          importedEvents.push({ name: `${c.last_name} ${c.first_name}`.trim(), email: c.email, phone: c.phone || undefined, next_appointment: c.next_appointment })
        }
      }
    }

    const res = await fetch('/api/bookings/add-to-gcal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bookingIds, importedEvents, tenantId }),
    })
    const data = await res.json()
    setBulkLoading(false)

    if (!res.ok) {
      setGcalStatus({ ok: false, msg: data.error || 'Hiba történt.' })
    } else if (data.errors?.length > 0) {
      setGcalStatus({ ok: false, msg: `${data.created} esemény hozzáadva, ${data.errors.length} sikertelen: ${data.errors.join(', ')}` })
    } else {
      setGcalStatus({ ok: true, msg: `✅ ${data.created} esemény sikeresen hozzáadva a Google Naptárhoz!` })
      setSelectedItems(new Set())
    }
  }

  const handleDeleteImportedFromBookingTab = async (email: string) => {
    if (!tenantId) return
    await supabase.from('imported_clients').delete().eq('tenant_id', tenantId).eq('email', email)
    setImportedClients(prev => prev.filter(c => c.email !== email))
  }

  const executeDelete = async () => {
    if (!deletePending) return
    setBulkLoading(true)
    if (deletePending.kind === 'booking') {
      await handleDeleteBooking(deletePending.id)
    } else if (deletePending.kind === 'imported') {
      await handleDeleteImportedFromBookingTab(deletePending.email)
    } else {
      for (const id of deletePending.bookingIds) await handleDeleteBooking(id)
      for (const email of deletePending.importedEmails) await handleDeleteImportedFromBookingTab(email)
      setSelectedItems(new Set())
    }
    setDeletePending(null)
    setBulkLoading(false)
  }

  const handleRemoveBlacklist = async (id: string) => {
    const entry = blacklist.find(e => e.id === id)
    await supabase.from('staff_blacklist').delete().eq('id', id)
    setBlacklist(blacklist.filter(e => e.id !== id))
    if (entry) setBlacklistedClientEmails(prev => { const s = new Set(prev); s.delete(entry.email.toLowerCase()); return s })
  }

  const handleDeleteWaitlist = async (id: string) => {
    await supabase.from('waitlist').delete().eq('id', id)
    setWaitlist(waitlist.filter(e => e.id !== id))
  }

  const exportCSV = () => {
    const header = 'Vezetéknév,Keresztnév,Email,Telefon,Foglalások száma,Utolsó foglalás'
    const rows = filteredClients.map(c => `"${c.last_name}","${c.first_name}","${c.email}","${c.phone}","${c.booking_count}","${new Date(c.last_booking).toLocaleDateString('hu-HU')}"`)
    const blob = new Blob(['﻿' + [header, ...rows].join('\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = `ugyfelek_${new Date().toISOString().slice(0, 10)}.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  const now = new Date()
  const filteredBookings = bookings.filter(b => {
    const start = new Date(b.start_time)
    if (tab === 'upcoming') return start >= now && b.status === 'confirmed'
    if (tab === 'past') return start < now || b.status === 'cancelled'
    return true
  })

  const handleCancel = async (id: string) => {
    const { error } = await supabase.from('bookings').update({ status: 'cancelled' }).eq('id', id)
    if (!error) setBookings(bookings.map(b => b.id === id ? { ...b, status: 'cancelled' } : b))
  }

  const dateLocale = lang === 'en' ? 'en-US' : lang === 'sk' ? 'sk-SK' : 'hu-HU'
  const formatDate = (d: string) => new Date(d).toLocaleDateString(dateLocale, { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })
  const formatTime = (d: string) => new Date(d).toLocaleTimeString(dateLocale, { hour: '2-digit', minute: '2-digit' })

  const waitingCount = waitlist.filter(w => w.status === 'waiting').length
  const importedUpcoming = importedClients.filter(c => c.next_appointment && new Date(c.next_appointment) >= now)
  const importedWithVisit = importedClients.filter(c =>
    c.last_booking || (c.next_appointment && new Date(c.next_appointment) < now)
  )
  const upcomingTotal = bookings.filter(b => new Date(b.start_time) >= now && b.status === 'confirmed').length + importedUpcoming.length
  const pastTotal = bookings.filter(b => new Date(b.start_time) < now || b.status === 'cancelled').length + importedWithVisit.length
  const allTotal = bookings.length + importedClients.length

  type CombinedEntry = { kind: 'booking'; data: Booking } | { kind: 'imported'; data: Client }

  const combinedUpcoming: CombinedEntry[] = [
    ...filteredBookings.map(b => ({ kind: 'booking' as const, data: b })),
    ...importedUpcoming.map(c => ({ kind: 'imported' as const, data: c })),
  ].sort((a, b) => {
    const ta = a.kind === 'booking' ? new Date(a.data.start_time).getTime() : new Date(a.data.next_appointment!).getTime()
    const tb = b.kind === 'booking' ? new Date(b.data.start_time).getTime() : new Date(b.data.next_appointment!).getTime()
    return ta - tb
  })

  const importedPastTime = (c: Client) => Math.max(
    c.last_booking ? new Date(c.last_booking).getTime() : 0,
    c.next_appointment && new Date(c.next_appointment) < now ? new Date(c.next_appointment).getTime() : 0
  )

  const combinedPast: CombinedEntry[] = [
    ...filteredBookings.map(b => ({ kind: 'booking' as const, data: b })),
    ...importedWithVisit.map(c => ({ kind: 'imported' as const, data: c })),
  ].sort((a, b) => {
    const ta = a.kind === 'booking' ? new Date(a.data.start_time).getTime() : importedPastTime(a.data)
    const tb = b.kind === 'booking' ? new Date(b.data.start_time).getTime() : importedPastTime(b.data)
    return tb - ta
  })

  const sq = tabSearch.toLowerCase()
  const bMatch = (b: Booking) => !sq ||
    `${b.customer_last_name} ${b.customer_first_name}`.toLowerCase().includes(sq) ||
    b.customer_email.toLowerCase().includes(sq) ||
    (b.customer_phone || '').includes(sq) ||
    ((b.services as [{name:string}]|null)?.[0]?.name || '').toLowerCase().includes(sq)
  const cMatch = (c: Client) => !sq ||
    `${c.last_name} ${c.first_name}`.toLowerCase().includes(sq) ||
    c.email.toLowerCase().includes(sq) ||
    (c.phone || '').includes(sq)

  const typeOk = (e: CombinedEntry) => filterType === 'all' || e.kind === filterType
  const statusOk = (e: CombinedEntry) => filterStatus === 'all' || (e.kind === 'booking' && (e.data as Booking).status === filterStatus) || (e.kind === 'imported' && filterStatus !== 'cancelled')
  const visibleUpcoming = combinedUpcoming.filter(e => (e.kind === 'booking' ? bMatch(e.data as Booking) : cMatch(e.data as Client)) && typeOk(e))
  const visiblePast = combinedPast.filter(e => (e.kind === 'booking' ? bMatch(e.data as Booking) : cMatch(e.data as Client)) && typeOk(e) && statusOk(e))
  const visibleBlacklist = blacklist.filter(e => !sq || e.email.toLowerCase().includes(sq) || (e.reason || '').toLowerCase().includes(sq))
  const visibleWaitlist = waitlist.filter(e =>
    (!sq || `${e.customer_last_name} ${e.customer_first_name}`.toLowerCase().includes(sq) || e.customer_email.toLowerCase().includes(sq) || ((e.services as {name:string}|null)?.name || '').toLowerCase().includes(sq)) &&
    (filterWaitStatus === 'all' || e.status === filterWaitStatus)
  )

  const tabs = [
    { value: 'upcoming', label: `📋 ${isMobile ? t.dash.tab_upcoming.split(' ')[0] : t.dash.tab_upcoming}${upcomingTotal > 0 ? ` (${upcomingTotal})` : ''}` },
    { value: 'past', label: `🕐 ${isMobile ? t.dash.tab_past.split(' ')[0] : t.dash.tab_past}${pastTotal > 0 ? ` (${pastTotal})` : ''}` },
    { value: 'all', label: `📑 ${isMobile ? 'Összes' : t.dash.tab_all}${allTotal > 0 ? ` (${allTotal})` : ''}` },
    { value: 'clients', label: `👥 ${isMobile ? 'Ügyfelek' : t.dash.tab_clients}${filteredClients.length > 0 ? ` (${filteredClients.length})` : ''}` },
    { value: 'blacklist', label: `🚫 ${isMobile ? 'Tiltólista' : t.dash.tab_blacklist}${blacklistedClientEmails.size > 0 ? ` (${blacklistedClientEmails.size})` : ''}` },
    { value: 'waitlist', label: `⏳ ${isMobile ? 'Várólista' : t.dash.tab_waitlist}${waitingCount > 0 ? ` (${waitingCount})` : ''}` },
  ]

  return (
    <>
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#111827' }}>📅 {t.dash.menu_bookings}</h1>
        <button
          onClick={() => router.push('/dashboard/bookings/settings')}
          style={{ backgroundColor: 'white', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '0.5rem 1rem', cursor: 'pointer', fontSize: '0.875rem', color: '#374151' }}
        >
          ⚙️ {t.dash.menu_settings}
        </button>
      </div>

      {/* Tab sor */}
      <div style={{ display: 'flex', gap: '0.375rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        {tabs.map(t => (
          <button key={t.value} onClick={() => setTab(t.value as Tab)}
            style={{
              padding: isMobile ? '0.4rem 0.625rem' : '0.5rem 1.25rem', borderRadius: '8px', border: '2px solid',
              borderColor: tab === t.value ? '#2563eb' : '#e5e7eb',
              backgroundColor: tab === t.value ? '#eff6ff' : 'white',
              color: tab === t.value ? '#2563eb' : '#6b7280',
              cursor: 'pointer', fontWeight: tab === t.value ? '600' : '400', fontSize: isMobile ? '0.78rem' : '0.875rem',
              whiteSpace: 'nowrap',
            }}
          >{t.label}</button>
        ))}
      </div>

      {/* Keresősáv – minden tab */}
      {(
        <div style={{ marginBottom: '1rem', maxWidth: '480px' }}>
          <div style={{ display: 'flex', alignItems: 'center', border: `1px solid ${isFilterActive ? '#2563eb' : '#d1d5db'}`, borderRadius: '8px', backgroundColor: 'white', overflow: 'visible' }}>
            <input
              type="text"
              value={tabSearch}
              onChange={e => setTabSearch(e.target.value)}
              placeholder="🔍 Keresés..."
              style={{ flex: 1, border: 'none', outline: 'none', padding: '0.625rem 1rem', color: '#111827', fontSize: '0.875rem', backgroundColor: 'transparent', minWidth: 0 }}
            />
          <div ref={filterRef} style={{ position: 'relative', flexShrink: 0, borderLeft: `1px solid ${isFilterActive ? '#bfdbfe' : '#e5e7eb'}` }}>
            <button
              onClick={() => setFilterOpen(v => !v)}
              style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', padding: '0.625rem 0.875rem', border: 'none', borderRadius: '0 7px 7px 0', backgroundColor: isFilterActive ? '#eff6ff' : 'transparent', color: isFilterActive ? '#2563eb' : '#6b7280', cursor: 'pointer', fontWeight: '600', fontSize: '0.825rem', whiteSpace: 'nowrap' }}>
              ⚙️ Szűrő{isFilterActive ? ' ●' : ''}
            </button>
            {filterOpen && (
              <div style={{ position: 'absolute', top: 'calc(100% + 6px)', right: 0, backgroundColor: 'white', borderRadius: '12px', boxShadow: '0 8px 24px rgba(0,0,0,0.15)', border: '1px solid #e5e7eb', padding: '1rem', zIndex: 100, minWidth: '220px' }}>

                {/* Típus szűrő — közelgő/múlt/összes */}
                {(tab === 'upcoming' || tab === 'past' || tab === 'all') && (
                  <div style={{ marginBottom: '0.875rem' }}>
                    <p style={{ fontSize: '0.72rem', fontWeight: '700', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>Típus</p>
                    {([['all', 'Összes'], ['booking', 'Csak foglalások'], ['imported', 'Csak importált']] as const).map(([v, label]) => (
                      <label key={v} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.3rem 0', cursor: 'pointer', fontSize: '0.875rem', color: '#374151' }}>
                        <input type="radio" name="filterType" value={v} checked={filterType === v} onChange={() => setFilterType(v)} style={{ accentColor: '#2563eb' }} />
                        {label}
                      </label>
                    ))}
                  </div>
                )}

                {/* Állapot szűrő — múlt/összes */}
                {(tab === 'past' || tab === 'all') && (
                  <div style={{ marginBottom: '0.875rem' }}>
                    <p style={{ fontSize: '0.72rem', fontWeight: '700', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>Állapot</p>
                    {([['all', 'Összes'], ['confirmed', '✅ Visszaigazolt'], ['cancelled', '❌ Lemondott']] as const).map(([v, label]) => (
                      <label key={v} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.3rem 0', cursor: 'pointer', fontSize: '0.875rem', color: '#374151' }}>
                        <input type="radio" name="filterStatus" value={v} checked={filterStatus === v} onChange={() => setFilterStatus(v)} style={{ accentColor: '#2563eb' }} />
                        {label}
                      </label>
                    ))}
                  </div>
                )}

                {/* Várólistán állapot */}
                {tab === 'waitlist' && (
                  <div>
                    <p style={{ fontSize: '0.72rem', fontWeight: '700', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>Állapot</p>
                    {([['all', 'Összes'], ['waiting', '⏳ Várakozó'], ['notified', '📩 Értesített'], ['booked', '✅ Lefoglalt']] as const).map(([v, label]) => (
                      <label key={v} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.3rem 0', cursor: 'pointer', fontSize: '0.875rem', color: '#374151' }}>
                        <input type="radio" name="filterWait" value={v} checked={filterWaitStatus === v} onChange={() => setFilterWaitStatus(v)} style={{ accentColor: '#2563eb' }} />
                        {label}
                      </label>
                    ))}
                  </div>
                )}

                {/* Ügyfelek forrás szűrő */}
                {tab === 'clients' && (
                  <div style={{ marginBottom: '0.875rem' }}>
                    <p style={{ fontSize: '0.72rem', fontWeight: '700', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>Forrás</p>
                    {([['all', 'Összes'], ['booking', 'Csak foglalásból'], ['import', 'Csak importált']] as const).map(([v, label]) => (
                      <label key={v} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.3rem 0', cursor: 'pointer', fontSize: '0.875rem', color: '#374151' }}>
                        <input type="radio" name="clientFilterSource" value={v} checked={clientFilterSource === v} onChange={() => setClientFilterSource(v)} style={{ accentColor: '#2563eb' }} />
                        {label}
                      </label>
                    ))}
                  </div>
                )}

                {/* Ügyfelek rendezés */}
                {tab === 'clients' && (
                  <div>
                    <p style={{ fontSize: '0.72rem', fontWeight: '700', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>Rendezés</p>
                    {([
                      ['name', 'ABC (névsor)'],
                      ['last_visit', 'Utolsó látogatás'],
                      ['next_appointment', 'Közelgő időpont'],
                    ] as const).map(([v, label]) => (
                      <div key={v} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.25rem 0' }}>
                        <input type="radio" name="clientSortField" value={v} checked={clientSortField === v} onChange={() => setClientSortField(v)} style={{ accentColor: '#2563eb', cursor: 'pointer', flexShrink: 0 }} />
                        <span onClick={() => setClientSortField(v)} style={{ fontSize: '0.875rem', color: '#374151', flex: 1, cursor: 'pointer' }}>{label}</span>
                        <button onClick={() => { setClientSortField(v); setClientSortDir('asc') }}
                          style={{ padding: '0.15rem 0.5rem', borderRadius: '5px', border: '1px solid', fontSize: '0.72rem', fontWeight: '700', cursor: 'pointer', lineHeight: 1.4,
                            backgroundColor: clientSortField === v && clientSortDir === 'asc' ? '#2563eb' : 'transparent',
                            color: clientSortField === v && clientSortDir === 'asc' ? 'white' : '#9ca3af',
                            borderColor: clientSortField === v && clientSortDir === 'asc' ? '#2563eb' : '#e5e7eb' }}>↑</button>
                        <button onClick={() => { setClientSortField(v); setClientSortDir('desc') }}
                          style={{ padding: '0.15rem 0.5rem', borderRadius: '5px', border: '1px solid', fontSize: '0.72rem', fontWeight: '700', cursor: 'pointer', lineHeight: 1.4,
                            backgroundColor: clientSortField === v && clientSortDir === 'desc' ? '#2563eb' : 'transparent',
                            color: clientSortField === v && clientSortDir === 'desc' ? 'white' : '#9ca3af',
                            borderColor: clientSortField === v && clientSortDir === 'desc' ? '#2563eb' : '#e5e7eb' }}>↓</button>
                      </div>
                    ))}
                  </div>
                )}

                {isFilterActive && (
                  <button onClick={() => { setFilterType('all'); setFilterStatus('all'); setFilterWaitStatus('all'); setClientFilterSource('all'); setClientFilterBlacklist('all'); setClientSortField('last_visit'); setClientSortDir('desc') }}
                    style={{ marginTop: '0.75rem', width: '100%', padding: '0.5rem', borderRadius: '8px', border: '1px solid #e5e7eb', backgroundColor: '#f9fafb', color: '#6b7280', cursor: 'pointer', fontSize: '0.8rem', fontWeight: '600' }}>
                    ✕ Szűrők törlése
                  </button>
                )}
              </div>
            )}
          </div>
          </div>
        </div>
      )}

      {/* Foglalás nézetek */}
      {(tab === 'upcoming' || tab === 'past' || tab === 'all') && !bookingsLoading && (() => {
        const list = tab === 'upcoming' ? visibleUpcoming : visiblePast
        const allIds = list.map((e, i) => e.kind === 'booking' ? e.data.id : `imp-${i}-${e.data.email}`)
        const someSelected = selectedItems.size > 0
        const bookingIds = Array.from(selectedItems).filter(id => !id.startsWith('imp-'))
        const importedIds = Array.from(selectedItems).filter(id => id.startsWith('imp-'))
        return (
          <>
            {/* Bulk action bar */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', flexWrap: 'wrap', marginBottom: '1rem', backgroundColor: someSelected ? '#eff6ff' : '#f9fafb', border: `1px solid ${someSelected ? '#bfdbfe' : '#e5e7eb'}`, borderRadius: '10px', padding: '0.625rem 1rem' }}>
              <input type="checkbox" checked={allIds.length > 0 && allIds.every(id => selectedItems.has(id))} onChange={() => toggleAll(allIds)} style={{ width: '15px', height: '15px', cursor: 'pointer', accentColor: '#2563eb' }} />
              <span style={{ fontSize: '0.82rem', fontWeight: '600', color: someSelected ? '#1d4ed8' : '#9ca3af' }}>
                {someSelected ? `${selectedItems.size} kiválasztva` : 'Jelölj ki elemeket'}
              </span>
              {tab === 'upcoming' && bookingIds.length > 0 && (
                <button disabled={bulkLoading} onClick={async () => { setBulkLoading(true); for (const id of bookingIds) await handleCancel(id); setSelectedItems(new Set()); setBulkLoading(false) }}
                  style={{ backgroundColor: '#fef3c7', color: '#92400e', padding: '0.35rem 0.875rem', borderRadius: '7px', border: '1px solid #fde68a', cursor: 'pointer', fontWeight: '600', fontSize: '0.8rem', opacity: bulkLoading ? 0.5 : 1 }}>
                  ❌ {bulkLoading ? 'Folyamatban...' : `${bookingIds.length} lemondása`}
                </button>
              )}
              {tab === 'upcoming' && someSelected && (
                <button disabled={bulkLoading} onClick={() => addToGoogleCalendar(selectedItems, list as CombinedEntry[])}
                  style={{ backgroundColor: '#eff6ff', color: '#2563eb', padding: '0.35rem 0.875rem', borderRadius: '7px', border: '1px solid #bfdbfe', cursor: bulkLoading ? 'not-allowed' : 'pointer', fontWeight: '600', fontSize: '0.8rem', opacity: bulkLoading ? 0.5 : 1 }}>
                  📅 {bulkLoading ? 'Folyamatban...' : 'Google Naptárba'}
                </button>
              )}
              {someSelected && (
                <button disabled={bulkLoading} onClick={() => {
                  const importedEmails = importedIds.map(id => id.replace(/^imp-\d+-/, ''))
                  setDeletePending({ kind: 'bulk', bookingIds, importedEmails, count: selectedItems.size })
                }}
                  style={{ backgroundColor: '#fee2e2', color: '#dc2626', padding: '0.35rem 0.875rem', borderRadius: '7px', border: '1px solid #fca5a5', cursor: 'pointer', fontWeight: '600', fontSize: '0.8rem', opacity: bulkLoading ? 0.5 : 1 }}>
                  🗑️ {bulkLoading ? 'Törlés...' : `${selectedItems.size} törlése`}
                </button>
              )}
              {someSelected && <button onClick={() => setSelectedItems(new Set())} style={{ background: 'none', border: 'none', color: '#6b7280', fontSize: '0.8rem', cursor: 'pointer', padding: '0.4rem 0.5rem', marginLeft: 'auto' }}>✕ Mégse</button>}
            </div>
            {gcalStatus && (
              <div style={{ marginBottom: '0.75rem', padding: '0.625rem 1rem', borderRadius: '8px', backgroundColor: gcalStatus.ok ? '#dcfce7' : '#fee2e2', border: `1px solid ${gcalStatus.ok ? '#86efac' : '#fca5a5'}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.85rem', fontWeight: '600', color: gcalStatus.ok ? '#15803d' : '#dc2626' }}>{gcalStatus.msg}</span>
                <button onClick={() => setGcalStatus(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280', fontSize: '1rem' }}>×</button>
              </div>
            )}
            {list.length === 0 && <div style={{ backgroundColor: 'white', padding: '2rem', borderRadius: '12px', textAlign: 'center', color: '#6b7280', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>{sq ? 'Nincs találat.' : t.dash.no_results}</div>}
          </>
        )
      })()}

      {tab === 'upcoming' && !bookingsLoading && (
        visibleUpcoming.map((entry, idx) => {
          const itemId = entry.kind === 'booking' ? entry.data.id : `imp-${idx}-${entry.data.email}`
          const isSelected = selectedItems.has(itemId)
          if (entry.kind === 'booking') {
            const booking = entry.data
            return (
              <div key={booking.id} style={{ backgroundColor: isSelected ? '#eff6ff' : 'white', padding: isMobile ? '0.875rem 1rem' : '1.25rem 1.5rem', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', marginBottom: '0.75rem', borderLeft: `4px solid ${isSelected ? '#2563eb' : '#22c55e'}`, display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
                <input type="checkbox" checked={isSelected} onChange={() => toggleItem(itemId)} style={{ marginTop: '0.25rem', width: '16px', height: '16px', cursor: 'pointer', accentColor: '#2563eb', flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: isMobile ? 'column' : 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: isMobile ? '0.625rem' : undefined }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', marginBottom: '0.375rem', flexWrap: 'wrap' }}>
                      <p style={{ fontWeight: '700', color: '#111827', fontSize: isMobile ? '0.95rem' : '1rem', margin: 0 }}>{booking.customer_last_name} {booking.customer_first_name}</p>
                      <span style={{ fontSize: '0.75rem', padding: '0.2rem 0.625rem', borderRadius: '100px', backgroundColor: '#dcfce7', color: '#16a34a', fontWeight: '600' }}>{t.dash.status_confirmed}</span>
                    </div>
                    <p style={{ fontSize: '0.85rem', color: '#374151', marginBottom: '0.2rem' }}>📅 {formatDate(booking.start_time)} · {formatTime(booking.start_time)} — {formatTime(booking.end_time)}</p>
                    {booking.services?.[0] && <p style={{ fontSize: '0.85rem', color: '#6b7280', marginBottom: '0.2rem' }}>✂️ {booking.services[0].name}{booking.staff?.[0] && ` · 👤 ${booking.staff[0].name}`}</p>}
                    <p style={{ fontSize: '0.85rem', color: '#6b7280', margin: 0 }}>
                      <a href={`mailto:${booking.customer_email}`} style={{ color: '#2563eb', textDecoration: 'none' }} title="Email küldése">📧 {booking.customer_email}</a>
                      {booking.customer_phone && <> · <a href={`tel:${booking.customer_phone}`} style={{ color: '#2563eb', textDecoration: 'none' }} title="Hívás">📞 {booking.customer_phone}</a></>}
                    </p>
                    {booking.notes && <p style={{ fontSize: '0.8rem', color: '#374151', marginTop: '0.25rem', backgroundColor: '#fffbeb', padding: '0.3rem 0.625rem', borderRadius: '6px', border: '1px solid #fde68a', display: 'inline-block' }}>💬 {booking.notes}</p>}
                  </div>
                  <button onClick={() => handleCancel(booking.id)} style={{ backgroundColor: '#fef3c7', color: '#92400e', border: 'none', borderRadius: '8px', padding: '0.4rem 0.875rem', cursor: 'pointer', fontSize: '0.8rem', fontWeight: '600', flexShrink: 0, width: isMobile ? '100%' : undefined }}>❌ {t.dash.cancel_btn}</button>
                </div>
              </div>
            )
          }
          const client = entry.data
          return (
            <div key={`imp-up-${idx}-${client.email}`} style={{ backgroundColor: isSelected ? '#eff6ff' : 'white', padding: isMobile ? '0.875rem 1rem' : '1.25rem 1.5rem', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', marginBottom: '0.75rem', borderLeft: `4px solid ${isSelected ? '#2563eb' : '#a78bfa'}`, display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
              <input type="checkbox" checked={isSelected} onChange={() => toggleItem(itemId)} style={{ marginTop: '0.25rem', width: '16px', height: '16px', cursor: 'pointer', accentColor: '#2563eb', flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.4rem' }}>
                  <p style={{ fontWeight: '700', color: '#111827', fontSize: '1rem', margin: 0 }}>{client.last_name} {client.first_name}</p>
                  <span style={{ fontSize: '0.7rem', padding: '0.2rem 0.6rem', borderRadius: '100px', backgroundColor: '#ede9fe', color: '#7c3aed', fontWeight: '700' }}>📥 {client.import_source && client.import_source !== 'Általános' ? client.import_source : 'Importált'}</span>
                </div>
                <p style={{ fontSize: '0.875rem', color: '#374151', marginBottom: '0.25rem' }}>📅 {formatDate(client.next_appointment!)} · {formatTime(client.next_appointment!)}</p>
                <p style={{ fontSize: '0.875rem', color: '#6b7280', margin: 0 }}>📧 {client.email}{client.phone ? ` · 📞 ${client.phone}` : ''}</p>
              </div>
            </div>
          )
        })
      )}

      {(tab === 'past' || tab === 'all') && !bookingsLoading && (
        visiblePast.map((entry, idx) => {
          const itemId = entry.kind === 'booking' ? entry.data.id : `imp-${idx}-${entry.data.email}`
          const isSelected = selectedItems.has(itemId)
          if (entry.kind === 'booking') {
            const booking = entry.data
            return (
              <div key={booking.id} style={{ backgroundColor: isSelected ? '#eff6ff' : 'white', padding: isMobile ? '0.875rem 1rem' : '1.25rem 1.5rem', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', marginBottom: '0.75rem', borderLeft: `4px solid ${isSelected ? '#2563eb' : booking.status === 'cancelled' ? '#ef4444' : '#22c55e'}`, opacity: booking.status === 'cancelled' ? 0.7 : 1, display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
                <input type="checkbox" checked={isSelected} onChange={() => toggleItem(itemId)} style={{ marginTop: '0.25rem', width: '16px', height: '16px', cursor: 'pointer', accentColor: '#2563eb', flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', marginBottom: '0.375rem', flexWrap: 'wrap' }}>
                    <p style={{ fontWeight: '700', color: '#111827', fontSize: isMobile ? '0.95rem' : '1rem', margin: 0 }}>{booking.customer_last_name} {booking.customer_first_name}</p>
                    <span style={{ fontSize: '0.75rem', padding: '0.2rem 0.625rem', borderRadius: '100px', backgroundColor: booking.status === 'cancelled' ? '#fee2e2' : '#dcfce7', color: booking.status === 'cancelled' ? '#ef4444' : '#16a34a', fontWeight: '600' }}>
                      {booking.status === 'cancelled' ? t.dash.status_cancelled : t.dash.status_confirmed}
                    </span>
                  </div>
                  <p style={{ fontSize: '0.85rem', color: '#374151', marginBottom: '0.2rem' }}>📅 {formatDate(booking.start_time)} · {formatTime(booking.start_time)} — {formatTime(booking.end_time)}</p>
                  {booking.services?.[0] && <p style={{ fontSize: '0.85rem', color: '#6b7280', marginBottom: '0.2rem' }}>✂️ {booking.services[0].name}{booking.staff?.[0] && ` · 👤 ${booking.staff[0].name}`}</p>}
                  <p style={{ fontSize: '0.85rem', color: '#6b7280', margin: 0 }}>📧 {booking.customer_email}{booking.customer_phone ? ` · 📞 ${booking.customer_phone}` : ''}</p>
                  {booking.notes && <p style={{ fontSize: '0.8rem', color: '#374151', marginTop: '0.25rem', backgroundColor: '#fffbeb', padding: '0.3rem 0.625rem', borderRadius: '6px', border: '1px solid #fde68a', display: 'inline-block' }}>💬 {booking.notes}</p>}
                </div>
              </div>
            )
          }
          const client = entry.data
          return (
            <div key={`imp-${idx}-${client.email}`} style={{ backgroundColor: isSelected ? '#eff6ff' : 'white', padding: isMobile ? '0.875rem 1rem' : '1.25rem 1.5rem', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', marginBottom: '0.75rem', borderLeft: `4px solid ${isSelected ? '#2563eb' : '#a78bfa'}`, display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
              <input type="checkbox" checked={isSelected} onChange={() => toggleItem(itemId)} style={{ marginTop: '0.25rem', width: '16px', height: '16px', cursor: 'pointer', accentColor: '#2563eb', flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.4rem' }}>
                  <p style={{ fontWeight: '700', color: '#111827', fontSize: '1rem', margin: 0 }}>{client.last_name} {client.first_name}</p>
                  <span style={{ fontSize: '0.7rem', padding: '0.2rem 0.6rem', borderRadius: '100px', backgroundColor: '#ede9fe', color: '#7c3aed', fontWeight: '700' }}>📥 {client.import_source && client.import_source !== 'Általános' ? client.import_source : 'Importált'}</span>
                </div>
                <p style={{ fontSize: '0.875rem', color: '#374151', marginBottom: '0.25rem' }}>🕐 {(() => { const pt = importedPastTime(client); if (!pt) return ''; const d = new Date(pt).toISOString(); return `${formatDate(d)} · ${formatTime(d)}`; })()}</p>
                <p style={{ fontSize: '0.875rem', color: '#6b7280', margin: 0 }}>📧 {client.email}{client.phone ? ` · 📞 ${client.phone}` : ''}</p>
              </div>
            </div>
          )
        })
      )}

      {tab === 'clients' && (
        <div style={{ position: 'relative' }}>
          {plan === 'free' && (
            <div style={{ position: 'absolute', inset: 0, zIndex: 20, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: '2.5rem' }}>
              <div style={{ backgroundColor: 'white', borderRadius: '14px', padding: '1.75rem 2rem', boxShadow: '0 8px 32px rgba(0,0,0,0.15)', border: '2px solid #fde68a', textAlign: 'center', maxWidth: '360px', width: '100%' }}>
                <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🔒</div>
                <h3 style={{ fontSize: '1rem', fontWeight: '800', color: '#0f172a', marginBottom: '0.4rem' }}>Ügyfél lista</h3>
                <p style={{ fontSize: '0.85rem', color: '#6b7280', lineHeight: 1.6, marginBottom: '1rem' }}>Az ügyfél lista funkció Alap csomagtól érhető el.</p>
                <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center', flexWrap: 'wrap' }}>
                  <span style={{ backgroundColor: '#fef3c7', color: '#92400e', fontSize: '0.78rem', fontWeight: '700', padding: '0.25rem 0.75rem', borderRadius: '999px', border: '1px solid #fde68a' }}>Ingyenes: nincs</span>
                  <span style={{ backgroundColor: '#dbeafe', color: '#1d4ed8', fontSize: '0.78rem', fontWeight: '700', padding: '0.25rem 0.75rem', borderRadius: '999px', border: '1px solid #bfdbfe' }}>Alap 10€: elérhető</span>
                </div>
              </div>
            </div>
          )}
          <div style={{ opacity: plan === 'free' ? 0.3 : 1, pointerEvents: plan === 'free' ? 'none' : 'auto', filter: plan === 'free' ? 'blur(2px)' : 'none', minHeight: '200px' }}>
            <ClientList
                title={`👥 ${t.dash.tab_clients}`}
                clients={clients}
                filtered={filteredClients}
                search={tabSearch}
                setSearch={() => {}}
                hideSearch={true}
                tenantId={tenantId || undefined}
                exportCSV={exportCSV}
                onImportClick={() => setShowImportModal(true)}
                onDeleteSelected={async (emails) => {
                  if (!tenantId) return
                  const importEmails = importedClients.filter(c => emails.includes(c.email)).map(c => c.email)
                  if (importEmails.length > 0) {
                    await supabase.from('imported_clients').delete().eq('tenant_id', tenantId).in('email', importEmails)
                    await fetchImportedClients()
                  }
                }}
                onDeleteOne={async (email) => {
                  if (!tenantId) return
                  await supabase.from('imported_clients').delete().eq('tenant_id', tenantId).eq('email', email)
                  await fetchImportedClients()
                  if (ownerStaffId) {
                    await supabase.from('staff_blacklist').delete().eq('staff_id', ownerStaffId).eq('email', email.toLowerCase())
                    setBlacklistedClientEmails(prev => { const s = new Set(prev); s.delete(email.toLowerCase()); return s })
                    setBlacklist(prev => prev.filter(e => e.email.toLowerCase() !== email.toLowerCase()))
                  }
                }}
                onBlacklistOne={async (email, name) => {
                  if (!tenantId) return null
                  let staffId = ownerStaffId
                  if (!staffId) {
                    const { data: owner } = await supabase.from('staff').select('id').eq('tenant_id', tenantId).eq('is_owner', true).single()
                    if (!owner) return 'Staff nem található'
                    staffId = owner.id
                    setOwnerStaffId(staffId)
                  }
                  const { data: newEntry, error } = await supabase.from('staff_blacklist')
                    .insert({ staff_id: staffId, tenant_id: tenantId, email: email.toLowerCase(), reason: `Tiltólistára helyezve: ${name}` })
                    .select().single()
                  if (error && error.code !== '23505') return error.message
                  setBlacklistedClientEmails(prev => new Set([...prev, email.toLowerCase()]))
                  if (newEntry) {
                    setBlacklist(prev => [newEntry, ...prev])
                    setBlacklistLoaded(true)
                  }
                  return null
                }}
                blacklistedEmails={blacklistedClientEmails}
              />
          </div>
        </div>
      )}
      {showImportModal && tenantId && (
        <ImportModal tenantId={tenantId} onClose={() => setShowImportModal(false)} onImported={() => { setShowImportModal(false); fetchImportedClients() }} />
      )}

      {tab === 'blacklist' && (
        <div style={{ position: 'relative' }}>
          {(plan === 'free' || plan === 'basic') && (
            <div style={{ position: 'absolute', inset: 0, zIndex: 20, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: '2.5rem' }}>
              <div style={{ backgroundColor: 'white', borderRadius: '14px', padding: '1.75rem 2rem', boxShadow: '0 8px 32px rgba(0,0,0,0.15)', border: '2px solid #fde68a', textAlign: 'center', maxWidth: '360px', width: '100%' }}>
                <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🔒</div>
                <h3 style={{ fontSize: '1rem', fontWeight: '800', color: '#0f172a', marginBottom: '0.4rem' }}>Tiltólista</h3>
                <p style={{ fontSize: '0.85rem', color: '#6b7280', lineHeight: 1.6, marginBottom: '1rem' }}>
                  A tiltólista funkció Pro csomagtól érhető el.
                </p>
                <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center', flexWrap: 'wrap' }}>
                  <span style={{ backgroundColor: '#fef3c7', color: '#92400e', fontSize: '0.78rem', fontWeight: '700', padding: '0.25rem 0.75rem', borderRadius: '999px', border: '1px solid #fde68a' }}>Ingyenes: nincs</span>
                  <span style={{ backgroundColor: '#dbeafe', color: '#1d4ed8', fontSize: '0.78rem', fontWeight: '700', padding: '0.25rem 0.75rem', borderRadius: '999px', border: '1px solid #bfdbfe' }}>Alap: nincs</span>
                  <span style={{ backgroundColor: '#ede9fe', color: '#6d28d9', fontSize: '0.78rem', fontWeight: '700', padding: '0.25rem 0.75rem', borderRadius: '999px', border: '1px solid #c4b5fd' }}>Pro 16€: elérhető</span>
                </div>
              </div>
            </div>
          )}
          <div style={{ opacity: (plan === 'free' || plan === 'basic') ? 0.3 : 1, pointerEvents: (plan === 'free' || plan === 'basic') ? 'none' : 'auto', filter: (plan === 'free' || plan === 'basic') ? 'blur(2px)' : 'none', minHeight: '200px' }}>
            <BlacklistUI
              title={`🚫 ${t.dash.blacklist_title.replace('🚫 ', '')}`}
              entries={visibleBlacklist}
              newEmail={newEmail} setNewEmail={setNewEmail}
              newPhone={newPhone} setNewPhone={setNewPhone}
              newReason={newReason} setNewReason={setNewReason}
              adding={adding} error={blError}
              onAdd={handleAddBlacklist}
              onRemove={handleRemoveBlacklist}
              selectedIds={selectedItems}
              onToggleId={(id) => {
                if (id === '__all__') toggleAll(blacklist.map(e => e.id))
                else toggleItem(id)
              }}
              onBulkRemove={async (ids) => {
                setBulkLoading(true)
                for (const id of ids) await handleRemoveBlacklist(id)
                setSelectedItems(new Set())
                setBulkLoading(false)
              }}
            />
          </div>
        </div>
      )}

      {tab === 'waitlist' && (
        <div style={{ position: 'relative' }}>
          {(plan === 'free' || plan === 'basic') && (
            <div style={{ position: 'absolute', inset: 0, zIndex: 20, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: '2.5rem' }}>
              <div style={{ backgroundColor: 'white', borderRadius: '14px', padding: '1.75rem 2rem', boxShadow: '0 8px 32px rgba(0,0,0,0.15)', border: '2px solid #fde68a', textAlign: 'center', maxWidth: '360px', width: '100%' }}>
                <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🔒</div>
                <h3 style={{ fontSize: '1rem', fontWeight: '800', color: '#0f172a', marginBottom: '0.4rem' }}>Várólisták</h3>
                <p style={{ fontSize: '0.85rem', color: '#6b7280', lineHeight: 1.6, marginBottom: '1rem' }}>A várólistás funkció Pro csomagtól érhető el.</p>
                <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center', flexWrap: 'wrap' }}>
                  <span style={{ backgroundColor: '#fef3c7', color: '#92400e', fontSize: '0.78rem', fontWeight: '700', padding: '0.25rem 0.75rem', borderRadius: '999px', border: '1px solid #fde68a' }}>Ingyenes: nincs</span>
                  <span style={{ backgroundColor: '#dbeafe', color: '#1d4ed8', fontSize: '0.78rem', fontWeight: '700', padding: '0.25rem 0.75rem', borderRadius: '999px', border: '1px solid #bfdbfe' }}>Alap: nincs</span>
                  <span style={{ backgroundColor: '#ede9fe', color: '#6d28d9', fontSize: '0.78rem', fontWeight: '700', padding: '0.25rem 0.75rem', borderRadius: '999px', border: '1px solid #c4b5fd' }}>Pro 16€: elérhető</span>
                </div>
              </div>
            </div>
          )}
          <div style={{ opacity: (plan === 'free' || plan === 'basic') ? 0.3 : 1, pointerEvents: (plan === 'free' || plan === 'basic') ? 'none' : 'auto', filter: (plan === 'free' || plan === 'basic') ? 'blur(2px)' : 'none', minHeight: '200px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '0.75rem' }}>
              <div>
                <h2 style={{ fontSize: '1.25rem', fontWeight: '700', color: '#111827', margin: 0 }}>⏳ {t.dash.tab_waitlist}</h2>
                <p style={{ fontSize: '0.875rem', color: '#6b7280', marginTop: '0.25rem' }}>{t.dash.waitlist_guests}</p>
              </div>
              {selectedItems.size > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', backgroundColor: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '10px', padding: '0.5rem 1rem' }}>
                  <span style={{ fontSize: '0.82rem', fontWeight: '600', color: '#1d4ed8' }}>{selectedItems.size} kiválasztva</span>
                  <button disabled={bulkLoading} onClick={async () => { setBulkLoading(true); for (const id of Array.from(selectedItems)) await handleDeleteWaitlist(id); setSelectedItems(new Set()); setBulkLoading(false) }}
                    style={{ backgroundColor: '#fee2e2', color: '#dc2626', padding: '0.35rem 0.875rem', borderRadius: '7px', border: '1px solid #fca5a5', cursor: 'pointer', fontWeight: '600', fontSize: '0.8rem' }}>
                    🗑️ Törlés
                  </button>
                  <button onClick={() => setSelectedItems(new Set())} style={{ background: 'none', border: 'none', color: '#6b7280', fontSize: '0.8rem', cursor: 'pointer' }}>✕</button>
                </div>
              )}
            </div>
            {!waitlistLoaded ? (
              <p style={{ color: '#6b7280' }}>Betöltés...</p>
            ) : visibleWaitlist.length === 0 ? (
              <div style={{ backgroundColor: 'white', padding: '3rem', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', textAlign: 'center', color: '#9ca3af' }}>
                {tabSearch ? 'Nincs találat.' : t.dash.waitlist_empty}
              </div>
            ) : (() => {
              const groups = new Map<string, { label: string; entries: WaitlistEntry[] }>()
              for (const entry of visibleWaitlist) {
                const key = entry.staff_id || '__owner__'
                const label = (entry.staff as { name: string } | null)?.name || 'Saját (tulajdonos)'
                if (!groups.has(key)) groups.set(key, { label, entries: [] })
                groups.get(key)!.entries.push(entry)
              }
              return Array.from(groups.values()).map(group => (
                <div key={group.label} style={{ marginBottom: '1.5rem' }}>
                  <p style={{ fontSize: '0.75rem', fontWeight: '700', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.5rem' }}>
                    👤 {group.label} ({group.entries.filter(e => e.status === 'waiting').length} vár)
                  </p>
                  <div style={{ backgroundColor: 'white', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', overflow: 'hidden' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '24px 2fr 2fr 2fr 1fr 1fr auto', gap: '1rem', padding: '0.75rem 1.5rem', backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb', alignItems: 'center' }}>
                      <input type="checkbox" checked={group.entries.length > 0 && group.entries.every(e => selectedItems.has(e.id))} onChange={() => toggleAll(group.entries.map(e => e.id))} style={{ width: '14px', height: '14px', cursor: 'pointer', accentColor: '#2563eb' }} />
                      {[t.dash.col_guest, t.dash.col_email, t.dash.col_service, t.dash.col_status, '📅', ''].map(h => (
                        <p key={h} style={{ fontSize: '0.75rem', fontWeight: '700', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>{h}</p>
                      ))}
                    </div>
                    {group.entries.map((entry, i) => (
                      <div key={entry.id} style={{ display: 'grid', gridTemplateColumns: '24px 2fr 2fr 2fr 1fr 1fr auto', gap: '1rem', padding: '1rem 1.5rem', alignItems: 'center', borderBottom: i < group.entries.length - 1 ? '1px solid #f3f4f6' : 'none', backgroundColor: selectedItems.has(entry.id) ? '#eff6ff' : 'white' }}>
                        <input type="checkbox" checked={selectedItems.has(entry.id)} onChange={() => toggleItem(entry.id)} style={{ width: '14px', height: '14px', cursor: 'pointer', accentColor: '#2563eb' }} />
                        <p style={{ fontWeight: '600', color: '#111827', margin: 0, fontSize: '0.875rem' }}>
                          {[entry.customer_last_name, entry.customer_first_name].filter(Boolean).join(' ') || '—'}
                        </p>
                        <p style={{ color: '#374151', margin: 0, fontSize: '0.8rem', wordBreak: 'break-all' }}>
                          <a href={`mailto:${entry.customer_email}`} style={{ color: '#2563eb', textDecoration: 'none' }} title="Email küldése">{entry.customer_email}</a>
                          {entry.customer_phone && <> · <a href={`tel:${entry.customer_phone}`} style={{ color: '#2563eb', textDecoration: 'none' }} title="Hívás">📞 {entry.customer_phone}</a></>}
                        </p>
                        <p style={{ color: '#6b7280', margin: 0, fontSize: '0.8rem' }}>
                          {(entry.services as { name: string } | null)?.name || '—'}
                        </p>
                        <span style={{ fontSize: '0.75rem', fontWeight: '700', padding: '0.2rem 0.6rem', borderRadius: '999px', display: 'inline-block', backgroundColor: entry.status === 'waiting' ? '#fef3c7' : entry.status === 'notified' ? '#dbeafe' : '#dcfce7', color: entry.status === 'waiting' ? '#92400e' : entry.status === 'notified' ? '#1d4ed8' : '#15803d' }}>
                          {entry.status === 'waiting' ? t.dash.waitlist_status_waiting : entry.status === 'notified' ? t.dash.waitlist_status_notified : t.dash.waitlist_status_booked}
                        </span>
                        <p style={{ color: '#9ca3af', margin: 0, fontSize: '0.75rem' }}>
                          {new Date(entry.created_at).toLocaleDateString(dateLocale, { month: 'short', day: 'numeric' })}
                        </p>
                        <button onClick={() => handleDeleteWaitlist(entry.id)} title="Törlés" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', fontSize: '1rem', padding: '0.25rem', borderRadius: '6px', lineHeight: 1, display: 'flex', alignItems: 'center' }}>🗑️</button>
                      </div>
                    ))}
                  </div>
                </div>
              ))
            })()}
          </div>
        </div>
      )}
    </div>

      {deletePending && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}>
          <div style={{ backgroundColor: 'white', borderRadius: '16px', padding: '2rem', maxWidth: '400px', width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.25)', textAlign: 'center' }}>
            <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>🗑️</div>
            <h3 style={{ fontSize: '1.1rem', fontWeight: '800', color: '#111827', marginBottom: '0.5rem' }}>Biztosan törlöd?</h3>
            <p style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '1.5rem', lineHeight: 1.6 }}>
              {deletePending.kind === 'bulk'
                ? `${deletePending.count} elem törlése véglegesen eltávolítja őket az adatbázisból.`
                : `„${deletePending.label}" törlése végleges és nem visszavonható.`}
            </p>
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
              <button onClick={() => setDeletePending(null)}
                style={{ flex: 1, backgroundColor: '#f3f4f6', color: '#374151', padding: '0.75rem', borderRadius: '10px', border: '1px solid #e5e7eb', cursor: 'pointer', fontWeight: '600', fontSize: '0.9rem' }}>
                Mégse
              </button>
              <button disabled={bulkLoading} onClick={executeDelete}
                style={{ flex: 1, backgroundColor: '#dc2626', color: 'white', padding: '0.75rem', borderRadius: '10px', border: 'none', cursor: bulkLoading ? 'not-allowed' : 'pointer', fontWeight: '700', fontSize: '0.9rem', opacity: bulkLoading ? 0.6 : 1 }}>
                {bulkLoading ? 'Törlés...' : 'Igen, törlöm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
