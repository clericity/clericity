'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { useLanguage } from '@/hooks/useLanguage'
import RichTextEditor from '@/components/RichTextEditor'
import TimingSelector from '@/components/TimingSelector'

// ─── Email constants ──────────────────────────────────────────────────────────

const DEFAULT_BODY = `Kedves {customerName}!\n\nKöszönjük a foglalásodat! Az alábbiakban találod a foglalásod részleteit:\n\n🗓 Szolgáltatás: {serviceName}\n📅 Dátum: {date}\n🕐 Időpont: {slot}\n\nHa kérdésed van, kérjük vedd fel velünk a kapcsolatot.\n\nÜdvözlettel,\n{businessName}`
const DEFAULT_CANCEL_BODY = `Kedves {customerName}!\n\nFoglalásod sikeresen lemondásra került.\n\n🗓 Szolgáltatás: {serviceName}\n📅 Dátum: {date}\n🕐 Időpont: {slot}\n\nReméljük hamarosan viszontlátjuk!\n\nÜdvözlettel,\n{businessName}`
const DEFAULT_RESCHEDULE_BODY = `Kedves {customerName}!\n\nFoglalásod sikeresen átütemezésre került. Az alábbiakban találod az új időpont adatait:\n\n🗓 Szolgáltatás: {serviceName}\n📅 Új dátum: {date}\n🕐 Új időpont: {slot}\n\nHa kérdésed van, vedd fel velünk a kapcsolatot.\n\nÜdvözlettel,\n{businessName}`
const DEFAULT_REMINDER_BODY = `Kedves {customerName}!\n\nMár egy ideje nem jártál nálunk. Szívesen látunk újra!\n\nFoglalj időpontot most:\n{bookingUrl}\n\nÜdvözlettel,\n{businessName}`

const EMAIL_TEMPLATES = [
  { key: '24h-reminder', name: '24h emlékeztető', icon: '⏰', description: '24 órával az időpont előtt automatikusan elküldi', trigger_type: 'before_appointment', trigger_delay_minutes: 1440, subject: '⏰ Emlékeztető: holnap van a foglalásod, {customerName}!', body: `Kedves {customerName}!\n\nEmlékeztetünk, hogy holnap foglalásod van nálunk:\n\n🗓 Szolgáltatás: {serviceName}\n📅 Dátum: {date}\n🕐 Időpont: {slot}\n\nHa nem tudsz eljönni, kérjük jelezd mielőbb.\n\nÜdvözlettel,\n{businessName}` },
  { key: 'follow-up', name: 'Follow-up email', icon: '🙏', description: '1 nappal az időpont után visszajelzést kér a vendégtől', trigger_type: 'after_appointment', trigger_delay_minutes: 1440, subject: '🙏 Köszönjük a látogatásodat, {customerName}!', body: `Kedves {customerName}!\n\nKöszönjük, hogy meglátogattál minket!\n\nReméljük elégedett voltál a {serviceName} szolgáltatásunkkal. A véleményed nagyon fontos számunkra!\n\nVárunk vissza szeretettel,\n{businessName}` },
]
const TEMPLATE_NAMES = new Set(EMAIL_TEMPLATES.map(t => t.name))

// ─── Interfaces ───────────────────────────────────────────────────────────────

interface BookingField {
  id: string
  field_type: string
  label: string
  required: boolean
  enabled: boolean
  order_index: number
  service_ids: string[] | null
}

interface Automation {
  id: string; name: string; trigger_type: string
  trigger_delay_minutes: number; subject: string; body: string; enabled: boolean
}

const DEFAULT_FIELDS = [
  { field_type: 'last_name', label: 'Vezetéknév', required: true, enabled: true, order_index: 0 },
  { field_type: 'first_name', label: 'Keresztnév', required: true, enabled: true, order_index: 1 },
  { field_type: 'email', label: 'Email cím', required: true, enabled: true, order_index: 2 },
  { field_type: 'phone', label: 'Telefonszám', required: true, enabled: true, order_index: 3 },
]

type PageTab = 'fields' | 'email'
type EmailTab = 'template' | 'automations'

// ─── Main component ───────────────────────────────────────────────────────────

