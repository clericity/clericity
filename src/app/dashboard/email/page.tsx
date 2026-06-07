'use client'

import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import RichTextEditor from '@/components/RichTextEditor'
import TimingSelector from '@/components/TimingSelector'

const DEFAULT_BODY = `Kedves {customerName}!

Köszönjük a foglalásodat! Az alábbiakban találod a foglalásod részleteit:

🗓 Szolgáltatás: {serviceName}
📅 Dátum: {date}
🕐 Időpont: {slot}

Ha kérdésed van, kérjük vedd fel velünk a kapcsolatot.

Üdvözlettel,
{businessName}`

const DEFAULT_CANCEL_BODY = `Kedves {customerName}!

Foglalásod sikeresen lemondásra került.

🗓 Szolgáltatás: {serviceName}
📅 Dátum: {date}
🕐 Időpont: {slot}

Reméljük hamarosan viszontlátjuk!

Üdvözlettel,
{businessName}`

const DEFAULT_RESCHEDULE_BODY = `Kedves {customerName}!

Foglalásod sikeresen átütemezésre került. Az alábbiakban találod az új időpont adatait:

🗓 Szolgáltatás: {serviceName}
📅 Új dátum: {date}
🕐 Új időpont: {slot}

Ha kérdésed van, vedd fel velünk a kapcsolatot.

Üdvözlettel,
{businessName}`

const TRIGGER_LABELS: Record<string, string> = {
  booking_confirmed: '✅ Foglalás után',
  before_appointment: '⏰ Időpont előtt',
  after_appointment: '🔄 Időpont után',
}

const VARIABLES = [
  { var: '{customerName}', desc: 'Vendég neve' },
  { var: '{serviceName}', desc: 'Szolgáltatás neve' },
  { var: '{date}', desc: 'Foglalás dátuma' },
  { var: '{slot}', desc: 'Időpont' },
  { var: '{businessName}', desc: 'Üzlet neve' },
]

interface Automation {
  id: string
  name: string
  trigger_type: string
  trigger_delay_minutes: number
  subject: string
  body: string
  enabled: boolean
}

const TEMPLATES = [
  {
    key: '24h-reminder',
    name: '24h emlékeztető',
    icon: '⏰',
    description: '24 órával az időpont előtt automatikusan elküldi',
    trigger_type: 'before_appointment',
    trigger_delay_minutes: 1440,
    subject: '⏰ Emlékeztető: holnap van a foglalásod, {customerName}!',
    body: `Kedves {customerName}!

Emlékeztetünk, hogy holnap foglalásod van nálunk:

🗓 Szolgáltatás: {serviceName}
📅 Dátum: {date}
🕐 Időpont: {slot}

Ha nem tudsz eljönni, kérjük jelezd mielőbb.

Üdvözlettel,
{businessName}`,
  },
  {
    key: 'follow-up',
    name: 'Follow-up email',
    icon: '🙏',
    description: '1 nappal az időpont után visszajelzést kér a vendégtől',
    trigger_type: 'after_appointment',
    trigger_delay_minutes: 1440,
    subject: '🙏 Köszönjük a látogatásodat, {customerName}!',
    body: `Kedves {customerName}!

Köszönjük, hogy meglátogattál minket!

Reméljük elégedett voltál a {serviceName} szolgáltatásunkkal. A véleményed nagyon fontos számunkra — ha van pár perced, oszd meg velünk tapasztalataidat!

Várunk vissza szeretettel,
{businessName}`,
  },
]

const TEMPLATE_NAMES = new Set(TEMPLATES.map(t => t.name))

interface AutoFormData {
  id?: string
  name: string
  trigger_type: string
  trigger_delay_minutes: number
  subject: string
  body: string
  enabled: boolean
}

