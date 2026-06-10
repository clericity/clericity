import { supabaseAdmin } from '@/lib/supabaseServer'
import { NextResponse } from 'next/server'
import { getIP, checkRateLimit, rateLimitResponse } from '@/lib/rateLimit'
import { sanitizeText, sanitizePhone, isValidUUID } from '@/lib/validate'

const VALID_PLANS = ['free', 'basic', 'pro', 'business']
const VALID_REG_TYPES = ['personal', 'business']

export async function POST(request: Request) {
  if (!checkRateLimit(getIP(request), 'register', 5, 60 * 60 * 1000)) {
    return rateLimitResponse()
  }

  const body = await request.json()
  const { userId, plan, registrationType } = body

  if (!isValidUUID(userId)) {
    return NextResponse.json({ error: 'Érvénytelen kérés.' }, { status: 400 })
  }

  const fullName = sanitizeText(body.fullName, 100)
  const companyName = sanitizeText(body.companyName, 200)
  const taxNumber = sanitizeText(body.taxNumber, 50).replace(/[^0-9\-]/g, '')
  const address = sanitizeText(body.address, 300)
  const phone = sanitizePhone(body.phone)
  const validPlan = VALID_PLANS.includes(plan) ? plan : 'free'
  const validRegType = VALID_REG_TYPES.includes(registrationType) ? registrationType : 'personal'

  const isBusinessReg = validRegType === 'business'
  const tenantName = isBusinessReg ? (companyName || 'Új vállalkozás') : (fullName || 'Új üzlet')
  const now = new Date()
  const expiresAt = new Date(now); expiresAt.setDate(expiresAt.getDate() + 30)

  // Email lekérése az auth rendszerből
  const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(userId)
  const userEmail = authUser?.user?.email || null

  const { data: tenant, error: tenantError } = await supabaseAdmin
    .from('tenants')
    .insert({
      name: tenantName,
      slug: userId,
      plan: validPlan,
      plan_activated_at: now.toISOString(),
      plan_expires_at: validPlan === 'free' ? null : expiresAt.toISOString(),
      registration_type: validRegType,
      ...(userEmail ? { email: userEmail } : {}),
      ...(isBusinessReg && taxNumber ? { tax_number: taxNumber } : {}),
      ...(address ? { address } : {}),
      ...(phone ? { phone } : {}),
    })
    .select()
    .single()

  if (tenantError) {
    return NextResponse.json({ error: tenantError.message }, { status: 400 })
  }

  const { error: profileError } = await supabaseAdmin
    .from('profiles')
    .insert({
      id: userId,
      full_name: fullName || companyName || 'Felhasználó',
      role: 'tenant_admin',
      tenant_id: tenant.id,
      registration_type: validRegType,
      ...(address && !isBusinessReg ? { address } : {}),
      ...(phone ? { phone } : {}),
    })

  if (profileError) {
    return NextResponse.json({ error: profileError.message }, { status: 400 })
  }

  // Owner automatikus hozzáadása a staff táblához
  await supabaseAdmin.from('staff').insert({
    tenant_id: tenant.id,
    user_id: userId,
    name: fullName || companyName || 'Tulajdonos',
    email: userEmail,
    is_owner: true,
  })

  // Üdvözlő email küldése
  if (userEmail) {
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://clericity.com'
    try {
      await fetch(`${siteUrl}/api/email/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          emailType: 'welcome',
          to: userEmail,
          customerName: fullName || companyName || 'Felhasználó',
          businessName: tenant.slug,
        }),
      })
    } catch (e) {
      console.error('Üdvözlő email küldési hiba:', e)
    }
  }

  return NextResponse.json({ success: true })
}