export default function BookingSettingsPage() {
  const router = useRouter()
  const { t } = useLanguage()
  const [isMobile, setIsMobile] = useState(false)
  const autoFormRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 640)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  const EMAIL_VARIABLES = [
    { var: '{customerName}', desc: t.dash.var_customer },
    { var: '{serviceName}', desc: t.dash.var_service },
    { var: '{date}', desc: t.dash.var_date },
    { var: '{slot}', desc: t.dash.var_slot },
    { var: '{businessName}', desc: t.dash.var_business },
    { var: '{bookingUrl}', desc: t.dash.var_booking_url },
  ]
  const TRIGGER_LABELS: Record<string, string> = {
    booking_confirmed: t.dash.trigger_confirmed,
    before_appointment: t.dash.trigger_before,
    after_appointment: t.dash.trigger_after,
  }

  const [pageTab, setPageTab] = useState<PageTab>('fields')
  const [tenantId, setTenantId] = useState<string | null>(null)
  const [plan, setPlan] = useState('free')

  // ── Booking fields state ──
  const [fields, setFields] = useState<BookingField[]>([])
  const [services, setServices] = useState<{ id: string; name: string }[]>([])
  const [fieldsLoading, setFieldsLoading] = useState(true)
  const [fieldsSaving, setFieldsSaving] = useState(false)
  const [fieldsSuccess, setFieldsSuccess] = useState(false)
  const [newLabel, setNewLabel] = useState('')
  const [newRequired, setNewRequired] = useState(false)
  const [newServiceIds, setNewServiceIds] = useState<string[]>([])

  // ── Email state ──
  const [emailLoaded, setEmailLoaded] = useState(false)
  const [emailTab, setEmailTab] = useState<EmailTab>('template')
  const [fromName, setFromName] = useState('CLERICITY')
  const [fromNameSaving, setFromNameSaving] = useState(false)
  const [fromNameSuccess, setFromNameSuccess] = useState(false)
  const [emailSubject, setEmailSubject] = useState('✅ Foglalás visszaigazolása — {businessName}')
  const [emailBody, setEmailBody] = useState(DEFAULT_BODY)
  const [cancelSubject, setCancelSubject] = useState('❌ Foglalás lemondva — {businessName}')
  const [cancelBody, setCancelBody] = useState(DEFAULT_CANCEL_BODY)
  const [rescheduleSubject, setRescheduleSubject] = useState('🔄 Foglalás átütemezve — {businessName}')
  const [rescheduleBody, setRescheduleBody] = useState(DEFAULT_RESCHEDULE_BODY)
  const [waitlistSubject, setWaitlistSubject] = useState('🎉 Szabad időpont nyílt meg — {businessName}')
  const [waitlistBody, setWaitlistBody] = useState('Kedves {customerName}!\n\nÖrömmel értesítünk, hogy szabad időpont nyílt meg a {businessName} naptárában!\n\nSiess, foglald le mielőtt elfogy!\n\nÜdvözlettel,\n{businessName}')
  const [reminderSubject, setReminderSubject] = useState('👋 Rég látogattál meg minket — {businessName}')
  const [reminderBody, setReminderBody] = useState(DEFAULT_REMINDER_BODY)
  const [expandedCard, setExpandedCard] = useState<string | null>(null)
  const [cardSaving, setCardSaving] = useState<string | null>(null)
  const [cardSuccess, setCardSuccess] = useState<string | null>(null)
  const [automations, setAutomations] = useState<Automation[]>([])
  const [editingAuto, setEditingAuto] = useState<(Automation & { id?: string }) | null>(null)
  const [showNewAutoForm, setShowNewAutoForm] = useState(false)
  const [newAuto, setNewAuto] = useState({ name: '', trigger_type: 'booking_confirmed', trigger_delay_minutes: 0, subject: '', body: '', enabled: true })
  const [autoSaving, setAutoSaving] = useState(false)

  // ── Init ──
  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/auth'); return }

      const { data: profile } = await supabase
        .from('profiles').select('tenant_id').eq('id', user.id).single()
      if (!profile?.tenant_id) return
      setTenantId(profile.tenant_id)

      const [tenantRes, fieldsRes, servicesRes] = await Promise.all([
        supabase.from('tenants').select('plan').eq('id', profile.tenant_id).single(),
        supabase.from('booking_fields').select('*').eq('tenant_id', profile.tenant_id).order('order_index', { ascending: true }),
        supabase.from('services').select('id, name').eq('tenant_id', profile.tenant_id),
      ])

      setPlan(tenantRes.data?.plan || 'free')
      setServices(servicesRes.data || [])

      if (fieldsRes.data && fieldsRes.data.length > 0) {
        setFields(fieldsRes.data)
      } else {
        const inserts = DEFAULT_FIELDS.map(f => ({ ...f, tenant_id: profile.tenant_id }))
        const { data: newFields } = await supabase.from('booking_fields').insert(inserts).select()
        setFields(newFields || [])
      }
      setFieldsLoading(false)
    }
    init()
  }, [router])

  // ── Load email (lazy) ──
  const loadEmail = useCallback(async () => {
    if (emailLoaded || !tenantId) return
    const [tenantRes, autoRes] = await Promise.all([
      supabase.from('tenants').select('email_subject, email_body, email_from_name, cancel_email_subject, cancel_email_body, reschedule_email_subject, reschedule_email_body, waitlist_email_subject, waitlist_email_body, reminder_email_subject, reminder_email_body').eq('id', tenantId).single(),
      supabase.from('email_automations').select('*').eq('tenant_id', tenantId).order('created_at', { ascending: true }),
    ])
    const td = tenantRes.data
    if (td) {
      setFromName(td.email_from_name || 'CLERICITY')
      setEmailSubject(td.email_subject || '✅ Foglalás visszaigazolása — {businessName}')
      setEmailBody(td.email_body || DEFAULT_BODY)
      setCancelSubject(td.cancel_email_subject || '❌ Foglalás lemondva — {businessName}')
      setCancelBody(td.cancel_email_body || DEFAULT_CANCEL_BODY)
      setRescheduleSubject(td.reschedule_email_subject || '🔄 Foglalás átütemezve — {businessName}')
      setRescheduleBody(td.reschedule_email_body || DEFAULT_RESCHEDULE_BODY)
      if (td.waitlist_email_subject) setWaitlistSubject(td.waitlist_email_subject)
      if (td.waitlist_email_body) setWaitlistBody(td.waitlist_email_body)
      if (td.reminder_email_subject) setReminderSubject(td.reminder_email_subject)
      if (td.reminder_email_body) setReminderBody(td.reminder_email_body)
    }
    setAutomations(autoRes.data || [])
    setEmailLoaded(true)
  }, [emailLoaded, tenantId])

  useEffect(() => {
    if (pageTab !== 'email') return
    const run = async () => { await loadEmail() }
    run()
  }, [pageTab, loadEmail])

  // ── Booking field handlers ──
  const handleToggleEnabled = async (id: string, enabled: boolean) => {
    await supabase.from('booking_fields').update({ enabled }).eq('id', id)
    setFields(fields.map(f => f.id === id ? { ...f, enabled } : f))
  }

  const handleToggleRequired = async (id: string, required: boolean) => {
    await supabase.from('booking_fields').update({ required }).eq('id', id)
    setFields(fields.map(f => f.id === id ? { ...f, required } : f))
  }

  const handleLabelChange = (id: string, label: string) => {
    setFields(fields.map(f => f.id === id ? { ...f, label } : f))
  }

  const handleSaveLabel = async (id: string, label: string) => {
    await supabase.from('booking_fields').update({ label }).eq('id', id)
  }

  const handleAddCustom = async () => {
    if (!tenantId || !newLabel.trim()) return
    setFieldsSaving(true)
    const { data } = await supabase.from('booking_fields').insert({
      tenant_id: tenantId, field_type: 'custom', label: newLabel,
      required: newRequired, enabled: true, order_index: fields.length,
      service_ids: newServiceIds.length > 0 ? newServiceIds : null,
    }).select().single()
    if (data) {
      setFields([...fields, data])
      setNewLabel(''); setNewRequired(false); setNewServiceIds([])
      setFieldsSuccess(true); setTimeout(() => setFieldsSuccess(false), 2000)
    }
    setFieldsSaving(false)
  }

  const handleDeleteField = async (id: string) => {
    await supabase.from('booking_fields').delete().eq('id', id)
    setFields(fields.filter(f => f.id !== id))
  }

  const getFieldIcon = (type: string) => {
    switch (type) {
      case 'first_name': case 'last_name': return '👤'
      case 'email': return '📧'
      case 'phone': return '📞'
      default: return '❓'
    }
  }

  // ── Email handlers ──
  const handleSaveFromName = async () => {
    if (!tenantId) return
    setFromNameSaving(true); setFromNameSuccess(false)
    await supabase.from('tenants').update({ email_from_name: fromName }).eq('id', tenantId)
    setFromNameSaving(false); setFromNameSuccess(true)
    setTimeout(() => setFromNameSuccess(false), 2500)
  }

  const handleSaveEmailCard = async (type: 'confirmation' | 'cancel' | 'reschedule' | 'waitlist' | 'reminder') => {
    if (!tenantId) return
    setCardSaving(type); setCardSuccess(null)
    const updates =
      type === 'confirmation' ? { email_subject: emailSubject, email_body: emailBody, email_from_name: fromName } :
      type === 'cancel'       ? { cancel_email_subject: cancelSubject, cancel_email_body: cancelBody } :
      type === 'reschedule'   ? { reschedule_email_subject: rescheduleSubject, reschedule_email_body: rescheduleBody } :
      type === 'reminder'     ? { reminder_email_subject: reminderSubject, reminder_email_body: reminderBody } :
                                { waitlist_email_subject: waitlistSubject, waitlist_email_body: waitlistBody }
    await supabase.from('tenants').update(updates).eq('id', tenantId)
    setCardSaving(null); setCardSuccess(type)
    setTimeout(() => setCardSuccess(null), 2500)
  }

  const handleAddAutomation = async () => {
    if (!tenantId || !newAuto.name || !newAuto.subject || !newAuto.body) return
    setAutoSaving(true)
    const { data } = await supabase.from('email_automations').insert({ ...newAuto, tenant_id: tenantId }).select().single()
    if (data) { setAutomations([...automations, data]); setShowNewAutoForm(false); setNewAuto({ name: '', trigger_type: 'booking_confirmed', trigger_delay_minutes: 0, subject: '', body: '', enabled: true }) }
    setAutoSaving(false)
  }

  const handleUpdateAutomation = async () => {
    if (!editingAuto?.id) return
    setAutoSaving(true)
    await supabase.from('email_automations').update({ name: editingAuto.name, trigger_type: editingAuto.trigger_type, trigger_delay_minutes: editingAuto.trigger_delay_minutes, subject: editingAuto.subject, body: editingAuto.body, enabled: editingAuto.enabled }).eq('id', editingAuto.id)
    setAutomations(automations.map(a => a.id === editingAuto.id ? { ...a, ...editingAuto } : a))
    setEditingAuto(null); setAutoSaving(false)
  }

  const handleToggleAutomation = async (id: string, enabled: boolean) => {
    await supabase.from('email_automations').update({ enabled }).eq('id', id)
    setAutomations(automations.map(a => a.id === id ? { ...a, enabled } : a))
  }

  const handleDeleteAutomation = async (id: string) => {
    await supabase.from('email_automations').delete().eq('id', id)
    setAutomations(automations.filter(a => a.id !== id))
  }

  const handleTemplateToggle = async (template: typeof EMAIL_TEMPLATES[0]) => {
    if (!tenantId) return
    const existing = automations.find(a => a.name === template.name)
    if (existing) {
      await supabase.from('email_automations').update({ enabled: !existing.enabled }).eq('id', existing.id)
      setAutomations(automations.map(a => a.id === existing.id ? { ...a, enabled: !existing.enabled } : a))
    } else {
      const { data } = await supabase.from('email_automations').insert({ tenant_id: tenantId, name: template.name, trigger_type: template.trigger_type, trigger_delay_minutes: template.trigger_delay_minutes, subject: template.subject, body: template.body, enabled: true }).select().single()
      if (data) setAutomations([...automations, data])
    }
  }

  const getDelayLabel = (minutes: number, triggerType: string) => {
    if (triggerType === 'booking_confirmed') {
      if (minutes === 0) return t.dash.delay_immediately
      if (minutes < 60) return `${minutes} ${t.dash.delay_min} ${t.dash.delay_booking_delay}`
      return `${Math.floor(minutes / 60)} ${t.dash.delay_hr} ${t.dash.delay_booking_delay}`
    }
    const suffix = triggerType === 'before_appointment' ? t.dash.delay_before : t.dash.delay_after_word
    if (minutes < 60) return `${minutes} ${t.dash.delay_min} ${suffix}`
    if (minutes < 1440) return `${Math.floor(minutes / 60)} ${t.dash.delay_hr} ${suffix}`
    return `${Math.floor(minutes / 1440)} ${t.dash.delay_day} ${suffix}`
  }

  // ─── Render ───────────────────────────────────────────────────────────────────

  return (
    <div>
      {/* Fejléc */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
        <button
          onClick={() => router.push('/dashboard/bookings')}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280', fontSize: '0.875rem' }}
        >
          ← Vissza
        </button>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#111827' }}>⚙️ Foglalási beállítások</h1>
      </div>

      {/* Fő tab sor */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.75rem' }}>
        {[
          { key: 'fields' as PageTab, label: '📋 Foglalási mezők' },
          { key: 'email' as PageTab, label: '📧 Email beállítások' },
        ].map(tb => (
          <button key={tb.key} onClick={() => setPageTab(tb.key)}
            style={{ padding: '0.5rem 1.25rem', borderRadius: '8px', border: '2px solid', borderColor: pageTab === tb.key ? '#2563eb' : '#e5e7eb', backgroundColor: pageTab === tb.key ? '#eff6ff' : 'white', color: pageTab === tb.key ? '#2563eb' : '#6b7280', cursor: 'pointer', fontWeight: pageTab === tb.key ? '700' : '400', fontSize: '0.875rem' }}
          >{tb.label}</button>
        ))}
      </div>

      {/* ══════════════ FOGLALÁSI MEZŐK ══════════════ */}
      {pageTab === 'fields' && (
        <div>
          {fieldsLoading ? <p style={{ color: '#6b7280' }}>Betöltés...</p> : (
            <>
              <p style={{ color: '#6b7280', fontSize: '0.875rem', marginBottom: '2rem' }}>
                Add meg hogy milyen adatokat kérj be a vendégtől foglaláskor.
              </p>

              {/* Alap mezők */}
              <div style={{ backgroundColor: 'white', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', marginBottom: '1.5rem', maxWidth: '650px' }}>
                <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid #f3f4f6' }}>
                  <h2 style={{ fontSize: '0.9rem', fontWeight: '700', color: '#111827' }}>Alap mezők</h2>
                </div>
                {!isMobile && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '0.5rem 1.5rem', borderBottom: '1px solid #f3f4f6' }}>
                    <div style={{ flex: 1, fontSize: '0.75rem', fontWeight: '600', color: '#9ca3af', textTransform: 'uppercase' }}>Mező neve</div>
                    <div style={{ width: '80px', fontSize: '0.75rem', fontWeight: '600', color: '#9ca3af', textTransform: 'uppercase', textAlign: 'center' }}>Aktív</div>
                    <div style={{ width: '80px', fontSize: '0.75rem', fontWeight: '600', color: '#9ca3af', textTransform: 'uppercase', textAlign: 'center' }}>Kötelező</div>
                  </div>
                )}
                {fields.filter(f => f.field_type !== 'custom').map(field => (
                  <div key={field.id} style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', alignItems: isMobile ? 'stretch' : 'center', gap: isMobile ? '0.5rem' : '1rem', padding: isMobile ? '0.75rem 1rem' : '0.875rem 1.5rem', borderBottom: '1px solid #f9fafb' }}>
                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <span style={{ fontSize: '1.25rem' }}>{getFieldIcon(field.field_type)}</span>
                      <input type="text" value={field.label} onChange={e => handleLabelChange(field.id, e.target.value)} onBlur={e => handleSaveLabel(field.id, e.target.value)}
                        style={{ border: '1px solid #e5e7eb', borderRadius: '6px', padding: '0.375rem 0.75rem', color: '#111827', outline: 'none', fontSize: '0.875rem', flex: 1, minWidth: 0 }} />
                    </div>
                    <div style={{ display: 'flex', gap: '1rem', paddingLeft: isMobile ? '2rem' : undefined }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: isMobile ? 1 : undefined, justifyContent: isMobile ? undefined : 'center', width: isMobile ? undefined : '80px' }}>
                        {isMobile && <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>Aktív</span>}
                        <button onClick={() => handleToggleEnabled(field.id, !field.enabled)}
                          style={{ width: '44px', height: '24px', borderRadius: '12px', border: 'none', backgroundColor: field.enabled ? '#22c55e' : '#d1d5db', cursor: 'pointer', position: 'relative', flexShrink: 0 }}>
                          <div style={{ position: 'absolute', top: '2px', left: field.enabled ? '22px' : '2px', width: '20px', height: '20px', borderRadius: '50%', backgroundColor: 'white', transition: 'left 0.2s' }} />
                        </button>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: isMobile ? 1 : undefined, justifyContent: isMobile ? undefined : 'center', width: isMobile ? undefined : '80px' }}>
                        {isMobile && <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>Kötelező</span>}
                        <button onClick={() => handleToggleRequired(field.id, !field.required)} disabled={!field.enabled}
                          style={{ width: '44px', height: '24px', borderRadius: '12px', border: 'none', backgroundColor: field.required && field.enabled ? '#2563eb' : '#d1d5db', cursor: field.enabled ? 'pointer' : 'not-allowed', position: 'relative', opacity: field.enabled ? 1 : 0.5, flexShrink: 0 }}>
                          <div style={{ position: 'absolute', top: '2px', left: field.required && field.enabled ? '22px' : '2px', width: '20px', height: '20px', borderRadius: '50%', backgroundColor: 'white', transition: 'left 0.2s' }} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Egyéni kérdések */}
              <div style={{ backgroundColor: 'white', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', marginBottom: '1.5rem', maxWidth: '650px' }}>
                <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid #f3f4f6' }}>
                  <h2 style={{ fontSize: '0.9rem', fontWeight: '700', color: '#111827' }}>Egyéni kérdések</h2>
                  <p style={{ fontSize: '0.8rem', color: '#6b7280', marginTop: '0.25rem' }}>pl. Hány éves a gyerek? Van-e allergiája?</p>
                </div>

                {fields.filter(f => f.field_type === 'custom').length === 0 ? (
                  <div style={{ padding: '1.5rem', textAlign: 'center', color: '#9ca3af', fontSize: '0.875rem' }}>
                    Még nincs egyéni kérdés hozzáadva.
                  </div>
                ) : fields.filter(f => f.field_type === 'custom').map(field => (
                  <div key={field.id} style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', alignItems: isMobile ? 'stretch' : 'center', gap: isMobile ? '0.5rem' : '1rem', padding: isMobile ? '0.75rem 1rem' : '0.875rem 1.5rem', borderBottom: '1px solid #f9fafb' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.25rem' }}>
                        <span style={{ fontSize: '1.25rem' }}>❓</span>
                        <input type="text" value={field.label} onChange={e => handleLabelChange(field.id, e.target.value)} onBlur={e => handleSaveLabel(field.id, e.target.value)}
                          style={{ border: '1px solid #e5e7eb', borderRadius: '6px', padding: '0.375rem 0.75rem', color: '#111827', outline: 'none', fontSize: '0.875rem', flex: 1, minWidth: 0 }} />
                      </div>
                      {field.service_ids && field.service_ids.length > 0 && (
                        <p style={{ fontSize: '0.75rem', color: '#6b7280', marginLeft: '2rem' }}>
                          🔗 {services.filter(s => field.service_ids?.includes(s.id)).map(s => s.name).join(', ')}
                        </p>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: '1rem', paddingLeft: isMobile ? '2rem' : undefined, alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: isMobile ? 1 : undefined, width: isMobile ? undefined : '80px', justifyContent: isMobile ? undefined : 'center' }}>
                        {isMobile && <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>Aktív</span>}
                        <button onClick={() => handleToggleEnabled(field.id, !field.enabled)}
                          style={{ width: '44px', height: '24px', borderRadius: '12px', border: 'none', backgroundColor: field.enabled ? '#22c55e' : '#d1d5db', cursor: 'pointer', position: 'relative', flexShrink: 0 }}>
                          <div style={{ position: 'absolute', top: '2px', left: field.enabled ? '22px' : '2px', width: '20px', height: '20px', borderRadius: '50%', backgroundColor: 'white', transition: 'left 0.2s' }} />
                        </button>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: isMobile ? 1 : undefined, width: isMobile ? undefined : '80px', justifyContent: isMobile ? undefined : 'center' }}>
                        {isMobile && <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>Kötelező</span>}
                        <button onClick={() => handleToggleRequired(field.id, !field.required)} disabled={!field.enabled}
                          style={{ width: '44px', height: '24px', borderRadius: '12px', border: 'none', backgroundColor: field.required && field.enabled ? '#2563eb' : '#d1d5db', cursor: field.enabled ? 'pointer' : 'not-allowed', position: 'relative', opacity: field.enabled ? 1 : 0.5, flexShrink: 0 }}>
                          <div style={{ position: 'absolute', top: '2px', left: field.required && field.enabled ? '22px' : '2px', width: '20px', height: '20px', borderRadius: '50%', backgroundColor: 'white', transition: 'left 0.2s' }} />
                        </button>
                      </div>
                      <button onClick={() => handleDeleteField(field.id)}
                        style={{ backgroundColor: '#fee2e2', color: '#ef4444', border: 'none', borderRadius: '6px', padding: '0.375rem 0.625rem', cursor: 'pointer', fontSize: '0.8rem', flexShrink: 0 }}>🗑️</button>
                    </div>
                  </div>
                ))}

                {/* Új egyéni kérdés */}
                <div style={{ padding: '1.25rem 1.5rem', backgroundColor: '#f9fafb', borderTop: '1px solid #f3f4f6', borderRadius: '0 0 12px 12px' }}>
                  <p style={{ fontSize: '0.8rem', fontWeight: '600', color: '#374151', marginBottom: '0.75rem' }}>Új kérdés hozzáadása</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    <input type="text" value={newLabel} onChange={e => setNewLabel(e.target.value)}
                      style={{ width: '100%', border: '1px solid #d1d5db', borderRadius: '8px', padding: '0.625rem 1rem', color: '#111827', outline: 'none', boxSizing: 'border-box', fontSize: '0.875rem' }}
                      placeholder="pl. Hány éves a gyerek?" />
                    {services.length > 0 && (
                      <div>
                        <p style={{ fontSize: '0.8rem', fontWeight: '500', color: '#374151', marginBottom: '0.4rem' }}>Melyik szolgáltatásnál jelenjen meg? (ha nem választasz, mindegyiknél megjelenik)</p>
                        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                          {services.map(service => (
                            <button key={service.id}
                              onClick={() => setNewServiceIds(prev => prev.includes(service.id) ? prev.filter(id => id !== service.id) : [...prev, service.id])}
                              style={{ padding: '0.375rem 0.875rem', borderRadius: '8px', border: '2px solid', borderColor: newServiceIds.includes(service.id) ? '#2563eb' : '#e5e7eb', backgroundColor: newServiceIds.includes(service.id) ? '#eff6ff' : 'white', color: newServiceIds.includes(service.id) ? '#2563eb' : '#6b7280', cursor: 'pointer', fontSize: '0.8rem', fontWeight: newServiceIds.includes(service.id) ? '600' : '400' }}>
                              {newServiceIds.includes(service.id) ? '✓ ' : ''}{service.name}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <button onClick={() => setNewRequired(!newRequired)}
                          style={{ width: '44px', height: '24px', borderRadius: '12px', border: 'none', backgroundColor: newRequired ? '#2563eb' : '#d1d5db', cursor: 'pointer', position: 'relative' }}>
                          <div style={{ position: 'absolute', top: '2px', left: newRequired ? '22px' : '2px', width: '20px', height: '20px', borderRadius: '50%', backgroundColor: 'white', transition: 'left 0.2s' }} />
                        </button>
                        <span style={{ fontSize: '0.8rem', color: '#6b7280' }}>Kötelező</span>
                      </div>
                      <button onClick={handleAddCustom} disabled={fieldsSaving || !newLabel.trim()}
                        style={{ backgroundColor: !newLabel.trim() ? '#e5e7eb' : '#2563eb', color: !newLabel.trim() ? '#9ca3af' : 'white', padding: '0.625rem 1.25rem', borderRadius: '8px', border: 'none', cursor: !newLabel.trim() ? 'not-allowed' : 'pointer', fontWeight: '600', fontSize: '0.875rem' }}>
                        {fieldsSaving ? 'Mentés...' : '➕ Hozzáadás'}
                      </button>
                    </div>
                    {fieldsSuccess && <p style={{ color: '#22c55e', fontSize: '0.8rem' }}>✅ Kérdés hozzáadva!</p>}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ══════════════ EMAIL BEÁLLÍTÁSOK ══════════════ */}
      {pageTab === 'email' && (
        <div style={{ position: 'relative' }}>
          {/* Plan lock overlay */}
          {plan === 'free' && (
            <div style={{ position: 'absolute', inset: 0, zIndex: 20, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start', paddingTop: '3rem', pointerEvents: 'auto' }}>
              <div style={{ backgroundColor: 'white', borderRadius: '16px', padding: '2rem 2.5rem', boxShadow: '0 8px 32px rgba(0,0,0,0.15)', border: '2px solid #fde68a', textAlign: 'center', maxWidth: '400px', width: '100%' }}>
                <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>🔒</div>
                <h3 style={{ fontSize: '1.1rem', fontWeight: '800', color: '#0f172a', marginBottom: '0.5rem' }}>{t.dash.email_lock_title}</h3>
                <p style={{ fontSize: '0.875rem', color: '#6b7280', lineHeight: 1.6, marginBottom: '1.25rem' }}>{t.dash.email_lock_desc}</p>
                <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center', flexWrap: 'wrap', marginBottom: '1rem' }}>
                  <span style={{ backgroundColor: '#fef3c7', color: '#92400e', fontSize: '0.78rem', fontWeight: '700', padding: '0.25rem 0.75rem', borderRadius: '999px', border: '1px solid #fde68a' }}>{t.dash.email_free_badge_default}</span>
                  <span style={{ backgroundColor: '#dbeafe', color: '#1d4ed8', fontSize: '0.78rem', fontWeight: '700', padding: '0.25rem 0.75rem', borderRadius: '999px', border: '1px solid #bfdbfe' }}>{t.dash.email_free_badge_custom}</span>
                </div>
                <p style={{ fontSize: '0.78rem', color: '#9ca3af' }}>{t.dash.email_lock_preview}</p>
              </div>
            </div>
          )}

          <div style={{ opacity: plan === 'free' ? 0.35 : 1, pointerEvents: plan === 'free' ? 'none' : 'auto', filter: plan === 'free' ? 'blur(1px)' : 'none' }}>
            {/* Sub-tabok */}
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem' }}>
              {[
                { key: 'template' as EmailTab, label: t.dash.email_subtab_templates },
                { key: 'automations' as EmailTab, label: t.dash.email_subtab_automations },
              ].map(tb => (
                <button key={tb.key} onClick={() => setEmailTab(tb.key)}
                  style={{ padding: '0.5rem 1.25rem', borderRadius: '8px', border: '2px solid', borderColor: emailTab === tb.key ? '#2563eb' : '#e5e7eb', backgroundColor: emailTab === tb.key ? '#eff6ff' : 'white', color: emailTab === tb.key ? '#2563eb' : '#6b7280', cursor: 'pointer', fontWeight: emailTab === tb.key ? '700' : '400', fontSize: '0.875rem' }}>
                  {tb.label}
                </button>
              ))}
            </div>

            {/* Változók */}
            <div style={{ backgroundColor: '#eff6ff', padding: '1rem 1.25rem', borderRadius: '12px', border: '1px solid #bfdbfe', marginBottom: '1.5rem', maxWidth: '650px' }}>
              <p style={{ fontSize: '0.8rem', fontWeight: '700', color: '#1d4ed8', marginBottom: '0.5rem' }}>{t.dash.email_variables_title}</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                {EMAIL_VARIABLES.map(v => (
                  <div key={v.var} style={{ backgroundColor: 'white', padding: '0.25rem 0.625rem', borderRadius: '6px', border: '1px solid #bfdbfe' }}>
                    <span style={{ fontFamily: 'monospace', color: '#2563eb', fontSize: '0.75rem', fontWeight: '600' }}>{v.var}</span>
                    <span style={{ color: '#6b7280', fontSize: '0.7rem', marginLeft: '0.4rem' }}>= {v.desc}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* ── EMAIL SABLONOK ── */}
            {emailTab === 'template' && (
              <div style={{ maxWidth: '650px' }}>
                {/* Feladó neve */}
                <div style={{ backgroundColor: 'white', padding: '1.25rem 1.5rem', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', marginBottom: '1rem' }}>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '600', color: '#374151', marginBottom: '0.4rem' }}>{t.dash.email_from_label}</label>
                  <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                    <input type="text" value={fromName} onChange={e => setFromName(e.target.value)}
                      style={{ flex: 1, minWidth: 0, border: '1px solid #d1d5db', borderRadius: '8px', padding: '0.5rem 0.875rem', color: '#111827', outline: 'none', fontSize: '0.875rem' }}
                      placeholder="pl. Kovács Fodrászat" />
                    <button
                      onClick={handleSaveFromName}
                      disabled={fromNameSaving}
                      style={{ flexShrink: 0, backgroundColor: fromNameSuccess ? '#22c55e' : '#2563eb', color: 'white', padding: '0.5rem 1.25rem', borderRadius: '8px', border: 'none', cursor: 'pointer', fontWeight: '600', fontSize: '0.875rem', whiteSpace: 'nowrap', opacity: fromNameSaving ? 0.5 : 1, transition: 'background-color 0.2s' }}
                    >
                      {fromNameSuccess ? '✅ Mentve!' : fromNameSaving ? 'Mentés...' : '💾 Mentés'}
                    </button>
                  </div>
                </div>

                {([
                  { key: 'confirmation', icon: '✅', title: t.dash.email_tpl_confirmation, desc: t.dash.email_tpl_confirmation_desc, subjectVal: emailSubject, setSubjectFn: setEmailSubject, bodyVal: emailBody, setBodyFn: setEmailBody, defaultSubject: '✅ Foglalás visszaigazolása — {businessName}', defaultBody: DEFAULT_BODY },
                  { key: 'cancel', icon: '❌', title: t.dash.email_tpl_cancel, desc: t.dash.email_tpl_cancel_desc, subjectVal: cancelSubject, setSubjectFn: setCancelSubject, bodyVal: cancelBody, setBodyFn: setCancelBody, defaultSubject: '❌ Foglalás lemondva — {businessName}', defaultBody: DEFAULT_CANCEL_BODY },
                  { key: 'reschedule', icon: '🔄', title: t.dash.email_tpl_reschedule, desc: t.dash.email_tpl_reschedule_desc, subjectVal: rescheduleSubject, setSubjectFn: setRescheduleSubject, bodyVal: rescheduleBody, setBodyFn: setRescheduleBody, defaultSubject: '🔄 Foglalás átütemezve — {businessName}', defaultBody: DEFAULT_RESCHEDULE_BODY },
                  { key: 'waitlist', icon: '📋', title: t.dash.email_tpl_waitlist, desc: t.dash.email_tpl_waitlist_desc, subjectVal: waitlistSubject, setSubjectFn: setWaitlistSubject, bodyVal: waitlistBody, setBodyFn: setWaitlistBody, defaultSubject: '🎉 Szabad időpont nyílt meg — {businessName}', defaultBody: 'Kedves {customerName}!\n\nÖrömmel értesítünk, hogy szabad időpont nyílt meg a {businessName} naptárában!\n\nSiess, foglald le mielőtt elfogy!\n\nÜdvözlettel,\n{businessName}' },
                  { key: 'reminder', icon: '🔔', title: 'Ügyfél emlékeztető', desc: 'Kézzel küldhető emlékeztető régi ügyfeleknek az Ügyfelek fülről', subjectVal: reminderSubject, setSubjectFn: setReminderSubject, bodyVal: reminderBody, setBodyFn: setReminderBody, defaultSubject: '👋 Rég látogattál meg minket — {businessName}', defaultBody: DEFAULT_REMINDER_BODY },
                ] as const).map(card => {
                  const isOpen = expandedCard === card.key
                  const isSaving = cardSaving === card.key
                  const isSuccess = cardSuccess === card.key
                  return (
                    <div key={card.key} style={{ backgroundColor: 'white', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', marginBottom: '0.75rem', overflow: 'hidden' }}>
                      <div onClick={() => setExpandedCard(isOpen ? null : card.key)} style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '1rem 1.25rem', cursor: 'pointer', userSelect: 'none' }}>
                        <span style={{ fontSize: '1.5rem', flexShrink: 0 }}>{card.icon}</span>
                        <div style={{ flex: 1 }}>
                          <p style={{ fontWeight: '700', color: '#111827', fontSize: '0.95rem', marginBottom: '0.15rem' }}>{card.title}</p>
                          <p style={{ fontSize: '0.8rem', color: '#6b7280' }}>{card.desc}</p>
                        </div>
                        {isSuccess && <span style={{ fontSize: '0.8rem', color: '#22c55e', fontWeight: '600' }}>{t.dash.email_card_saved}</span>}
                        <span style={{ color: '#9ca3af', fontSize: '1rem', fontWeight: '700', transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', flexShrink: 0 }}>▼</span>
                      </div>
                      {isOpen && (
                        <div style={{ padding: '0 1.25rem 1.25rem', borderTop: '1px solid #f3f4f6' }}>
                          <div style={{ marginTop: '1rem', marginBottom: '0.875rem' }}>
                            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '600', color: '#374151', marginBottom: '0.4rem' }}>{t.dash.email_subject_label}</label>
                            <input type="text" value={card.subjectVal} onChange={e => card.setSubjectFn(e.target.value)}
                              style={{ width: '100%', border: '1px solid #d1d5db', borderRadius: '8px', padding: '0.5rem 0.875rem', color: '#111827', outline: 'none', boxSizing: 'border-box', fontSize: '0.875rem' }} />
                          </div>
                          <div style={{ marginBottom: '1rem' }}>
                            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '600', color: '#374151', marginBottom: '0.4rem' }}>{t.dash.email_body_label}</label>
                            <RichTextEditor value={card.bodyVal} onChange={card.setBodyFn} rows={10} />
                          </div>
                          <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: '0.75rem' }}>
                            <button onClick={() => handleSaveEmailCard(card.key as 'confirmation' | 'cancel' | 'reschedule' | 'waitlist')} disabled={isSaving}
                              style={{ backgroundColor: '#2563eb', color: 'white', padding: '0.625rem 1.5rem', borderRadius: '8px', border: 'none', cursor: 'pointer', fontWeight: '600', fontSize: '0.875rem', opacity: isSaving ? 0.5 : 1 }}>
                              {isSaving ? t.dash.saving : `💾 ${t.dash.save_btn}`}
                            </button>
                            <button onClick={() => { card.setSubjectFn(card.defaultSubject); card.setBodyFn(card.defaultBody) }}
                              style={{ backgroundColor: '#f3f4f6', color: '#374151', padding: '0.625rem 1.25rem', borderRadius: '8px', border: '1px solid #e5e7eb', cursor: 'pointer', fontWeight: '500', fontSize: '0.875rem' }}>
                              {t.dash.email_reset_btn}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}

            {/* ── AUTOMATIZÁCIÓK ── */}
            {emailTab === 'automations' && (
              <div style={{ maxWidth: '650px' }}>
                <p style={{ fontSize: '0.75rem', fontWeight: '700', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.75rem' }}>{t.dash.auto_quick_title}</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '2rem' }}>
                  {EMAIL_TEMPLATES.map(template => {
                    const existing = automations.find(a => a.name === template.name)
                    const isEnabled = existing?.enabled ?? false
                    return (
                      <div key={template.key} style={{ backgroundColor: 'white', borderRadius: '12px', padding: isMobile ? '0.875rem 1rem' : '1rem 1.25rem', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', border: isEnabled ? '2px solid #22c55e' : '2px solid transparent', display: 'flex', flexDirection: isMobile ? 'column' : 'row', alignItems: isMobile ? 'stretch' : 'center', gap: '0.75rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flex: 1 }}>
                          <div style={{ fontSize: '1.75rem', flexShrink: 0 }}>{template.icon}</div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{ fontWeight: '700', color: '#111827', fontSize: '0.95rem', marginBottom: '0.2rem' }}>
                              {existing && (template.key === '24h-reminder' || template.key === 'follow-up')
                                ? template.key === '24h-reminder'
                                  ? `${getDelayLabel(existing.trigger_delay_minutes, existing.trigger_type)} ${t.dash.auto_reminder_suffix}`
                                  : `${getDelayLabel(existing.trigger_delay_minutes, existing.trigger_type)} ${t.dash.auto_followup_suffix}`
                                : template.key === '24h-reminder' ? t.dash.auto_reminder_suffix : t.dash.auto_followup_suffix}
                            </p>
                            <p style={{ fontSize: '0.8rem', color: '#6b7280' }}>
                              {existing && (template.key === '24h-reminder' || template.key === 'follow-up')
                                ? existing.trigger_type === 'before_appointment'
                                  ? `${getDelayLabel(existing.trigger_delay_minutes, existing.trigger_type)} ${t.dash.auto_sends_before}`
                                  : existing.trigger_type === 'after_appointment'
                                    ? `${getDelayLabel(existing.trigger_delay_minutes, existing.trigger_type)} ${t.dash.auto_sends_after_appt}`
                                    : `${getDelayLabel(existing.trigger_delay_minutes, existing.trigger_type)} ${t.dash.auto_sends_after_booking}`
                                : template.key === '24h-reminder' ? t.dash.auto_template_24h_desc : t.dash.auto_template_followup_desc}
                            </p>
                            {existing && <p style={{ fontSize: '0.75rem', color: '#9ca3af', marginTop: '0.2rem' }}>📧 {existing.subject}</p>}
                          </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
                          <button
                            onClick={() => {
                              setShowNewAutoForm(false)
                              if (existing) {
                                setEditingAuto(existing)
                              } else {
                                setEditingAuto(null)
                                setNewAuto({ name: template.name, trigger_type: template.trigger_type, trigger_delay_minutes: template.trigger_delay_minutes, subject: template.subject, body: template.body, enabled: true })
                                setShowNewAutoForm(true)
                              }
                              if (isMobile) setTimeout(() => autoFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100)
                            }}
                            style={{ backgroundColor: '#eff6ff', color: '#2563eb', border: 'none', borderRadius: '8px', padding: '0.375rem 0.75rem', cursor: 'pointer', fontSize: '0.8rem', fontWeight: '600', flex: isMobile ? 1 : undefined }}>
                            {t.dash.auto_edit_btn}
                          </button>
                          <button onClick={() => handleTemplateToggle(template)} style={{ width: '44px', height: '24px', borderRadius: '12px', border: 'none', backgroundColor: isEnabled ? '#22c55e' : '#d1d5db', cursor: 'pointer', position: 'relative', flexShrink: 0 }}>
                            <div style={{ position: 'absolute', top: '2px', left: isEnabled ? '22px' : '2px', width: '20px', height: '20px', borderRadius: '50%', backgroundColor: 'white', transition: 'left 0.2s' }} />
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                  <p style={{ fontSize: '0.75rem', fontWeight: '700', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{t.dash.auto_custom_title}</p>
                  <button onClick={() => { setShowNewAutoForm(true); setEditingAuto(null) }}
                    style={{ backgroundColor: '#2563eb', color: 'white', padding: '0.375rem 1rem', borderRadius: '8px', border: 'none', cursor: 'pointer', fontWeight: '600', fontSize: '0.8rem' }}>
                    {t.dash.auto_new_btn}
                  </button>
                </div>

                {(showNewAutoForm || editingAuto) && (
                  <div ref={autoFormRef} style={{ backgroundColor: '#f8fafc', borderRadius: '12px', padding: '1.25rem', border: '1px solid #e5e7eb', marginBottom: '1rem' }}>
                    {(['name', 'subject'] as const)
                      .filter(field => !(field === 'name' && TEMPLATE_NAMES.has((editingAuto || newAuto).name)))
                      .map(field => (
                        <div key={field} style={{ marginBottom: '0.875rem' }}>
                          <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '600', color: '#374151', marginBottom: '0.4rem' }}>{field === 'name' ? t.dash.auto_name_label : t.dash.email_subject_label}</label>
                          <input type="text" value={(editingAuto || newAuto)[field]}
                            onChange={e => editingAuto ? setEditingAuto({ ...editingAuto, [field]: e.target.value }) : setNewAuto({ ...newAuto, [field]: e.target.value })}
                            style={{ width: '100%', border: '1px solid #d1d5db', borderRadius: '8px', padding: '0.5rem 0.75rem', color: '#111827', outline: 'none', boxSizing: 'border-box', fontSize: '0.875rem' }} />
                        </div>
                      ))}
                    <TimingSelector
                      triggerType={(editingAuto || newAuto).trigger_type}
                      delayMinutes={(editingAuto || newAuto).trigger_delay_minutes}
                      onChangeTrigger={v => editingAuto ? setEditingAuto(prev => prev ? { ...prev, trigger_type: v, trigger_delay_minutes: 0 } : null) : setNewAuto(prev => ({ ...prev, trigger_type: v, trigger_delay_minutes: 0 }))}
                      onChangeDelay={v => editingAuto ? setEditingAuto(prev => prev ? { ...prev, trigger_delay_minutes: v } : null) : setNewAuto(prev => ({ ...prev, trigger_delay_minutes: v }))}
                    />
                    <div style={{ marginBottom: '0.875rem' }}>
                      <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '600', color: '#374151', marginBottom: '0.4rem' }}>{t.dash.email_body_label}</label>
                      <RichTextEditor value={(editingAuto || newAuto).body} onChange={v => editingAuto ? setEditingAuto({ ...editingAuto, body: v }) : setNewAuto({ ...newAuto, body: v })} rows={5} />
                    </div>
                    <div style={{ display: 'flex', gap: '0.75rem', flexDirection: isMobile ? 'column' : 'row' }}>
                      <button onClick={editingAuto ? handleUpdateAutomation : handleAddAutomation} disabled={autoSaving}
                        style={{ backgroundColor: '#2563eb', color: 'white', padding: '0.5rem 1.25rem', borderRadius: '8px', border: 'none', cursor: 'pointer', fontWeight: '600', fontSize: '0.875rem', opacity: autoSaving ? 0.5 : 1 }}>
                        {autoSaving ? t.dash.saving : `💾 ${t.dash.save_btn}`}
                      </button>
                      <button onClick={() => { setShowNewAutoForm(false); setEditingAuto(null) }}
                        style={{ backgroundColor: '#f3f4f6', color: '#374151', padding: '0.5rem 1.25rem', borderRadius: '8px', border: '1px solid #e5e7eb', cursor: 'pointer', fontWeight: '500', fontSize: '0.875rem' }}>
                        {t.dash.auto_cancel_btn}
                      </button>
                    </div>
                  </div>
                )}

                {automations.filter(a => !TEMPLATE_NAMES.has(a.name)).map(auto => (
                  <div key={auto.id} style={{ backgroundColor: 'white', borderRadius: '12px', padding: isMobile ? '0.875rem 1rem' : '1.25rem', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', marginBottom: '0.75rem', display: 'flex', flexDirection: isMobile ? 'column' : 'row', alignItems: isMobile ? 'stretch' : 'center', gap: isMobile ? '0.625rem' : '1rem', opacity: auto.enabled ? 1 : 0.6 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem', flexWrap: 'wrap' }}>
                        <p style={{ fontWeight: '700', color: '#111827', fontSize: '0.95rem', margin: 0 }}>{auto.name}</p>
                        <span style={{ fontSize: '0.75rem', backgroundColor: '#f3f4f6', color: '#6b7280', padding: '0.125rem 0.5rem', borderRadius: '100px' }}>{TRIGGER_LABELS[auto.trigger_type]}</span>
                      </div>
                      <p style={{ fontSize: '0.8rem', color: '#6b7280', margin: 0 }}>🕐 {getDelayLabel(auto.trigger_delay_minutes, auto.trigger_type)} · 📧 {auto.subject}</p>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
                      <button onClick={() => handleToggleAutomation(auto.id, !auto.enabled)} style={{ width: '44px', height: '24px', borderRadius: '12px', border: 'none', backgroundColor: auto.enabled ? '#22c55e' : '#d1d5db', cursor: 'pointer', position: 'relative', flexShrink: 0 }}>
                        <div style={{ position: 'absolute', top: '2px', left: auto.enabled ? '22px' : '2px', width: '20px', height: '20px', borderRadius: '50%', backgroundColor: 'white', transition: 'left 0.2s' }} />
                      </button>
                      <button onClick={() => { setEditingAuto(auto); setShowNewAutoForm(false); if (isMobile) setTimeout(() => autoFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100) }} style={{ backgroundColor: '#eff6ff', color: '#2563eb', border: 'none', borderRadius: '8px', padding: '0.375rem 0.625rem', cursor: 'pointer', fontSize: '0.875rem', flex: isMobile ? 1 : undefined }}>✏️ {isMobile && 'Szerkesztés'}</button>
                      <button onClick={() => handleDeleteAutomation(auto.id)} style={{ backgroundColor: '#fee2e2', color: '#ef4444', border: 'none', borderRadius: '8px', padding: '0.375rem 0.625rem', cursor: 'pointer', fontSize: '0.875rem', flex: isMobile ? 1 : undefined }}>🗑️ {isMobile && 'Törlés'}</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
