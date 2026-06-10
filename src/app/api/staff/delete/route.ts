import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseServer'
import { getAuthUser, getUserTenantId, unauthorizedResponse, forbiddenResponse } from '@/lib/auth'
import { writeAuditLog } from '@/lib/audit'

export async function DELETE(request: Request) {
  const user = await getAuthUser(request)
  if (!user) return unauthorizedResponse()

  const { staffId, tenantId } = await request.json()

  if (!staffId || !tenantId) {
    return NextResponse.json({ error: 'Hiányzó adatok' }, { status: 400 })
  }

  const userTenantId = await getUserTenantId(user.id)
  if (tenantId !== userTenantId) return forbiddenResponse()

  // Staff rekord lekérése (user_id-hoz kell)
  const { data: staff, error: fetchError } = await supabaseAdmin
    .from('staff')
    .select('id, user_id, tenant_id, name')
    .eq('id', staffId)
    .eq('tenant_id', tenantId)
    .single()

  if (fetchError || !staff) {
    return NextResponse.json({ error: 'Munkás nem található' }, { status: 404 })
  }

  // Foglalásokban staff_id NULL-ra állítása (megőrzi a foglalás adatait)
  await supabaseAdmin
    .from('bookings')
    .update({ staff_id: null })
    .eq('staff_id', staffId)

  // Staff rekord törlése
  const { error: staffDeleteError } = await supabaseAdmin
    .from('staff')
    .delete()
    .eq('id', staffId)

  if (staffDeleteError) {
    return NextResponse.json({ error: staffDeleteError.message }, { status: 400 })
  }

  // Ha volt auth user → profiles + auth user törlése
  if (staff.user_id) {
    await supabaseAdmin.from('profiles').delete().eq('id', staff.user_id)
    await supabaseAdmin.auth.admin.deleteUser(staff.user_id)
  }

  await writeAuditLog({
    tenantId,
    userId: user.id,
    action: 'staff.delete',
    entityType: 'staff',
    entityId: staffId,
    metadata: { name: staff.name },
  })

  return NextResponse.json({ success: true })
}
