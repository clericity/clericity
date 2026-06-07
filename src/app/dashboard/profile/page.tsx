'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import RichTextEditor from '@/components/RichTextEditor'
import Image from 'next/image'
import { useLanguage } from '@/hooks/useLanguage'

export default function OwnerProfilePage() {
  const router = useRouter()
  const { t } = useLanguage()
  const [staffId, setStaffId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [age, setAge] = useState('')
  const [bio, setBio] = useState('')
  const [profilePhoto, setProfilePhoto] = useState('')
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState('')
  const [referencePhotos, setReferencePhotos] = useState<string[]>([])
  const [refUploading, setRefUploading] = useState(false)
  const [refError, setRefError] = useState('')
  const [uploadError, setUploadError] = useState('')
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(true)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/auth'); return }

      const { data: profile } = await supabase
        .from('profiles')
        .select('tenant_id')
        .eq('id', user.id)
        .single()

      if (!profile?.tenant_id) return

      // Owner staff rekord lekérése
      const { data: staff } = await supabase
        .from('staff')
        .select('id, name, age, bio, profile_photo, reference_photos')
        .eq('tenant_id', profile.tenant_id)
        .eq('is_owner', true)
        .single()

      if (staff) {
        setStaffId(staff.id)
        setName(staff.name || '')
        setAge(staff.age?.toString() || '')
        setBio(staff.bio || '')
        setProfilePhoto(staff.profile_photo || '')
        setPhotoPreview(staff.profile_photo || '')
        setReferencePhotos(staff.reference_photos || [])
      }
      setLoading(false)
    }
    load()
  }, [router])

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setPhotoFile(file)
      const reader = new FileReader()
      reader.onloadend = () => setPhotoPreview(reader.result as string)
      reader.readAsDataURL(file)
    }
  }

  const handleSave = async () => {
    if (!staffId) return
    setSaving(true)
    setSuccess(false)
    setUploadError('')

    let finalPhotoUrl = profilePhoto
    if (photoFile) {
      const fileExt = photoFile.name.split('.').pop()
      const fileName = `${staffId}.${fileExt}`
      const { error: storageErr } = await supabase.storage
        .from('staff-photos')
        .upload(fileName, photoFile, { upsert: true })
      if (storageErr) {
        setUploadError('Profilkép feltöltése sikertelen: ' + storageErr.message)
        setSaving(false)
        return
      }
      const { data: urlData } = supabase.storage.from('staff-photos').getPublicUrl(fileName)
      finalPhotoUrl = urlData.publicUrl
    }

    const { error } = await supabase
      .from('staff')
      .update({ age: age ? parseInt(age) : null, bio, profile_photo: finalPhotoUrl })
      .eq('id', staffId)

    if (error) {
      setUploadError('Mentés sikertelen: ' + error.message)
    } else {
      setProfilePhoto(finalPhotoUrl)
      setSuccess(true)
    }
    setSaving(false)
  }

  const handleAddReferencePhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (!files.length || !staffId) return
    const toUpload = files.slice(0, 7 - referencePhotos.length)
    if (!toUpload.length) return

    setRefUploading(true)
    setRefError('')
    let current = [...referencePhotos]

    for (const file of toUpload) {
      const fileExt = file.name.split('.').pop()
      const fileName = `ref-${staffId}-${Date.now()}-${Math.random().toString(36).slice(2)}.${fileExt}`
      const { error } = await supabase.storage.from('staff-photos').upload(fileName, file, { upsert: false })
      if (error) { setRefError('Feltöltési hiba: ' + error.message); break }
      const { data: urlData } = supabase.storage.from('staff-photos').getPublicUrl(fileName)
      current = [...current, urlData.publicUrl]
    }

    setReferencePhotos(current)
    await supabase.from('staff').update({ reference_photos: current }).eq('id', staffId)
    setRefUploading(false)
    e.target.value = ''
  }

  const handleRemoveReferencePhoto = async (url: string) => {
    if (!staffId) return
    const newPhotos = referencePhotos.filter(p => p !== url)
    setReferencePhotos(newPhotos)
    await supabase.from('staff').update({ reference_photos: newPhotos }).eq('id', staffId)
    const fileName = url.split('/').pop()
    if (fileName) await supabase.storage.from('staff-photos').remove([fileName])
  }

  if (loading) return <p style={{ color: '#6b7280' }}>{t.dash.loading}</p>

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#111827', margin: 0 }}>{t.dash.profile_title}</h1>
        <span style={{ backgroundColor: '#fef3c7', color: '#92400e', fontSize: '0.75rem', fontWeight: '700', padding: '0.2rem 0.6rem', borderRadius: '999px', border: '1px solid #fde68a' }}>
          {t.dash.profile_owner}
        </span>
      </div>

      {/* Alap adatok */}
      <div style={{ backgroundColor: 'white', padding: '2rem', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', maxWidth: '560px', marginBottom: '1.5rem' }}>

        {/* Profilkép */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', marginBottom: '1.75rem' }}>
          <div style={{ width: '80px', height: '80px', borderRadius: '50%', backgroundColor: '#f3f4f6', border: '2px dashed #d1d5db', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
            {photoPreview
              ? <Image src={photoPreview} alt="Profilkép" width={80} height={80} style={{ objectFit: 'cover', borderRadius: '50%' }} />
              : <span style={{ fontSize: '2rem' }}>👑</span>
            }
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', color: '#374151', marginBottom: '0.5rem' }}>{t.dash.profile_photo_label}</label>
            <input type="file" accept="image/*" onChange={handlePhotoChange} id="owner-photo" style={{ display: 'none' }} />
            <label htmlFor="owner-photo" style={{ display: 'inline-block', padding: '0.5rem 1.25rem', backgroundColor: '#f3f4f6', border: '1px solid #d1d5db', borderRadius: '8px', cursor: 'pointer', fontSize: '0.875rem', color: '#374151', fontWeight: '500' }}>
              {t.dash.profile_photo_btn}
            </label>
            <p style={{ fontSize: '0.75rem', color: '#9ca3af', marginTop: '0.4rem' }}>{t.dash.profile_photo_hint}</p>
          </div>
        </div>

        {/* Név (csak olvasható) */}
        <div style={{ marginBottom: '1.25rem' }}>
          <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', color: '#374151', marginBottom: '0.5rem' }}>{t.dash.profile_name_label}</label>
          <input type="text" value={name} disabled
            style={{ width: '100%', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '0.625rem 1rem', color: '#6b7280', backgroundColor: '#f9fafb', outline: 'none', boxSizing: 'border-box', cursor: 'not-allowed' }} />
          <p style={{ fontSize: '0.75rem', color: '#9ca3af', marginTop: '0.25rem' }}>{t.dash.profile_name_hint}</p>
        </div>

        {/* Kor */}
        <div style={{ marginBottom: '1.25rem' }}>
          <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', color: '#374151', marginBottom: '0.5rem' }}>{t.dash.profile_age_label}</label>
          <input type="number" value={age} onChange={e => setAge(e.target.value)} min="16" max="99"
            style={{ width: '120px', border: '1px solid #d1d5db', borderRadius: '8px', padding: '0.625rem 1rem', color: '#111827', outline: 'none' }}
            placeholder="25" />
        </div>

        {/* Bemutatkozás */}
        <div style={{ marginBottom: '1.5rem' }}>
          <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', color: '#374151', marginBottom: '0.5rem' }}>{t.dash.profile_bio_label}</label>
          <RichTextEditor value={bio} onChange={setBio} rows={5} placeholder={t.dash.profile_bio_ph} />
        </div>

        {uploadError && <p style={{ color: '#ef4444', fontSize: '0.875rem', marginBottom: '1rem' }}>❌ {uploadError}</p>}
        {success && <p style={{ color: '#22c55e', fontSize: '0.875rem', marginBottom: '1rem' }}>{t.dash.profile_saved}</p>}

        <button onClick={handleSave} disabled={saving}
          style={{ backgroundColor: '#2563eb', color: 'white', padding: '0.75rem 2rem', borderRadius: '8px', border: 'none', cursor: 'pointer', fontWeight: '600', opacity: saving ? 0.5 : 1 }}>
          {saving ? t.dash.saving : t.dash.profile_save}
        </button>
      </div>

      {/* Fiók törlése */}
      <div style={{ backgroundColor: 'white', padding: '2rem', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', maxWidth: '560px', marginBottom: '1.5rem', border: '1px solid #fee2e2' }}>
        <h2 style={{ fontSize: '1rem', fontWeight: '700', color: '#dc2626', marginBottom: '0.5rem' }}>{t.dash.profile_delete_btn}</h2>
        <p style={{ fontSize: '0.85rem', color: '#6b7280', marginBottom: '1.25rem' }}>
          {t.dash.profile_delete_warning}
        </p>

        {!showDeleteConfirm ? (
          <button
            onClick={() => setShowDeleteConfirm(true)}
            style={{ backgroundColor: 'white', color: '#dc2626', padding: '0.625rem 1.5rem', borderRadius: '8px', border: '1.5px solid #dc2626', cursor: 'pointer', fontWeight: '600', fontSize: '0.875rem' }}>
            {t.dash.profile_delete_btn.replace('🗑️ ', '')}
          </button>
        ) : (
          <div>
            <p style={{ fontSize: '0.875rem', color: '#374151', marginBottom: '0.75rem' }}>
              {t.dash.profile_delete_confirm_label} <strong>{t.dash.profile_delete_word}</strong>
            </p>
            <input
              type="text"
              value={deleteConfirmText}
              onChange={e => setDeleteConfirmText(e.target.value)}
              placeholder={t.dash.profile_delete_word}
              style={{ width: '100%', border: '1.5px solid #fca5a5', borderRadius: '8px', padding: '0.625rem 1rem', color: '#111827', outline: 'none', boxSizing: 'border-box', marginBottom: '0.75rem', fontSize: '0.875rem' }}
            />
            {deleteError && <p style={{ color: '#ef4444', fontSize: '0.875rem', marginBottom: '0.75rem' }}>{deleteError}</p>}
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button
                onClick={async () => {
                  if (deleteConfirmText !== t.dash.profile_delete_word) { setDeleteError(`${t.dash.profile_delete_confirm_label} ${t.dash.profile_delete_word}`); return }
                  setDeleting(true)
                  setDeleteError('')
                  const { data: { user } } = await supabase.auth.getUser()
                  if (!user) return
                  const res = await fetch('/api/owner/delete-account', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ userId: user.id }),
                  })
                  const result = await res.json()
                  if (result.error) { setDeleteError(result.error); setDeleting(false); return }
                  await supabase.auth.signOut()
                  window.location.href = '/'
                }}
                disabled={deleting || deleteConfirmText !== t.dash.profile_delete_word}
                style={{ backgroundColor: deleteConfirmText === t.dash.profile_delete_word ? '#dc2626' : '#e5e7eb', color: deleteConfirmText === t.dash.profile_delete_word ? 'white' : '#9ca3af', padding: '0.625rem 1.5rem', borderRadius: '8px', border: 'none', cursor: deleteConfirmText === t.dash.profile_delete_word ? 'pointer' : 'not-allowed', fontWeight: '600', fontSize: '0.875rem' }}>
                {deleting ? t.dash.saving : t.dash.profile_delete_final}
              </button>
              <button
                onClick={() => { setShowDeleteConfirm(false); setDeleteConfirmText(''); setDeleteError('') }}
                style={{ backgroundColor: '#f3f4f6', color: '#374151', padding: '0.625rem 1.25rem', borderRadius: '8px', border: '1px solid #e5e7eb', cursor: 'pointer', fontWeight: '500', fontSize: '0.875rem' }}>
                {t.dash.profile_cancel}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Referencia fotók */}
      <div style={{ backgroundColor: 'white', padding: '2rem', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', maxWidth: '560px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
          <div>
            <h2 style={{ fontSize: '1rem', fontWeight: '700', color: '#111827', margin: 0 }}>{t.dash.ref_photos_title}</h2>
            <p style={{ fontSize: '0.75rem', color: '#9ca3af', marginTop: '0.25rem' }}>{referencePhotos.length}/7</p>
          </div>
          {referencePhotos.length < 7 && (
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.375rem', padding: '0.5rem 1rem', backgroundColor: '#2563eb', color: 'white', borderRadius: '8px', cursor: 'pointer', fontSize: '0.825rem', fontWeight: '600' }}>
              {refUploading ? t.dash.ref_photos_uploading : t.dash.ref_photos_add}
              <input type="file" accept="image/*" multiple onChange={handleAddReferencePhoto} style={{ display: 'none' }} disabled={refUploading} />
            </label>
          )}
        </div>

        {refError && <p style={{ color: '#ef4444', fontSize: '0.875rem', marginBottom: '0.75rem' }}>❌ {refError}</p>}

        {referencePhotos.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '2rem', border: '2px dashed #e5e7eb', borderRadius: '12px', color: '#9ca3af' }}>
            <p style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>📷</p>
            <p style={{ fontSize: '0.875rem' }}>{t.dash.ref_photos_none}</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem' }}>
            {referencePhotos.map((url, i) => (
              <div key={i} style={{ position: 'relative', aspectRatio: '1', borderRadius: '10px', overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
                <Image src={url} alt={`Referencia ${i + 1}`} fill style={{ objectFit: 'cover' }} />
                <button onClick={() => handleRemoveReferencePhoto(url)}
                  style={{ position: 'absolute', top: '4px', right: '4px', width: '24px', height: '24px', borderRadius: '50%', backgroundColor: 'rgba(239,68,68,0.9)', color: 'white', border: 'none', cursor: 'pointer', fontSize: '0.7rem', fontWeight: '700', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  ✕
                </button>
              </div>
            ))}
            {Array.from({ length: 7 - referencePhotos.length }).map((_, i) => (
              <label key={`empty-${i}`} style={{ aspectRatio: '1', borderRadius: '10px', border: '2px dashed #e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#d1d5db', fontSize: '1.5rem' }}>
                +
                <input type="file" accept="image/*" multiple onChange={handleAddReferencePhoto} style={{ display: 'none' }} disabled={refUploading} />
              </label>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
