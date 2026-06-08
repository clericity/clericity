'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { supabase } from '@/lib/supabase'
import { useLanguage } from '@/hooks/useLanguage'

type Step = 'loading' | 'reset' | 'success' | 'error'

export default function ResetPasswordPage() {
  const router = useRouter()
  const { t } = useLanguage()
  const [step, setStep] = useState<Step>('loading')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    // PKCE flow: token_hash in query params
    const params = new URLSearchParams(window.location.search)
    const tokenHash = params.get('token_hash')
    const type = params.get('type')

    if (tokenHash && type === 'recovery') {
      supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'recovery' }).then(({ error }) => {
        if (error) setStep('error')
        else setStep('reset')
      })
      return
    }

    // Implicit flow: Supabase auto-detects access_token from URL hash and fires PASSWORD_RECOVERY
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') setStep('reset')
    })

    // If no token in URL and no event fires within 3s → invalid link
    const timeout = setTimeout(() => {
      setStep(prev => prev === 'loading' ? 'error' : prev)
    }, 3000)

    return () => {
      subscription.unsubscribe()
      clearTimeout(timeout)
    }
  }, [])

  const handleSave = async () => {
    if (password.length < 8) { setErrorMsg('A jelszónak legalább 8 karakter hosszúnak kell lennie.'); return }
    if (password !== confirm) { setErrorMsg(t.auth.passwords_mismatch); return }
    setSaving(true)
    setErrorMsg('')
    const { error } = await supabase.auth.updateUser({ password })
    if (error) {
      setErrorMsg(error.message)
      setSaving(false)
    } else {
      await supabase.auth.signOut()
      setStep('success')
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem', fontFamily: "'Segoe UI', sans-serif" }}>
      <div style={{ width: '100%', maxWidth: '420px' }}>
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <Image src="/clericity-logo.png" alt="CLERICITY" width={140} height={50} style={{ objectFit: 'contain' }} />
        </div>

        <div style={{ backgroundColor: 'white', borderRadius: '16px', padding: '2rem', boxShadow: '0 4px 20px rgba(0,0,0,0.08)' }}>

          {step === 'loading' && (
            <div style={{ textAlign: 'center', padding: '2rem 0', color: '#6b7280' }}>
              <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>⏳</div>
              <p style={{ margin: 0 }}>Ellenőrzés...</p>
            </div>
          )}

          {step === 'error' && (
            <div style={{ textAlign: 'center', padding: '1.5rem 0' }}>
              <div style={{ fontSize: '3rem', marginBottom: '0.75rem' }}>⚠️</div>
              <h2 style={{ color: '#111827', fontWeight: '700', fontSize: '1.1rem', marginBottom: '0.5rem' }}>Érvénytelen link</h2>
              <p style={{ color: '#6b7280', fontSize: '0.875rem', lineHeight: 1.7, marginBottom: '1.5rem' }}>{t.auth.reset_expired}</p>
              <button onClick={() => router.push('/')}
                style={{ backgroundColor: '#2563eb', color: 'white', border: 'none', borderRadius: '10px', padding: '0.75rem 2rem', fontWeight: '700', cursor: 'pointer', fontSize: '0.95rem' }}>
                Vissza a főoldalra
              </button>
            </div>
          )}

          {step === 'success' && (
            <div style={{ textAlign: 'center', padding: '1.5rem 0' }}>
              <div style={{ fontSize: '3rem', marginBottom: '0.75rem' }}>✅</div>
              <h2 style={{ color: '#111827', fontWeight: '700', fontSize: '1.1rem', marginBottom: '0.5rem' }}>{t.auth.reset_success}</h2>
              <p style={{ color: '#6b7280', fontSize: '0.875rem', lineHeight: 1.7, marginBottom: '1.5rem' }}>Mostantól az új jelszavaddal léphetsz be.</p>
              <button onClick={() => router.push('/')}
                style={{ backgroundColor: '#2563eb', color: 'white', border: 'none', borderRadius: '10px', padding: '0.75rem 2rem', fontWeight: '700', cursor: 'pointer', fontSize: '0.95rem' }}>
                Belépés →
              </button>
            </div>
          )}

          {step === 'reset' && (
            <>
              <h2 style={{ color: '#111827', fontWeight: '700', fontSize: '1.2rem', marginBottom: '0.5rem' }}>{t.auth.reset_title}</h2>
              <p style={{ color: '#6b7280', fontSize: '0.85rem', marginBottom: '1.5rem', lineHeight: 1.6 }}>{t.auth.reset_desc}</p>

              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', color: '#374151', marginBottom: '0.5rem' }}>{t.auth.reset_password}</label>
                <div style={{ position: 'relative' }}>
                  <input type={showPass ? 'text' : 'password'} value={password} onChange={e => { setPassword(e.target.value); setErrorMsg('') }}
                    style={{ width: '100%', border: `1px solid ${errorMsg && password.length < 8 ? '#ef4444' : '#e5e7eb'}`, borderRadius: '10px', padding: '0.75rem 2.75rem 0.75rem 1rem', color: '#111827', outline: 'none', boxSizing: 'border-box', fontSize: '0.95rem' }}
                    placeholder="••••••••" autoFocus />
                  <button type="button" onClick={() => setShowPass(v => !v)}
                    style={{ position: 'absolute', right: '0.75rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', fontSize: '1rem' }}>
                    {showPass ? '🙈' : '👁️'}
                  </button>
                </div>
                {password && password.length < 8 && (
                  <p style={{ color: '#ef4444', fontSize: '0.75rem', marginTop: '0.3rem' }}>Legalább 8 karakter szükséges</p>
                )}
              </div>

              <div style={{ marginBottom: '1.25rem' }}>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', color: '#374151', marginBottom: '0.5rem' }}>{t.auth.reset_confirm}</label>
                <div style={{ position: 'relative' }}>
                  <input type={showConfirm ? 'text' : 'password'} value={confirm} onChange={e => { setConfirm(e.target.value); setErrorMsg('') }}
                    style={{ width: '100%', border: `1px solid ${confirm && password !== confirm ? '#ef4444' : '#e5e7eb'}`, borderRadius: '10px', padding: '0.75rem 2.75rem 0.75rem 1rem', color: '#111827', outline: 'none', boxSizing: 'border-box', fontSize: '0.95rem' }}
                    placeholder="••••••••"
                    onKeyDown={e => e.key === 'Enter' && handleSave()} />
                  <button type="button" onClick={() => setShowConfirm(v => !v)}
                    style={{ position: 'absolute', right: '0.75rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', fontSize: '1rem' }}>
                    {showConfirm ? '🙈' : '👁️'}
                  </button>
                </div>
                {confirm && password !== confirm && (
                  <p style={{ color: '#ef4444', fontSize: '0.75rem', marginTop: '0.3rem' }}>{t.auth.passwords_mismatch}</p>
                )}
                {confirm && password === confirm && password.length >= 8 && (
                  <p style={{ color: '#16a34a', fontSize: '0.75rem', marginTop: '0.3rem' }}>{t.auth.passwords_match}</p>
                )}
              </div>

              {errorMsg && <p style={{ color: '#ef4444', fontSize: '0.875rem', marginBottom: '1rem', textAlign: 'center' }}>{errorMsg}</p>}

              <button onClick={handleSave} disabled={saving || password.length < 8 || password !== confirm}
                style={{ width: '100%', backgroundColor: '#2563eb', color: 'white', padding: '0.875rem', borderRadius: '10px', border: 'none', cursor: saving || password.length < 8 || password !== confirm ? 'not-allowed' : 'pointer', fontWeight: '700', fontSize: '1rem', opacity: saving || password.length < 8 || password !== confirm ? 0.5 : 1, boxShadow: '0 4px 15px rgba(37,99,235,0.35)' }}>
                {saving ? 'Mentés...' : t.auth.reset_btn}
              </button>
            </>
          )}

        </div>
      </div>
    </div>
  )
}
