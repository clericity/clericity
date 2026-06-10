'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { useLanguage } from '@/hooks/useLanguage'

export default function AuthPage() {
  const router = useRouter()
  const { t } = useLanguage()
  const [isLogin, setIsLogin] = useState(true)
  const [forgotMode, setForgotMode] = useState(false)
  const [forgotSent, setForgotSent] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async () => {
    setLoading(true)
    setError('')

    if (isLogin) {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) {
        setError(error.message)
      } else {
        router.push('/dashboard')
      }
    } else {
      const { data, error } = await supabase.auth.signUp({ email, password })
      if (error) {
        setError(error.message)
      } else if (data.user) {
        const res = await fetch('/api/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: data.user.id, fullName })
        })
        const result = await res.json()
        if (result.error) {
          setError(result.error)
        } else {
          router.push('/dashboard')
        }
      }
    }
    setLoading(false)
  }

  const handleForgotPassword = async () => {
    if (!email) return
    setLoading(true)
    setError('')
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || window.location.origin
    await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${siteUrl}/auth/reset`,
    })
    setForgotSent(true)
    setLoading(false)
  }

  if (forgotMode) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ backgroundColor: 'white', padding: '2rem', borderRadius: '12px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)', width: '100%', maxWidth: '400px' }}>
          {forgotSent ? (
            <>
              <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
                <div style={{ fontSize: '3rem', marginBottom: '0.75rem' }}>📧</div>
                <h1 style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#111827', marginBottom: '0.5rem' }}>{t.auth.forgot_sent_title}</h1>
                <p style={{ fontSize: '0.875rem', color: '#6b7280', lineHeight: 1.6 }}>{t.auth.forgot_sent_desc}</p>
              </div>
              <button onClick={() => { setForgotMode(false); setForgotSent(false) }}
                style={{ width: '100%', backgroundColor: 'transparent', color: '#2563eb', padding: '0.5rem', borderRadius: '8px', fontWeight: '500', border: '1px solid #2563eb', cursor: 'pointer', fontSize: '0.875rem' }}>
                {t.auth.forgot_back}
              </button>
            </>
          ) : (
            <>
              <h1 style={{ fontSize: '1.25rem', fontWeight: 'bold', textAlign: 'center', marginBottom: '0.5rem', color: '#111827' }}>{t.auth.forgot_title}</h1>
              <p style={{ fontSize: '0.875rem', color: '#6b7280', textAlign: 'center', marginBottom: '1.5rem', lineHeight: 1.6 }}>{t.auth.forgot_desc}</p>

              <div style={{ marginBottom: '1.25rem' }}>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', color: '#374151', marginBottom: '0.25rem' }}>{t.auth.email}</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                  style={{ width: '100%', border: '1px solid #d1d5db', borderRadius: '8px', padding: '0.5rem 1rem', color: '#111827', outline: 'none', boxSizing: 'border-box' }}
                  placeholder="email@example.com" />
              </div>

              {error && <div style={{ marginBottom: '1rem', color: '#ef4444', fontSize: '0.875rem', textAlign: 'center' }}>{error}</div>}

              <button onClick={handleForgotPassword} disabled={loading || !email}
                style={{ width: '100%', backgroundColor: !email || loading ? '#e5e7eb' : '#2563eb', color: !email || loading ? '#9ca3af' : 'white', padding: '0.5rem', borderRadius: '8px', fontWeight: '500', border: 'none', cursor: !email || loading ? 'not-allowed' : 'pointer', marginBottom: '0.75rem' }}>
                {loading ? t.booking.loading : t.auth.forgot_send}
              </button>

              <button onClick={() => setForgotMode(false)}
                style={{ width: '100%', backgroundColor: 'transparent', color: '#6b7280', padding: '0.5rem', borderRadius: '8px', fontWeight: '500', border: 'none', cursor: 'pointer', fontSize: '0.875rem' }}>
                {t.auth.forgot_back}
              </button>
            </>
          )}
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ backgroundColor: 'white', padding: '2rem', borderRadius: '12px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)', width: '100%', maxWidth: '400px' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 'bold', textAlign: 'center', marginBottom: '1.5rem', color: '#111827' }}>
          {isLogin ? t.auth.login : t.auth.register}
        </h1>

        {!isLogin && (
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', color: '#374151', marginBottom: '0.25rem' }}>{t.auth.full_name}</label>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              style={{ width: '100%', border: '1px solid #d1d5db', borderRadius: '8px', padding: '0.5rem 1rem', color: '#111827', outline: 'none', boxSizing: 'border-box' }}
              placeholder="Kovács János"
            />
          </div>
        )}

        <div style={{ marginBottom: '1rem' }}>
          <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', color: '#374151', marginBottom: '0.25rem' }}>{t.auth.email}</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={{ width: '100%', border: '1px solid #d1d5db', borderRadius: '8px', padding: '0.5rem 1rem', color: '#111827', outline: 'none', boxSizing: 'border-box' }}
            placeholder="email@example.com"
          />
        </div>

        <div style={{ marginBottom: isLogin ? '0.75rem' : '1.5rem' }}>
          <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', color: '#374151', marginBottom: '0.25rem' }}>{t.auth.password}</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={{ width: '100%', border: '1px solid #d1d5db', borderRadius: '8px', padding: '0.5rem 1rem', color: '#111827', outline: 'none', boxSizing: 'border-box' }}
            placeholder="••••••••"
          />
        </div>

        {isLogin && (
          <div style={{ textAlign: 'right', marginBottom: '1.25rem' }}>
            <button onClick={() => setForgotMode(true)}
              style={{ color: '#6b7280', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.8rem', textDecoration: 'underline' }}>
              {t.auth.forgot_link}
            </button>
          </div>
        )}

        {error && (
          <div style={{ marginBottom: '1rem', color: '#ef4444', fontSize: '0.875rem', textAlign: 'center' }}>{error}</div>
        )}

        <button
          onClick={handleSubmit}
          disabled={loading}
          style={{ width: '100%', backgroundColor: '#2563eb', color: 'white', padding: '0.5rem', borderRadius: '8px', fontWeight: '500', border: 'none', cursor: 'pointer', opacity: loading ? 0.5 : 1 }}
        >
          {loading ? t.booking.loading : isLogin ? t.auth.login_btn : t.auth.register}
        </button>

        <p style={{ textAlign: 'center', fontSize: '0.875rem', color: '#6b7280', marginTop: '1rem' }}>
          {isLogin ? t.auth.no_account : t.auth.have_account}{' '}
          <button
            onClick={() => setIsLogin(!isLogin)}
            style={{ color: '#2563eb', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}
          >
            {isLogin ? t.auth.sign_up : t.auth.sign_in}
          </button>
        </p>
      </div>
    </div>
  )
}
