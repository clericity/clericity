import { supabaseAdmin } from '@/lib/supabaseServer'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const { userId, fullName, registrationType, companyName, taxNumber, address, phone, plan } = await request.json()

  const isBusinessReg = registrationType === 'business'
  const tenantName = isBusinessReg ? (companyName || 'Új vállalkozás') : (fullName || 'Új üzlet')
  const validPlan = ['free', 'basic', 'pro', 'business'].includes(plan) ? plan : 'free'
  const now = new Date()
  const expiresAt = new Date(now); expiresAt.setDate(expiresAt.getDate() + 30)

  const { data: tenant, error: tenantError } = await supabaseAdmin
    .from('tenants')
    .insert({
      name: tenantName,
      slug: userId,
      plan: validPlan,
      plan_activated_at: now.toISOString(),
      plan_expires_at: validPlan === 'free' ? null : expiresAt.toISOString(),
      registration_type: registrationType || 'personal',
      ...(isBusinessReg && taxNumber ? { tax_number: taxNumber } : {}),
      ...(address ? { address } : {}),
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
      registration_type: registrationType || 'personal',
      ...(address && !isBusinessReg ? { address } : {}),
      ...(phone ? { phone } : {}),
    })

  if (profileError) {
    return NextResponse.json({ error: profileError.message }, { status: 400 })
  }

  // Owner automatikus hozzáadása a staff táblához
  const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(userId)
  await supabaseAdmin.from('staff').insert({
    tenant_id: tenant.id,
    user_id: userId,
    name: fullName || companyName || 'Tulajdonos',
    email: authUser?.user?.email || null,
    is_owner: true,
  })

  return NextResponse.json({ success: true })
}