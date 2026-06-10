import { supabaseAdmin } from '@/lib/supabaseServer'
import { NextResponse } from 'next/server'
import { getAuthUser, unauthorizedResponse, forbiddenResponse } from '@/lib/auth'
import { isValidUUID } from '@/lib/validate'
import { writeAuditLog } from '@/lib/audit'

export async function POST(request: Request) {
  const user = await getAuthUser(request)
  if (!user) return unauthorizedResponse()

  const { data: profile } = await supabaseAdmin
    .from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'super_admin') return forbiddenResponse()

  const { tenantId, plan, expiresAt } = await request.json()
  if (!tenantId || !plan) return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  if (!isValidUUID(tenantId)) return NextResponse.json({ error: 'Invalid tenantId' }, { status: 400 })

  const validPlans = ['free', 'basic', 'pro', 'business']
  if (!validPlans.includes(plan)) return NextResponse.json({ error: 'Invalid plan' }, { status: 400 })

  const now = new Date()
  const { error } = await supabaseAdmin
    .from('tenants')
    .update({
      plan,
      plan_activated_at: now.toISOString(),
      plan_expires_at: plan === 'free' ? null : (expiresAt || null),
    })
    .eq('id', tenantId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await writeAuditLog({
    tenantId,
    userId: user.id,
    action: 'plan.change',
    entityType: 'tenant',
    entityId: tenantId,
    metadata: { plan, expires_at: expiresAt ?? null },
  })

  return NextResponse.json({ ok: true })
}
