import { NextResponse } from 'next/server'
import { stripe } from '@/lib/stripe'
import { supabaseAdmin } from '@/lib/supabaseServer'
import { getAuthUser, getUserTenantId, unauthorizedResponse } from '@/lib/auth'

export async function POST(request: Request) {
  const user = await getAuthUser(request)
  if (!user) return unauthorizedResponse()

  const tenantId = await getUserTenantId(user.id)
  if (!tenantId) return NextResponse.json({ error: 'Tenant nem található.' }, { status: 404 })

  const { data: tenant } = await supabaseAdmin
    .from('tenants')
    .select('stripe_subscription_id, plan')
    .eq('id', tenantId)
    .single()

  if (!tenant?.stripe_subscription_id) {
    return NextResponse.json({ error: 'Nincs aktív Stripe előfizetés.' }, { status: 400 })
  }

  if (!tenant.plan || tenant.plan === 'free') {
    return NextResponse.json({ error: 'Nincs aktív fizetős csomag.' }, { status: 400 })
  }

  try {
    await stripe.subscriptions.cancel(tenant.stripe_subscription_id)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Stripe hiba.'
    return NextResponse.json({ error: msg }, { status: 500 })
  }

  // A webhook (customer.subscription.deleted) kezeli a DB frissítést:
  // ha plan_expires_at még érvényes → csak subscription_id törlődik (csomag aktív marad)
  // ha plan_expires_at lejárt → plan visszaáll free-re

  return NextResponse.json({ success: true })
}
