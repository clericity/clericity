'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { ClientList } from '@/app/dashboard/clients/page'

export default function StaffClientsPage() {
  const [clients, setClients] = useState<Parameters<typeof ClientList>[0]['clients']>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: staffRow } = await supabase
        .from('staff').select('id').eq('user_id', user.id).single()
      if (!staffRow) return

      const { data: bookings } = await supabase
        .from('bookings')
        .select('customer_first_name, customer_last_name, customer_email, customer_phone, start_time')
        .eq('staff_id', staffRow.id)
        .order('start_time', { ascending: false })

      if (!bookings) { setLoading(false); return }

      const map = new Map<string, typeof clients[0]>()
      for (const b of bookings) {
        const email = b.customer_email?.toLowerCase() || ''
        if (!email) continue
        if (map.has(email)) {
          map.get(email)!.booking_count++
        } else {
          map.set(email, {
            email,
            first_name: b.customer_first_name || '',
            last_name: b.customer_last_name || '',
            phone: b.customer_phone || '',
            booking_count: 1,
            last_booking: b.start_time,
          })
        }
      }

      const list = Array.from(map.values()).sort((a, b) =>
        new Date(b.last_booking).getTime() - new Date(a.last_booking).getTime()
      )
      setClients(list)
      setLoading(false)
    }
    load()
  }, [])

  const q = search.toLowerCase()
  const filtered = q ? clients.filter(c =>
    c.email.includes(q) ||
    c.first_name.toLowerCase().includes(q) ||
    c.last_name.toLowerCase().includes(q) ||
    c.phone.includes(q)
  ) : clients

  const exportCSV = () => {
    const header = 'Vezetéknév,Keresztnév,Email,Telefon,Foglalások száma,Utolsó foglalás'
    const rows = filtered.map(c =>
      `"${c.last_name}","${c.first_name}","${c.email}","${c.phone}","${c.booking_count}","${new Date(c.last_booking).toLocaleDateString('hu-HU')}"`
    )
    const blob = new Blob(['﻿' + [header, ...rows].join('\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `sajat_ugyfelek_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (loading) return <p style={{ color: '#6b7280' }}>Betöltés...</p>

  return <ClientList title="👥 Ügyfeleim" clients={clients} filtered={filtered} search={search} setSearch={setSearch} exportCSV={exportCSV} />
}