function AutoForm({ data, onChange, onSave, onCancel, saving: isSaving }: {
  data: AutoFormData,
  onChange: (d: AutoFormData) => void,
  onSave: () => void,
  onCancel: () => void,
  saving: boolean,
}) {
  const isTemplate = TEMPLATE_NAMES.has(data.name)

  return (
    <div style={{ backgroundColor: '#f8fafc', borderRadius: '12px', padding: '1.25rem', border: '1px solid #e5e7eb', marginBottom: '1rem' }}>
      <div style={{ display: 'grid', gridTemplateColumns: isTemplate ? '1fr' : '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
        {!isTemplate && <div>
          <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '600', color: '#374151', marginBottom: '0.4rem' }}>Név</label>
          <input
            type="text"
            value={data.name}
            onChange={e => onChange({ ...data, name: e.target.value })}
            style={{ width: '100%', border: '1px solid #d1d5db', borderRadius: '8px', padding: '0.5rem 0.75rem', color: '#111827', outline: 'none', boxSizing: 'border-box', fontSize: '0.875rem' }}
            placeholder="pl. Emlékeztető"
          />
        </div>}
        <div>
          <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '600', color: '#374151', marginBottom: '0.4rem' }}>Mikor küldje?</label>
          <select
            value={data.trigger_type}
            onChange={e => onChange({ ...data, trigger_type: e.target.value, trigger_delay_minutes: 0 })}
            style={{ width: '100%', border: '1px solid #d1d5db', borderRadius: '8px', padding: '0.5rem 0.75rem', color: '#111827', outline: 'none', backgroundColor: 'white', fontSize: '0.875rem' }}
          >
            <option value="booking_confirmed">✅ Foglalás után</option>
            <option value="before_appointment">⏰ Időpont előtt</option>
            <option value="after_appointment">🔄 Időpont után</option>
          </select>
        </div>
      </div>

      <div style={{ marginBottom: '1rem' }}>
        <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '600', color: '#374151', marginBottom: '0.4rem' }}>
          {data.trigger_type === 'booking_confirmed' ? 'Késés (perc, 0 = azonnal)' : data.trigger_type === 'before_appointment' ? 'Hány perccel előtte?' : 'Hány perccel utána?'}
        </label>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          {data.trigger_type === 'booking_confirmed' ? (
            [0, 30, 60].map(m => (
              <button key={m} onClick={() => onChange({ ...data, trigger_delay_minutes: m })}
                style={{ padding: '0.375rem 0.875rem', borderRadius: '8px', border: '2px solid', borderColor: data.trigger_delay_minutes === m ? '#2563eb' : '#e5e7eb', backgroundColor: data.trigger_delay_minutes === m ? '#eff6ff' : 'white', color: data.trigger_delay_minutes === m ? '#2563eb' : '#6b7280', cursor: 'pointer', fontSize: '0.8rem', fontWeight: '500' }}>
                {m === 0 ? 'Azonnal' : `${m} perc`}
              </button>
            ))
          ) : data.trigger_type === 'before_appointment' ? (
            [60, 120, 1440, 2880].map(m => (
              <button key={m} onClick={() => onChange({ ...data, trigger_delay_minutes: m })}
                style={{ padding: '0.375rem 0.875rem', borderRadius: '8px', border: '2px solid', borderColor: data.trigger_delay_minutes === m ? '#2563eb' : '#e5e7eb', backgroundColor: data.trigger_delay_minutes === m ? '#eff6ff' : 'white', color: data.trigger_delay_minutes === m ? '#2563eb' : '#6b7280', cursor: 'pointer', fontSize: '0.8rem', fontWeight: '500' }}>
                {m < 1440 ? `${m / 60} óra` : `${m / 1440} nap`}
              </button>
            ))
          ) : (
            [60, 1440, 2880, 4320].map(m => (
              <button key={m} onClick={() => onChange({ ...data, trigger_delay_minutes: m })}
                style={{ padding: '0.375rem 0.875rem', borderRadius: '8px', border: '2px solid', borderColor: data.trigger_delay_minutes === m ? '#2563eb' : '#e5e7eb', backgroundColor: data.trigger_delay_minutes === m ? '#eff6ff' : 'white', color: data.trigger_delay_minutes === m ? '#2563eb' : '#6b7280', cursor: 'pointer', fontSize: '0.8rem', fontWeight: '500' }}>
                {m < 1440 ? `${m / 60} óra` : `${m / 1440} nap`}
              </button>
            ))
          )}
          <input
            type="number"
            value={data.trigger_delay_minutes}
            onChange={e => onChange({ ...data, trigger_delay_minutes: parseInt(e.target.value) || 0 })}
            style={{ width: '80px', border: '1px solid #d1d5db', borderRadius: '8px', padding: '0.375rem 0.625rem', color: '#111827', outline: 'none', fontSize: '0.875rem' }}
            placeholder="perc"
          />
        </div>
      </div>

      <div style={{ marginBottom: '1rem' }}>
        <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '600', color: '#374151', marginBottom: '0.4rem' }}>Email tárgya</label>
        <input
          type="text"
          value={data.subject}
          onChange={e => onChange({ ...data, subject: e.target.value })}
          style={{ width: '100%', border: '1px solid #d1d5db', borderRadius: '8px', padding: '0.5rem 0.75rem', color: '#111827', outline: 'none', boxSizing: 'border-box', fontSize: '0.875rem' }}
          placeholder="pl. ⏰ Emlékeztető: holnap van a foglalásom"
        />
      </div>

      <div style={{ marginBottom: '1rem' }}>
        <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '600', color: '#374151', marginBottom: '0.4rem' }}>Email szövege</label>
        <RichTextEditor value={data.body} onChange={v => onChange({ ...data, body: v })} rows={6} placeholder="Kedves {customerName}!..." />
      </div>

      <div style={{ display: 'flex', gap: '0.75rem' }}>
        <button
          onClick={onSave}
          disabled={isSaving || !data.name || !data.subject || !data.body}
          style={{ backgroundColor: !data.name || !data.subject || !data.body ? '#e5e7eb' : '#2563eb', color: !data.name || !data.subject || !data.body ? '#9ca3af' : 'white', padding: '0.5rem 1.25rem', borderRadius: '8px', border: 'none', cursor: 'pointer', fontWeight: '600', fontSize: '0.875rem', opacity: isSaving ? 0.5 : 1 }}
        >
          {isSaving ? 'Mentés...' : '💾 Mentés'}
        </button>
        <button
          onClick={onCancel}
          style={{ backgroundColor: '#f3f4f6', color: '#374151', padding: '0.5rem 1.25rem', borderRadius: '8px', border: '1px solid #e5e7eb', cursor: 'pointer', fontWeight: '500', fontSize: '0.875rem' }}
        >
          Mégse
        </button>
      </div>
    </div>
  )
}

