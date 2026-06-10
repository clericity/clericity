import { NextResponse } from 'next/server'
import { stripe, STRIPE_PRICES } from '@/lib/stripe'
import { supabaseAdmin } from '@/lib/supabaseServer'
import { getAuthUser, getUserTenantId, unauthorizedResponse } from '@/lib/auth'

export async function POST(request: Request) {
  const user = await getAuthUser(request)
  if (!user) return unauthorizedResponse()

  const { plan } = await request.json()

  if (!plan || !['basic', 'pro', 'business'].includes(plan)) {
    return NextResponse.json({ error: 'Érvénytelen csomag.' }, { status: 400 })
  }

  const priceId = STRIPE_PRICES[plan]
  if (!priceId || priceId === 'price_REPLACE_ME') {
    return NextResponse.json({ error: 'A Stripe még nincs konfigurálva.' }, { status: 503 })
  }

  const tenantId = await getUserTenantId(user.id)
  if (!tenantId) return NextResponse.json({ error: 'Tenant nem található.' }, { status: 404 })

  const { data: tenant } = await supabaseAdmin
    .from('tenants')
    .select('stripe_customer_id, email')
    .eq('id', tenantId)
    .single()

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.startsWith('http')
    ? process.env.NEXT_PUBLIC_SITE_URL
    : `https://${process.env.NEXT_PUBLIC_SITE_URL}`

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    payment_method_types: ['card'],
    ...(tenant?.stripe_customer_id
      ? { customer: tenant.stripe_customer_id }
      : { customer_email: tenant?.email || user.email || undefined }),
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${siteUrl}/stripe/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${siteUrl}/dashboard/billing`,
    metadata: { tenantId, plan },
    subscription_data: { metadata: { tenantId, plan } },
  })

  return NextResponse.json({ url: session.url })
}
