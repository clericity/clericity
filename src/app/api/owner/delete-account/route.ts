import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseServer'

export async function POST(request: Request) {
  const { userId } = await request.json()
  if (!userId) return NextResponse.json({ error: 'Hiányzó felhasználó ID' }, { status: 400 })

  // Ellenőrzés: csak tulajdonos törölheti
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('tenant_id, role')
    .eq('id', userId)
    .single()

  if (!profile?.tenant_id) return NextResponse.json({ error: 'Profil nem található' }, { status: 404 })

  const tenantId = profile.tenant_id

  // Törlés helyes sorrendben (FK függőségek miatt)
  await supabaseAdmin.from('email_automation_logs').delete().in(
    'booking_id',
    (await supabaseAdmin.from('bookings').select('id').eq('tenant_id', tenantId)).data?.map(b => b.id) || []
  )
  await supabaseAdmin.from('email_automations').delete().eq('tenant_id', tenantId)
  await supabaseAdmin.from('waitlist').delete().eq('tenant_id', tenantId)
  await supabaseAdmin.from('bookings').delete().eq('tenant_id', tenantId)
  await supabaseAdmin.from('booking_fields').delete().eq('tenant_id', tenantId)
  await supabaseAdmin.from('holidays').delete().eq('tenant_id', tenantId)
  await supabaseAdmin.from('opening_hours').delete().eq('tenant_id', tenantId)

  // Staff törlése (staff_hours, staff_holidays, staff_blacklist cascade)
  const { data: staffList } = await supabaseAdmin.from('staff').select('id, user_id').eq('tenant_id', tenantId)
  for (const s of staffList || []) {
    await supabaseAdmin.from('staff_hours').delete().eq('staff_id', s.id)
    await supabaseAdmin.from('staff_holidays').delete().eq('staff_id', s.id)
    await supabaseAdmin.from('staff_blacklist').delete().eq('staff_id', s.id)
    // Nem-tulajdonos staff auth user törlése
    if (s.user_id && s.user_id !== userId) {
      await supabaseAdmin.auth.admin.deleteUser(s.user_id)
    }
  }
  await supabaseAdmin.from('staff').delete().eq('tenant_id', tenantId)
  await supabaseAdmin.from('services').delete().eq('tenant_id', tenantId)
  await supabaseAdmin.from('profiles').delete().eq('tenant_id', tenantId)
  await supabaseAdmin.from('tenants').delete().eq('id', tenantId)

  // Tulajdonos auth user törlése
  const { error } = await supabaseAdmin.auth.admin.deleteUser(userId)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  return NextResponse.json({ success: true })
}
