'use client'

import { useEffect, useState, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import RichTextEditor from '@/components/RichTextEditor'
import { useLanguage } from '@/hooks/useLanguage'

// ─── Types ───────────────────────────────────────────────────────────────────

type MainTab = 'general' | 'integrations' | 'profile' | 'appearance'


const COUNTRIES = [
  { code: 'HU', name: 'Magyarország', timezone: 'Europe/Budapest', phone: '+36' },
  { code: 'SK', name: 'Szlovákia', timezone: 'Europe/Bratislava', phone: '+421' },
  { code: 'AT', name: 'Ausztria', timezone: 'Europe/Vienna', phone: '+43' },
  { code: 'RO', name: 'Románia', timezone: 'Europe/Bucharest', phone: '+40' },
  { code: 'DE', name: 'Németország', timezone: 'Europe/Berlin', phone: '+49' },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

function TabBtn({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{ padding: '0.5rem 1.5rem', borderRadius: '8px', border: '2px solid', borderColor: active ? '#2563eb' : '#e5e7eb', backgroundColor: active ? '#eff6ff' : 'white', color: active ? '#2563eb' : '#6b7280', cursor: 'pointer', fontWeight: active ? '700' : '400', fontSize: '0.875rem' }}>
      {label}
    </button>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', gap: '1rem', alignItems: 'baseline', paddingBottom: '0.75rem', borderBottom: '1px solid #f3f4f6' }}>
      <span style={{ fontSize: '0.8rem', fontWeight: '600', color: '#6b7280', minWidth: '100px', flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: '0.875rem', color: '#111827', wordBreak: 'break-all' }}>{value || '—'}</span>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function SettingsPage() {
  const router = useRouter()
  const { t } = useLanguage()

  const [tab, setTab] = useState<MainTab>('general')

  // ── Shared ──
  const [tenantId, setTenantId] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [isSuperAdmin, setIsSuperAdmin] = useState(false)
  const [plan, setPlan] = useState('free')
  const [planExpiresAt, setPlanExpiresAt] = useState<string | null>(null)
  const [registrationType, setRegistrationType] = useState<'business' | 'personal' | ''>('')
  const [regTaxNumber, setRegTaxNumber] = useState('')
  const [regAddress, setRegAddress] = useState('')
  const [regFullName, setRegFullName] = useState('')
  const [generalLoaded, setGeneralLoaded] = useState(false)
  const [profileLoaded, setProfileLoaded] = useState(false)
  // ── General tab ──
  const [userEmail, setUserEmail] = useState('')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [phone, setPhone] = useState('')
  const [country, setCountry] = useState('HU')
  const [logoUrl, setLogoUrl] = useState('')
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [logoPreview, setLogoPreview] = useState('')
  const [slug, setSlug] = useState('')
  const [originalSlug, setOriginalSlug] = useState('')
  const [customDomain, setCustomDomain] = useState('')
  const [slugStatus, setSlugStatus] = useState<'idle' | 'checking' | 'available' | 'taken' | 'invalid'>('idle')
  const [slugMessage, setSlugMessage] = useState('')
  const slugDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [googleConnected, setGoogleConnected] = useState(false)
  const [googleError, setGoogleError] = useState('')
  const [generalLoading, setGeneralLoading] = useState(false)
  const [generalSuccess, setGeneralSuccess] = useState(false)
  const [generalError, setGeneralError] = useState('')
  const [bookingPrimaryColor, setBookingPrimaryColor] = useState('#1e3a8a')
  const [bookingAccentColor, setBookingAccentColor] = useState('#2563eb')
  const [bookingTransition, setBookingTransition] = useState('swipe')
  const [logoInBackground, setLogoInBackground] = useState(false)
  const [logoInHeader, setLogoInHeader] = useState(true)
  const [logoBgOpacity, setLogoBgOpacity] = useState(0.08)
  const [logoBgSize, setLogoBgSize] = useState(55)
  const [appearanceLogoUrl, setAppearanceLogoUrl] = useState('')
  const [transitionEnabled, setTransitionEnabled] = useState(true)
  const [serviceLayout, setServiceLayout] = useState<'list' | 'grid'>('list')
  const [staffLayout, setStaffLayout] = useState<'list' | 'grid'>('list')
  const [previewKey, setPreviewKey] = useState(0)
  const [appearanceSaving, setAppearanceSaving] = useState(false)
  const [appearanceSuccess, setAppearanceSuccess] = useState(false)

  // ── Profile tab ──
  const [ownerStaffId, setOwnerStaffId] = useState<string | null>(null)
  const [ownerName, setOwnerName] = useState('')
  const [ownerAge, setOwnerAge] = useState('')
  const [ownerBio, setOwnerBio] = useState('')
  const [ownerPhoto, setOwnerPhoto] = useState('')
  const [ownerPhotoFile, setOwnerPhotoFile] = useState<File | null>(null)
  const [ownerPhotoPreview, setOwnerPhotoPreview] = useState('')
  const [ownerRefPhotos, setOwnerRefPhotos] = useState<string[]>([])
  const [refUploading, setRefUploading] = useState(false)
  const [refError, setRefError] = useState('')
  const [profileSaving, setProfileSaving] = useState(false)
  const [profileSuccess, setProfileSuccess] = useState(false)
  const [profileError, setProfileError] = useState('')

  // ── Delete account ──
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [deleteError, setDeleteError] = useState('')

  // ── Init: load user/tenant ──
  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/auth'); return }
      setUserId(user.id)
      setUserEmail(user.email || '')

      const { data: profile } = await supabase.from('profiles').select('tenant_id, role').eq('id', user.id).single()
      if (!profile?.tenant_id) return
      setTenantId(profile.tenant_id)
      setIsSuperAdmin(profile.role === 'super_admin')

      const { data: tenantData } = await supabase.from('tenants').select('plan, plan_expires_at, booking_primary_color, booking_accent_color, booking_transition, logo_url, logo_in_background, logo_bg_opacity, logo_bg_size, logo_in_header, service_layout, staff_layout').eq('id', profile.tenant_id).single()
      setPlan(tenantData?.plan || 'free')
      setPlanExpiresAt(tenantData?.plan_expires_at || null)
      setBookingPrimaryColor(tenantData?.booking_primary_color || '#1e3a8a')
      setBookingAccentColor(tenantData?.booking_accent_color || '#2563eb')
      setAppearanceLogoUrl(tenantData?.logo_url || '')
      setLogoInBackground(tenantData?.logo_in_background || false)
      setLogoBgOpacity(tenantData?.logo_bg_opacity ?? 0.08)
      setLogoBgSize(tenantData?.logo_bg_size ?? 55)
      setLogoInHeader(tenantData?.logo_in_header !== false)
      setServiceLayout((tenantData?.service_layout as 'list' | 'grid') || 'list')
      setStaffLayout((tenantData?.staff_layout as 'list' | 'grid') || 'list')
      const savedTransition = tenantData?.booking_transition || 'swipe'
      if (savedTransition === 'none') { setTransitionEnabled(false); setBookingTransition('swipe') }
      else { setTransitionEnabled(true); setBookingTransition(savedTransition) }

      // Handle Google callback params
      const params = new URLSearchParams(window.location.search)
      if (params.get('success') === 'google_connected') setGoogleConnected(true)
      const errCode = params.get('error')
      if (errCode) {
        const errMap: Record<string, string> = { no_code: 'Nem érkezett authorization code', token_exchange_failed: 'Token csere sikertelen — ellenőrizd a Google Cloud Console redirect URI beállítást', no_refresh_token: 'Vond vissza az app jogosultságát a Google fióknál, majd próbáld újra', db_save_failed: 'Adatbázis mentési hiba' }
        setGoogleError(errMap[errCode] || `Hiba: ${errCode}`)
      }
    }
    init()
  }, [router])

  // ── Load general tab ──
  useEffect(() => {
    if (generalLoaded || !tenantId || !userId || tab !== 'general') return
    const run = async () => {
      const [tenantRes, profileRes, statusRes] = await Promise.all([
        supabase.from('tenants').select('*').eq('id', tenantId).single(),
        supabase.from('profiles').select('full_name, address, phone').eq('id', userId).single(),
        fetch(`/api/google/status?tenantId=${tenantId}`),
      ])
      const tenantData = tenantRes.data
      if (tenantData) {
        setName(tenantData.name || '')
        setDescription(tenantData.description || '')
        setPhone(tenantData.phone || profileRes.data?.phone || '')
        setCountry(tenantData.country || 'HU')
        setLogoUrl(tenantData.logo_url || '')
        setLogoPreview(tenantData.logo_url || '')
        setSlug(tenantData.slug || '')
        setOriginalSlug(tenantData.slug || '')
        setCustomDomain(tenantData.custom_domain || '')
        setRegistrationType(tenantData.registration_type || '')
        setRegTaxNumber(tenantData.tax_number || '')
        setRegAddress(tenantData.address || profileRes.data?.address || '')
        setBookingPrimaryColor(tenantData.booking_primary_color || '#1e3a8a')
        setBookingAccentColor(tenantData.booking_accent_color || '#2563eb')
        const savedTransition = tenantData.booking_transition || 'swipe'
        if (savedTransition === 'none') {
          setTransitionEnabled(false)
          setBookingTransition('swipe')
        } else {
          setTransitionEnabled(true)
          setBookingTransition(savedTransition)
        }
      }
      setRegFullName(profileRes.data?.full_name || '')
      const statusData = await statusRes.json()
      if (statusData.connected) setGoogleConnected(true)
      setGeneralLoaded(true)
    }
    void run()
  }, [generalLoaded, tenantId, userId, tab])

  // ── Load profile tab ──
  useEffect(() => {
    if (profileLoaded || !tenantId || tab !== 'profile') return
    const run = async () => {
      const { data: staff } = await supabase.from('staff').select('id, name, age, bio, profile_photo, reference_photos').eq('tenant_id', tenantId).eq('is_owner', true).single()
      if (staff) {
        setOwnerStaffId(staff.id)
        setOwnerName(staff.name || '')
        setOwnerAge(staff.age?.toString() || '')
        setOwnerBio(staff.bio || '')
        setOwnerPhoto(staff.profile_photo || '')
        setOwnerPhotoPreview(staff.profile_photo || '')
        setOwnerRefPhotos(staff.reference_photos || [])
      }
      setProfileLoaded(true)
    }
    void run()
  }, [profileLoaded, tenantId, tab])

  // ── General handlers ──
  const selectedCountry = COUNTRIES.find(c => c.code === country)

  const handleSaveGeneral = async () => {
    if (!tenantId || !userId) return
    if (slugStatus === 'taken' || slugStatus === 'invalid') { setGeneralError('A foglalási link nem elérhető.'); return }
    setGeneralLoading(true); setGeneralError(''); setGeneralSuccess(false)
    let finalLogoUrl = logoUrl
    if (logoFile) {
      const fileExt = logoFile.name.split('.').pop()
      const fileName = `${tenantId}.${fileExt}`
      const { error: uploadError } = await supabase.storage.from('logos').upload(fileName, logoFile, { upsert: true })
      if (uploadError) { setGeneralError('Logo feltöltési hiba: ' + uploadError.message); setGeneralLoading(false); return }
      const { data: urlData } = supabase.storage.from('logos').getPublicUrl(fileName)
      finalLogoUrl = urlData.publicUrl
    }
    const timezone = COUNTRIES.find(c => c.code === country)?.timezone || 'Europe/Budapest'
    const { error } = await supabase.from('tenants').update({ name, description, phone, country, timezone, logo_url: finalLogoUrl, slug, ...(isSuperAdmin && { custom_domain: customDomain }) }).eq('id', tenantId)
    await supabase.from('profiles').update({ phone: `${selectedCountry?.phone}${phone}` }).eq('id', userId)
    if (error) { setGeneralError(error.message) } else { setGeneralSuccess(true); setLogoUrl(finalLogoUrl); setOriginalSlug(slug) }
    setGeneralLoading(false)
  }

  const handleSaveAppearance = async () => {
    if (!tenantId) return
    setAppearanceSaving(true); setAppearanceSuccess(false)
    await supabase.from('tenants').update({ booking_primary_color: bookingPrimaryColor, booking_accent_color: bookingAccentColor, booking_transition: transitionEnabled ? bookingTransition : 'none', logo_in_background: logoInBackground, logo_bg_opacity: logoBgOpacity, logo_bg_size: logoBgSize, logo_in_header: logoInHeader, service_layout: serviceLayout, staff_layout: staffLayout }).eq('id', tenantId)
    setAppearanceSaving(false); setAppearanceSuccess(true)
    setTimeout(() => setAppearanceSuccess(false), 2500)
  }

  // ── Profile handlers ──
  const handleSaveProfile = async () => {
    if (!ownerStaffId) return
    setProfileSaving(true); setProfileSuccess(false); setProfileError('')
    let finalPhotoUrl = ownerPhoto
    if (ownerPhotoFile) {
      const fileExt = ownerPhotoFile.name.split('.').pop()
      const fileName = `${ownerStaffId}.${fileExt}`
      const { error: storageErr } = await supabase.storage.from('staff-photos').upload(fileName, ownerPhotoFile, { upsert: true })
      if (storageErr) { setProfileError('Profilkép feltöltése sikertelen: ' + storageErr.message); setProfileSaving(false); return }
      const { data: urlData } = supabase.storage.from('staff-photos').getPublicUrl(fileName)
      finalPhotoUrl = urlData.publicUrl
    }
    const { error } = await supabase.from('staff').update({ age: ownerAge ? parseInt(ownerAge) : null, bio: ownerBio, profile_photo: finalPhotoUrl }).eq('id', ownerStaffId)
    if (error) setProfileError('Mentés sikertelen: ' + error.message)
    else { setOwnerPhoto(finalPhotoUrl); setProfileSuccess(true) }
    setProfileSaving(false)
  }

  const handleAddRefPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (!files.length || !ownerStaffId) return
    const toUpload = files.slice(0, 7 - ownerRefPhotos.length)
    if (!toUpload.length) return
    setRefUploading(true); setRefError('')
    let current = [...ownerRefPhotos]
    for (const file of toUpload) {
      const fileExt = file.name.split('.').pop()
      const fileName = `ref-${ownerStaffId}-${Date.now()}-${Math.random().toString(36).slice(2)}.${fileExt}`
      const { error } = await supabase.storage.from('staff-photos').upload(fileName, file, { upsert: false })
      if (error) { setRefError('Feltöltési hiba: ' + error.message); break }
      const { data: urlData } = supabase.storage.from('staff-photos').getPublicUrl(fileName)
      current = [...current, urlData.publicUrl]
    }
    setOwnerRefPhotos(current)
    await supabase.from('staff').update({ reference_photos: current }).eq('id', ownerStaffId)
    setRefUploading(false); e.target.value = ''
  }

  const handleRemoveRefPhoto = async (url: string) => {
    if (!ownerStaffId) return
    const newPhotos = ownerRefPhotos.filter(p => p !== url)
    setOwnerRefPhotos(newPhotos)
    await supabase.from('staff').update({ reference_photos: newPhotos }).eq('id', ownerStaffId)
    const fileName = url.split('/').pop()
    if (fileName) await supabase.storage.from('staff-photos').remove([fileName])
  }

  const handleDeleteAccount = async () => {
    if (!userId) return
    setDeleteLoading(true); setDeleteError('')
    const res = await fetch('/api/owner/delete-account', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId }) })
    const data = await res.json()
    if (!res.ok) { setDeleteError(data.error || 'Ismeretlen hiba'); setDeleteLoading(false); return }
    await supabase.auth.signOut()
    router.push('/')
  }

  // ─────────────────────────────────────────────────────────────────────────────

  const isExpired = (() => {
    if (!planExpiresAt || plan === 'free') return false
    const graceEnd = new Date(planExpiresAt)
    graceEnd.setDate(graceEnd.getDate() + 3)
    return new Date() > graceEnd
  })()

  // Lejárt előfizetés esetén csak profile tab elérhető
  if (isExpired && tab !== 'profile') {
    setTab('profile')
  }

  return (
    <div>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#111827', marginBottom: '1.25rem' }}>{t.dash.settings_title}</h1>

      {/* Fő tabok */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '2rem', flexWrap: 'wrap' }}>
        {!isExpired && <TabBtn label={`🏪 ${t.dash.tab_general}`} active={tab === 'general'} onClick={() => setTab('general')} />}
        {!isExpired && <TabBtn label={`🔗 ${t.dash.tab_integrations}`} active={tab === 'integrations'} onClick={() => setTab('integrations')} />}
        {!isExpired && <TabBtn label="🎨 Foglalási oldal" active={tab === 'appearance'} onClick={() => setTab('appearance')} />}
        <TabBtn label={`👑 ${t.dash.tab_profile}`} active={tab === 'profile'} onClick={() => setTab('profile')} />
      </div>

      {/* ══════════════ ÁLTALÁNOS TAB ══════════════ */}
      {tab === 'general' && (
        <div style={{ display: 'flex', gap: '2rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: '300px', maxWidth: '560px' }}>
            <div style={{ backgroundColor: 'white', padding: '2rem', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>

              {/* Logo */}
              <div style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
                <div style={{ width: '80px', height: '80px', borderRadius: '50%', backgroundColor: '#f3f4f6', border: '2px dashed #d1d5db', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
                  {logoPreview ? <Image src={logoPreview} alt="Logo" width={80} height={80} style={{ objectFit: 'cover', borderRadius: '50%' }} /> : <span style={{ fontSize: '2rem' }}>🏪</span>}
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', color: '#374151', marginBottom: '0.5rem' }}>{t.dash.logo_upload}</label>
                  <input type="file" accept="image/*" onChange={e => { const f = e.target.files?.[0]; if (f) { setLogoFile(f); const r = new FileReader(); r.onloadend = () => setLogoPreview(r.result as string); r.readAsDataURL(f) } }} id="logo-upload" style={{ display: 'none' }} />
                  <label htmlFor="logo-upload" style={{ display: 'inline-block', padding: '0.5rem 1.25rem', backgroundColor: '#f3f4f6', border: '1px solid #d1d5db', borderRadius: '8px', cursor: 'pointer', fontSize: '0.875rem', color: '#374151', fontWeight: '500' }}>{t.dash.profile_photo_btn}</label>
                  <p style={{ fontSize: '0.75rem', color: '#9ca3af', marginTop: '0.5rem' }}>{t.dash.profile_photo_hint}</p>
                </div>
              </div>

              {[
                { label: t.dash.business_name_field, value: name, setter: setName, placeholder: 'Kovács Barbershop', type: 'text' },
              ].map(f => (
                <div key={f.label} style={{ marginBottom: '1.25rem' }}>
                  <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', color: '#374151', marginBottom: '0.5rem' }}>{f.label}</label>
                  <input type={f.type} value={f.value} onChange={e => f.setter(e.target.value)} placeholder={f.placeholder} style={{ width: '100%', border: '1px solid #d1d5db', borderRadius: '8px', padding: '0.625rem 1rem', color: '#111827', outline: 'none', boxSizing: 'border-box' }} />
                </div>
              ))}

              <div style={{ marginBottom: '1.25rem' }}>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', color: '#374151', marginBottom: '0.5rem' }}>{t.dash.description_label}</label>
                <RichTextEditor value={description} onChange={setDescription} rows={3} placeholder={t.dash.description_ph} />
              </div>

              <div style={{ marginBottom: '1.25rem' }}>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', color: '#374151', marginBottom: '0.5rem' }}>{t.auth.email}</label>
                <input type="email" value={userEmail} disabled style={{ width: '100%', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '0.625rem 1rem', color: '#6b7280', backgroundColor: '#f9fafb', outline: 'none', boxSizing: 'border-box', cursor: 'not-allowed' }} />
              </div>

              <div style={{ marginBottom: '1.25rem' }}>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', color: '#374151', marginBottom: '0.5rem' }}>{t.dash.country_label}</label>
                <select value={country} onChange={e => setCountry(e.target.value)} style={{ width: '100%', border: '1px solid #d1d5db', borderRadius: '8px', padding: '0.625rem 1rem', color: '#111827', outline: 'none', boxSizing: 'border-box', backgroundColor: 'white' }}>
                  {COUNTRIES.map(c => <option key={c.code} value={c.code}>{c.name}</option>)}
                </select>
                {selectedCountry && <p style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem' }}>🕐 {selectedCountry.timezone} · 📞 {selectedCountry.phone}</p>}
              </div>

              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', color: '#374151', marginBottom: '0.5rem' }}>{t.dash.phone_label}</label>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <div style={{ padding: '0.625rem 1rem', border: '1px solid #d1d5db', borderRadius: '8px', backgroundColor: '#f9fafb', color: '#6b7280', fontSize: '0.875rem' }}>{selectedCountry?.phone}</div>
                  <input type="tel" value={phone} onChange={e => setPhone(e.target.value.replace(/[^\d+\s\-()]/g, ''))} placeholder="30 123 4567" style={{ flex: 1, border: '1px solid #d1d5db', borderRadius: '8px', padding: '0.625rem 1rem', color: '#111827', outline: 'none', boxSizing: 'border-box' }} />
                </div>
              </div>

              {/* Foglalási link */}
              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', color: '#374151', marginBottom: '0.5rem' }}>{t.dash.booking_url_label}</label>
                <div style={{ display: 'flex', alignItems: 'center', border: `1px solid ${slugStatus === 'available' ? '#22c55e' : (slugStatus === 'taken' || slugStatus === 'invalid') ? '#ef4444' : '#d1d5db'}`, borderRadius: '8px', overflow: 'hidden' }}>
                  <span style={{ padding: '0.625rem 1rem', backgroundColor: '#f9fafb', color: '#6b7280', fontSize: '0.875rem', borderRight: '1px solid #d1d5db', whiteSpace: 'nowrap' }}>
                    {process.env.NEXT_PUBLIC_SITE_URL?.replace('http://', '').replace('https://', '') || 'localhost:3000'}/
                  </span>
                  <input type="text" value={slug} onChange={e => {
                    const val = e.target.value.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
                    setSlug(val); setSlugStatus('checking'); setSlugMessage('')
                    if (slugDebounceRef.current) clearTimeout(slugDebounceRef.current)
                    if (!val) { setSlugStatus('idle'); return }
                    slugDebounceRef.current = setTimeout(async () => {
                      if (val === originalSlug) { setSlugStatus('available'); setSlugMessage(t.dash.slug_current); return }
                      const res = await fetch(`/api/tenants/check-slug?slug=${val}&tenantId=${tenantId}`)
                      const data = await res.json()
                      if (data.available) { setSlugStatus('available'); setSlugMessage(t.dash.slug_available) }
                      else { setSlugStatus('taken'); setSlugMessage(`❌ ${data.reason}`) }
                    }, 500)
                  }} style={{ flex: 1, padding: '0.625rem 1rem', color: '#111827', outline: 'none', border: 'none' }} placeholder="kovacs-barbershop" />
                  <span style={{ padding: '0 0.75rem' }}>{slugStatus === 'checking' && '⏳'}{slugStatus === 'available' && '✅'}{(slugStatus === 'taken' || slugStatus === 'invalid') && '❌'}</span>
                </div>
                {slugMessage && <p style={{ fontSize: '0.75rem', marginTop: '0.25rem', color: slugStatus === 'available' ? '#16a34a' : '#ef4444' }}>{slugMessage}</p>}
              </div>

              {generalError && <p style={{ color: '#ef4444', fontSize: '0.875rem', marginBottom: '1rem' }}>{generalError}</p>}
              {generalSuccess && <p style={{ color: '#22c55e', fontSize: '0.875rem', marginBottom: '1rem' }}>{t.dash.general_saved}</p>}

              <button onClick={handleSaveGeneral} disabled={generalLoading} style={{ backgroundColor: '#2563eb', color: 'white', padding: '0.75rem 2rem', borderRadius: '8px', border: 'none', cursor: 'pointer', fontWeight: '500', opacity: generalLoading ? 0.5 : 1 }}>
                {generalLoading ? t.dash.saving : `💾 ${t.dash.save_btn}`}
              </button>
            </div>
          </div>

          {/* Regisztrációs adatok */}
          {registrationType && (
            <div style={{ backgroundColor: 'white', padding: '1.75rem', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', maxWidth: '560px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem' }}>
                <h2 style={{ fontSize: '1rem', fontWeight: '700', color: '#111827', margin: 0 }}>
                  {registrationType === 'business' ? t.dash.reg_business : t.dash.reg_personal_reg}
                </h2>
                <span style={{
                  fontSize: '0.72rem', fontWeight: '700', padding: '0.2rem 0.625rem', borderRadius: '999px',
                  backgroundColor: registrationType === 'business' ? '#dbeafe' : '#f0fdf4',
                  color: registrationType === 'business' ? '#1d4ed8' : '#15803d',
                  border: `1px solid ${registrationType === 'business' ? '#bfdbfe' : '#bbf7d0'}`,
                }}>
                  {registrationType === 'business' ? t.dash.reg_business_badge : t.dash.reg_personal_badge}
                </span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {registrationType === 'business' ? (
                  <>
                    <Row label={t.dash.reg_company_name} value={name} />
                    <Row label={t.dash.reg_tax} value={regTaxNumber} />
                    <Row label={t.dash.reg_hq} value={regAddress} />
                    <Row label={t.auth.email} value={userEmail} />
                  </>
                ) : (
                  <>
                    <Row label={t.dash.reg_full_name_label} value={regFullName} />
                    <Row label={t.dash.reg_home_addr} value={regAddress} />
                    <Row label={t.auth.email} value={userEmail} />
                  </>
                )}
              </div>
            </div>
          )}

        </div>
      )}

      {/* ══════════════ INTEGRÁCIÓK TAB ══════════════ */}
      {tab === 'integrations' && (
        <div style={{ maxWidth: '480px' }}>
          <div style={{ backgroundColor: 'white', padding: '1.5rem', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', marginBottom: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.25rem' }}>
              <div style={{ width: '48px', height: '48px', borderRadius: '12px', backgroundColor: '#f0f9ff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.75rem', flexShrink: 0 }}>📅</div>
              <div>
                <p style={{ fontWeight: '700', color: '#111827', fontSize: '1rem', margin: 0 }}>{t.dash.google_calendar}</p>
                <p style={{ color: googleConnected ? '#16a34a' : '#9ca3af', fontSize: '0.8rem', margin: 0, fontWeight: googleConnected ? '600' : '400' }}>
                  {googleConnected ? t.dash.google_connected_label : t.dash.google_not_connected}
                </p>
              </div>
            </div>
            <p style={{ fontSize: '0.8rem', color: '#6b7280', marginBottom: '1.25rem', lineHeight: 1.6 }}>
              {t.dash.google_desc}
            </p>
            {googleError && <p style={{ color: '#ef4444', fontSize: '0.8rem', marginBottom: '1rem', backgroundColor: '#fef2f2', padding: '0.625rem 0.875rem', borderRadius: '8px', border: '1px solid #fecaca' }}>{googleError}</p>}
            <button
              onClick={() => window.location.href = `/api/google/auth?tenantId=${tenantId}`}
              style={{ width: '100%', padding: '0.75rem', backgroundColor: '#4285f4', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '0.875rem', fontWeight: '600' }}
            >
              🔗 {googleConnected ? t.dash.google_reconnect : t.dash.google_connect}
            </button>
          </div>
        </div>
      )}

      {/* ══════════════ FOGLALÁSI OLDAL / MEGJELENÉS TAB ══════════════ */}
      {tab === 'appearance' && (
        <div style={{ maxWidth: '560px' }}>
          <div style={{ backgroundColor: 'white', padding: '2rem', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>

            {/* ══ 1. SZEKCIÓ: Logo a háttérben ══ */}
            <div style={{ marginBottom: '2rem', paddingBottom: '2rem', borderBottom: '1px solid #f3f4f6' }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1rem', alignItems: 'center' }}>
                <h3 style={{ fontSize: '0.95rem', fontWeight: '700', color: '#111827', margin: 0, flexBasis: '100%' }}>🖼️ Logo beállítások</h3>

                {/* Fejléc logo toggle */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', backgroundColor: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '0.5rem 0.75rem' }}>
                  <span style={{ fontSize: '0.8rem', fontWeight: '600', color: '#374151' }}>Logo a fejlécben</span>
                  <button onClick={() => setLogoInHeader(v => !v)}
                    style={{ width: '36px', height: '20px', borderRadius: '10px', border: 'none', backgroundColor: logoInHeader ? '#22c55e' : '#d1d5db', cursor: 'pointer', position: 'relative', flexShrink: 0, transition: 'background-color 0.2s' }}>
                    <div style={{ position: 'absolute', top: '2px', left: logoInHeader ? '18px' : '2px', width: '16px', height: '16px', borderRadius: '50%', backgroundColor: 'white', transition: 'left 0.2s', boxShadow: '0 1px 2px rgba(0,0,0,0.2)' }} />
                  </button>
                </div>

                {/* Háttér logo toggle */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', backgroundColor: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '0.5rem 0.75rem' }}>
                  <span style={{ fontSize: '0.8rem', fontWeight: '600', color: '#374151' }}>Logo a háttérben</span>
                  <button onClick={() => setLogoInBackground(v => !v)}
                    style={{ width: '36px', height: '20px', borderRadius: '10px', border: 'none', backgroundColor: logoInBackground ? '#22c55e' : '#d1d5db', cursor: 'pointer', position: 'relative', flexShrink: 0, transition: 'background-color 0.2s' }}>
                    <div style={{ position: 'absolute', top: '2px', left: logoInBackground ? '18px' : '2px', width: '16px', height: '16px', borderRadius: '50%', backgroundColor: 'white', transition: 'left 0.2s', boxShadow: '0 1px 2px rgba(0,0,0,0.2)' }} />
                  </button>
                </div>
              </div>

              {logoInBackground && (
                <div style={{ marginBottom: '1rem', display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
                  <div>
                    <label style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', fontWeight: '600', color: '#374151', marginBottom: '0.5rem' }}>
                      <span>Átlátszóság</span>
                      <span style={{ fontFamily: 'monospace', color: '#2563eb' }}>{Math.round(logoBgOpacity * 100)}%</span>
                    </label>
                    <input type="range" min="3" max="35" value={Math.round(logoBgOpacity * 100)}
                      onChange={e => setLogoBgOpacity(parseInt(e.target.value) / 100)}
                      style={{ width: '100%', accentColor: '#2563eb', cursor: 'pointer' }} />
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.65rem', color: '#9ca3af', marginTop: '0.2rem' }}>
                      <span>Halvány</span><span>Erős</span>
                    </div>
                  </div>
                  <div>
                    <label style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', fontWeight: '600', color: '#374151', marginBottom: '0.5rem' }}>
                      <span>Méret</span>
                      <span style={{ fontFamily: 'monospace', color: '#2563eb' }}>{logoBgSize}%</span>
                    </label>
                    <input type="range" min="15" max="100" value={logoBgSize}
                      onChange={e => setLogoBgSize(parseInt(e.target.value))}
                      style={{ width: '100%', accentColor: '#2563eb', cursor: 'pointer' }} />
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.65rem', color: '#9ca3af', marginTop: '0.2rem' }}>
                      <span>Kis</span><span>Nagy</span>
                    </div>
                  </div>
                </div>
              )}

              {/* ── Logo preview ── */}
              <div style={{ borderRadius: '12px', overflow: 'hidden', border: '1px solid #e2e8f0', boxShadow: '0 2px 8px rgba(0,0,0,0.07)' }}>
                <div style={{ position: 'relative', backgroundColor: '#f8fafc', height: '130px' }}>
                  {/* Logo vízjel */}
                  {appearanceLogoUrl && logoInBackground
                    ? <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Image src={appearanceLogoUrl} alt="" width={400} height={300} sizes="50vw" style={{ width: `${Math.round(logoBgSize * 0.55)}%`, height: 'auto', objectFit: 'contain', opacity: logoBgOpacity, userSelect: 'none', pointerEvents: 'none' }} />
                      </div>
                    : !appearanceLogoUrl
                      ? <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <span style={{ fontSize: '0.7rem', color: '#cbd5e1' }}>Logo az Általános fülön tölthető fel</span>
                        </div>
                      : null
                  }
                  {/* Mock tartalom */}
                  <div style={{ position: 'relative', zIndex: 1, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '7px', height: '100%', boxSizing: 'border-box', justifyContent: 'center' }}>
                    {[{ w: '62%', w2: '40%' }, { w: '48%', w2: '32%' }].map((s, i) => (
                      <div key={i} style={{ backgroundColor: 'rgba(255,255,255,0.82)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)', borderRadius: '8px', padding: '8px 10px', border: '1.5px solid #e5e7eb', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div style={{ width: '20px', height: '20px', borderRadius: '5px', backgroundColor: '#f3f4f6', flexShrink: 0 }} />
                        <div style={{ flex: 1 }}>
                          <div style={{ height: '4px', backgroundColor: '#374151', borderRadius: '2px', width: s.w, marginBottom: '4px' }} />
                          <div style={{ height: '3px', backgroundColor: '#94a3b8', borderRadius: '2px', width: s.w2 }} />
                        </div>
                        <div style={{ height: '10px', width: '22px', backgroundColor: bookingAccentColor, borderRadius: '4px', opacity: 0.5 }} />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* ══ 2. SZEKCIÓ: Foglalási oldal megjelenése ══ */}
            <div style={{ marginBottom: '2rem', paddingBottom: '2rem', borderBottom: '1px solid #f3f4f6' }}>
              <h2 style={{ fontSize: '0.95rem', fontWeight: '700', color: '#111827', marginBottom: '1rem' }}>🎨 Foglalási oldal megjelenése</h2>

              <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap', marginBottom: '1.25rem' }}>
                {([
                  { label: 'Fejléc szín', value: bookingPrimaryColor, setter: setBookingPrimaryColor, defaultVal: '#1e3a8a' },
                  { label: 'Kiemelés / Gombok', value: bookingAccentColor, setter: setBookingAccentColor, defaultVal: '#2563eb' },
                ] as const).map(({ label, value, setter, defaultVal }) => (
                  <div key={label}>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '600', color: '#374151', marginBottom: '0.5rem' }}>{label}</label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <input type="color" value={value} onChange={e => setter(e.target.value)}
                        style={{ width: '40px', height: '40px', border: '1px solid #e5e7eb', borderRadius: '8px', cursor: 'pointer', padding: '2px', flexShrink: 0 }} />
                      <input type="text" value={value} onChange={e => setter(e.target.value)} maxLength={7}
                        style={{ width: '88px', border: '1px solid #d1d5db', borderRadius: '8px', padding: '0.375rem 0.625rem', color: '#111827', outline: 'none', fontSize: '0.82rem', fontFamily: 'monospace' }} />
                      {value !== defaultVal && (
                        <button onClick={() => setter(defaultVal)} title="Visszaállítás"
                          style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', fontSize: '0.8rem', padding: '0.25rem' }}>↺</button>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* ── Szín preview ── */}
              <div style={{ borderRadius: '12px', overflow: 'hidden', border: '1px solid #e2e8f0', boxShadow: '0 2px 8px rgba(0,0,0,0.07)' }}>
                {/* Header */}
                <div style={{ background: `linear-gradient(135deg, #0f172a 0%, ${bookingPrimaryColor} 100%)`, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                  {logoInHeader && (
                    appearanceLogoUrl
                      ? <Image src={appearanceLogoUrl} alt="" width={28} height={28} style={{ width: '28px', height: '28px', borderRadius: '50%', objectFit: 'cover', border: '2px solid rgba(255,255,255,0.3)', flexShrink: 0 }} />
                      : <div style={{ width: '28px', height: '28px', borderRadius: '50%', backgroundColor: 'rgba(255,255,255,0.18)', flexShrink: 0 }} />
                  )}
                  <div>
                    <div style={{ height: '6px', backgroundColor: 'white', borderRadius: '3px', width: '80px', marginBottom: '4px' }} />
                    <div style={{ height: '4px', backgroundColor: 'rgba(255,255,255,0.4)', borderRadius: '3px', width: '52px' }} />
                  </div>
                </div>
                {/* Content */}
                <div style={{ backgroundColor: '#f8fafc', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {[{ w: '65%', w2: '42%', accent: true }, { w: '52%', w2: '35%', accent: false }].map((s, i) => (
                    <div key={i} style={{ backgroundColor: 'rgba(255,255,255,0.82)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)', borderRadius: '8px', padding: '8px 10px', border: s.accent ? `2px solid ${bookingAccentColor}` : '1.5px solid #e5e7eb', display: 'flex', alignItems: 'center', gap: '8px', boxShadow: s.accent ? `0 2px 8px ${bookingAccentColor}30` : 'none' }}>
                      <div style={{ width: '20px', height: '20px', borderRadius: '5px', backgroundColor: s.accent ? `${bookingAccentColor}18` : '#f3f4f6', flexShrink: 0 }} />
                      <div style={{ flex: 1 }}>
                        <div style={{ height: '4px', backgroundColor: '#1e293b', borderRadius: '2px', width: s.w, marginBottom: '4px' }} />
                        <div style={{ height: '3px', backgroundColor: '#94a3b8', borderRadius: '2px', width: s.w2 }} />
                      </div>
                      <div style={{ height: '10px', width: '22px', backgroundColor: bookingAccentColor, borderRadius: '4px', opacity: s.accent ? 1 : 0.4 }} />
                    </div>
                  ))}
                  <div style={{ backgroundColor: bookingAccentColor, borderRadius: '8px', padding: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: `0 3px 10px ${bookingAccentColor}44` }}>
                    <div style={{ height: '5px', backgroundColor: 'rgba(255,255,255,0.9)', borderRadius: '2px', width: '42%' }} />
                  </div>
                </div>
              </div>
            </div>

            {/* ══ 3. SZEKCIÓ: Lépésváltó effekt ══ */}
            <style>{`
              @keyframes bkpSwipe     { from { transform: translateX(0%)               } to { transform: translateX(-50%)             } }
              @keyframes bkpFade      { from { opacity: 0                              } to { opacity: 1                             } }
              @keyframes bkpSlide     { from { transform: translateY(16px); opacity: 0 } to { transform: translateY(0); opacity: 1   } }
              @keyframes bkpZoom      { from { transform: scale(0.88); opacity: 0      } to { transform: scale(1); opacity: 1        } }
              @keyframes bkpSlideDown { from { transform: translateY(-16px); opacity: 0 } to { transform: translateY(0); opacity: 1  } }
              @keyframes bkpBounce    { 0%{transform:scale(0.82);opacity:0} 70%{transform:scale(1.08)} 100%{transform:scale(1);opacity:1} }
              @keyframes bkpFlip      { from { transform: rotateY(90deg); opacity: 0   } to { transform: rotateY(0deg); opacity: 1   } }
              @keyframes bkpPop       { 0%{transform:scale(0.65);opacity:0} 70%{transform:scale(1.1)} 100%{transform:scale(1);opacity:1} }
              @keyframes bkpWipe      { from { transform: translateX(-30px); opacity: 0 } to { transform: translateX(0); opacity: 1  } }
              @keyframes bkpTilt      { from { transform: skewX(12deg) translateX(-14px); opacity: 0 } to { transform: skewX(0) translateX(0); opacity: 1 } }
              @keyframes bkpSpin      { from { transform: rotate(-130deg) scale(0.6); opacity: 0 } to { transform: rotate(0) scale(1); opacity: 1 } }
              @keyframes bkpDrop      { 0%{transform:translateY(-22px) scale(1.04);opacity:0} 80%{transform:translateY(2px) scale(0.98)} 100%{transform:translateY(0) scale(1);opacity:1} }
              @keyframes bkpElastic   { 0%{transform:scale(0.5);opacity:0} 55%{transform:scale(1.12)} 75%{transform:scale(0.93)} 90%{transform:scale(1.04)} 100%{transform:scale(1);opacity:1} }
              @keyframes bkpRipple    { 0%{transform:scale(0.4);opacity:0} 60%{transform:scale(1.06)} 80%{transform:scale(0.97)} 100%{transform:scale(1);opacity:1} }
            `}</style>
            <div style={{ marginBottom: '1.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
                <h3 style={{ fontSize: '0.95rem', fontWeight: '700', color: '#111827', margin: 0 }}>✨ Lépésváltó effekt</h3>
                <button onClick={() => setTransitionEnabled(v => !v)}
                  style={{ width: '40px', height: '22px', borderRadius: '11px', border: 'none', backgroundColor: transitionEnabled ? '#22c55e' : '#d1d5db', cursor: 'pointer', position: 'relative', flexShrink: 0, transition: 'background-color 0.2s' }}>
                  <div style={{ position: 'absolute', top: '2px', left: transitionEnabled ? '20px' : '2px', width: '18px', height: '18px', borderRadius: '50%', backgroundColor: 'white', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
                </button>
                <span style={{ fontSize: '0.75rem', color: transitionEnabled ? '#16a34a' : '#9ca3af', fontWeight: '500' }}>
                  {transitionEnabled ? 'Bekapcsolva' : 'Kikapcsolva'}
                </span>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', opacity: transitionEnabled ? 1 : 0.35, pointerEvents: transitionEnabled ? 'auto' : 'none', marginBottom: '1rem' }}>
                {(() => {
                  const BASIC = [
                    { key: 'swipe',      icon: '📱', label: 'Lapozás'      },
                    { key: 'fade',       icon: '✨', label: 'Halványulás'  },
                    { key: 'slide-up',   icon: '⬆️', label: 'Felcsúszás'   },
                    { key: 'zoom',       icon: '🔍', label: 'Nagyítás'     },
                  ] as const
                  const EXTRA = [
                    { key: 'slide-down', icon: '⬇️', label: 'Lecsúszás'    },
                    { key: 'bounce',     icon: '🎯', label: 'Visszapattan' },
                    { key: 'flip',       icon: '🔄', label: 'Fordulás'     },
                    { key: 'pop',        icon: '💫', label: 'Ugrás'        },
                    { key: 'wipe',       icon: '💨', label: 'Átcsúszás'    },
                    { key: 'tilt',       icon: '📐', label: 'Döntés'       },
                    { key: 'spin',       icon: '🌀', label: 'Pörgetés'     },
                    { key: 'drop',       icon: '🪂', label: 'Ejtés'        },
                    { key: 'elastic',    icon: '🎪', label: 'Rugalmas'     },
                    { key: 'ripple',     icon: '💦', label: 'Hullám'       },
                  ] as const
                  const isRandom = bookingTransition === 'random'
                  return (<>
                    {[...BASIC, ...EXTRA].map(opt => (
                      <button key={opt.key} onClick={() => { setBookingTransition(opt.key); setPreviewKey(k => k + 1) }}
                        style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.25rem', padding: '0.625rem 0.75rem', borderRadius: '10px', cursor: 'pointer', minWidth: '64px', border: `2px solid ${bookingTransition === opt.key ? '#2563eb' : '#e5e7eb'}`, backgroundColor: bookingTransition === opt.key ? '#eff6ff' : 'white' }}>
                        <span style={{ fontSize: '1.25rem', lineHeight: 1 }}>{opt.icon}</span>
                        <span style={{ fontSize: '0.72rem', fontWeight: bookingTransition === opt.key ? '700' : '500', color: bookingTransition === opt.key ? '#2563eb' : '#374151' }}>{opt.label}</span>
                      </button>
                    ))}
                    <button onClick={() => { setBookingTransition('random'); setPreviewKey(k => k + 1) }}
                      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.25rem', padding: '0.625rem 0.75rem', borderRadius: '10px', cursor: 'pointer', minWidth: '64px', border: `2px solid ${isRandom ? '#7c3aed' : '#ede9fe'}`, backgroundColor: isRandom ? '#f5f3ff' : 'white' }}>
                      <span style={{ fontSize: '1.25rem', lineHeight: 1 }}>🎲</span>
                      <span style={{ fontSize: '0.72rem', fontWeight: isRandom ? '700' : '500', color: isRandom ? '#7c3aed' : '#6b7280' }}>Véletlen</span>
                    </button>
                  </>)
                })()}
              </div>
              {/* ── Effekt preview ── */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div style={{ width: '120px', borderRadius: '10px', overflow: 'hidden', border: '1px solid #e2e8f0', backgroundColor: '#f1f5f9', flexShrink: 0 }}>
                  <div style={{ height: '3px', backgroundColor: '#cbd5e1' }} />
                  {bookingTransition === 'random' ? (
                    <div key={previewKey} style={{ padding: '0.4rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.3rem' }}>
                      {[
                        { anim: 'bkpFade 0.45s ease both', label: '✨' },
                        { anim: 'bkpSlide 0.4s cubic-bezier(0.4,0,0.2,1) both', label: '⬆️' },
                        { anim: 'bkpZoom 0.38s cubic-bezier(0.4,0,0.2,1) both', label: '🔍' },
                        { anim: 'bkpSwipe 0.42s cubic-bezier(0.4,0,0.2,1) both', label: '📱' },
                      ].map((item, idx) => (
                        <div key={idx} style={{ animation: item.anim, backgroundColor: 'white', borderRadius: '5px', border: '1.5px solid #e2e8f0', height: '34px', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: '2px' }}>
                          <span style={{ fontSize: '0.65rem', lineHeight: 1 }}>{item.label}</span>
                          <div style={{ height: '3px', backgroundColor: '#cbd5e1', borderRadius: '2px', width: '60%' }} />
                        </div>
                      ))}
                    </div>
                  ) : bookingTransition === 'swipe' ? (
                    <div key={previewKey} style={{ overflow: 'hidden' }}>
                      <div style={{ display: 'flex', width: '200%', animation: 'bkpSwipe 0.42s cubic-bezier(0.4,0,0.2,1) both' }}>
                        {[0, 1].map(i => (
                          <div key={i} style={{ width: '50%', padding: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                            <div style={{ height: '4px', backgroundColor: i === 0 ? '#475569' : '#94a3b8', borderRadius: '3px', width: '70%', opacity: 0.6 }} />
                            <div style={{ height: '20px', backgroundColor: 'white', borderRadius: '4px', border: '1.5px solid ' + (i === 0 ? '#475569' : '#e2e8f0') }} />
                            <div style={{ height: '12px', backgroundColor: 'white', borderRadius: '4px', border: '1.5px solid #e2e8f0', opacity: 0.55 }} />
                            {i === 1 && <div style={{ height: '9px', backgroundColor: '#475569', borderRadius: '4px', opacity: 0.85 }} />}
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div key={previewKey} style={{ padding: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.3rem', animation: ({
                      'fade':       'bkpFade      0.4s ease both',
                      'slide-up':   'bkpSlide     0.38s cubic-bezier(0.4,0,0.2,1) both',
                      'zoom':       'bkpZoom      0.35s cubic-bezier(0.4,0,0.2,1) both',
                      'slide-down': 'bkpSlideDown 0.38s cubic-bezier(0.4,0,0.2,1) both',
                      'bounce':     'bkpBounce    0.5s  cubic-bezier(0.4,0,0.2,1) both',
                      'flip':       'bkpFlip      0.4s  ease both',
                      'pop':        'bkpPop       0.45s cubic-bezier(0.4,0,0.2,1) both',
                      'wipe':       'bkpWipe      0.38s cubic-bezier(0.4,0,0.2,1) both',
                      'tilt':       'bkpTilt      0.4s  ease both',
                      'spin':       'bkpSpin      0.45s cubic-bezier(0.4,0,0.2,1) both',
                      'drop':       'bkpDrop      0.45s cubic-bezier(0.4,0,0.2,1) both',
                      'elastic':    'bkpElastic   0.55s cubic-bezier(0.4,0,0.2,1) both',
                      'ripple':     'bkpRipple    0.5s  cubic-bezier(0.4,0,0.2,1) both',
                    } as Record<string,string>)[bookingTransition] || 'none' }}>
                      <div style={{ height: '4px', backgroundColor: '#94a3b8', borderRadius: '3px', width: '70%', opacity: 0.6 }} />
                      <div style={{ height: '20px', backgroundColor: 'white', borderRadius: '4px', border: '1.5px solid #475569' }} />
                      <div style={{ height: '12px', backgroundColor: 'white', borderRadius: '4px', border: '1.5px solid #e2e8f0', opacity: 0.55 }} />
                      <div style={{ height: '9px', backgroundColor: '#475569', borderRadius: '4px', opacity: 0.85 }} />
                    </div>
                  )}
                </div>
                <button onClick={() => setPreviewKey(k => k + 1)}
                  style={{ fontSize: '0.75rem', color: '#2563eb', background: 'none', border: '1px solid #bfdbfe', borderRadius: '6px', padding: '0.3rem 0.75rem', cursor: 'pointer', fontWeight: '600' }}>▶ Újra</button>
              </div>
            </div>

            {/* ══ 4. SZEKCIÓ: Szolgáltatások elrendezése ══ */}
            <div style={{ marginBottom: '2rem', paddingTop: '2rem', borderTop: '1px solid #f3f4f6' }}>
              <h3 style={{ fontSize: '0.95rem', fontWeight: '700', color: '#111827', marginBottom: '1rem' }}>📋 Szolgáltatások elrendezése</h3>
              <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.25rem' }}>
                {([
                  { key: 'list', label: 'Lista', desc: 'Egymás alatt' },
                  { key: 'grid', label: 'Rács', desc: '2 oszlopban' },
                ] as const).map(opt => (
                  <button key={opt.key} onClick={() => setServiceLayout(opt.key)}
                    style={{ flex: 1, padding: '0.875rem 0.75rem', borderRadius: '12px', border: `2px solid ${serviceLayout === opt.key ? bookingAccentColor : '#e5e7eb'}`, backgroundColor: serviceLayout === opt.key ? `${bookingAccentColor}10` : 'white', cursor: 'pointer', textAlign: 'center' }}>
                    {/* Mini layout preview */}
                    <div style={{ marginBottom: '0.5rem', display: 'flex', flexDirection: opt.key === 'grid' ? 'row' : 'column', gap: '4px', justifyContent: 'center' }}>
                      {opt.key === 'list' ? (
                        <>
                          <div style={{ height: '10px', backgroundColor: serviceLayout === 'list' ? `${bookingAccentColor}40` : '#e2e8f0', borderRadius: '4px', width: '100%' }} />
                          <div style={{ height: '10px', backgroundColor: serviceLayout === 'list' ? `${bookingAccentColor}25` : '#e2e8f0', borderRadius: '4px', width: '100%' }} />
                          <div style={{ height: '10px', backgroundColor: serviceLayout === 'list' ? `${bookingAccentColor}15` : '#e2e8f0', borderRadius: '4px', width: '100%' }} />
                        </>
                      ) : (
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px', width: '100%' }}>
                          {[0,1,2,3].map(i => (
                            <div key={i} style={{ height: '22px', backgroundColor: serviceLayout === 'grid' ? `${bookingAccentColor}${i === 0 ? '40' : i === 1 ? '30' : i === 2 ? '20' : '15'}` : '#e2e8f0', borderRadius: '4px' }} />
                          ))}
                        </div>
                      )}
                    </div>
                    <div style={{ fontSize: '0.82rem', fontWeight: '700', color: serviceLayout === opt.key ? bookingAccentColor : '#374151' }}>{opt.label}</div>
                    <div style={{ fontSize: '0.7rem', color: '#9ca3af', marginTop: '2px' }}>{opt.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* ══ 5. SZEKCIÓ: Munkatársak elrendezése ══ */}
            <div style={{ marginBottom: '2rem', paddingTop: '2rem', borderTop: '1px solid #f3f4f6' }}>
              <h3 style={{ fontSize: '0.95rem', fontWeight: '700', color: '#111827', marginBottom: '1rem' }}>👤 Munkatársak elrendezése</h3>
              <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.25rem' }}>
                {([
                  { key: 'list', label: 'Lista', desc: 'Egymás alatt' },
                  { key: 'grid', label: 'Rács', desc: '2 oszlopban' },
                ] as const).map(opt => (
                  <button key={opt.key} onClick={() => setStaffLayout(opt.key)}
                    style={{ flex: 1, padding: '0.875rem 0.75rem', borderRadius: '12px', border: `2px solid ${staffLayout === opt.key ? bookingAccentColor : '#e5e7eb'}`, backgroundColor: staffLayout === opt.key ? `${bookingAccentColor}10` : 'white', cursor: 'pointer', textAlign: 'center' }}>
                    <div style={{ marginBottom: '0.5rem', display: 'flex', flexDirection: opt.key === 'grid' ? 'row' : 'column', gap: '4px', justifyContent: 'center' }}>
                      {opt.key === 'list' ? (
                        <>
                          <div style={{ height: '10px', backgroundColor: staffLayout === 'list' ? `${bookingAccentColor}40` : '#e2e8f0', borderRadius: '4px', width: '100%' }} />
                          <div style={{ height: '10px', backgroundColor: staffLayout === 'list' ? `${bookingAccentColor}25` : '#e2e8f0', borderRadius: '4px', width: '100%' }} />
                          <div style={{ height: '10px', backgroundColor: staffLayout === 'list' ? `${bookingAccentColor}15` : '#e2e8f0', borderRadius: '4px', width: '100%' }} />
                        </>
                      ) : (
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px', width: '100%' }}>
                          {[0,1,2,3].map(i => (
                            <div key={i} style={{ height: '22px', backgroundColor: staffLayout === 'grid' ? `${bookingAccentColor}${i === 0 ? '40' : i === 1 ? '30' : i === 2 ? '20' : '15'}` : '#e2e8f0', borderRadius: '4px' }} />
                          ))}
                        </div>
                      )}
                    </div>
                    <div style={{ fontSize: '0.82rem', fontWeight: '700', color: staffLayout === opt.key ? bookingAccentColor : '#374151' }}>{opt.label}</div>
                    <div style={{ fontSize: '0.7rem', color: '#9ca3af', marginTop: '2px' }}>{opt.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {appearanceSuccess && <p style={{ color: '#22c55e', fontSize: '0.875rem', marginBottom: '1rem' }}>✅ Mentve!</p>}
            <button onClick={handleSaveAppearance} disabled={appearanceSaving}
              style={{ backgroundColor: '#2563eb', color: 'white', padding: '0.75rem 2rem', borderRadius: '8px', border: 'none', cursor: 'pointer', fontWeight: '600', opacity: appearanceSaving ? 0.5 : 1 }}>
              {appearanceSaving ? 'Mentés...' : `💾 ${t.dash.save_btn}`}
            </button>
          </div>
        </div>
      )}

      {/* ══════════════ PROFIL TAB ══════════════ */}
      {tab === 'profile' && (
        <div>
          {isExpired && (
            <div style={{ backgroundColor: '#fee2e2', border: '1px solid #fca5a5', borderRadius: '10px', padding: '0.875rem 1.25rem', marginBottom: '1.5rem', fontSize: '0.85rem', color: '#991b1b', fontWeight: '600' }}>
              {t.dash.profile_expired_notice}
            </div>
          )}
          <div style={{ opacity: isExpired ? 0.35 : 1, pointerEvents: isExpired ? 'none' : 'auto', filter: isExpired ? 'blur(1px)' : 'none' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
            <span style={{ backgroundColor: '#fef3c7', color: '#92400e', fontSize: '0.75rem', fontWeight: '700', padding: '0.2rem 0.6rem', borderRadius: '999px', border: '1px solid #fde68a' }}>{t.dash.owner_label}</span>
          </div>

          <div style={{ backgroundColor: 'white', padding: '2rem', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', maxWidth: '560px', marginBottom: '1.5rem' }}>
            {/* Profilkép */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', marginBottom: '1.75rem' }}>
              <div style={{ width: '80px', height: '80px', borderRadius: '50%', backgroundColor: '#f3f4f6', border: '2px dashed #d1d5db', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
                {ownerPhotoPreview ? <Image src={ownerPhotoPreview} alt="Profilkép" width={80} height={80} style={{ objectFit: 'cover', borderRadius: '50%' }} /> : <span style={{ fontSize: '2rem' }}>👑</span>}
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', color: '#374151', marginBottom: '0.5rem' }}>{t.dash.profile_photo_label}</label>
                <input type="file" accept="image/*" onChange={e => { const f = e.target.files?.[0]; if (f) { setOwnerPhotoFile(f); const r = new FileReader(); r.onloadend = () => setOwnerPhotoPreview(r.result as string); r.readAsDataURL(f) } }} id="owner-photo" style={{ display: 'none' }} />
                <label htmlFor="owner-photo" style={{ display: 'inline-block', padding: '0.5rem 1.25rem', backgroundColor: '#f3f4f6', border: '1px solid #d1d5db', borderRadius: '8px', cursor: 'pointer', fontSize: '0.875rem', color: '#374151', fontWeight: '500' }}>{t.dash.profile_photo_btn}</label>
              </div>
            </div>

            <div style={{ marginBottom: '1.25rem' }}>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', color: '#374151', marginBottom: '0.5rem' }}>{t.dash.profile_name_label}</label>
              <input type="text" value={ownerName} disabled style={{ width: '100%', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '0.625rem 1rem', color: '#6b7280', backgroundColor: '#f9fafb', outline: 'none', boxSizing: 'border-box', cursor: 'not-allowed' }} />
              <p style={{ fontSize: '0.75rem', color: '#9ca3af', marginTop: '0.25rem' }}>{t.dash.profile_name_hint_general}</p>
            </div>

            <div style={{ marginBottom: '1.25rem' }}>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', color: '#374151', marginBottom: '0.5rem' }}>{t.dash.profile_age_label}</label>
              <input type="number" value={ownerAge} onChange={e => setOwnerAge(e.target.value)} min="16" max="99" style={{ width: '120px', border: '1px solid #d1d5db', borderRadius: '8px', padding: '0.625rem 1rem', color: '#111827', outline: 'none' }} placeholder="25" />
            </div>

            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', color: '#374151', marginBottom: '0.5rem' }}>{t.dash.profile_bio_label}</label>
              <RichTextEditor value={ownerBio} onChange={setOwnerBio} rows={5} placeholder={t.dash.profile_bio_ph_short} />
            </div>

            {profileError && <p style={{ color: '#ef4444', fontSize: '0.875rem', marginBottom: '1rem' }}>❌ {profileError}</p>}
            {profileSuccess && <p style={{ color: '#22c55e', fontSize: '0.875rem', marginBottom: '1rem' }}>{t.dash.profile_saved}</p>}

            <button onClick={handleSaveProfile} disabled={profileSaving} style={{ backgroundColor: '#2563eb', color: 'white', padding: '0.75rem 2rem', borderRadius: '8px', border: 'none', cursor: 'pointer', fontWeight: '600', opacity: profileSaving ? 0.5 : 1 }}>
              {profileSaving ? t.dash.saving : t.dash.profile_save}
            </button>
          </div>

          {/* Referencia fotók */}
          <div style={{ backgroundColor: 'white', padding: '2rem', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', maxWidth: '560px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
              <div>
                <h2 style={{ fontSize: '1rem', fontWeight: '700', color: '#111827', margin: 0 }}>{t.dash.ref_photos_title}</h2>
                <p style={{ fontSize: '0.75rem', color: '#9ca3af', marginTop: '0.25rem' }}>{ownerRefPhotos.length}/7</p>
              </div>
              {ownerRefPhotos.length < 7 && (
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.375rem', padding: '0.5rem 1rem', backgroundColor: '#2563eb', color: 'white', borderRadius: '8px', cursor: 'pointer', fontSize: '0.825rem', fontWeight: '600' }}>
                  {refUploading ? t.dash.ref_photos_uploading : t.dash.ref_photos_add}
                  <input type="file" accept="image/*" multiple onChange={handleAddRefPhoto} style={{ display: 'none' }} disabled={refUploading} />
                </label>
              )}
            </div>
            {refError && <p style={{ color: '#ef4444', fontSize: '0.875rem', marginBottom: '0.75rem' }}>❌ {refError}</p>}
            {ownerRefPhotos.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '2rem', border: '2px dashed #e5e7eb', borderRadius: '12px', color: '#9ca3af' }}>
                <p style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>📷</p>
                <p style={{ fontSize: '0.875rem' }}>{t.dash.ref_photos_none}</p>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem' }}>
                {ownerRefPhotos.map((url, i) => (
                  <div key={i} style={{ position: 'relative', aspectRatio: '1', borderRadius: '10px', overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
                    <Image src={url} alt={`Referencia ${i + 1}`} fill style={{ objectFit: 'cover' }} />
                    <button onClick={() => handleRemoveRefPhoto(url)} style={{ position: 'absolute', top: '4px', right: '4px', width: '24px', height: '24px', borderRadius: '50%', backgroundColor: 'rgba(239,68,68,0.9)', color: 'white', border: 'none', cursor: 'pointer', fontSize: '0.7rem', fontWeight: '700', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
                  </div>
                ))}
                {Array.from({ length: 7 - ownerRefPhotos.length }).map((_, i) => (
                  <label key={`e-${i}`} style={{ aspectRatio: '1', borderRadius: '10px', border: '2px dashed #e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#d1d5db', fontSize: '1.5rem' }}>
                    + <input type="file" accept="image/*" multiple onChange={handleAddRefPhoto} style={{ display: 'none' }} disabled={refUploading} />
                  </label>
                ))}
              </div>
            )}
          </div>
          </div> {/* /blur wrapper (lejárt esetén) */}

          {/* Veszélyes zóna — fiók törlése (mindig aktív) */}
          <div style={{ backgroundColor: 'white', padding: '2rem', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', maxWidth: '560px', border: '1px solid #fee2e2', marginTop: '1.5rem' }}>
            <h2 style={{ fontSize: '1rem', fontWeight: '700', color: '#991b1b', marginBottom: '0.5rem' }}>{t.dash.danger_zone_title}</h2>
            <p style={{ fontSize: '0.85rem', color: '#6b7280', marginBottom: '1.25rem', lineHeight: 1.6 }}>
              {t.dash.danger_zone_desc}
            </p>
            <button
              onClick={() => { setShowDeleteDialog(true); setDeleteConfirmText(''); setDeleteError('') }}
              style={{ backgroundColor: '#fee2e2', color: '#b91c1c', border: '1px solid #fca5a5', padding: '0.625rem 1.5rem', borderRadius: '8px', cursor: 'pointer', fontWeight: '600', fontSize: '0.875rem' }}
            >
              {t.dash.profile_delete_btn}
            </button>
          </div>

        </div>
      )}

      {/* ══════════════ EMAIL TAB ══════════════ */}
      {/* Törlés megerősítő dialog — minden tabon elérhető */}
      {showDeleteDialog && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}>
          <div style={{ backgroundColor: 'white', borderRadius: '16px', padding: '2rem', maxWidth: '420px', width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
            <h3 style={{ fontSize: '1.125rem', fontWeight: '700', color: '#111827', marginBottom: '0.75rem' }}>{t.dash.delete_dialog_title}</h3>
            <p style={{ fontSize: '0.875rem', color: '#6b7280', lineHeight: 1.6, marginBottom: '1.5rem' }}>
              {t.dash.delete_dialog_warning}
            </p>
            <p style={{ fontSize: '0.875rem', color: '#374151', marginBottom: '0.5rem', fontWeight: '500' }}>
              {t.dash.profile_delete_confirm_label} <strong>{t.dash.profile_delete_word}</strong>
            </p>
            <input
              type="text"
              value={deleteConfirmText}
              onChange={e => setDeleteConfirmText(e.target.value)}
              placeholder={t.dash.profile_delete_word}
              style={{ width: '100%', border: '1px solid #d1d5db', borderRadius: '8px', padding: '0.625rem 1rem', fontSize: '0.875rem', color: '#111827', outline: 'none', boxSizing: 'border-box', marginBottom: '1rem' }}
              autoFocus
            />
            {deleteError && <p style={{ color: '#ef4444', fontSize: '0.8rem', marginBottom: '0.75rem' }}>❌ {deleteError}</p>}
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button
                onClick={handleDeleteAccount}
                disabled={deleteConfirmText !== t.dash.profile_delete_word || deleteLoading}
                style={{ flex: 1, backgroundColor: deleteConfirmText === t.dash.profile_delete_word ? '#dc2626' : '#f3f4f6', color: deleteConfirmText === t.dash.profile_delete_word ? 'white' : '#9ca3af', border: 'none', padding: '0.75rem', borderRadius: '8px', cursor: deleteConfirmText === t.dash.profile_delete_word ? 'pointer' : 'not-allowed', fontWeight: '700', fontSize: '0.875rem', transition: 'background-color 0.15s' }}
              >
                {deleteLoading ? t.dash.saving : t.dash.delete_dialog_final}
              </button>
              <button
                onClick={() => setShowDeleteDialog(false)}
                disabled={deleteLoading}
                style={{ flex: 1, backgroundColor: '#f3f4f6', color: '#374151', border: '1px solid #e5e7eb', padding: '0.75rem', borderRadius: '8px', cursor: 'pointer', fontWeight: '500', fontSize: '0.875rem' }}
              >
                {t.dash.auto_cancel_btn}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
