import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseServer'
import { getAuthUser, unauthorizedResponse, forbiddenResponse } from '@/lib/auth'

export async function POST(request: Request) {
  const user = await getAuthUser(request)
  if (!user) return unauthorizedResponse()

  const { userId } = await request.json()
  if (!userId) return NextResponse.json({ error: 'Hiányzó felhasználó ID' }, { status: 400 })

  if (userId !== user.id) return forbiddenResponse()

  // Ellenőrzés: ne legyen tulajdonos
  const { data: staff } = await supabaseAdmin
    .from('staff')
    .select('id, is_owner')
    .eq('user_id', userId)
    .single()

  if (!staff) return NextResponse.json({ error: 'Munkás nem található' }, { status: 404 })
  if (staff.is_owner) return NextResponse.json({ error: 'A tulajdonos nem törölheti saját fiókját itt.' }, { status: 403 })

  // Staff rekord törlése (cascade: staff_hours, staff_holidays, staff_blacklist)
  await supabaseAdmin.from('staff').delete().eq('id', staff.id)

  // Auth user törlése
  const { error } = await supabaseAdmin.auth.admin.deleteUser(userId)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  return NextResponse.json({ success: true })
}
