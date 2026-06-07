'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import RichTextEditor from '@/components/RichTextEditor'
import { useLanguage } from '@/hooks/useLanguage'

const SERVICE_COLORS = ['#2563eb','#16a34a','#dc2626','#d97706','#7c3aed','#0891b2','#be185d','#374151']

interface Service {
  id: string
  name: string
  duration_minutes: number
  price: number | null
  description: string | null
  currency: string
  slot_interval: number
  buffer_minutes: number
  enabled: boolean
  icon_url?: string | null
  color?: string | null
}

const DEFAULT_POLICY_TEXT = `Foglalásait legalább {hours} órával az időpont előtt kérjük lemondani. Ezt követően a lemondás már nem lehetséges, és a szolgáltatás díja felszámításra kerülhet.

Lemondáshoz kérjük használja az emailben kapott lemondási linket, vagy vegye fel velünk a kapcsolatot közvetlenül.`

export default function ServicesPage() {
  const router = useRouter()
  const { t } = useLanguage()
  const [activeTab, setActiveTab] = useState<'services' | 'policy'>('services')
  const [services, setServices] = useState<Service[]>([])
  const [tenantId, setTenantId] = useState<string | null>(null)
  const [plan, setPlan] = useState('free')
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 640)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  // Lemondási szabály
  const [policyEnabled, setPolicyEnabled] = useState(false)
  const [policyHours, setPolicyHours] = useState(24)
  const [policyText, setPolicyText] = useState(DEFAULT_POLICY_TEXT)
  const [policySaving, setPolicySaving] = useState(false)
  const [policySuccess, setPolicySuccess] = useState(false)
  const [name, setName] = useState('')
  const [duration, setDuration] = useState('30')
  const [isCustomDuration, setIsCustomDuration] = useState(false)
  const [price, setPrice] = useState('')
  const [currency, setCurrency] = useState('HUF')
  const [description, setDescription] = useState('')
  const [slotInterval, setSlotInterval] = useState('0')
  const [bufferMinutes, setBufferMinutes] = useState('0')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [bulkInterval, setBulkInterval] = useState('0')
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [bulkLoading, setBulkLoading] = useState(false)
  const [bulkSuccess, setBulkSuccess] = useState(false)
  const [iconFile, setIconFile] = useState<File | null>(null)
  const [iconPreview, setIconPreview] = useState<string>('')
  const [iconUploading, setIconUploading] = useState(false)
  const [serviceColor, setServiceColor] = useState<string>('')

  useEffect(() => {
    const getData = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/auth'); return }

      const { data: profile } = await supabase
        .from('profiles')
        .select('tenant_id')
        .eq('id', user.id)
        .single()

      if (profile?.tenant_id) {
        setTenantId(profile.tenant_id)
        const [servicesRes, tenantRes] = await Promise.all([
          supabase.from('services').select('*').eq('tenant_id', profile.tenant_id),
          supabase.from('tenants').select('cancellation_policy_enabled, cancellation_policy_hours, cancellation_policy_text, plan').eq('id', profile.tenant_id).single(),
        ])
        setServices(servicesRes.data || [])
        const t = tenantRes.data
        if (t) {
          setPolicyEnabled(t.cancellation_policy_enabled || false)
          setPolicyHours(t.cancellation_policy_hours || 24)
          setPolicyText(t.cancellation_policy_text || DEFAULT_POLICY_TEXT.replace('{hours}', '24'))
          setPlan(t.plan || 'free')
        }
      }
    }
    getData()
  }, [router])

  const uploadIcon = async (file: File): Promise<string | null> => {
    if (!tenantId) return null
    const ext = file.name.split('.').pop()?.toLowerCase() || 'png'
    const path = `services/${tenantId}/${Date.now()}.${ext}`
    const { error } = await supabase.storage.from('logos').upload(path, file, { upsert: true })
    if (error) { console.error('Icon upload error:', error.message); return null }
    const { data } = supabase.storage.from('logos').getPublicUrl(path)
    return data.publicUrl
  }

  const handleAdd = async () => {
    if (!tenantId || !name || !duration) return
    setLoading(true)
    setError('')
    setSuccess(false)

    let icon_url: string | null = iconPreview || null
    if (iconFile) {
      setIconUploading(true)
      icon_url = await uploadIcon(iconFile)
      setIconUploading(false)
    }

    const { data, error } = await supabase
      .from('services')
      .insert({
        tenant_id: tenantId,
        name,
        duration_minutes: parseInt(duration),
        price: price ? parseInt(price) : null,
        description,
        currency,
        slot_interval: parseInt(slotInterval) || 0,
        buffer_minutes: parseInt(bufferMinutes) || 0,
        icon_url,
        color: serviceColor || null,
      })
      .select()
      .single()

    if (error) {
      setError(error.message)
    } else {
      setServices([...services, data])
      setName('')
      setDuration('30')
      setIsCustomDuration(false)
      setPrice('')
      setDescription('')
      setSlotInterval('0')
      setBufferMinutes('0')
      setIconFile(null)
      setIconPreview('')
      setServiceColor('')
      setSuccess(true)
    }
    setLoading(false)
  }

