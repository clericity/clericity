
'use client'

import { useState, useEffect } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useLanguage } from '@/hooks/useLanguage'
import LanguageSwitcher from '@/components/LanguageSwitcher'

const ADMIN_EMAIL_KEY = 'CLERICITY_admin_emails'
function getAdminEmails(): string[] {
  try { return JSON.parse(localStorage.getItem(ADMIN_EMAIL_KEY) || '[]') } catch { return [] }
}
function saveAdminEmail(email: string) {
  const list = getAdminEmails().filter(e => e !== email)
  localStorage.setItem(ADMIN_EMAIL_KEY, JSON.stringify([email, ...list].slice(0, 5)))
}

export default function LandingPage() {
  const router = useRouter()
  const { lang, setLang, t } = useLanguage()
  const [activeTab, setActiveTab] = useState<'login' | 'register'>('login')
  const [regType, setRegType] = useState<'business' | 'personal'>('business')
  const [selectedPlan, setSelectedPlan] = useState<string>('free')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [savedEmails] = useState<string[]>(() =>
    typeof window !== 'undefined' ? getAdminEmails() : []
  )
  const [loginDrop, setLoginDrop] = useState(false)
  const [bizDrop, setBizDrop] = useState(false)
  const [personalDrop, setPersonalDrop] = useState(false)

  const [isMobile, setIsMobile] = useState(false)
  const [isSmall, setIsSmall] = useState(false)

  useEffect(() => {
    const check = () => {
      setIsMobile(window.innerWidth < 768)
      setIsSmall(window.innerWidth < 430)
    }
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  // Belépés
  const [loginEmail, setLoginEmail] = useState('')
  const [loginPassword, setLoginPassword] = useState('')
  const [rememberMe, setRememberMe] = useState(true)

  // Cégként regisztráció
  const [companyName, setCompanyName] = useState('')
  const [companyNameError, setCompanyNameError] = useState('')
  const [taxNumber, setTaxNumber] = useState('')
  const [companyAddress, setCompanyAddress] = useState('')
  const [taxNumberError, setTaxNumberError] = useState('')
  const [companyAddressError, setCompanyAddressError] = useState('')
  const [bizPhone, setBizPhone] = useState('')
  const [bizPhoneError, setBizPhoneError] = useState('')
  const [bizEmail, setBizEmail] = useState('')
  const [bizEmailError, setBizEmailError] = useState('')
  const [bizPassword, setBizPassword] = useState('')
  const [bizPasswordConfirm, setBizPasswordConfirm] = useState('')
  const [showBizPassword, setShowBizPassword] = useState(false)
  const [showBizPasswordConfirm, setShowBizPasswordConfirm] = useState(false)

  // Magánszemélyként regisztráció
  const [personalName, setPersonalName] = useState('')
  const [personalNameError, setPersonalNameError] = useState('')
  const [personalEmail, setPersonalEmail] = useState('')
  const [personalAddress, setPersonalAddress] = useState('')
  const [personalAddressError, setPersonalAddressError] = useState('')
  const [personalPhone, setPersonalPhone] = useState('')
  const [personalPhoneError, setPersonalPhoneError] = useState('')
  const [personalEmailError, setPersonalEmailError] = useState('')
  const [personalPassword, setPersonalPassword] = useState('')
  const [personalPasswordConfirm, setPersonalPasswordConfirm] = useState('')
  const [showPersonalPassword, setShowPersonalPassword] = useState(false)
  const [showPersonalPasswordConfirm, setShowPersonalPasswordConfirm] = useState(false)

  const validateFullName = (name: string) => {
    const parts = name.trim().split(/\s+/).filter(Boolean)
    if (parts.length < 2) return false
    return parts.every(p => p.length >= 2 && /^[a-záéíóöőúüűA-ZÁÉÍÓÖŐÚÜŰČŠŽĎŇŔĽĹŤČŠŽĎŇŔĽĹŤ'-]+$/i.test(p))
  }
  const validateTaxNumber = (tax: string) => {
    const t = tax.trim()
    return /^\d{8}-\d-\d{2}$/.test(t) || /^\d{8}$/.test(t)
  }
  const validatePhone = (phone: string) => /^\+?[0-9\s\-().]{7,20}$/.test(phone.trim())
  const validateEmail = (email: string) => /^[^\s@]+@[^\s@]+\.(hu|com|sk)$/i.test(email.trim())
  const validateAddress = (addr: string) => addr.trim().length >= 8 && /\d/.test(addr) && /[a-záéíóöőúüűA-ZÁÉÍÓÖŐÚÜŰ]/.test(addr)

  const handleLogin = async () => {
    setLoading(true)
    setError('')
    const { error } = await supabase.auth.signInWithPassword({ email: loginEmail, password: loginPassword })
    if (error) {
      setError(error.message)
    } else {
      saveAdminEmail(loginEmail)
      // Ha NEM maradjon bejelentkezve: localStorage token törlése → csak az aktuális sessionben él
      if (!rememberMe) {
        Object.keys(localStorage)
          .filter(k => k.startsWith('sb-'))
          .forEach(k => {
            sessionStorage.setItem(k, localStorage.getItem(k) || '')
            localStorage.removeItem(k)
          })
      }
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
        router.push(profile?.role === 'staff' ? '/staff' : '/dashboard')
      }
    }
    setLoading(false)
  }

  const handleRegisterBusiness = async () => {
    if (!companyName || !taxNumber || !companyAddress || !bizPhone || !bizEmail || !bizPassword || !bizPasswordConfirm) {
      setError(t.auth.required_fields); return
    }
    if (!validateFullName(companyName)) {
      setCompanyNameError(t.auth.name_invalid); return
    }
    if (!validateTaxNumber(taxNumber)) {
      setTaxNumberError(t.auth.tax_invalid); return
    }
    if (!validateAddress(companyAddress)) {
      setCompanyAddressError(t.auth.address_invalid); return
    }
    if (!validateEmail(bizEmail)) {
      setBizEmailError(t.auth.email_invalid); return
    }
    if (!validatePhone(bizPhone)) {
      setBizPhoneError(t.auth.phone_invalid); return
    }
    if (bizPassword !== bizPasswordConfirm) {
      setError(t.auth.passwords_no_match); return
    }
    setLoading(true); setError('')
    const { data, error } = await supabase.auth.signUp({ email: bizEmail, password: bizPassword })
    if (error) { setError(error.message); setLoading(false); return }
    if (data.user) {
      const res = await fetch('/api/register', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: data.user.id, fullName: companyName, registrationType: 'business', companyName, taxNumber, address: companyAddress, phone: bizPhone, plan: selectedPlan })
      })
      const result = await res.json()
      if (result.error) setError(result.error)
      else router.push('/dashboard')
    }
    setLoading(false)
  }

  const handleRegisterPersonal = async () => {
    if (!personalName || !personalEmail || !personalAddress || !personalPhone || !personalPassword || !personalPasswordConfirm) {
      setError(t.auth.required_fields); return
    }
    if (!validateFullName(personalName)) {
      setPersonalNameError(t.auth.name_invalid); return
    }
    if (!validateAddress(personalAddress)) {
      setPersonalAddressError(t.auth.address_invalid); return
    }
    if (!validateEmail(personalEmail)) {
      setPersonalEmailError(t.auth.email_invalid); return
    }
    if (!validatePhone(personalPhone)) {
      setPersonalPhoneError(t.auth.phone_invalid); return
    }
    if (personalPassword !== personalPasswordConfirm) {
      setError(t.auth.passwords_no_match); return
    }
    setLoading(true); setError('')
    const { data, error } = await supabase.auth.signUp({ email: personalEmail, password: personalPassword })
    if (error) { setError(error.message); setLoading(false); return }
    if (data.user) {
      const res = await fetch('/api/register', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: data.user.id, fullName: personalName, registrationType: 'personal', address: personalAddress, phone: personalPhone, plan: selectedPlan })
      })
      const result = await res.json()
      if (result.error) setError(result.error)
      else router.push('/dashboard')
    }
    setLoading(false)
  }

  return (
    <div style={{ fontFamily: "'Segoe UI', sans-serif", color: '#111827' }}>

      {/* NAVBAR */}
      <nav style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100, backgroundColor: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(10px)', borderBottom: '1px solid #f3f4f6', padding: isMobile ? '0.75rem 1rem' : '1rem 2rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Image src="/clericity-logo.png" alt="CLERICITY" width={isMobile ? 90 : 120} height={isMobile ? 30 : 40} style={{ objectFit: 'contain' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          {!isMobile && (
            <>
              <button
                onClick={() => document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' })}
                style={{ padding: '0.5rem 1rem', border: 'none', borderRadius: '8px', color: '#64748b', backgroundColor: 'transparent', cursor: 'pointer', fontWeight: '500', fontSize: '0.875rem' }}
              >
                {t.nav.features}
              </button>
              <button
                onClick={() => document.getElementById('pricing')?.scrollIntoView({ behavior: 'smooth' })}
                style={{ padding: '0.5rem 1rem', border: 'none', borderRadius: '8px', color: '#64748b', backgroundColor: 'transparent', cursor: 'pointer', fontWeight: '500', fontSize: '0.875rem' }}
              >
                {t.nav.pricing}
              </button>
            </>
          )}
          <LanguageSwitcher lang={lang} setLang={setLang} />
          <button
            onClick={() => { setActiveTab('login'); document.getElementById('auth-section')?.scrollIntoView({ behavior: 'smooth' }) }}
            style={{ padding: isSmall ? '0.4rem 0.75rem' : '0.5rem 1rem', border: '1px solid #2563eb', borderRadius: '8px', color: '#2563eb', backgroundColor: 'white', cursor: 'pointer', fontWeight: '500', fontSize: isSmall ? '0.8rem' : '0.875rem' }}
          >
            {t.nav.login}
          </button>
          <button
            onClick={() => { setActiveTab('register'); document.getElementById('auth-section')?.scrollIntoView({ behavior: 'smooth' }) }}
            style={{ padding: isSmall ? '0.4rem 0.75rem' : '0.5rem 1rem', border: 'none', borderRadius: '8px', color: 'white', backgroundColor: '#2563eb', cursor: 'pointer', fontWeight: '500', fontSize: isSmall ? '0.8rem' : '0.875rem' }}
          >
            {isMobile ? t.nav.register : t.nav.start}
          </button>
        </div>
      </nav>

      {/* HERO */}
      <section style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #0f172a 0%, #1e3a8a 50%, #1d4ed8 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: isMobile ? '5rem 1.25rem 3rem' : '6rem 2rem 4rem', textAlign: 'center' }}>
        <div style={{ maxWidth: '800px' }}>
          <div style={{ display: 'inline-block', backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: '100px', padding: '0.4rem 1.25rem', marginBottom: '1.5rem', fontSize: '0.875rem', color: '#93c5fd' }}>
            {t.hero.badge}
          </div>
          <h1 style={{ fontSize: isSmall ? '1.75rem' : isMobile ? '2.25rem' : '3.5rem', fontWeight: '800', color: 'white', lineHeight: 1.2, marginBottom: '1.5rem' }}>
            {t.hero.title1}<br />
            <span style={{ color: '#60a5fa' }}>{t.hero.title2}</span>
          </h1>
          <p style={{ fontSize: '1.25rem', color: '#93c5fd', lineHeight: 1.7, marginBottom: '2.5rem', maxWidth: '600px', margin: '0 auto 2.5rem' }}>
            {t.hero.subtitle.replace('CLERICITY', '')}
            <strong style={{ color: 'white' }}>CLERICITY</strong>
            {lang === 'hu' ? ' megoldja ezt helyetted.' : ''}
          </p>
          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
            <button
              onClick={() => { setActiveTab('register'); document.getElementById('auth-section')?.scrollIntoView({ behavior: 'smooth' }) }}
              style={{ padding: '1rem 2.5rem', backgroundColor: '#2563eb', color: 'white', border: 'none', borderRadius: '12px', fontSize: '1.1rem', fontWeight: '700', cursor: 'pointer', boxShadow: '0 4px 20px rgba(37,99,235,0.5)' }}
            >
              {t.hero.cta}
            </button>
            <button
              onClick={() => document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' })}
              style={{ padding: '1rem 2.5rem', backgroundColor: 'rgba(255,255,255,0.1)', color: 'white', border: '1px solid rgba(255,255,255,0.3)', borderRadius: '12px', fontSize: '1.1rem', fontWeight: '600', cursor: 'pointer' }}
            >
              {t.hero.learn}
            </button>
          </div>
        </div>
      </section>

      {/* PROBLÉMA SZEKCIÓ */}
      <section style={{ padding: isMobile ? '3rem 1.25rem' : '6rem 2rem', backgroundColor: '#f8fafc', textAlign: 'center' }}>
        <div style={{ maxWidth: '800px', margin: '0 auto' }}>
          <h2 style={{ fontSize: isMobile ? '1.75rem' : '2.25rem', fontWeight: '800', marginBottom: '1.5rem', color: '#0f172a' }}>
            {t.problem.title}
          </h2>
          <p style={{ fontSize: '1.15rem', color: '#475569', lineHeight: 1.8, marginBottom: '3rem' }}>
            {t.problem.subtitle}
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1.5rem' }}>
            {t.problem.items.map((item, i) => (
              <div key={i} style={{ backgroundColor: 'white', padding: '1.75rem', borderRadius: '16px', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
                <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>{item.icon}</div>
                <h3 style={{ fontWeight: '700', marginBottom: '0.5rem', color: '#0f172a' }}>{item.title}</h3>
                <p style={{ color: '#64748b', fontSize: '0.875rem', lineHeight: 1.6 }}>{item.desc}</p>
              </div>
            ))}
          </div>
          <div style={{ marginTop: '3rem', padding: '2rem', backgroundColor: '#eff6ff', borderRadius: '16px', border: '1px solid #bfdbfe' }}>
            <p style={{ fontSize: '1.25rem', fontWeight: '700', color: '#1d4ed8', marginBottom: '0.5rem' }}>
              {t.problem.solution_label}
            </p>
            <p style={{ color: '#3b82f6', fontSize: '1rem' }}>
              {t.problem.win}
            </p>
          </div>
        </div>
      </section>

      {/* FUNKCIÓK */}
      <section id="features" style={{ padding: isMobile ? '3rem 1.25rem' : '6rem 2rem', backgroundColor: 'white' }}>
        <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '4rem' }}>
            <h2 style={{ fontSize: '2.25rem', fontWeight: '800', color: '#0f172a', marginBottom: '1rem' }}>
              {t.features.title}
            </h2>
            <p style={{ color: '#64748b', fontSize: '1.1rem' }}>{t.features.subtitle}</p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem' }}>
            {t.features.items.map((feature, i) => (
              <div key={i} style={{ padding: '1.75rem', borderRadius: '16px', border: '1px solid #f1f5f9', boxShadow: '0 2px 12px rgba(0,0,0,0.04)', transition: 'transform 0.2s' }}
                onMouseEnter={e => (e.currentTarget.style.transform = 'translateY(-4px)')}
                onMouseLeave={e => (e.currentTarget.style.transform = 'translateY(0)')}
              >
                <div style={{ fontSize: '2.25rem', marginBottom: '1rem' }}>{feature.icon}</div>
                <h3 style={{ fontWeight: '700', fontSize: '1.1rem', marginBottom: '0.75rem', color: '#0f172a' }}>{feature.title}</h3>
                <p style={{ color: '#64748b', fontSize: '0.9rem', lineHeight: 1.7 }}>{feature.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ÁRAZÁS */}
      <section id="pricing" style={{ padding: isMobile ? '3rem 1.25rem' : '6rem 2rem', backgroundColor: '#f8fafc' }}>
        <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '3.5rem' }}>
            <h2 style={{ fontSize: '2.25rem', fontWeight: '800', color: '#0f172a', marginBottom: '1rem' }}>
              {t.pricing.title}
            </h2>
            <p style={{ color: '#64748b', fontSize: '1.1rem' }}>{t.pricing.subtitle}</p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: isSmall ? '1fr' : 'repeat(auto-fit, minmax(230px, 1fr))', gap: '1.25rem', alignItems: 'start' }}>
            {t.pricing.plans.map((plan, i) => {
              const prices = ['0€', '10€', '16€', '25€']
              const highlight = i === 2
              const cta = i === 0 ? t.pricing.cta_free : t.pricing.cta_paid
              return (
              <div key={plan.key} style={{
                backgroundColor: 'white', borderRadius: '20px',
                padding: highlight ? '2.5rem 1.75rem' : '2rem 1.75rem',
                boxShadow: highlight ? '0 12px 48px rgba(37,99,235,0.18)' : '0 2px 12px rgba(0,0,0,0.06)',
                border: highlight ? '2px solid #2563eb' : '1px solid #e5e7eb',
                position: 'relative',
                transform: highlight && !isSmall ? 'scale(1.03)' : 'none',
              }}>
                {highlight && (
                  <div style={{ position: 'absolute', top: '-14px', left: '50%', transform: 'translateX(-50%)', backgroundColor: '#2563eb', color: 'white', padding: '0.3rem 1.25rem', borderRadius: '100px', fontSize: '0.75rem', fontWeight: '800', whiteSpace: 'nowrap', letterSpacing: '0.05em' }}>
                    {t.pricing.popular_badge}
                  </div>
                )}
                <p style={{ fontSize: '0.8rem', fontWeight: '700', color: highlight ? '#2563eb' : '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.5rem' }}>{plan.name}</p>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: '0.25rem', marginBottom: '0.25rem' }}>
                  <span style={{ fontSize: '2.75rem', fontWeight: '900', color: '#0f172a', lineHeight: 1 }}>{prices[i]}</span>
                  <span style={{ fontSize: '0.9rem', color: '#64748b', marginBottom: '0.4rem' }}>{t.pricing.period}</span>
                </div>
                <p style={{ color: '#64748b', fontSize: '0.875rem', marginBottom: '1.5rem' }}>{plan.desc}</p>

                <div style={{ marginBottom: '1.75rem', borderTop: '1px solid #f3f4f6', paddingTop: '1.25rem' }}>
                  {plan.features.map((f, j) => (
                    <div key={j} style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', marginBottom: '0.5rem' }}>
                      <span style={{
                        width: '18px', height: '18px', borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', fontWeight: '900',
                        backgroundColor: f.ok ? (highlight ? '#eff6ff' : '#f0fdf4') : '#f9fafb',
                        color: f.ok ? (highlight ? '#2563eb' : '#16a34a') : '#d1d5db',
                      }}>
                        {f.ok ? '✓' : '✕'}
                      </span>
                      <span style={{ color: f.ok ? '#374151' : '#9ca3af', fontSize: '0.85rem' }}>{f.text}</span>
                    </div>
                  ))}
                </div>

                <button
                  onClick={() => {
                    setSelectedPlan(plan.key)
                    setActiveTab('register')
                    document.getElementById('auth-section')?.scrollIntoView({ behavior: 'smooth' })
                  }}
                  style={{
                    width: '100%', padding: '0.875rem',
                    backgroundColor: highlight ? '#2563eb' : 'white',
                    color: highlight ? 'white' : '#2563eb',
                    border: highlight ? 'none' : '2px solid #2563eb',
                    borderRadius: '10px', fontSize: '0.95rem', fontWeight: '700', cursor: 'pointer',
                    boxShadow: highlight ? '0 4px 16px rgba(37,99,235,0.35)' : 'none',
                  }}
                >
                  {cta} →
                </button>
              </div>
              )
            })}
          </div>

          <p style={{ textAlign: 'center', color: '#9ca3af', fontSize: '0.85rem', marginTop: '2rem' }}>
            {t.pricing.no_card}
          </p>
        </div>
      </section>

      {/* WIN-WIN */}
      <section style={{ padding: isMobile ? '3rem 1.25rem' : '6rem 2rem', background: 'linear-gradient(135deg, #0f172a 0%, #1e3a8a 100%)', textAlign: 'center' }}>
        <div style={{ maxWidth: '700px', margin: '0 auto' }}>
          <h2 style={{ fontSize: isMobile ? '1.75rem' : '2.25rem', fontWeight: '800', color: 'white', marginBottom: '1.5rem' }}>
            {t.winwin.title}
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '1rem', marginBottom: '3rem' }}>
            <div style={{ backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: '16px', padding: '2rem', textAlign: 'left' }}>
              <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>👨‍💼</div>
              <h3 style={{ color: 'white', fontWeight: '700', marginBottom: '1rem' }}>{t.winwin.you}</h3>
              {t.winwin.you_items.map((item, i) => (
                <div key={i} style={{ color: '#93c5fd', fontSize: '0.9rem', marginBottom: '0.5rem' }}>✓ {item}</div>
              ))}
            </div>
            <div style={{ backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: '16px', padding: '2rem', textAlign: 'left' }}>
              <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>🙋‍♀️</div>
              <h3 style={{ color: 'white', fontWeight: '700', marginBottom: '1rem' }}>{t.winwin.guests}</h3>
              {t.winwin.guest_items.map((item, i) => (
                <div key={i} style={{ color: '#93c5fd', fontSize: '0.9rem', marginBottom: '0.5rem' }}>✓ {item}</div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* AUTH SZEKCIÓ */}
      <section id="auth-section" style={{ padding: isMobile ? '3rem 1.25rem' : '6rem 2rem', backgroundColor: '#f8fafc' }}>
        <div style={{ maxWidth: '500px', margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
            <Image src="/clericity-logo.png" alt="CLERICITY" width={140} height={50} style={{ objectFit: 'contain' }} />
          </div>

          {/* Kiválasztott csomag badge */}
          {activeTab === 'register' && (() => {
            const planInfo: Record<string, { label: string; color: string; bg: string; border: string }> = {
              free:     { label: t.auth.plan_free,     color: '#92400e', bg: '#fef3c7', border: '#fde68a' },
              basic:    { label: t.auth.plan_basic,    color: '#1d4ed8', bg: '#dbeafe', border: '#bfdbfe' },
              pro:      { label: t.auth.plan_pro,      color: '#6d28d9', bg: '#ede9fe', border: '#c4b5fd' },
              business: { label: t.auth.plan_business, color: '#065f46', bg: '#d1fae5', border: '#6ee7b7' },
            }
            const info = planInfo[selectedPlan] || planInfo.free
            return (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', marginBottom: '1rem', padding: '0.625rem 1rem', backgroundColor: info.bg, border: `1px solid ${info.border}`, borderRadius: '10px' }}>
                <span style={{ fontSize: '0.85rem', color: info.color, fontWeight: '700' }}>📦 {info.label}</span>
                <button onClick={() => document.getElementById('pricing')?.scrollIntoView({ behavior: 'smooth' })} style={{ background: 'none', border: 'none', color: info.color, fontSize: '0.75rem', cursor: 'pointer', textDecoration: 'underline', opacity: 0.8 }}>
                  {t.auth.change}
                </button>
              </div>
            )
          })()}

          {/* Tab váltó — csak Belépés és Regisztráció */}
          <div style={{ display: 'flex', backgroundColor: 'white', borderRadius: '12px', padding: '0.375rem', marginBottom: '1.5rem', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', gap: '0.25rem' }}>
            {([
              { key: 'login', label: t.auth.login },
              { key: 'register', label: t.auth.register },
            ] as const).map(tab => (
              <button key={tab.key} onClick={() => { setActiveTab(tab.key); setError('') }}
                style={{ flex: 1, padding: '0.625rem 0.5rem', borderRadius: '8px', border: 'none', cursor: 'pointer', fontWeight: '600', fontSize: '0.875rem', backgroundColor: activeTab === tab.key ? '#2563eb' : 'transparent', color: activeTab === tab.key ? 'white' : '#6b7280', transition: 'all 0.2s' }}>
                {tab.label}
              </button>
            ))}
          </div>

          <div
            style={{ backgroundColor: 'white', borderRadius: '16px', padding: '2rem', boxShadow: '0 4px 20px rgba(0,0,0,0.08)' }}
            onKeyDown={e => {
              if (e.key !== 'Enter' || e.shiftKey) return
              const tag = (e.target as HTMLElement).tagName
              if (tag === 'TEXTAREA' || tag === 'BUTTON') return
              if (activeTab === 'login') handleLogin()
              else if (activeTab === 'register' && regType === 'business') handleRegisterBusiness()
              else if (activeTab === 'register' && regType === 'personal') handleRegisterPersonal()
            }}>

            {/* BELÉPÉS */}
            {activeTab === 'login' && <>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', color: '#374151', marginBottom: '0.5rem' }}>{t.auth.email}</label>
                <div style={{ position: 'relative' }}>
                  <input type="email" value={loginEmail}
                    onChange={e => { setLoginEmail(e.target.value); setLoginDrop(true) }}
                    onFocus={() => setLoginDrop(true)}
                    onBlur={() => setTimeout(() => setLoginDrop(false), 150)}
                    autoComplete="off"
                    style={{ width: '100%', border: '1px solid #e5e7eb', borderRadius: '10px', padding: '0.75rem 1rem', color: '#111827', outline: 'none', boxSizing: 'border-box', fontSize: '0.95rem' }}
                    placeholder="email@example.com" onKeyDown={e => e.key === 'Enter' && handleLogin()} />
                  {loginDrop && savedEmails.filter(e => e.toLowerCase().includes(loginEmail.toLowerCase())).length > 0 && (
                    <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, backgroundColor: 'white', border: '1px solid #e5e7eb', borderRadius: '10px', boxShadow: '0 4px 16px rgba(0,0,0,0.1)', zIndex: 50, marginTop: '4px', overflow: 'hidden' }}>
                      {savedEmails.filter(e => e.toLowerCase().includes(loginEmail.toLowerCase())).map((e, i) => (
                        <div key={i} onMouseDown={() => { setLoginEmail(e); setLoginDrop(false) }}
                          style={{ padding: '0.75rem 1rem', cursor: 'pointer', fontSize: '0.9rem', color: '#111827', borderBottom: '1px solid #f3f4f6' }}
                          onMouseOver={ev => (ev.currentTarget.style.backgroundColor = '#f8fafc')}
                          onMouseOut={ev => (ev.currentTarget.style.backgroundColor = 'white')}>
                          {e}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', color: '#374151', marginBottom: '0.5rem' }}>{t.auth.password}</label>
                <input type="password" value={loginPassword} onChange={e => setLoginPassword(e.target.value)}
                  autoComplete="current-password"
                  style={{ width: '100%', border: '1px solid #e5e7eb', borderRadius: '10px', padding: '0.75rem 1rem', color: '#111827', outline: 'none', boxSizing: 'border-box', fontSize: '0.95rem' }}
                  placeholder="••••••••" onKeyDown={e => e.key === 'Enter' && handleLogin()} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', marginBottom: '1.5rem' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', userSelect: 'none' }}>
                  <div onClick={() => setRememberMe(!rememberMe)}
                    style={{ width: '40px', height: '22px', borderRadius: '11px', backgroundColor: rememberMe ? '#2563eb' : '#d1d5db', position: 'relative', cursor: 'pointer', transition: 'background 0.2s', flexShrink: 0 }}>
                    <div style={{ position: 'absolute', top: '2px', left: rememberMe ? '20px' : '2px', width: '18px', height: '18px', borderRadius: '50%', backgroundColor: 'white', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
                  </div>
                  <span style={{ fontSize: '0.875rem', color: '#374151', fontWeight: '500' }}>{t.auth.remember}</span>
                </label>
              </div>
              {error && <p style={{ color: '#ef4444', fontSize: '0.875rem', marginBottom: '1rem', textAlign: 'center' }}>{error}</p>}
              <button onClick={handleLogin} disabled={loading}
                style={{ width: '100%', backgroundColor: '#2563eb', color: 'white', padding: '0.875rem', borderRadius: '10px', border: 'none', cursor: 'pointer', fontWeight: '700', fontSize: '1rem', opacity: loading ? 0.5 : 1, boxShadow: '0 4px 15px rgba(37,99,235,0.35)' }}>
                {loading ? t.booking.loading : t.auth.login_btn}
              </button>
            </>}

            {/* REGISZTRÁCIÓ */}
            {activeTab === 'register' && <>
              {/* Típus választó */}
              <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', backgroundColor: '#f8fafc', borderRadius: '10px', padding: '0.3rem' }}>
                <button onClick={() => { setRegType('business'); setError('') }}
                  style={{ flex: 1, padding: '0.625rem', borderRadius: '8px', border: 'none', cursor: 'pointer', fontWeight: '600', fontSize: '0.875rem', backgroundColor: regType === 'business' ? 'white' : 'transparent', color: regType === 'business' ? '#111827' : '#6b7280', boxShadow: regType === 'business' ? '0 1px 4px rgba(0,0,0,0.1)' : 'none', transition: 'all 0.15s' }}>
                  {t.auth.as_company}
                </button>
                <button onClick={() => { setRegType('personal'); setError('') }}
                  style={{ flex: 1, padding: '0.625rem', borderRadius: '8px', border: 'none', cursor: 'pointer', fontWeight: '600', fontSize: '0.875rem', backgroundColor: regType === 'personal' ? 'white' : 'transparent', color: regType === 'personal' ? '#111827' : '#6b7280', boxShadow: regType === 'personal' ? '0 1px 4px rgba(0,0,0,0.1)' : 'none', transition: 'all 0.15s' }}>
                  {t.auth.as_personal}
                </button>
              </div>

              {/* Cégként mezők */}
              {regType === 'business' && <>
                <p style={{ fontSize: '0.8rem', color: '#6b7280', marginBottom: '1.25rem' }}>{t.auth.company_desc}</p>
                {[
                  { label: t.auth.company_name, type: 'text', value: companyName, set: setCompanyName, placeholder: 'Kovács Barbershop Kft.', isName: true },
                  { label: t.auth.tax_number, type: 'text', value: taxNumber, set: setTaxNumber, placeholder: '12345678-1-01', isTax: true },
                  { label: t.auth.address, type: 'text', value: companyAddress, set: setCompanyAddress, placeholder: '1234 Budapest, Fő utca 1.', isAddress: true },
                  { label: t.auth.email, type: 'email', value: bizEmail, set: setBizEmail, placeholder: 'info@valalkozas.hu' },
                ].map(f => (
                  <div key={f.label} style={{ marginBottom: '1rem' }}>
                    <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', color: '#374151', marginBottom: '0.5rem' }}>{f.label}</label>
                    {f.type === 'email' ? (
                      <div style={{ position: 'relative' }}>
                        <input type="email" value={f.value} autoComplete="off"
                          onChange={e => { f.set(e.target.value); setBizDrop(true); setBizEmailError('') }}
                          onFocus={() => setBizDrop(true)} onBlur={() => setTimeout(() => setBizDrop(false), 150)}
                          style={{ width: '100%', border: `1px solid ${bizEmailError ? '#ef4444' : '#e5e7eb'}`, borderRadius: '10px', padding: '0.75rem 1rem', color: '#111827', outline: 'none', boxSizing: 'border-box', fontSize: '0.95rem' }}
                          placeholder={f.placeholder} />
                        {bizEmailError && <p style={{ color: '#ef4444', fontSize: '0.75rem', marginTop: '0.3rem' }}>{bizEmailError}</p>}
                        {bizDrop && savedEmails.filter(e => e.toLowerCase().includes(f.value.toLowerCase())).length > 0 && (
                          <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, backgroundColor: 'white', border: '1px solid #e5e7eb', borderRadius: '10px', boxShadow: '0 4px 16px rgba(0,0,0,0.1)', zIndex: 50, marginTop: '4px', overflow: 'hidden' }}>
                            {savedEmails.filter(e => e.toLowerCase().includes(f.value.toLowerCase())).map((e, i) => (
                              <div key={i} onMouseDown={() => { f.set(e); setBizDrop(false) }}
                                style={{ padding: '0.75rem 1rem', cursor: 'pointer', fontSize: '0.9rem', color: '#111827', borderBottom: '1px solid #f3f4f6' }}
                                onMouseOver={ev => (ev.currentTarget.style.backgroundColor = '#f8fafc')}
                                onMouseOut={ev => (ev.currentTarget.style.backgroundColor = 'white')}>{e}</div>
                            ))}
                          </div>
                        )}
                      </div>
                    ) : (
                      <>
                        <input type={f.type} value={f.value}
                          onChange={e => {
                            f.set(e.target.value)
                            if ((f as { isAddress?: boolean }).isAddress) setCompanyAddressError('')
                            if ((f as { isTax?: boolean }).isTax) setTaxNumberError('')
                            if ((f as { isName?: boolean }).isName) setCompanyNameError('')
                          }}
                          style={{ width: '100%', border: `1px solid ${((f as { isAddress?: boolean }).isAddress && companyAddressError) || ((f as { isTax?: boolean }).isTax && taxNumberError) || ((f as { isName?: boolean }).isName && companyNameError) ? '#ef4444' : '#e5e7eb'}`, borderRadius: '10px', padding: '0.75rem 1rem', color: '#111827', outline: 'none', boxSizing: 'border-box', fontSize: '0.95rem' }}
                          placeholder={f.placeholder} />
                        {(f as { isAddress?: boolean }).isAddress && companyAddressError && <p style={{ color: '#ef4444', fontSize: '0.75rem', marginTop: '0.3rem' }}>{companyAddressError}</p>}
                        {(f as { isTax?: boolean }).isTax && taxNumberError && <p style={{ color: '#ef4444', fontSize: '0.75rem', marginTop: '0.3rem' }}>{taxNumberError}</p>}
                        {(f as { isName?: boolean }).isName && companyNameError && <p style={{ color: '#ef4444', fontSize: '0.75rem', marginTop: '0.3rem' }}>{companyNameError}</p>}
                      </>
                    )}
                  </div>
                ))}
                {/* Telefonszám */}
                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', color: '#374151', marginBottom: '0.5rem' }}>{t.auth.phone}</label>
                  <input
                    type="tel"
                    value={bizPhone}
                    onChange={e => { setBizPhone(e.target.value); setBizPhoneError('') }}
                    style={{ width: '100%', border: `1px solid ${bizPhoneError ? '#ef4444' : '#e5e7eb'}`, borderRadius: '10px', padding: '0.75rem 1rem', color: '#111827', outline: 'none', boxSizing: 'border-box', fontSize: '0.95rem' }}
                    placeholder={t.auth.phone_placeholder}
                  />
                  {bizPhoneError && <p style={{ color: '#ef4444', fontSize: '0.75rem', marginTop: '0.3rem' }}>{bizPhoneError}</p>}
                </div>
                {/* Jelszó szemgombbal */}
                {[
                  { label: t.auth.password + ' *', isConfirm: false, value: bizPassword, set: setBizPassword, show: showBizPassword, toggle: () => setShowBizPassword(v => !v) },
                  { label: t.auth.password_confirm + ' *', isConfirm: true, value: bizPasswordConfirm, set: setBizPasswordConfirm, show: showBizPasswordConfirm, toggle: () => setShowBizPasswordConfirm(v => !v) },
                ].map(f => (
                  <div key={f.label} style={{ marginBottom: '1rem' }}>
                    <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', color: '#374151', marginBottom: '0.5rem' }}>{f.label}</label>
                    <div style={{ position: 'relative' }}>
                      <input type={f.show ? 'text' : 'password'} value={f.value} onChange={e => f.set(e.target.value)}
                        style={{ width: '100%', border: `1px solid ${f.isConfirm && bizPasswordConfirm && bizPassword !== bizPasswordConfirm ? '#ef4444' : '#e5e7eb'}`, borderRadius: '10px', padding: '0.75rem 2.75rem 0.75rem 1rem', color: '#111827', outline: 'none', boxSizing: 'border-box', fontSize: '0.95rem' }}
                        placeholder="••••••••" />
                      <button type="button" onClick={f.toggle}
                        style={{ position: 'absolute', right: '0.75rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', fontSize: '1rem', lineHeight: 1 }}>
                        {f.show ? '🙈' : '👁️'}
                      </button>
                    </div>
                    {f.isConfirm && bizPasswordConfirm && bizPassword !== bizPasswordConfirm && (
                      <p style={{ color: '#ef4444', fontSize: '0.75rem', marginTop: '0.3rem' }}>{t.auth.passwords_mismatch}</p>
                    )}
                    {f.isConfirm && bizPasswordConfirm && bizPassword === bizPasswordConfirm && (
                      <p style={{ color: '#16a34a', fontSize: '0.75rem', marginTop: '0.3rem' }}>{t.auth.passwords_match}</p>
                    )}
                  </div>
                ))}
                {error && <p style={{ color: '#ef4444', fontSize: '0.875rem', marginBottom: '1rem', textAlign: 'center' }}>{error}</p>}
                <button onClick={handleRegisterBusiness} disabled={loading}
                  style={{ width: '100%', backgroundColor: '#2563eb', color: 'white', padding: '0.875rem', borderRadius: '10px', border: 'none', cursor: 'pointer', fontWeight: '700', fontSize: '1rem', opacity: loading ? 0.5 : 1 }}>
                  {loading ? t.booking.loading : t.auth.register_company}
                </button>
              </>}

              {/* Magánszemélyként mezők */}
              {regType === 'personal' && <>
                <p style={{ fontSize: '0.8rem', color: '#6b7280', marginBottom: '1.25rem' }}>{t.auth.personal_desc}</p>
                {[
                  { label: t.auth.full_name, type: 'text', value: personalName, set: setPersonalName, placeholder: 'Kovács János', isName: true },
                  { label: t.auth.email, type: 'email', value: personalEmail, set: setPersonalEmail, placeholder: 'email@example.com' },
                  { label: t.auth.personal_address, type: 'text', value: personalAddress, set: setPersonalAddress, placeholder: '1234 Budapest, Fő utca 1.', isAddress: true },
                ].map(f => (
                  <div key={f.label} style={{ marginBottom: '1rem' }}>
                    <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', color: '#374151', marginBottom: '0.5rem' }}>{f.label}</label>
                    {f.type === 'email' ? (
                      <div style={{ position: 'relative' }}>
                        <input type="email" value={f.value} autoComplete="off"
                          onChange={e => { f.set(e.target.value); setPersonalDrop(true); setPersonalEmailError('') }}
                          onFocus={() => setPersonalDrop(true)} onBlur={() => setTimeout(() => setPersonalDrop(false), 150)}
                          style={{ width: '100%', border: `1px solid ${personalEmailError ? '#ef4444' : '#e5e7eb'}`, borderRadius: '10px', padding: '0.75rem 1rem', color: '#111827', outline: 'none', boxSizing: 'border-box', fontSize: '0.95rem' }}
                          placeholder={f.placeholder} />
                        {personalEmailError && <p style={{ color: '#ef4444', fontSize: '0.75rem', marginTop: '0.3rem' }}>{personalEmailError}</p>}
                        {personalDrop && savedEmails.filter(e => e.toLowerCase().includes(f.value.toLowerCase())).length > 0 && (
                          <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, backgroundColor: 'white', border: '1px solid #e5e7eb', borderRadius: '10px', boxShadow: '0 4px 16px rgba(0,0,0,0.1)', zIndex: 50, marginTop: '4px', overflow: 'hidden' }}>
                            {savedEmails.filter(e => e.toLowerCase().includes(f.value.toLowerCase())).map((e, i) => (
                              <div key={i} onMouseDown={() => { f.set(e); setPersonalDrop(false) }}
                                style={{ padding: '0.75rem 1rem', cursor: 'pointer', fontSize: '0.9rem', color: '#111827', borderBottom: '1px solid #f3f4f6' }}
                                onMouseOver={ev => (ev.currentTarget.style.backgroundColor = '#f8fafc')}
                                onMouseOut={ev => (ev.currentTarget.style.backgroundColor = 'white')}>{e}</div>
                            ))}
                          </div>
                        )}
                      </div>
                    ) : (
                      <>
                        <input type={f.type} value={f.value}
                          onChange={e => {
                            f.set(e.target.value)
                            if ((f as { isAddress?: boolean }).isAddress) setPersonalAddressError('')
                            if ((f as { isName?: boolean }).isName) setPersonalNameError('')
                          }}
                          style={{ width: '100%', border: `1px solid ${((f as { isAddress?: boolean }).isAddress && personalAddressError) || ((f as { isName?: boolean }).isName && personalNameError) ? '#ef4444' : '#e5e7eb'}`, borderRadius: '10px', padding: '0.75rem 1rem', color: '#111827', outline: 'none', boxSizing: 'border-box', fontSize: '0.95rem' }}
                          placeholder={f.placeholder} />
                        {(f as { isAddress?: boolean }).isAddress && personalAddressError && <p style={{ color: '#ef4444', fontSize: '0.75rem', marginTop: '0.3rem' }}>{personalAddressError}</p>}
                        {(f as { isName?: boolean }).isName && personalNameError && <p style={{ color: '#ef4444', fontSize: '0.75rem', marginTop: '0.3rem' }}>{personalNameError}</p>}
                      </>
                    )}
                  </div>
                ))}
                {/* Telefonszám */}
                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', color: '#374151', marginBottom: '0.5rem' }}>{t.auth.phone}</label>
                  <input
                    type="tel"
                    value={personalPhone}
                    onChange={e => { setPersonalPhone(e.target.value); setPersonalPhoneError('') }}
                    style={{ width: '100%', border: `1px solid ${personalPhoneError ? '#ef4444' : '#e5e7eb'}`, borderRadius: '10px', padding: '0.75rem 1rem', color: '#111827', outline: 'none', boxSizing: 'border-box', fontSize: '0.95rem' }}
                    placeholder={t.auth.phone_placeholder}
                  />
                  {personalPhoneError && <p style={{ color: '#ef4444', fontSize: '0.75rem', marginTop: '0.3rem' }}>{personalPhoneError}</p>}
                </div>
                {/* Jelszó szemgombbal */}
                {[
                  { label: t.auth.password + ' *', isConfirm: false, value: personalPassword, set: setPersonalPassword, show: showPersonalPassword, toggle: () => setShowPersonalPassword(v => !v) },
                  { label: t.auth.password_confirm + ' *', isConfirm: true, value: personalPasswordConfirm, set: setPersonalPasswordConfirm, show: showPersonalPasswordConfirm, toggle: () => setShowPersonalPasswordConfirm(v => !v) },
                ].map(f => (
                  <div key={f.label} style={{ marginBottom: '1rem' }}>
                    <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', color: '#374151', marginBottom: '0.5rem' }}>{f.label}</label>
                    <div style={{ position: 'relative' }}>
                      <input type={f.show ? 'text' : 'password'} value={f.value} onChange={e => f.set(e.target.value)}
                        style={{ width: '100%', border: `1px solid ${f.isConfirm && personalPasswordConfirm && personalPassword !== personalPasswordConfirm ? '#ef4444' : '#e5e7eb'}`, borderRadius: '10px', padding: '0.75rem 2.75rem 0.75rem 1rem', color: '#111827', outline: 'none', boxSizing: 'border-box', fontSize: '0.95rem' }}
                        placeholder="••••••••" />
                      <button type="button" onClick={f.toggle}
                        style={{ position: 'absolute', right: '0.75rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', fontSize: '1rem', lineHeight: 1 }}>
                        {f.show ? '🙈' : '👁️'}
                      </button>
                    </div>
                    {f.isConfirm && personalPasswordConfirm && personalPassword !== personalPasswordConfirm && (
                      <p style={{ color: '#ef4444', fontSize: '0.75rem', marginTop: '0.3rem' }}>{t.auth.passwords_mismatch}</p>
                    )}
                    {f.isConfirm && personalPasswordConfirm && personalPassword === personalPasswordConfirm && (
                      <p style={{ color: '#16a34a', fontSize: '0.75rem', marginTop: '0.3rem' }}>{t.auth.passwords_match}</p>
                    )}
                  </div>
                ))}
                {error && <p style={{ color: '#ef4444', fontSize: '0.875rem', marginBottom: '1rem', textAlign: 'center' }}>{error}</p>}
                <button onClick={handleRegisterPersonal} disabled={loading}
                  style={{ width: '100%', backgroundColor: '#2563eb', color: 'white', padding: '0.875rem', borderRadius: '10px', border: 'none', cursor: 'pointer', fontWeight: '700', fontSize: '1rem', opacity: loading ? 0.5 : 1 }}>
                  {loading ? t.booking.loading : t.auth.register_personal}
                </button>
              </>}

              <p style={{ color: '#9ca3af', fontSize: '0.8rem', textAlign: 'center', marginTop: '1rem' }}>{t.auth.no_card}</p>
            </>}

          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer style={{ backgroundColor: '#0f172a', padding: '2.5rem 2rem', textAlign: 'center' }}>
        <div style={{ display: 'flex', justifyContent: 'center', gap: '2rem', flexWrap: 'wrap', marginBottom: '1.25rem' }}>
          <Link href="/privacy-policy" style={{ color: '#64748b', fontSize: '0.85rem', textDecoration: 'none' }}>{t.footer.privacy}</Link>
          <Link href="/terms" style={{ color: '#64748b', fontSize: '0.85rem', textDecoration: 'none' }}>{t.footer.terms}</Link>
          <a href="mailto:kusalarudika@gmail.com" style={{ color: '#64748b', fontSize: '0.85rem', textDecoration: 'none' }}>{t.footer.contact}</a>
        </div>
        <p style={{ color: '#334155', fontSize: '0.8rem', margin: 0 }}>© 2026 CLERICITY — Online Foglalási Rendszer</p>
      </footer>

    </div>
  )
}