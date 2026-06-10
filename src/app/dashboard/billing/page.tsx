'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { useLanguage } from '@/hooks/useLanguage'

export default function BillingPage() {
  const router = useRouter()
  const { lang, t } = useLanguage()
  const dateLocale = lang === 'en' ? 'en-US' : lang === 'sk' ? 'sk-SK' : 'hu-HU'

  const [tenantId, setTenantId] = useState<string | null>(null)
  const [plan, setPlan] = useState('free')
  const [planExpiresAt, setPlanExpiresAt] = useState<string | null>(null)
  const [stripeSubscriptionId, setStripeSubscriptionId] = useState<string | null>(null)
  const [isSuperAdmin, setIsSuperAdmin] = useState(false)
  const [planSaving, setPlanSaving] = useState(false)
  const [planSuccess, setPlanSuccess] = useState(false)
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null)
  const [checkoutError, setCheckoutError] = useState('')
  const [showCancelConfirm, setShowCancelConfirm] = useState(false)
  const [cancelLoading, setCancelLoading] = useState(false)
  const [cancelError, setCancelError] = useState('')

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/auth'); return }
      const { data: profile } = await supabase.from('profiles').select('tenant_id, role').eq('id', user.id).single()
      if (!profile?.tenant_id) return
      setTenantId(profile.tenant_id)
      setIsSuperAdmin(profile.role === 'super_admin')
      const { data: tenant } = await supabase.from('tenants').select('plan, plan_expires_at, stripe_subscription_id').eq('id', profile.tenant_id).single()
      if (tenant) {
        setPlan(tenant.plan || 'free')
        setPlanExpiresAt(tenant.plan_expires_at || null)
        setStripeSubscriptionId(tenant.stripe_subscription_id || null)
      }
    }
    init()
  }, [router])

  const handleSavePlan = async (newPlan: string) => {
    if (!tenantId) return
    setPlanSaving(true); setPlanSuccess(false)
    const now = new Date()
    const expiresAt = new Date(now)
    expiresAt.setDate(expiresAt.getDate() + 30)
    await supabase.from('tenants').update({
      plan: newPlan,
      plan_activated_at: now.toISOString(),
      plan_expires_at: newPlan === 'free' ? null : expiresAt.toISOString(),
    }).eq('id', tenantId)
    setPlan(newPlan); setPlanSuccess(true)
    setPlanSaving(false)
    setTimeout(() => setPlanSuccess(false), 2500)
  }

  const handleStripeCheckout = async (targetPlan: string) => {
    setCheckoutError('')
    setCheckoutLoading(targetPlan)
    try {
      const { data: { session: sess } } = await supabase.auth.getSession()
      const res = await fetch('/api/stripe/create-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${sess?.access_token}` },
        body: JSON.stringify({ plan: targetPlan }),
      })
      const data = await res.json()
      if (data.url) {
        window.location.href = data.url
      } else {
        setCheckoutError(data.error || 'Hiba történt a fizetés indításakor.')
        setCheckoutLoading(null)
      }
    } catch {
      setCheckoutError('Hálózati hiba. Kérjük próbáld újra.')
      setCheckoutLoading(null)
    }
  }

  const handleCancelSubscription = async () => {
    setCancelLoading(true)
    setCancelError('')
    try {
      const { data: { session: sess } } = await supabase.auth.getSession()
      const res = await fetch('/api/stripe/cancel-subscription', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${sess?.access_token}` },
      })
      const data = await res.json()
      if (data.success) {
        setStripeSubscriptionId(null)
        setShowCancelConfirm(false)
      } else {
        setCancelError(data.error || 'Hiba történt a lemondáskor.')
      }
    } catch {
      setCancelError('Hálózati hiba. Kérjük próbáld újra.')
    }
    setCancelLoading(false)
  }

  const PLANS = [
    { key: 'free',     label: t.pricing.plans[0].name, price: '0€',  color: '#92400e', bg: '#fef3c7', border: '#fde68a', bookings: 100,  staff: 1  },
    { key: 'basic',    label: t.pricing.plans[1].name, price: '10€', color: '#1d4ed8', bg: '#dbeafe', border: '#bfdbfe', bookings: 300,  staff: 2  },
    { key: 'pro',      label: t.pricing.plans[2].name, price: '16€', color: '#6d28d9', bg: '#ede9fe', border: '#c4b5fd', bookings: 1000, staff: 5  },
    { key: 'business', label: t.pricing.plans[3].name, price: '25€', color: '#065f46', bg: '#d1fae5', border: '#6ee7b7', bookings: 5000, staff: 10 },
  ]
  const PLAN_FEATURES: Record<string, string[]> = {
    free:     [t.pricing.plans[0].features[0].text, t.pricing.plans[0].features[1].text, t.pricing.plans[0].features[5].text],
    basic:    [t.pricing.plans[1].features[0].text, t.pricing.plans[1].features[1].text, t.pricing.plans[1].features[5].text, t.pricing.plans[1].features[8].text, t.pricing.plans[1].features[11].text, t.pricing.plans[1].features[6].text],
    pro:      [t.pricing.plans[2].features[0].text, t.pricing.plans[2].features[1].text, t.pricing.plans[2].features[12].text, t.pricing.plans[2].features[13].text, t.pricing.plans[2].features[14].text],
    business: [t.pricing.plans[3].features[0].text, t.pricing.plans[3].features[1].text],
  }

  const current = PLANS.find(p => p.key === plan) || PLANS[0]
  const planOrder = ['free', 'basic', 'pro', 'business']
  const currentIdx = planOrder.indexOf(plan)

  return (
    <div>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#111827', marginBottom: '1.5rem' }}>
        💳 {t.dash.tab_billing}
      </h1>

      <div style={{ maxWidth: '680px' }}>

        {/* Jelenlegi csomag */}
        <div style={{ backgroundColor: 'white', padding: '1.75rem', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', marginBottom: '1.25rem' }}>
          <h2 style={{ fontSize: '1rem', fontWeight: '700', color: '#111827', marginBottom: '1.25rem' }}>{t.dash.current_plan_title}</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '1rem 1.25rem', backgroundColor: current.bg, borderRadius: '10px', border: `1px solid ${current.border}`, marginBottom: '1.25rem' }}>
            <div style={{ flex: 1 }}>
              <p style={{ fontWeight: '800', color: current.color, fontSize: '1.1rem', margin: '0 0 0.25rem' }}>{current.label} — {current.price}{t.dash.plan_per_month}</p>
              <p style={{ color: current.color, fontSize: '0.85rem', margin: 0, opacity: 0.8 }}>
                {current.bookings} {t.dash.plan_bookings_users.split('·')[0].trim()} · {current.staff} {t.dash.plan_bookings_users.split('·')[1]?.trim()}
              </p>
              {planExpiresAt && plan !== 'free' && (() => {
                const now = new Date()
                const expires = new Date(planExpiresAt)
                const graceEnd = new Date(expires); graceEnd.setDate(graceEnd.getDate() + 3)
                const msLeft = expires.getTime() - now.getTime()
                const days = Math.ceil(msLeft / (1000 * 60 * 60 * 24))
                const isGrace = now > expires && now <= graceEnd
                const isExpired = now > graceEnd
                return (
                  <p style={{ fontSize: '0.8rem', marginTop: '0.4rem', fontWeight: '600', color: isExpired ? '#dc2626' : isGrace ? '#d97706' : current.color, opacity: 1 }}>
                    {isExpired ? t.dash.plan_expired_grace : isGrace ? `⚠️ ${Math.ceil((graceEnd.getTime() - now.getTime()) / 86400000)} ${t.dash.delay_day}` : days <= 7 ? `⏳ ${days} ${t.dash.delay_day}` : `${t.dash.plan_valid_until}: ${expires.toLocaleDateString(dateLocale)}`}
                  </p>
                )
              })()}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.4rem' }}>
              <span style={{ backgroundColor: current.color, color: 'white', fontSize: '0.75rem', fontWeight: '700', padding: '0.3rem 0.875rem', borderRadius: '999px' }}>
                {current.label.toUpperCase()}
              </span>
              {plan !== 'free' && !stripeSubscriptionId && planExpiresAt && (
                <span style={{ backgroundColor: '#fef2f2', color: '#dc2626', fontSize: '0.7rem', fontWeight: '700', padding: '0.2rem 0.6rem', borderRadius: '999px', border: '1px solid #fecaca' }}>
                  {t.dash.plan_cancelled_badge}
                </span>
              )}
            </div>
          </div>

          {isSuperAdmin ? (
            <div>
              <p style={{ fontSize: '0.8rem', fontWeight: '600', color: '#374151', marginBottom: '0.75rem' }}>{t.dash.plan_super_label}</p>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                {PLANS.map(p => (
                  <button key={p.key} onClick={() => handleSavePlan(p.key)} disabled={planSaving || p.key === plan}
                    style={{ padding: '0.5rem 1.125rem', borderRadius: '8px', border: `2px solid ${p.key === plan ? p.color : '#e5e7eb'}`, backgroundColor: p.key === plan ? p.bg : 'white', color: p.key === plan ? p.color : '#374151', cursor: p.key === plan ? 'default' : 'pointer', fontWeight: p.key === plan ? '700' : '500', fontSize: '0.875rem', opacity: planSaving ? 0.6 : 1 }}>
                    {p.key === plan ? `✓ ${p.label}` : p.label}
                  </button>
                ))}
              </div>
              {planSuccess && <p style={{ color: '#22c55e', fontSize: '0.8rem', marginTop: '0.75rem' }}>{t.dash.plan_success}</p>}
            </div>
          ) : plan !== 'free' && stripeSubscriptionId ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
              <p style={{ fontSize: '0.85rem', color: '#6b7280', lineHeight: 1.6, margin: 0 }}>
                Az előfizetésedet lentebb a <strong>Csomag váltás</strong> szekcióban tudod módosítani.
              </p>
              <button
                onClick={() => { setCancelError(''); setShowCancelConfirm(true) }}
                style={{ padding: '0.5rem 1rem', borderRadius: '8px', border: '1.5px solid #fca5a5', backgroundColor: '#fff5f5', color: '#dc2626', fontWeight: '600', fontSize: '0.8rem', cursor: 'pointer', whiteSpace: 'nowrap' }}
              >
                {t.dash.plan_cancel_btn}
              </button>
            </div>
          ) : plan !== 'free' && !stripeSubscriptionId && planExpiresAt ? (
            <div style={{ padding: '0.875rem 1rem', backgroundColor: '#fff7ed', borderRadius: '8px', border: '1px solid #fed7aa' }}>
              <p style={{ fontSize: '0.85rem', color: '#92400e', margin: 0, lineHeight: 1.6 }}>
                ⚠️ <strong>{t.dash.plan_cancelled_info}:</strong>{' '}
                {new Date(planExpiresAt).toLocaleDateString(dateLocale)}
              </p>
            </div>
          ) : (
            <div>
              <p style={{ fontSize: '0.85rem', color: '#6b7280', lineHeight: 1.6 }}>
                Az előfizetésedet lentebb a <strong>Csomag váltás</strong> szekcióban tudod módosítani Stripe-on keresztül.
              </p>
            </div>
          )}
        </div>

        {/* Csomag váltás */}
        <div style={{ backgroundColor: 'white', padding: '1.75rem', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', marginBottom: '1.25rem' }}>
          <h2 style={{ fontSize: '1rem', fontWeight: '700', color: '#111827', marginBottom: '0.4rem' }}>{t.dash.plan_switch_title}</h2>
          <p style={{ fontSize: '0.8rem', color: '#6b7280', marginBottom: '1.25rem' }}>{t.dash.plan_switch_desc}</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0.875rem' }}>
            {PLANS.filter(p => p.key !== 'free').map(p => {
              const pIdx = planOrder.indexOf(p.key)
              const isCurrent = p.key === plan
              const isUpgrade = pIdx > currentIdx
              const isDowngrade = pIdx < currentIdx
              return (
                <div key={p.key} style={{ borderRadius: '12px', padding: '1.25rem', border: `2px solid ${isCurrent ? p.color : isUpgrade ? p.border : '#e5e7eb'}`, backgroundColor: isCurrent ? p.bg : isUpgrade ? '#fafffe' : '#f9fafb', opacity: isDowngrade ? 0.7 : 1, display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.25rem' }}>
                    <p style={{ fontWeight: '800', color: p.color, fontSize: '0.95rem', margin: 0 }}>{p.label}</p>
                    {isCurrent && <span style={{ backgroundColor: p.color, color: 'white', fontSize: '0.65rem', fontWeight: '700', padding: '0.15rem 0.5rem', borderRadius: '999px' }}>{t.dash.plan_active_badge}</span>}
                    {isUpgrade && <span style={{ backgroundColor: '#dcfce7', color: '#15803d', fontSize: '0.65rem', fontWeight: '700', padding: '0.15rem 0.5rem', borderRadius: '999px' }}>{t.dash.plan_upgrade_badge}</span>}
                    {isDowngrade && <span style={{ backgroundColor: '#f3f4f6', color: '#6b7280', fontSize: '0.65rem', fontWeight: '700', padding: '0.15rem 0.5rem', borderRadius: '999px' }}>{t.dash.plan_lower_badge}</span>}
                  </div>
                  <p style={{ fontWeight: '900', color: '#0f172a', fontSize: '1.5rem', margin: 0, lineHeight: 1 }}>
                    {p.price}<span style={{ fontSize: '0.8rem', fontWeight: '400', color: '#9ca3af' }}>/hó</span>
                  </p>
                  <div style={{ flex: 1 }}>
                    {PLAN_FEATURES[p.key].map((f, i) => (
                      <p key={i} style={{ fontSize: '0.75rem', color: '#374151', margin: '0 0 0.2rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                        <span style={{ color: p.color, fontWeight: '700' }}>✓</span> {f}
                      </p>
                    ))}
                  </div>
                  {!isCurrent && (
                    isSuperAdmin ? (
                      <button onClick={() => handleSavePlan(p.key)} disabled={planSaving}
                        style={{ width: '100%', padding: '0.6rem 0.5rem', borderRadius: '8px', fontSize: '0.8rem', fontWeight: '700', border: 'none', cursor: planSaving ? 'not-allowed' : 'pointer', backgroundColor: isUpgrade ? p.color : '#f3f4f6', color: isUpgrade ? 'white' : '#6b7280', opacity: planSaving ? 0.6 : 1 }}>
                        {isUpgrade ? `⚡ ${t.dash.plan_active_badge} → ${p.label}` : `${t.dash.plan_switch_title.replace('🔄 ', '')} → ${p.label}`}
                      </button>
                    ) : (
                      <button
                        onClick={() => isUpgrade && handleStripeCheckout(p.key)}
                        disabled={!!checkoutLoading || !isUpgrade}
                        style={{ width: '100%', padding: '0.6rem 0.5rem', borderRadius: '8px', fontSize: '0.8rem', fontWeight: '700', border: isUpgrade ? 'none' : '1.5px solid #e5e7eb', cursor: isUpgrade && !checkoutLoading ? 'pointer' : 'not-allowed', backgroundColor: isUpgrade ? p.color : 'white', color: isUpgrade ? 'white' : '#6b7280', opacity: checkoutLoading && checkoutLoading !== p.key ? 0.5 : 1 }}>
                        {checkoutLoading === p.key ? '⏳ Átirányítás...' : isUpgrade ? `💳 Upgrade → ${p.label}` : `${t.dash.plan_switch_title.replace('🔄 ', '')} → ${p.label}`}
                      </button>
                    )
                  )}
                </div>
              )
            })}
          </div>
          {checkoutError && (
            <p style={{ color: '#ef4444', fontSize: '0.8rem', marginTop: '1rem' }}>❌ {checkoutError}</p>
          )}
          <p style={{ fontSize: '0.75rem', color: '#9ca3af', marginTop: '1rem' }}>
            {isSuperAdmin ? t.dash.plan_super_note : '💳 A fizetés biztonságosan Stripe-on keresztül történik. Hitelkártya vagy bankkártya elfogadott.'}
          </p>
        </div>

        {/* Érvényesség sáv */}
        {plan !== 'free' && planExpiresAt && (() => {
          const now = new Date()
          const expires = new Date(planExpiresAt)
          const graceEnd = new Date(expires); graceEnd.setDate(graceEnd.getDate() + 3)
          const msLeft = expires.getTime() - now.getTime()
          const days = Math.ceil(msLeft / (1000 * 60 * 60 * 24))
          const isExpired = now > graceEnd
          const isGrace = now > expires && now <= graceEnd
          const isWarning = days <= 7 && !isGrace && !isExpired
          const bg = isExpired ? '#fef2f2' : isGrace ? '#fff7ed' : isWarning ? '#fefce8' : '#f0fdf4'
          const border = isExpired ? '#fecaca' : isGrace ? '#fed7aa' : isWarning ? '#fef08a' : '#bbf7d0'
          const color = isExpired ? '#dc2626' : isGrace ? '#92400e' : isWarning ? '#854d0e' : '#15803d'
          const icon = isExpired ? '🔴' : isGrace ? '⚠️' : isWarning ? '⏳' : '✅'
          return (
            <div style={{ backgroundColor: bg, border: `1px solid ${border}`, borderRadius: '10px', padding: '0.875rem 1.25rem', marginBottom: '1.25rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '0.875rem', color, fontWeight: '600' }}>
                {icon} {t.dash.plan_valid_until}:
              </span>
              <span style={{ fontSize: '1rem', color, fontWeight: '800' }}>
                {expires.toLocaleDateString(dateLocale, { year: 'numeric', month: 'long', day: 'numeric' })}
                {!isExpired && !isGrace && (
                  <span style={{ fontSize: '0.8rem', fontWeight: '400', color, opacity: 0.8, marginLeft: '0.5rem' }}>
                    ({days > 0 ? `${days} ${t.dash.delay_day}` : t.dash.plan_expired_grace})
                  </span>
                )}
              </span>
            </div>
          )
        })()}

        {/* Számla kivonatok */}
        <div style={{ backgroundColor: 'white', padding: '1.75rem', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
          <h2 style={{ fontSize: '1rem', fontWeight: '700', color: '#111827', marginBottom: '0.5rem' }}>{t.dash.invoices_title}</h2>
          <p style={{ fontSize: '0.8rem', color: '#9ca3af', marginBottom: '1.5rem' }}>{t.dash.invoices_desc}</p>
          {plan === 'free' ? (
            <div style={{ textAlign: 'center', padding: '2rem', border: '2px dashed #e5e7eb', borderRadius: '10px', color: '#9ca3af' }}>
              <p style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>🆓</p>
              <p style={{ fontSize: '0.875rem', fontWeight: '600', marginBottom: '0.25rem' }}>{t.pricing.plans[0].name}</p>
              <p style={{ fontSize: '0.8rem' }}>{t.dash.free_no_invoice}</p>
            </div>
          ) : (
            <div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '1rem', padding: '0.625rem 1rem', backgroundColor: '#f9fafb', borderRadius: '8px', marginBottom: '0.5rem' }}>
                {[t.dash.invoice_period, t.dash.invoice_plan, t.dash.invoice_amount, t.dash.col_status].map(h => (
                  <p key={h} style={{ fontSize: '0.75rem', fontWeight: '700', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>{h}</p>
                ))}
              </div>
              <div style={{ textAlign: 'center', padding: '2rem', color: '#9ca3af' }}>
                <p style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>📋</p>
                <p style={{ fontSize: '0.875rem' }}>{t.dash.no_invoices}</p>
              </div>
            </div>
          )}
        </div>

      </div>

      {/* Lemondás megerősítő modal */}
      {showCancelConfirm && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}>
          <div style={{ backgroundColor: 'white', borderRadius: '16px', padding: '2rem', maxWidth: '420px', width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
            <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
              <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>⚠️</div>
              <h2 style={{ fontSize: '1.2rem', fontWeight: '800', color: '#111827', marginBottom: '0.75rem' }}>
                {t.dash.plan_cancel_confirm_title}
              </h2>
              <p style={{ fontSize: '0.9rem', color: '#374151', lineHeight: 1.7, marginBottom: '0.5rem' }}>
                Az előfizetésed nem újul meg automatikusan.
              </p>
              {planExpiresAt && (
                <div style={{ backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '0.75rem 1rem', marginTop: '0.75rem' }}>
                  <p style={{ fontSize: '0.85rem', color: '#15803d', margin: 0, fontWeight: '600' }}>
                    A(z) <strong>{current.label}</strong> csomagod aktív marad:
                  </p>
                  <p style={{ fontSize: '1rem', color: '#166534', margin: '0.25rem 0 0', fontWeight: '800' }}>
                    {new Date(planExpiresAt).toLocaleDateString(dateLocale, { year: 'numeric', month: 'long', day: 'numeric' })}
                  </p>
                  <p style={{ fontSize: '0.8rem', color: '#15803d', margin: '0.25rem 0 0' }}>
                    Ezután visszavált az ingyenes csomagra.
                  </p>
                </div>
              )}
            </div>

            {cancelError && (
              <p style={{ color: '#ef4444', fontSize: '0.8rem', textAlign: 'center', marginBottom: '1rem' }}>❌ {cancelError}</p>
            )}

            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button
                onClick={() => setShowCancelConfirm(false)}
                disabled={cancelLoading}
                style={{ flex: 1, padding: '0.75rem', borderRadius: '8px', border: '1.5px solid #e5e7eb', backgroundColor: 'white', color: '#374151', fontWeight: '600', cursor: cancelLoading ? 'not-allowed' : 'pointer', fontSize: '0.875rem' }}
              >
                {t.dash.profile_cancel}
              </button>
              <button
                onClick={handleCancelSubscription}
                disabled={cancelLoading}
                style={{ flex: 1, padding: '0.75rem', borderRadius: '8px', border: 'none', backgroundColor: cancelLoading ? '#f3f4f6' : '#dc2626', color: cancelLoading ? '#9ca3af' : 'white', fontWeight: '700', cursor: cancelLoading ? 'not-allowed' : 'pointer', fontSize: '0.875rem' }}
              >
                {cancelLoading ? '⏳ ...' : t.dash.plan_cancel_confirm_yes}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
