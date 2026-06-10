import { createClient } from '@supabase/supabase-js'
import { supabaseAdmin } from './supabaseServer'
import { NextResponse } from 'next/server'

export async function getAuthUser(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) return null
  const token = authHeader.slice(7)
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
  const { data: { user }, error } = await supabase.auth.getUser(token)
  if (error || !user) return null
  return user
}

export async function getUserTenantId(userId: string): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from('profiles')
    .select('tenant_id')
    .eq('id', userId)
    .single()
  return data?.tenant_id ?? null
}

export const unauthorizedResponse = () =>
  NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

export const forbiddenResponse = () =>
  NextResponse.json({ error: 'Forbidden' }, { status: 403 })
