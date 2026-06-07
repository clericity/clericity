import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseServer'

// Rendszer által foglalt útvonalak — ezeket nem lehet slug-ként használni
const RESERVED_SLUGS = new Set([
  'api', 'dashboard', 'staff', 'admin', 'cancel', 'reschedule',
  'auth', 'login', 'register', 'settings', 'CLERICITY', 'app',
  'booking', 'bookings', 'profile', 'logout', 'signup',
  'privacy', 'terms', 'support', 'help', 'about', 'contact',
  'pricing', 'features', 'blog', 'www', 'mail', 'ftp',
])

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const slug = searchParams.get('slug')?.toLowerCase().trim()
  const currentTenantId = searchParams.get('tenantId')

  if (!slug) {
    return NextResponse.json({ available: false, reason: 'Hiányzó slug' })
  }

  // Formátum ellenőrzés: csak kisbetű, szám, kötőjel
  if (!/^[a-z0-9-]+$/.test(slug)) {
    return NextResponse.json({ available: false, reason: 'Csak kisbetű, szám és kötőjel megengedett' })
  }

  // Minimum hossz
  if (slug.length < 3) {
    return NextResponse.json({ available: false, reason: 'Legalább 3 karakter szükséges' })
  }

  // Maximum hossz
  if (slug.length > 60) {
    return NextResponse.json({ available: false, reason: 'Maximum 60 karakter megengedett' })
  }

  // Kötőjellel nem kezdődhet/végződhet
  if (slug.startsWith('-') || slug.endsWith('-')) {
    return NextResponse.json({ available: false, reason: 'Nem kezdődhet vagy végződhet kötőjellel' })
  }

  // Foglalt rendszer slugok
  if (RESERVED_SLUGS.has(slug)) {
    return NextResponse.json({ available: false, reason: 'Ez a slug rendszer által foglalt' })
  }

  // Adatbázis ellenőrzés
  let query = supabaseAdmin.from('tenants').select('id').eq('slug', slug)

  // Ha van currentTenantId, kizárjuk a saját tenantot (szerkesztésnél)
  if (currentTenantId) {
    query = query.neq('id', currentTenantId)
  }

  const { data } = await query.maybeSingle()

  if (data) {
    return NextResponse.json({ available: false, reason: 'Ez a foglalási link már foglalt' })
  }

  return NextResponse.json({ available: true })
}
