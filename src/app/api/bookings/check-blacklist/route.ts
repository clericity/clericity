import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseServer'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const staffId = searchParams.get('staffId')
  const tenantId = searchParams.get('tenantId')
  const email = searchParams.get('email')
  const phone = searchParams.get('phone')

  if (!email && !phone) return NextResponse.json({ blocked: false })

  const orParts: string[] = []
  if (email) orParts.push(`email.eq.${email.toLowerCase().trim()}`)
  if (phone?.trim()) orParts.push(`phone.eq.${phone.trim()}`)

  let query = supabaseAdmin.from('staff_blacklist').select('reason').or(orParts.join(','))

  if (tenantId) {
    query = query.eq('tenant_id', tenantId)
  } else if (staffId) {
    query = query.eq('staff_id', staffId)
  } else {
    return NextResponse.json({ blocked: false })
  }

  const { data } = await query.limit(1)

  if (data && data.length > 0) {
    return NextResponse.json({ blocked: true, reason: data[0].reason || null })
  }

  return NextResponse.json({ blocked: false })
}
