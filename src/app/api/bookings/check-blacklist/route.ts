import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseServer'
import { sanitizeEmail, sanitizePhone, isValidUUID, safeFilterValue } from '@/lib/validate'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const staffId = searchParams.get('staffId')
  const tenantId = searchParams.get('tenantId')
  const email = sanitizeEmail(searchParams.get('email'))
  const phone = sanitizePhone(searchParams.get('phone'))

  if (!email && !phone) return NextResponse.json({ blocked: false })

  if (tenantId && !isValidUUID(tenantId)) return NextResponse.json({ blocked: false })
  if (staffId && !isValidUUID(staffId)) return NextResponse.json({ blocked: false })

  const orParts: string[] = []
  if (email) orParts.push(`email.eq.${safeFilterValue(email)}`)
  if (phone) orParts.push(`phone.eq.${safeFilterValue(phone)}`)

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
