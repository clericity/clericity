import { supabaseAdmin } from '@/lib/supabaseServer'
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const token = authHeader.slice(7)

  // Verify the caller is a super_admin
  const supabaseClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
  const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token)
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabaseAdmin
    .from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'super_admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { tenantId, plan, expiresAt } = await request.json()
  if (!tenantId || !plan) return NextResponse.json({ error: 'Missing fields' }, { status: 400 })

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
  return NextResponse.json({ ok: true })
}