export default function EmailSettingsPage() {
  const router = useRouter()
  const [tenantId, setTenantId] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'template' | 'automations'>('template')

  // Email sablonok
  const [fromName, setFromName] = useState('CLERICITY')
  const [subject, setSubject] = useState('✅ Foglalás visszaigazolása — {businessName}')
  const [body, setBody] = useState('')
  const [cancelSubject, setCancelSubject] = useState('❌ Foglalás lemondva — {businessName}')
  const [cancelBody, setCancelBody] = useState('')
  const [rescheduleSubject, setRescheduleSubject] = useState('🔄 Foglalás átütemezve — {businessName}')
  const [rescheduleBody, setRescheduleBody] = useState('')
  const [confirmTrigger, setConfirmTrigger] = useState('booking_confirmed')
  const [confirmDelay, setConfirmDelay] = useState(0)
  const [cancelTrigger, setCancelTrigger] = useState('booking_confirmed')
  const [cancelDelay, setCancelDelay] = useState(0)
  const [rescheduleTrigger, setRescheduleTrigger] = useState('booking_confirmed')
  const [rescheduleDelay, setRescheduleDelay] = useState(0)
  const [expandedCard, setExpandedCard] = useState<'confirmation' | 'cancel' | 'reschedule' | null>(null)
  const [cardSaving, setCardSaving] = useState<string | null>(null)
  const [cardSuccess, setCardSuccess] = useState<string | null>(null)
  const [fromNameSaving, setFromNameSaving] = useState(false)
  const [fromNameSuccess, setFromNameSuccess] = useState(false)

  // Automatizációk
  const [automations, setAutomations] = useState<Automation[]>([])
  const [editingAutomation, setEditingAutomation] = useState<AutoFormData | null>(null)
  const [showNewForm, setShowNewForm] = useState(false)
  const [newAuto, setNewAuto] = useState({
    name: '',
    trigger_type: 'booking_confirmed',
    trigger_delay_minutes: 0,
    subject: '',
    body: '',
    enabled: true,
  })
  const [autoSaving, setAutoSaving] = useState(false)
  const [loading, setLoading] = useState(true)

  const getData = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/auth'); return }

    const { data: profile } = await supabase
      .from('profiles')
      .select('tenant_id')
      .eq('id', user.id)
      .single()

    if (profile?.tenant_id) {
      setTenantId(profile.tenant_id)

      const { data: tenant } = await supabase
        .from('tenants')
        .select('email_subject, email_body, email_from_name, cancel_email_subject, cancel_email_body, reschedule_email_subject, reschedule_email_body, confirmation_trigger_type, confirmation_trigger_delay_minutes, cancel_trigger_type, cancel_trigger_delay_minutes, reschedule_trigger_type, reschedule_trigger_delay_minutes')
        .eq('id', profile.tenant_id)
        .single()

      if (tenant) {
        setFromName(tenant.email_from_name || 'CLERICITY')
        setSubject(tenant.email_subject || '✅ Foglalás visszaigazolása — {businessName}')
        setBody(tenant.email_body || DEFAULT_BODY)
        setCancelSubject(tenant.cancel_email_subject || '❌ Foglalás lemondva — {businessName}')
        setCancelBody(tenant.cancel_email_body || DEFAULT_CANCEL_BODY)
        setRescheduleSubject(tenant.reschedule_email_subject || '🔄 Foglalás átütemezve — {businessName}')
        setRescheduleBody(tenant.reschedule_email_body || DEFAULT_RESCHEDULE_BODY)
        setConfirmTrigger(tenant.confirmation_trigger_type || 'booking_confirmed')
        setConfirmDelay(tenant.confirmation_trigger_delay_minutes || 0)
        setCancelTrigger(tenant.cancel_trigger_type || 'booking_confirmed')
        setCancelDelay(tenant.cancel_trigger_delay_minutes || 0)
        setRescheduleTrigger(tenant.reschedule_trigger_type || 'booking_confirmed')
        setRescheduleDelay(tenant.reschedule_trigger_delay_minutes || 0)
      } else {
        setBody(DEFAULT_BODY)
        setCancelBody(DEFAULT_CANCEL_BODY)
        setRescheduleBody(DEFAULT_RESCHEDULE_BODY)
      }

      const { data: autoData } = await supabase
        .from('email_automations')
        .select('*')
        .eq('tenant_id', profile.tenant_id)
        .order('created_at', { ascending: true })
      setAutomations(autoData || [])
    }
    setLoading(false)
  }, [router])

  useEffect(() => {
    const init = async () => { await getData() }
    init()
  }, [getData])

  const handleSaveFromName = async () => {
    if (!tenantId) return
    setFromNameSaving(true)
    setFromNameSuccess(false)
    await supabase.from('tenants').update({ email_from_name: fromName }).eq('id', tenantId)
    setFromNameSaving(false)
    setFromNameSuccess(true)
    setTimeout(() => setFromNameSuccess(false), 2500)
  }

  const handleSaveCard = async (type: 'confirmation' | 'cancel' | 'reschedule') => {
    if (!tenantId) return
    setCardSaving(type)
    setCardSuccess(null)
    const updates =
      type === 'confirmation' ? { email_subject: subject, email_body: body, email_from_name: fromName, confirmation_trigger_type: confirmTrigger, confirmation_trigger_delay_minutes: confirmDelay } :
      type === 'cancel'       ? { cancel_email_subject: cancelSubject, cancel_email_body: cancelBody, cancel_trigger_type: cancelTrigger, cancel_trigger_delay_minutes: cancelDelay } :
                                { reschedule_email_subject: rescheduleSubject, reschedule_email_body: rescheduleBody, reschedule_trigger_type: rescheduleTrigger, reschedule_trigger_delay_minutes: rescheduleDelay }
    await supabase.from('tenants').update(updates).eq('id', tenantId)
    setCardSaving(null)
    setCardSuccess(type)
    setTimeout(() => setCardSuccess(null), 2500)
  }

  const handleAddAutomation = async () => {
    if (!tenantId || !newAuto.name || !newAuto.subject || !newAuto.body) return
    setAutoSaving(true)

    const { data } = await supabase
      .from('email_automations')
      .insert({ ...newAuto, tenant_id: tenantId })
      .select()
      .single()

    if (data) {
      setAutomations([...automations, data])
      setShowNewForm(false)
      setNewAuto({ name: '', trigger_type: 'booking_confirmed', trigger_delay_minutes: 0, subject: '', body: '', enabled: true })
    }
    setAutoSaving(false)
  }

  const handleUpdateAutomation = async () => {
    if (!editingAutomation?.id) return
    setAutoSaving(true)

    await supabase
      .from('email_automations')
      .update({
        name: editingAutomation.name,
        trigger_type: editingAutomation.trigger_type,
        trigger_delay_minutes: editingAutomation.trigger_delay_minutes,
        subject: editingAutomation.subject,
        body: editingAutomation.body,
        enabled: editingAutomation.enabled,
      })
      .eq('id', editingAutomation.id)

    setAutomations(automations.map(a => a.id === editingAutomation.id ? { ...a, ...editingAutomation, id: a.id } : a))
    setEditingAutomation(null)
    setAutoSaving(false)
  }

  const handleSaveTemplateAutomation = async () => {
    if (!tenantId || !editingAutomation) return
    setAutoSaving(true)

    if (editingAutomation.id) {
      await supabase.from('email_automations').update({
        trigger_type: editingAutomation.trigger_type,
        trigger_delay_minutes: editingAutomation.trigger_delay_minutes,
        subject: editingAutomation.subject,
        body: editingAutomation.body,
      }).eq('id', editingAutomation.id)
      setAutomations(automations.map(a => a.id === editingAutomation.id ? { ...a, ...editingAutomation, id: a.id } : a))
    } else {
      const { data } = await supabase.from('email_automations').insert({
        tenant_id: tenantId,
        name: editingAutomation.name,
        trigger_type: editingAutomation.trigger_type,
        trigger_delay_minutes: editingAutomation.trigger_delay_minutes,
        subject: editingAutomation.subject,
        body: editingAutomation.body,
        enabled: true,
      }).select().single()
      if (data) setAutomations([...automations, data])
    }

    setEditingAutomation(null)
    setAutoSaving(false)
  }

  const handleToggleAutomation = async (id: string, enabled: boolean) => {
    await supabase.from('email_automations').update({ enabled }).eq('id', id)
    setAutomations(automations.map(a => a.id === id ? { ...a, enabled } : a))
  }

  const handleDeleteAutomation = async (id: string) => {
    await supabase.from('email_automations').delete().eq('id', id)
    setAutomations(automations.filter(a => a.id !== id))
  }

  const handleTemplateToggle = async (template: typeof TEMPLATES[0]) => {
    if (!tenantId) return
    const existing = automations.find(a => a.name === template.name)

    if (existing) {
      await supabase.from('email_automations').update({ enabled: !existing.enabled }).eq('id', existing.id)
      setAutomations(automations.map(a => a.id === existing.id ? { ...a, enabled: !existing.enabled } : a))
    } else {
      const { data } = await supabase
        .from('email_automations')
        .insert({
          tenant_id: tenantId,
          name: template.name,
          trigger_type: template.trigger_type,
          trigger_delay_minutes: template.trigger_delay_minutes,
          subject: template.subject,
          body: template.body,
          enabled: true,
        })
        .select()
        .single()
      if (data) setAutomations([...automations, data])
    }
  }

  const getDelayLabel = (minutes: number, triggerType: string) => {
    if (triggerType === 'booking_confirmed') {
      if (minutes === 0) return 'Azonnal'
      if (minutes < 60) return `${minutes} perc késéssel`
      return `${Math.floor(minutes / 60)} óra késéssel`
    }
    if (triggerType === 'before_appointment') {
      if (minutes < 60) return `${minutes} perccel előtte`
      if (minutes < 1440) return `${Math.floor(minutes / 60)} órával előtte`
      return `${Math.floor(minutes / 1440)} nappal előtte`
    }
    if (triggerType === 'after_appointment') {
      if (minutes < 60) return `${minutes} perccel utána`
      if (minutes < 1440) return `${Math.floor(minutes / 60)} órával utána`
      return `${Math.floor(minutes / 1440)} nappal utána`
    }
    return ''
  }

  if (loading) return <p style={{ color: '#6b7280' }}>Betöltés...</p>

  return (
    <div>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#111827', marginBottom: '1.5rem' }}>
        📧 Email beállítások
      </h1>

      {/* Tab váltó */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem' }}>
        {[
          { key: 'template', label: '📝 Email sablonok' },
          { key: 'automations', label: '⚡ Automatizációk' },
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key as 'template' | 'automations')}
            style={{
              padding: '0.5rem 1.25rem', borderRadius: '8px', border: '2px solid',
              borderColor: activeTab === tab.key ? '#2563eb' : '#e5e7eb',
              backgroundColor: activeTab === tab.key ? '#eff6ff' : 'white',
              color: activeTab === tab.key ? '#2563eb' : '#6b7280',
              cursor: 'pointer', fontWeight: activeTab === tab.key ? '700' : '400', fontSize: '0.875rem',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Változók */}
      <div style={{ backgroundColor: '#eff6ff', padding: '1rem 1.25rem', borderRadius: '12px', border: '1px solid #bfdbfe', marginBottom: '1.5rem', maxWidth: '650px' }}>
        <p style={{ fontSize: '0.8rem', fontWeight: '700', color: '#1d4ed8', marginBottom: '0.5rem' }}>💡 Használható változók</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
          {VARIABLES.map(item => (
            <div key={item.var} style={{ backgroundColor: 'white', padding: '0.25rem 0.625rem', borderRadius: '6px', border: '1px solid #bfdbfe' }}>
              <span style={{ fontFamily: 'monospace', color: '#2563eb', fontSize: '0.75rem', fontWeight: '600' }}>{item.var}</span>
              <span style={{ color: '#6b7280', fontSize: '0.7rem', marginLeft: '0.4rem' }}>= {item.desc}</span>
            </div>
          ))}
        </div>
      </div>

      {/* EMAIL SABLONOK TAB */}
      {activeTab === 'template' && (
        <div style={{ maxWidth: '650px' }}>

          {/* Feladó neve — közös beállítás */}
          <div style={{ backgroundColor: 'white', padding: '1.25rem 1.5rem', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', marginBottom: '1rem' }}>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '600', color: '#374151', marginBottom: '0.4rem' }}>Feladó neve (minden emailnél)</label>
            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
              <input type="text" value={fromName} onChange={e => setFromName(e.target.value)}
                style={{ flex: 1, border: '1px solid #d1d5db', borderRadius: '8px', padding: '0.5rem 0.875rem', color: '#111827', outline: 'none', fontSize: '0.875rem' }}
                placeholder="pl. Kovács Fodrászat" />
              <button
                onClick={handleSaveFromName}
                disabled={fromNameSaving}
                style={{ backgroundColor: fromNameSuccess ? '#22c55e' : '#2563eb', color: 'white', padding: '0.5rem 1.25rem', borderRadius: '8px', border: 'none', cursor: 'pointer', fontWeight: '600', fontSize: '0.875rem', whiteSpace: 'nowrap', opacity: fromNameSaving ? 0.5 : 1, transition: 'background-color 0.2s' }}
              >
                {fromNameSuccess ? '✅ Mentve!' : fromNameSaving ? 'Mentés...' : '💾 Mentés'}
              </button>
            </div>
          </div>

          {/* 3 sablon kártya */}
          {([
            {
              key: 'confirmation' as const,
              icon: '✅',
              title: 'Visszaigazoló email',
              desc: 'Új foglalás után küldi el automatikusan',
              subjectVal: subject, setSubject,
              bodyVal: body, setBody,
              defaultBody: DEFAULT_BODY,
              defaultSubject: '✅ Foglalás visszaigazolása — {businessName}',
            },
            {
              key: 'cancel' as const,
              icon: '❌',
              title: 'Lemondási visszaigazoló',
              desc: 'Foglalás lemondásakor küldi el',
              subjectVal: cancelSubject, setSubject: setCancelSubject,
              bodyVal: cancelBody, setBody: setCancelBody,
              defaultBody: DEFAULT_CANCEL_BODY,
              defaultSubject: '❌ Foglalás lemondva — {businessName}',
            },
            {
              key: 'reschedule' as const,
              icon: '🔄',
              title: 'Átütemezési visszaigazoló',
              desc: 'Foglalás átütemezésekor küldi el',
              subjectVal: rescheduleSubject, setSubject: setRescheduleSubject,
              bodyVal: rescheduleBody, setBody: setRescheduleBody,
              defaultBody: DEFAULT_RESCHEDULE_BODY,
              defaultSubject: '🔄 Foglalás átütemezve — {businessName}',
            },
          ] as const).map(card => {
            const isOpen = expandedCard === card.key
            const isSaving = cardSaving === card.key
            const isSuccess = cardSuccess === card.key

            return (
              <div key={card.key} style={{ backgroundColor: 'white', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', marginBottom: '0.75rem', overflow: 'hidden' }}>

                {/* Fejléc — mindig látható */}
                <div
                  onClick={() => setExpandedCard(isOpen ? null : card.key)}
                  style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '1rem 1.25rem', cursor: 'pointer', userSelect: 'none' }}
                >
                  <span style={{ fontSize: '1.5rem', flexShrink: 0 }}>{card.icon}</span>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontWeight: '700', color: '#111827', fontSize: '0.95rem', marginBottom: '0.15rem' }}>{card.title}</p>
                    <p style={{ fontSize: '0.8rem', color: '#6b7280' }}>{card.desc}</p>
                  </div>
                  {isSuccess && <span style={{ fontSize: '0.8rem', color: '#22c55e', fontWeight: '600' }}>✅ Mentve!</span>}
                  <span style={{ color: '#9ca3af', fontSize: '1rem', fontWeight: '700', transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', flexShrink: 0 }}>▼</span>
                </div>

                {/* Szerkesztő — csak nyitott állapotban */}
                {isOpen && (
                  <div style={{ padding: '0 1.25rem 1.25rem', borderTop: '1px solid #f3f4f6' }}>
                    <div style={{ marginTop: '1rem', marginBottom: '1rem' }}>
                      <TimingSelector
                        triggerType={card.key === 'confirmation' ? confirmTrigger : card.key === 'cancel' ? cancelTrigger : rescheduleTrigger}
                        delayMinutes={card.key === 'confirmation' ? confirmDelay : card.key === 'cancel' ? cancelDelay : rescheduleDelay}
                        onChangeTrigger={v => card.key === 'confirmation' ? setConfirmTrigger(v) : card.key === 'cancel' ? setCancelTrigger(v) : setRescheduleTrigger(v)}
                        onChangeDelay={v => card.key === 'confirmation' ? setConfirmDelay(v) : card.key === 'cancel' ? setCancelDelay(v) : setRescheduleDelay(v)}
                      />
                    </div>
                    <div style={{ marginBottom: '0.875rem' }}>
                      <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '600', color: '#374151', marginBottom: '0.4rem' }}>Email tárgya</label>
                      <input type="text" value={card.subjectVal} onChange={e => card.setSubject(e.target.value)}
                        style={{ width: '100%', border: '1px solid #d1d5db', borderRadius: '8px', padding: '0.5rem 0.875rem', color: '#111827', outline: 'none', boxSizing: 'border-box', fontSize: '0.875rem' }} />
                    </div>

                    <div style={{ marginBottom: '1rem' }}>
                      <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '600', color: '#374151', marginBottom: '0.4rem' }}>Email szövege</label>
                      <RichTextEditor value={card.bodyVal} onChange={card.setBody} rows={10} />
                    </div>

                    <div style={{ display: 'flex', gap: '0.75rem' }}>
                      <button
                        onClick={() => handleSaveCard(card.key)}
                        disabled={isSaving}
                        style={{ backgroundColor: '#2563eb', color: 'white', padding: '0.625rem 1.5rem', borderRadius: '8px', border: 'none', cursor: 'pointer', fontWeight: '600', fontSize: '0.875rem', opacity: isSaving ? 0.5 : 1 }}
                      >
                        {isSaving ? 'Mentés...' : '💾 Mentés'}
                      </button>
                      <button
                        onClick={() => { card.setSubject(card.defaultSubject); card.setBody(card.defaultBody) }}
                        style={{ backgroundColor: '#f3f4f6', color: '#374151', padding: '0.625rem 1.25rem', borderRadius: '8px', border: '1px solid #e5e7eb', cursor: 'pointer', fontWeight: '500', fontSize: '0.875rem' }}
                      >
                        🔄 Alapértelmezett
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* AUTOMATIZÁCIÓK TAB */}
      {activeTab === 'automations' && (
        <div style={{ maxWidth: '650px' }}>

          {/* SABLONOK */}
          <p style={{ fontSize: '0.75rem', fontWeight: '700', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.75rem' }}>
            ⚡ Gyors sablonok
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '2rem' }}>
            {TEMPLATES.map(template => {
              const existing = automations.find(a => a.name === template.name)
              const isEnabled = existing?.enabled ?? false
              const isEditing = editingAutomation !== null &&
                (editingAutomation.id === existing?.id || (!existing && editingAutomation.name === template.name))

              if (isEditing) {
                return (
                  <AutoForm
                    key={template.key}
                    data={editingAutomation!}
                    onChange={d => setEditingAutomation(d)}
                    onSave={handleSaveTemplateAutomation}
                    onCancel={() => setEditingAutomation(null)}
                    saving={autoSaving}
                  />
                )
              }

              return (
                <div key={template.key} style={{
                  backgroundColor: 'white', borderRadius: '12px', padding: '1rem 1.25rem',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                  border: isEnabled ? '2px solid #22c55e' : '2px solid transparent',
                  display: 'flex', alignItems: 'center', gap: '1rem',
                }}>
                  <div style={{ fontSize: '1.75rem', flexShrink: 0 }}>{template.icon}</div>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontWeight: '700', color: '#111827', fontSize: '0.95rem', marginBottom: '0.2rem' }}>
                      {existing && (template.key === '24h-reminder' || template.key === 'follow-up')
                        ? template.key === '24h-reminder'
                          ? `${getDelayLabel(existing.trigger_delay_minutes, existing.trigger_type)} emlékeztető`
                          : `${getDelayLabel(existing.trigger_delay_minutes, existing.trigger_type)} follow-up`
                        : template.name}
                    </p>
                    <p style={{ fontSize: '0.8rem', color: '#6b7280' }}>
                      {existing && (template.key === '24h-reminder' || template.key === 'follow-up')
                        ? existing.trigger_type === 'before_appointment'
                          ? `${getDelayLabel(existing.trigger_delay_minutes, existing.trigger_type)} az időpont előtt automatikusan elküldi`
                          : existing.trigger_type === 'after_appointment'
                            ? `${getDelayLabel(existing.trigger_delay_minutes, existing.trigger_type)} az időpont után automatikusan elküldi`
                            : `Foglalás után ${getDelayLabel(existing.trigger_delay_minutes, existing.trigger_type)} küldi el`
                        : template.description}
                    </p>
                    {existing && <p style={{ fontSize: '0.75rem', color: '#9ca3af', marginTop: '0.2rem' }}>📧 {existing.subject}</p>}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
                    <button
                      onClick={() => {
                        setShowNewForm(false)
                        setEditingAutomation(existing
                          ? { id: existing.id, name: existing.name, trigger_type: existing.trigger_type, trigger_delay_minutes: existing.trigger_delay_minutes, subject: existing.subject, body: existing.body, enabled: existing.enabled }
                          : { name: template.name, trigger_type: template.trigger_type, trigger_delay_minutes: template.trigger_delay_minutes, subject: template.subject, body: template.body, enabled: true }
                        )
                      }}
                      style={{ backgroundColor: '#eff6ff', color: '#2563eb', border: 'none', borderRadius: '8px', padding: '0.375rem 0.75rem', cursor: 'pointer', fontSize: '0.8rem', fontWeight: '600' }}
                    >
                      ✏️ Szerkesztés
                    </button>
                    <button
                      onClick={() => handleTemplateToggle(template)}
                      style={{ width: '44px', height: '24px', borderRadius: '12px', border: 'none', backgroundColor: isEnabled ? '#22c55e' : '#d1d5db', cursor: 'pointer', position: 'relative', flexShrink: 0 }}
                    >
                      <div style={{ position: 'absolute', top: '2px', left: isEnabled ? '22px' : '2px', width: '20px', height: '20px', borderRadius: '50%', backgroundColor: 'white', transition: 'left 0.2s' }} />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>

          {/* EGYEDI AUTOMATIZÁCIÓK */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
            <p style={{ fontSize: '0.75rem', fontWeight: '700', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              Egyedi automatizációk
            </p>
            <button
              onClick={() => { setShowNewForm(true); setEditingAutomation(null) }}
              style={{ backgroundColor: '#2563eb', color: 'white', padding: '0.375rem 1rem', borderRadius: '8px', border: 'none', cursor: 'pointer', fontWeight: '600', fontSize: '0.8rem', whiteSpace: 'nowrap' }}
            >
              ➕ Új
            </button>
          </div>

          {showNewForm && (
            <AutoForm
              data={newAuto}
              onChange={setNewAuto}
              onSave={handleAddAutomation}
              onCancel={() => setShowNewForm(false)}
              saving={autoSaving}
            />
          )}

          {automations.filter(a => !TEMPLATE_NAMES.has(a.name)).length === 0 && !showNewForm ? (
            <div style={{ backgroundColor: 'white', padding: '1.5rem', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', textAlign: 'center', color: '#9ca3af', fontSize: '0.875rem' }}>
              Még nincs egyedi automatizáció beállítva.
            </div>
          ) : (
            automations.filter(a => !TEMPLATE_NAMES.has(a.name)).map(auto => (
              <div key={auto.id}>
                {editingAutomation !== null && editingAutomation.id === auto.id ? (
                  <AutoForm
                    data={editingAutomation}
                    onChange={d => setEditingAutomation(prev => prev ? { ...prev, ...d } : null)}
                    onSave={handleUpdateAutomation}
                    onCancel={() => setEditingAutomation(null)}
                    saving={autoSaving}
                  />
                ) : (
                  <div style={{ backgroundColor: 'white', borderRadius: '12px', padding: '1.25rem', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '1rem', opacity: auto.enabled ? 1 : 0.6 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                        <p style={{ fontWeight: '700', color: '#111827', fontSize: '0.95rem' }}>{auto.name}</p>
                        <span style={{ fontSize: '0.75rem', backgroundColor: '#f3f4f6', color: '#6b7280', padding: '0.125rem 0.5rem', borderRadius: '100px' }}>
                          {TRIGGER_LABELS[auto.trigger_type]}
                        </span>
                      </div>
                      <p style={{ fontSize: '0.8rem', color: '#6b7280' }}>
                        🕐 {getDelayLabel(auto.trigger_delay_minutes, auto.trigger_type)} · 📧 {auto.subject}
                      </p>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
                      <button
                        onClick={() => handleToggleAutomation(auto.id, !auto.enabled)}
                        style={{ width: '44px', height: '24px', borderRadius: '12px', border: 'none', backgroundColor: auto.enabled ? '#22c55e' : '#d1d5db', cursor: 'pointer', position: 'relative' }}
                      >
                        <div style={{ position: 'absolute', top: '2px', left: auto.enabled ? '22px' : '2px', width: '20px', height: '20px', borderRadius: '50%', backgroundColor: 'white', transition: 'left 0.2s' }} />
                      </button>
                      <button
                        onClick={() => { setEditingAutomation(auto); setShowNewForm(false) }}
                        style={{ backgroundColor: '#eff6ff', color: '#2563eb', border: 'none', borderRadius: '8px', padding: '0.375rem 0.625rem', cursor: 'pointer', fontSize: '0.875rem' }}
                      >✏️</button>
                      <button
                        onClick={() => handleDeleteAutomation(auto.id)}
                        style={{ backgroundColor: '#fee2e2', color: '#ef4444', border: 'none', borderRadius: '8px', padding: '0.375rem 0.625rem', cursor: 'pointer', fontSize: '0.875rem' }}
                      >🗑️</button>
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}