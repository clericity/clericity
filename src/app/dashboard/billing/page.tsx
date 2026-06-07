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
  const [isSuperAdmin, setIsSuperAdmin] = useState(false)
  const [planSaving, setPlanSaving] = useState(false)
  const [planSuccess, setPlanSuccess] = useState(false)

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/auth'); return }
      const { data: profile } = await supabase.from('profiles').select('tenant_id, role').eq('id', user.id).single()
      if (!profile?.tenant_id) return
      setTenantId(profile.tenant_id)
      setIsSuperAdmin(profile.role === 'super_admin')
      const { data: tenant } = await supabase.from('tenants').select('plan, plan_expires_at').eq('id', profile.tenant_id).single()
      if (tenant) { setPlan(tenant.plan || 'free'); setPlanExpiresAt(tenant.plan_expires_at || null) }
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
            <span style={{ backgroundColor: current.color, color: 'white', fontSize: '0.75rem', fontWeight: '700', padding: '0.3rem 0.875rem', borderRadius: '999px' }}>
              {current.label.toUpperCase()}
            </span>
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
          ) : (
            <div>
              <p style={{ fontSize: '0.85rem', color: '#6b7280', lineHeight: 1.6, marginBottom: '1rem' }}>{t.dash.billing_contact}</p>
              <a href="mailto:kusalarudika@gmail.com?subject=CLERICITY csomag váltás"
                style={{ display: 'inline-block', backgroundColor: '#2563eb', color: 'white', padding: '0.625rem 1.5rem', borderRadius: '8px', textDecoration: 'none', fontWeight: '600', fontSize: '0.875rem' }}>
                {t.dash.billing_contact_btn}
              </a>
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
              const emailSubject = encodeURIComponent(`CLERICITY csomag váltás — ${p.label} csomag`)
              const emailBody = encodeURIComponent(`Sziasztok!\n\nSzeretnék váltani a(z) ${current.label} csomagról a(z) ${p.label} csomagra (${p.price}/hó).\n\nAz aktiválást fizet és azonnal kérem.\n\nKöszönöm!`)
              const mailtoHref = `mailto:kusalarudika@gmail.com?subject=${emailSubject}&body=${emailBody}`
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
                      <a href={mailtoHref} style={{ display: 'block', textAlign: 'center', textDecoration: 'none', padding: '0.6rem 0.5rem', borderRadius: '8px', fontSize: '0.8rem', fontWeight: '700', backgroundColor: isUpgrade ? p.color : 'white', color: isUpgrade ? 'white' : '#6b7280', border: isUpgrade ? 'none' : '1.5px solid #e5e7eb' }}>
                        {isUpgrade ? `Upgrade → ${p.label}` : `${t.dash.plan_switch_title.replace('🔄 ', '')} → ${p.label}`}
                      </a>
                    )
                  )}
                </div>
              )
            })}
          </div>
          <p style={{ fontSize: '0.75rem', color: '#9ca3af', marginTop: '1.25rem' }}>
            {isSuperAdmin ? t.dash.plan_super_note : t.dash.plan_user_note}
          </p>
        </div>

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
    </div>
  )
}
