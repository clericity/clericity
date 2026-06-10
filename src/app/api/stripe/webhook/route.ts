import { NextResponse } from 'next/server'
import { stripe } from '@/lib/stripe'
import { supabaseAdmin } from '@/lib/supabaseServer'
import type Stripe from 'stripe'

// Next.js App Router: raw body szükséges a Stripe signature ellenőrzéshez
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const body = await request.text()
  const signature = request.headers.get('stripe-signature') ?? ''

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(body, signature, process.env.STRIPE_WEBHOOK_SECRET!)
  } catch {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session
    if (session.mode !== 'subscription') return NextResponse.json({ received: true })

    const tenantId = session.metadata?.tenantId
    const plan = session.metadata?.plan
    if (!tenantId || !plan) return NextResponse.json({ received: true })

    const subscriptionId = session.subscription as string
    const customerId = session.customer as string

    // Lejárat: 30 nap (vagy subscription periódusból is lehetne, de így konzisztens a többi csomaggal)
    const now = new Date()
    const expiresAt = new Date(now)
    expiresAt.setDate(expiresAt.getDate() + 30)

    await supabaseAdmin.from('tenants').update({
      plan,
      plan_activated_at: now.toISOString(),
      plan_expires_at: expiresAt.toISOString(),
      stripe_customer_id: customerId,
      stripe_subscription_id: subscriptionId,
    }).eq('id', tenantId)
  }

  if (event.type === 'invoice.payment_succeeded') {
    const invoice = event.data.object as Stripe.Invoice
    // In Stripe API v2026+, subscription reference is in lines or parent
    const subscriptionId = (invoice as unknown as { subscription?: string | { id: string } }).subscription
      ? typeof (invoice as unknown as { subscription: string | { id: string } }).subscription === 'string'
        ? (invoice as unknown as { subscription: string }).subscription
        : (invoice as unknown as { subscription: { id: string } }).subscription.id
      : null

    if (!subscriptionId) return NextResponse.json({ received: true })

    const { data: tenant } = await supabaseAdmin
      .from('tenants')
      .select('id, plan')
      .eq('stripe_subscription_id', subscriptionId)
      .single()

    if (!tenant || tenant.plan === 'free') return NextResponse.json({ received: true })

    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + 30)

    await supabaseAdmin.from('tenants').update({
      plan_expires_at: expiresAt.toISOString(),
    }).eq('stripe_subscription_id', subscriptionId)
  }

  if (event.type === 'customer.subscription.deleted') {
    const subscription = event.data.object as Stripe.Subscription

    const { data: tenant } = await supabaseAdmin
      .from('tenants')
      .select('id, plan_expires_at')
      .eq('stripe_subscription_id', subscription.id)
      .single()

    if (tenant) {
      const now = new Date()
      const expiresAt = tenant.plan_expires_at ? new Date(tenant.plan_expires_at) : null

      if (!expiresAt || expiresAt <= now) {
        // Lejárt vagy nincs lejárat → azonnal free
        await supabaseAdmin.from('tenants').update({
          plan: 'free',
          plan_expires_at: null,
          stripe_subscription_id: null,
        }).eq('id', tenant.id)
      } else {
        // Még érvényes lejárati dátum → csak subscription_id törlése
        // A csomag plan_expires_at-ig aktív marad, utána a dashboard expiry logika kezeli
        await supabaseAdmin.from('tenants').update({
          stripe_subscription_id: null,
        }).eq('id', tenant.id)
      }
    }
  }

  return NextResponse.json({ received: true })
}
