'use client'

import { useState } from 'react'
import { supabase, setRememberMe } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { useLanguage } from '@/hooks/useLanguage'
import { areNamesBlocked } from '@/lib/nameFilter'

const PLAN_OPTIONS = [
  { key: 'free',     price: '0€',  color: '#92400e', bg: '#fef3c7', border: '#fde68a' },
  { key: 'basic',    price: '10€', color: '#1d4ed8', bg: '#dbeafe', border: '#bfdbfe' },
  { key: 'pro',      price: '16€', color: '#6d28d9', bg: '#ede9fe', border: '#c4b5fd' },
  { key: 'business', price: '25€', color: '#065f46', bg: '#d1fae5', border: '#6ee7b7' },
]

export default function AuthPage() {
  const router = useRouter()
  const { t } = useLanguage()
  const [isLogin, setIsLogin] = useState(true)
  const [forgotMode, setForgotMode] = useState(false)
  const [forgotSent, setForgotSent] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [rememberMe, setRememberMe_] = useState(true)
  const [regFirstName, setRegFirstName] = useState('')
  const [regLastName, setRegLastName] = useState('')
  const [selectedPlan, setSelectedPlan] = useState('free')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const planNames: Record<string, string> = {
    free:     t.pricing.plans[0].name,
    basic:    t.pricing.plans[1].name,
    pro:      t.pricing.plans[2].name,
    business: t.pricing.plans[3].name,
  }

  const handleSubmit = async () => {
    setLoading(true)
    setError('')
    setRememberMe(rememberMe)

    if (isLogin) {
      const { data: loginData, error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) {
        setError(error.message)
      } else if (loginData.user) {
        const { data: existingProfile } = await supabase
          .from('profiles')
          .select('id')
          .eq('id', loginData.user.id)
          .single()

        if (!existingProfile) {
          await supabase.auth.signOut()
          setError(t.auth.no_profile_error)
          setLoading(false)
          return
        }

        router.push('/dashboard')
      }
    } else {
      if (areNamesBlocked(regFirstName, regLastName)) {
        setError(t.booking.name_blocked)
        setLoading(false)
        return
      }
      const fullName = `${regLastName} ${regFirstName}`.trim()
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
        } else if (selectedPlan !== 'free') {
          const { data: { session: sess } } = await supabase.auth.getSession()
          const checkoutRes = await fetch('/api/stripe/create-checkout', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${sess?.access_token}` },
            body: JSON.stringify({ plan: selectedPlan }),
          })
          const checkoutData = await checkoutRes.json()
          if (checkoutData.url) {
            window.location.href = checkoutData.url
            return
          } else {
            setError(checkoutData.error || 'Stripe hiba – az ingyenes csomag lett aktiválva.')
            router.push('/dashboard')
          }
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
          <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem' }}>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', color: '#374151', marginBottom: '0.25rem' }}>{t.booking.lastname_required}</label>
              <input
                type="text"
                value={regLastName}
                onChange={e => setRegLastName(e.target.value)}
                style={{ width: '100%', border: '1px solid #d1d5db', borderRadius: '8px', padding: '0.5rem 0.75rem', color: '#111827', outline: 'none', boxSizing: 'border-box' }}
                placeholder="Kovács"
              />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', color: '#374151', marginBottom: '0.25rem' }}>{t.booking.firstname_required}</label>
              <input
                type="text"
                value={regFirstName}
                onChange={e => setRegFirstName(e.target.value)}
                style={{ width: '100%', border: '1px solid #d1d5db', borderRadius: '8px', padding: '0.5rem 0.75rem', color: '#111827', outline: 'none', boxSizing: 'border-box' }}
                placeholder="János"
              />
            </div>
          </div>
        )}

        {!isLogin && (
          <div style={{ marginBottom: '1.25rem' }}>
            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', color: '#374151', marginBottom: '0.5rem' }}>
              {t.auth.plan_label}
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
              {PLAN_OPTIONS.map(p => (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => setSelectedPlan(p.key)}
                  style={{ padding: '0.625rem 0.75rem', borderRadius: '8px', border: `2px solid ${selectedPlan === p.key ? p.color : '#e5e7eb'}`, backgroundColor: selectedPlan === p.key ? p.bg : 'white', cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s' }}
                >
                  <span style={{ fontWeight: '700', color: p.color, fontSize: '0.85rem', display: 'block' }}>{planNames[p.key]}</span>
                  <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>{p.price}/hó</span>
                </button>
              ))}
            </div>
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
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.85rem', color: '#374151', userSelect: 'none' }}>
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={e => setRememberMe_(e.target.checked)}
                style={{ width: '15px', height: '15px', accentColor: '#2563eb', cursor: 'pointer' }}
              />
              {t.auth.remember}
            </label>
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
          {loading
            ? t.booking.loading
            : isLogin
              ? t.auth.login_btn
              : selectedPlan !== 'free'
                ? t.auth.register_pay
                : t.auth.register}
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