const handleEdit = (service: Service) => {
    setEditingId(service.id)
    setName(service.name)
    setDuration(service.duration_minutes.toString())
    setIsCustomDuration(![15, 30, 45, 60, 90, 120].includes(service.duration_minutes))
    setPrice(service.price?.toString() || '')
    setCurrency(service.currency)
    setDescription(service.description || '')
    setSlotInterval(service.slot_interval?.toString() || '0')
    setBufferMinutes(service.buffer_minutes?.toString() || '0')
    setIconFile(null)
    setIconPreview(service.icon_url || '')
    setServiceColor(service.color || '')
    setTimeout(() => {
      document.getElementById('service-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 100)
  }

  const handleUpdate = async () => {
    if (!editingId || !name || !duration) return
    setLoading(true)
    setError('')

    let icon_url: string | null = iconPreview || null
    if (iconFile) {
      setIconUploading(true)
      icon_url = await uploadIcon(iconFile)
      setIconUploading(false)
    }

    const { data, error } = await supabase
      .from('services')
      .update({
        name,
        duration_minutes: parseInt(duration),
        price: price ? parseInt(price) : null,
        description,
        currency,
        slot_interval: parseInt(slotInterval) || 0,
        buffer_minutes: parseInt(bufferMinutes) || 0,
        icon_url,
        color: serviceColor || null,
      })
      .eq('id', editingId)
      .select()
      .single()

    if (error) {
      setError(error.message)
    } else {
      setServices(services.map(s => s.id === editingId ? data : s))
      setEditingId(null)
      setName('')
      setDuration('30')
      setIsCustomDuration(false)
      setPrice('')
      setDescription('')
      setSlotInterval('0')
      setBufferMinutes('0')
      setIconFile(null)
      setIconPreview('')
      setServiceColor('')
      setSuccess(true)
    }
    setLoading(false)
  }

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from('services').delete().eq('id', id)
    if (!error) {
      setServices(services.filter(s => s.id !== id))
      setSelectedIds(selectedIds.filter(i => i !== id))
    }
  }

  const handleToggleEnabled = async (id: string, enabled: boolean) => {
    await supabase.from('services').update({ enabled }).eq('id', id)
    setServices(services.map(s => s.id === id ? { ...s, enabled } : s))
  }

  const handleBulkInterval = async () => {
    if (selectedIds.length === 0) return
    setBulkLoading(true)
    setBulkSuccess(false)

    for (const id of selectedIds) {
      await supabase
        .from('services')
        .update({ slot_interval: parseInt(bulkInterval) || 0 })
        .eq('id', id)
    }

    setServices(services.map(s =>
      selectedIds.includes(s.id) ? { ...s, slot_interval: parseInt(bulkInterval) || 0 } : s
    ))
    setSelectedIds([])
    setBulkLoading(false)
    setBulkSuccess(true)
  }

  const toggleSelect = (id: string) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    )
  }

  const selectAll = () => {
    if (selectedIds.length === services.length) {
      setSelectedIds([])
    } else {
      setSelectedIds(services.map(s => s.id))
    }
  }

  const handleSavePolicy = async () => {
    if (!tenantId) return
    setPolicySaving(true)
    setPolicySuccess(false)
    await supabase.from('tenants').update({
      cancellation_policy_enabled: policyEnabled,
      cancellation_policy_hours: policyHours,
      cancellation_policy_text: policyText,
    }).eq('id', tenantId)
    setPolicySaving(false)
    setPolicySuccess(true)
    setTimeout(() => setPolicySuccess(false), 3000)
  }

  const handleHoursChange = (hours: number) => {
    setPolicyHours(hours)
    // Frissíti a szövegben az óraszámot ha {hours} placeholder van
    setPolicyText(prev => prev.replace(/\d+(?= órával)/, hours.toString()))
  }

  const getIntervalLabel = (service: Service) => {
    const interval = service.slot_interval || 0
    if (interval === 0) return `${service.duration_minutes} ${t.dash.service_interval_default}`
    return `${interval} ${t.dash.service_interval_every_n}`
  }

  return (
    <div>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#111827', marginBottom: '1.25rem' }}>
        {t.dash.services_title}
      </h1>

      {/* Tabok */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem' }}>
        {[
          { key: 'services', label: `✂️ ${t.dash.tab_services}` },
          { key: 'policy', label: `📜 ${t.dash.tab_policy}` },
        ].map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key as 'services' | 'policy')}
            style={{ padding: '0.5rem 1.25rem', borderRadius: '8px', border: '2px solid', borderColor: activeTab === tab.key ? '#2563eb' : '#e5e7eb', backgroundColor: activeTab === tab.key ? '#eff6ff' : 'white', color: activeTab === tab.key ? '#2563eb' : '#6b7280', cursor: 'pointer', fontWeight: activeTab === tab.key ? '700' : '400', fontSize: '0.875rem' }}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* ══ LEMONDÁSI SZABÁLY TAB ══ */}
      {activeTab === 'policy' && (
        <div style={{ maxWidth: '600px', position: 'relative' }}>
          {plan === 'free' && (
            <div style={{ position: 'absolute', inset: 0, zIndex: 20, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: '2.5rem' }}>
              <div style={{ backgroundColor: 'white', borderRadius: '14px', padding: '1.75rem 2rem', boxShadow: '0 8px 32px rgba(0,0,0,0.15)', border: '2px solid #fde68a', textAlign: 'center', maxWidth: '360px', width: '100%' }}>
                <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🔒</div>
                <h3 style={{ fontSize: '1rem', fontWeight: '800', color: '#0f172a', marginBottom: '0.4rem' }}>{t.dash.policy_lock_title}</h3>
                <p style={{ fontSize: '0.85rem', color: '#6b7280', lineHeight: 1.6, marginBottom: '1rem' }}>
                  {t.dash.policy_lock_desc}
                </p>
                <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center', flexWrap: 'wrap' }}>
                  <span style={{ backgroundColor: '#fef3c7', color: '#92400e', fontSize: '0.78rem', fontWeight: '700', padding: '0.25rem 0.75rem', borderRadius: '999px', border: '1px solid #fde68a' }}>{t.dash.policy_free_badge}</span>
                  <span style={{ backgroundColor: '#dbeafe', color: '#1d4ed8', fontSize: '0.78rem', fontWeight: '700', padding: '0.25rem 0.75rem', borderRadius: '999px', border: '1px solid #bfdbfe' }}>{t.dash.policy_basic_badge}</span>
                </div>
              </div>
            </div>
          )}
          <div style={{ opacity: plan === 'free' ? 0.3 : 1, pointerEvents: plan === 'free' ? 'none' : 'auto', filter: plan === 'free' ? 'blur(1.5px)' : 'none' }}>
          <div style={{ backgroundColor: 'white', padding: '1.75rem', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>

            {/* Bekapcsolt/ki */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem', paddingBottom: '1.25rem', borderBottom: '1px solid #f3f4f6' }}>
              <div>
                <p style={{ fontWeight: '700', color: '#111827', margin: 0 }}>{t.dash.policy_title}</p>
                <p style={{ fontSize: '0.8rem', color: '#6b7280', marginTop: '0.25rem' }}>
                  {policyEnabled ? t.dash.policy_enabled_desc : t.dash.policy_disabled_desc}
                </p>
              </div>
              <div
                onClick={() => setPolicyEnabled(!policyEnabled)}
                style={{ width: '48px', height: '26px', borderRadius: '13px', backgroundColor: policyEnabled ? '#2563eb' : '#d1d5db', cursor: 'pointer', position: 'relative', flexShrink: 0, transition: 'background 0.2s' }}
              >
                <div style={{ position: 'absolute', top: '3px', left: policyEnabled ? '24px' : '3px', width: '20px', height: '20px', borderRadius: '50%', backgroundColor: 'white', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
              </div>
            </div>

            {/* Óraszám */}
            <div style={{ marginBottom: '1.25rem' }}>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '600', color: '#374151', marginBottom: '0.5rem' }}>
                {t.dash.service_cancel_hours}
              </label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <input
                  type="number"
                  value={policyHours}
                  onChange={e => handleHoursChange(parseInt(e.target.value) || 0)}
                  min="1" max="168"
                  style={{ width: '100px', border: '1px solid #d1d5db', borderRadius: '8px', padding: '0.625rem 1rem', color: '#111827', outline: 'none', fontSize: '0.875rem' }}
                />
                <p style={{ fontSize: '0.85rem', color: '#6b7280', margin: 0 }}>
                  {t.dash.policy_hours_desc} <strong>{policyHours} {t.dash.delay_hr}</strong> {t.dash.policy_hours_desc2}
                </p>
              </div>
            </div>

            {/* Szabályzat szövege */}
            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '600', color: '#374151', marginBottom: '0.5rem' }}>
                {t.dash.policy_text_label}
              </label>
              <p style={{ fontSize: '0.75rem', color: '#9ca3af', marginBottom: '0.5rem' }}>
                {t.dash.policy_text_hint}
              </p>
              <RichTextEditor value={policyText} onChange={setPolicyText} rows={8} />
            </div>

            {/* Előnézet */}
            <div style={{ backgroundColor: '#f8fafc', border: '1px solid #e5e7eb', borderRadius: '10px', padding: '1.25rem', marginBottom: '1.5rem' }}>
              <p style={{ fontSize: '0.75rem', fontWeight: '700', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 0.75rem' }}>{t.dash.policy_preview_label}</p>
              <div style={{ fontSize: '0.875rem', color: '#374151', lineHeight: 1.7, margin: 0 }} dangerouslySetInnerHTML={{ __html: policyText }} />
            </div>

            {policySuccess && <p style={{ color: '#22c55e', fontSize: '0.875rem', marginBottom: '1rem' }}>{t.dash.policy_saved}</p>}

            <button onClick={handleSavePolicy} disabled={policySaving}
              style={{ backgroundColor: '#2563eb', color: 'white', padding: '0.75rem 2rem', borderRadius: '8px', border: 'none', cursor: 'pointer', fontWeight: '600', opacity: policySaving ? 0.5 : 1 }}>
              {policySaving ? t.dash.saving : `💾 ${t.dash.save_btn}`}
            </button>
          </div>
          </div> {/* /blur wrapper */}
        </div>
      )}

      {activeTab === 'services' && <>
      {/* Új szolgáltatás / Szerkesztés */}
      <div id="service-form" style={{ backgroundColor: 'white', padding: isMobile ? '1rem' : '1.5rem', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', marginBottom: '1.5rem', maxWidth: '600px' }}>
        <h2 style={{ fontSize: '1rem', fontWeight: '600', color: '#111827', marginBottom: '1rem' }}>
          {editingId ? t.dash.service_edit_title : t.dash.service_add_title}
        </h2>

        {/* Ikon feltöltés */}
        <div style={{ marginBottom: '1rem' }}>
          <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', color: '#374151', marginBottom: '0.5rem' }}>
            Ikon (opcionális)
          </label>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.875rem' }}>
            <div style={{ width: '52px', height: '52px', borderRadius: '10px', border: '1px solid #e5e7eb', backgroundColor: '#f9fafb', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
              {iconPreview
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={iconPreview} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : <span style={{ fontSize: '1.5rem' }}>🖼️</span>}
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <label htmlFor="icon-upload" style={{ backgroundColor: '#eff6ff', color: '#2563eb', padding: '0.4rem 0.875rem', borderRadius: '8px', border: '1px solid #bfdbfe', cursor: 'pointer', fontWeight: '600', fontSize: '0.8rem', display: 'inline-block' }}>
                  📎 {iconPreview ? 'Csere' : 'Kép feltöltése'}
                </label>
                <input id="icon-upload" type="file" accept="image/*" style={{ display: 'none' }} onChange={e => {
                  const file = e.target.files?.[0]
                  if (!file) return
                  setIconFile(file)
                  setIconPreview(URL.createObjectURL(file))
                  e.target.value = ''
                }} />
                {iconPreview && (
                  <button type="button" onClick={() => { setIconFile(null); setIconPreview('') }}
                    style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', fontSize: '0.8rem', fontWeight: '500' }}>
                    ✕ Eltávolítás
                  </button>
                )}
              </div>
              <p style={{ fontSize: '0.72rem', color: '#9ca3af', marginTop: '0.3rem' }}>JPG, PNG, SVG, WebP — max 2 MB</p>
            </div>
          </div>
        </div>

        {/* Szín */}
        <div style={{ marginBottom: '1rem' }}>
          <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', color: '#374151', marginBottom: '0.5rem' }}>
            Szín (opcionális)
          </label>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            {SERVICE_COLORS.map(c => (
              <button key={c} type="button" onClick={() => setServiceColor(serviceColor === c ? '' : c)}
                style={{ width: '28px', height: '28px', borderRadius: '50%', backgroundColor: c, border: serviceColor === c ? '3px solid #111827' : '2px solid transparent', cursor: 'pointer', outline: serviceColor === c ? '2px solid white' : 'none', outlineOffset: '-4px', flexShrink: 0 }}
                title={c}
              />
            ))}
            <input type="color" value={serviceColor || '#2563eb'}
              onChange={e => setServiceColor(e.target.value)}
              style={{ width: '28px', height: '28px', borderRadius: '50%', border: '1px solid #d1d5db', cursor: 'pointer', padding: '1px', backgroundColor: 'transparent' }}
              title="Egyéni szín"
            />
            {serviceColor && (
              <button type="button" onClick={() => setServiceColor('')}
                style={{ fontSize: '0.75rem', color: '#9ca3af', background: 'none', border: 'none', cursor: 'pointer', padding: '0 0.25rem' }}>
                ✕ Törlés
              </button>
            )}
          </div>
        </div>

        <div style={{ marginBottom: '1rem' }}>
          <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', color: '#374151', marginBottom: '0.5rem' }}>
            {t.dash.service_name_label}
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={{ width: '100%', border: '1px solid #d1d5db', borderRadius: '8px', padding: '0.625rem 1rem', color: '#111827', outline: 'none', boxSizing: 'border-box' }}
            placeholder={t.dash.service_name_ph}
          />
        </div>

        <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: '1rem', marginBottom: '1rem' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', color: '#374151', marginBottom: '0.5rem' }}>
              {t.dash.service_duration_star}
            </label>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <select
                value={isCustomDuration ? 'custom' : duration}
                onChange={(e) => {
                  if (e.target.value === 'custom') {
                    setIsCustomDuration(true)
                    setDuration('')
                  } else {
                    setIsCustomDuration(false)
                    setDuration(e.target.value)
                  }
                }}
                style={{ flex: 1, border: '1px solid #d1d5db', borderRadius: '8px', padding: '0.625rem 1rem', color: '#111827', outline: 'none', boxSizing: 'border-box', backgroundColor: 'white' }}
              >
                {[15, 30, 45, 60, 90, 120].map(m => (
                  <option key={m} value={String(m)}>{m} {t.dash.minutes_label}</option>
                ))}
                <option value="custom">{t.dash.service_duration_custom}</option>
              </select>
              {isCustomDuration && (
                <input
                  type="number"
                  value={duration}
                  onChange={(e) => setDuration(e.target.value)}
                  style={{ width: '80px', border: '1px solid #d1d5db', borderRadius: '8px', padding: '0.625rem 1rem', color: '#111827', outline: 'none', boxSizing: 'border-box' }}
                  placeholder={t.dash.minutes_label}
                />
              )}
            </div>
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', color: '#374151', marginBottom: '0.5rem' }}>
              {t.dash.service_price_short}
            </label>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <input
                type="number"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                style={{ flex: 1, border: '1px solid #d1d5db', borderRadius: '8px', padding: '0.625rem 1rem', color: '#111827', outline: 'none', boxSizing: 'border-box' }}
                placeholder={currency === 'HUF' ? '3000' : '8'}
              />
              <button
                onClick={() => setCurrency(currency === 'HUF' ? 'EUR' : 'HUF')}
                style={{ padding: '0.625rem 1rem', border: '1px solid #d1d5db', borderRadius: '8px', backgroundColor: currency === 'EUR' ? '#2563eb' : 'white', color: currency === 'EUR' ? 'white' : '#374151', cursor: 'pointer', fontWeight: '600', fontSize: '0.875rem', whiteSpace: 'nowrap', flexShrink: 0 }}
              >
                {currency === 'HUF' ? 'Ft' : '€'}
              </button>
            </div>
          </div>
        </div>

        {/* Buffer idő */}
        <div style={{ marginBottom: '1rem' }}>
          <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', color: '#374151', marginBottom: '0.5rem' }}>
            {t.dash.service_buffer_label}
          </label>
          <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: '0.5rem', alignItems: isMobile ? 'flex-start' : 'center' }}>
            <input
              type="number"
              value={bufferMinutes}
              onChange={e => setBufferMinutes(e.target.value)}
              style={{ width: isMobile ? '100%' : '100px', border: '1px solid #d1d5db', borderRadius: '8px', padding: '0.625rem 1rem', color: '#111827', outline: 'none', boxSizing: 'border-box' }}
              placeholder="0"
              min="0"
            />
            <p style={{ fontSize: '0.8rem', color: '#6b7280', margin: 0 }}>
              {!bufferMinutes || bufferMinutes === '0'
                ? t.dash.service_buffer_none
                : `${bufferMinutes} ${t.dash.service_buffer_desc}`}
            </p>
          </div>
        </div>

        {/* Időköz beállítás */}
        <div style={{ marginBottom: '1rem' }}>
          <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', color: '#374151', marginBottom: '0.5rem' }}>
            {t.dash.service_interval_label}
          </label>
          <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: '0.5rem', alignItems: isMobile ? 'flex-start' : 'center' }}>
            <input
              type="number"
              value={slotInterval}
              onChange={(e) => setSlotInterval(e.target.value)}
              style={{ width: isMobile ? '100%' : '100px', border: '1px solid #d1d5db', borderRadius: '8px', padding: '0.625rem 1rem', color: '#111827', outline: 'none', boxSizing: 'border-box' }}
              placeholder="0"
              min="0"
            />
            <p style={{ fontSize: '0.8rem', color: '#6b7280', margin: 0 }}>
              {slotInterval === '0' || slotInterval === ''
                ? `${t.dash.service_interval_auto} (${duration || '?'} ${t.dash.service_interval_every_n})`
                : `${slotInterval} ${t.dash.service_interval_every}`}
            </p>
          </div>
        </div>

        <div style={{ marginBottom: '1.25rem' }}>
          <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', color: '#374151', marginBottom: '0.5rem' }}>
            {t.dash.service_desc_label}
          </label>
          <RichTextEditor value={description} onChange={setDescription} rows={3} placeholder={t.dash.service_desc_ph} />
        </div>

        {error && <p style={{ color: '#ef4444', fontSize: '0.875rem', marginBottom: '1rem' }}>{error}</p>}
        {success && <p style={{ color: '#22c55e', fontSize: '0.875rem', marginBottom: '1rem' }}>✅ {editingId ? t.dash.service_updated : t.dash.service_added}</p>}

        <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: '0.75rem' }}>
          <button
            onClick={editingId ? handleUpdate : handleAdd}
            disabled={loading}
            style={{ backgroundColor: '#2563eb', color: 'white', padding: '0.75rem 2rem', borderRadius: '8px', border: 'none', cursor: 'pointer', fontWeight: '500', opacity: loading ? 0.5 : 1 }}
          >
            {iconUploading ? '📤 Kép feltöltése...' : loading ? t.dash.saving : editingId ? `💾 ${t.dash.save_btn}` : `➕ ${t.dash.add_btn}`}
          </button>
          {editingId && (
            <button
              onClick={() => { setEditingId(null); setName(''); setDuration('30'); setIsCustomDuration(false); setPrice(''); setDescription(''); setSlotInterval('0'); setBufferMinutes('0'); setIconFile(null); setIconPreview('') }}
              style={{ backgroundColor: '#f3f4f6', color: '#374151', padding: '0.75rem 1.5rem', borderRadius: '8px', border: '1px solid #e5e7eb', cursor: 'pointer', fontWeight: '500' }}
            >
              {t.dash.cancel_label}
            </button>
          )}
        </div>
      </div>

      {/* Tömeges intervallum beállítás */}
      {services.length > 0 && (
        <div style={{ backgroundColor: '#eff6ff', padding: isMobile ? '1rem' : '1.25rem', borderRadius: '12px', border: '1px solid #bfdbfe', marginBottom: '1.5rem', maxWidth: '600px' }}>
          <h3 style={{ fontSize: '0.9rem', fontWeight: '700', color: '#1d4ed8', marginBottom: '0.75rem' }}>
            {t.dash.service_bulk_title}
          </h3>
          <p style={{ fontSize: '0.8rem', color: '#3b82f6', marginBottom: '0.75rem' }}>
            {t.dash.service_bulk_desc}
          </p>
          <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: '0.75rem', alignItems: isMobile ? 'stretch' : 'center', flexWrap: isMobile ? undefined : 'wrap' }}>
            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
              <input
                type="number"
                value={bulkInterval}
                onChange={(e) => setBulkInterval(e.target.value)}
                style={{ width: isMobile ? '100%' : '100px', flex: isMobile ? 1 : undefined, border: '1px solid #bfdbfe', borderRadius: '8px', padding: '0.5rem 0.75rem', color: '#111827', outline: 'none', boxSizing: 'border-box' }}
                placeholder={t.dash.minutes_label}
                min="0"
              />
              <span style={{ fontSize: '0.8rem', color: '#3b82f6', whiteSpace: 'nowrap' }}>{t.dash.service_bulk_interval_label}</span>
            </div>
            <button
              onClick={handleBulkInterval}
              disabled={bulkLoading || selectedIds.length === 0}
              style={{ backgroundColor: selectedIds.length === 0 ? '#e5e7eb' : '#2563eb', color: selectedIds.length === 0 ? '#9ca3af' : 'white', padding: '0.5rem 1.25rem', borderRadius: '8px', border: 'none', cursor: selectedIds.length === 0 ? 'not-allowed' : 'pointer', fontWeight: '600', fontSize: '0.875rem' }}
            >
              {bulkLoading ? t.dash.saving : `✅ ${t.dash.service_bulk_apply} (${selectedIds.length} ${t.dash.service_bulk_apply_suffix})`}
            </button>
            {bulkSuccess && <span style={{ color: '#22c55e', fontSize: '0.8rem' }}>{t.dash.saved}</span>}
          </div>
        </div>
      )}

      {/* Szolgáltatások listája */}
      <div style={{ maxWidth: '600px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
          <h2 style={{ fontSize: '1rem', fontWeight: '600', color: '#111827' }}>
            {t.dash.tab_services}
          </h2>
          {services.length > 0 && (
            <button
              onClick={selectAll}
              style={{ fontSize: '0.8rem', color: '#2563eb', background: 'none', border: 'none', cursor: 'pointer', fontWeight: '500' }}
            >
              {selectedIds.length === services.length ? t.dash.deselect_all : t.dash.select_all}
            </button>
          )}
        </div>

        {services.length === 0 ? (
          <div style={{ backgroundColor: 'white', padding: '1.5rem', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', textAlign: 'center', color: '#6b7280' }}>
            {t.dash.no_services}
          </div>
        ) : (
          services.map((service) => (
            <div key={service.id} style={{
              backgroundColor: 'white', padding: isMobile ? '0.875rem 1rem' : '1rem 1.5rem', borderRadius: '12px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.1)', marginBottom: '0.75rem',
              display: 'flex', flexDirection: isMobile ? 'column' : 'row', alignItems: isMobile ? 'stretch' : 'center', justifyContent: 'space-between',
              border: selectedIds.includes(service.id) ? '2px solid #2563eb' : '2px solid transparent',
              opacity: service.enabled === false ? 0.55 : 1,
              gap: isMobile ? '0.75rem' : undefined,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flex: 1 }}>
                <input
                  type="checkbox"
                  checked={selectedIds.includes(service.id)}
                  onChange={() => toggleSelect(service.id)}
                  style={{ width: '16px', height: '16px', cursor: 'pointer', flexShrink: 0 }}
                />
                {service.icon_url
                  ? <Image src={service.icon_url} alt="" width={38} height={38} style={{ width: '38px', height: '38px', borderRadius: '8px', objectFit: 'cover', flexShrink: 0, border: '1px solid #e5e7eb' }} />
                  : <div style={{ width: '38px', height: '38px', borderRadius: '8px', backgroundColor: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: '1.2rem' }}>✂️</div>
                }
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    {service.color && <span style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: service.color, flexShrink: 0, display: 'inline-block' }} />}
                    <p style={{ fontWeight: '600', color: '#111827' }}>{service.name}</p>
                    {service.enabled === false && (
                      <span style={{ fontSize: '0.7rem', fontWeight: '700', color: '#9ca3af', backgroundColor: '#f3f4f6', padding: '0.1rem 0.5rem', borderRadius: '999px', border: '1px solid #e5e7eb' }}>
                        kikapcsolva
                      </span>
                    )}
                  </div>
                  <p style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                    ⏱ {service.duration_minutes} {t.dash.minutes_label}
                    {service.price && ` · 💰 ${service.price.toLocaleString('hu-HU')} ${service.currency === 'EUR' ? '€' : 'Ft'}`}
                  </p>
                  <p style={{ fontSize: '0.75rem', color: '#9ca3af', marginTop: '0.15rem' }}>
                    {t.dash.service_interval_row} {getIntervalLabel(service)}
                  </p>
                  {service.description && (
                    <p style={{ fontSize: '0.75rem', color: '#9ca3af', marginTop: '0.15rem' }}>{service.description}</p>
                  )}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: isMobile ? undefined : 0, justifyContent: isMobile ? 'space-between' : undefined }}>
                {/* Be/ki kapcsoló */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: isMobile ? 1 : undefined }}>
                  <button
                    onClick={() => handleToggleEnabled(service.id, service.enabled === false ? true : false)}
                    title={service.enabled === false ? 'Bekapcsolás' : 'Kikapcsolás'}
                    style={{ width: '44px', height: '24px', borderRadius: '12px', border: 'none', backgroundColor: service.enabled === false ? '#d1d5db' : '#22c55e', cursor: 'pointer', position: 'relative', flexShrink: 0 }}
                  >
                    <div style={{ position: 'absolute', top: '2px', left: service.enabled === false ? '2px' : '22px', width: '20px', height: '20px', borderRadius: '50%', backgroundColor: 'white', transition: 'left 0.2s' }} />
                  </button>
                  {isMobile && <span style={{ fontSize: '0.75rem', color: service.enabled === false ? '#9ca3af' : '#16a34a', fontWeight: '600' }}>{service.enabled === false ? 'Kikapcsolva' : 'Aktív'}</span>}
                </div>
                <button
                  onClick={() => handleEdit(service)}
                  style={{ backgroundColor: '#eff6ff', color: '#2563eb', border: 'none', borderRadius: '8px', padding: isMobile ? '0.5rem 1.25rem' : '0.5rem 0.75rem', cursor: 'pointer', fontSize: '0.875rem', flex: isMobile ? 1 : undefined }}
                >
                  ✏️ {isMobile && 'Szerkesztés'}
                </button>
                <button
                  onClick={() => handleDelete(service.id)}
                  style={{ backgroundColor: '#fee2e2', color: '#ef4444', border: 'none', borderRadius: '8px', padding: isMobile ? '0.5rem 1.25rem' : '0.5rem 0.75rem', cursor: 'pointer', fontSize: '0.875rem', flex: isMobile ? 1 : undefined }}
                >
                  🗑️ {isMobile && 'Törlés'}
                </button>
              </div>
            </div>
          ))
        )}
      </div>
      </>}
    </div>
  )
}