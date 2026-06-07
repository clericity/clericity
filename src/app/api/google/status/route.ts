import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseServer'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const tenantId = searchParams.get('tenantId')

  if (!tenantId) return NextResponse.json({ connected: false })

  // Staff tokenek ellenőrzése (service role, RLS bypass)
  const { data: staffData } = await supabaseAdmin
    .from('staff')
    .select('id')
    .eq('tenant_id', tenantId)
    .not('google_refresh_token', 'is', null)
    .limit(1)

  if (staffData && staffData.length > 0) {
    return NextResponse.json({ connected: true })
  }

  // Tenant szintű token ellenőrzése
  const { data: tenantData } = await supabaseAdmin
    .from('tenants')
    .select('google_refresh_token')
    .eq('id', tenantId)
    .single()

  return NextResponse.json({ connected: !!tenantData?.google_refresh_token })
}
