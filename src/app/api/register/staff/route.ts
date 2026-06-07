import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseServer'

export async function POST(request: Request) {
  const { name, slug, email, password } = await request.json()

  if (!name || !slug || !email || !password) {
    return NextResponse.json({ error: 'Minden mező kitöltése kötelező' }, { status: 400 })
  }

  // Tenant keresése slug alapján
  const { data: tenant, error: tenantError } = await supabaseAdmin
    .from('tenants')
    .select('id, name')
    .eq('slug', slug)
    .single()

  if (tenantError || !tenant) {
    return NextResponse.json({ error: 'Nem található ilyen foglalási link. Ellenőrizd a slug-ot!' }, { status: 404 })
  }

  // Staff rekord keresése: egyezik-e a név az adott tenant-nál
  const { data: staffRecord, error: staffError } = await supabaseAdmin
    .from('staff')
    .select('id, name, user_id')
    .eq('tenant_id', tenant.id)
    .ilike('name', name.trim())
    .single()

  if (staffError || !staffRecord) {
    return NextResponse.json({
      error: `Nem találtunk "${name}" nevű munkást a(z) "${tenant.name}" vállalkozásnál. Kérd meg a gazdát, hogy adjon hozzá a rendszerhez!`
    }, { status: 404 })
  }

  if (staffRecord.user_id) {
    return NextResponse.json({ error: 'Ez a munkás már regisztrált. Jelentkezz be!' }, { status: 400 })
  }

  // Supabase Auth felhasználó létrehozása
  const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })

  if (authError || !authData.user) {
    return NextResponse.json({ error: authError?.message || 'Regisztrációs hiba' }, { status: 400 })
  }

  const userId = authData.user.id

  // Profiles rekord létrehozása
  const { error: profileError } = await supabaseAdmin
    .from('profiles')
    .insert({
      id: userId,
      full_name: staffRecord.name,
      role: 'staff',
      tenant_id: tenant.id,
    })

  if (profileError) {
    await supabaseAdmin.auth.admin.deleteUser(userId)
    return NextResponse.json({ error: profileError.message }, { status: 400 })
  }

  // Staff rekord frissítése user_id-val
  // google tokeneket töröljük — a munkás majd maga köti össze a saját naptárát
  const { error: updateError } = await supabaseAdmin
    .from('staff')
    .update({
      user_id: userId,
      email,
      google_refresh_token: null,
      google_calendar_id: null,
    })
    .eq('id', staffRecord.id)

  if (updateError) {
    await supabaseAdmin.auth.admin.deleteUser(userId)
    return NextResponse.json({ error: updateError.message }, { status: 400 })
  }

  return NextResponse.json({ success: true })
}
