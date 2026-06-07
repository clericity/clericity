import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseServer'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const token = searchParams.get('token')

  if (!token) {
    return NextResponse.json({ error: 'Token hiányzik' }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin
    .from('bookings')
    .select('*, services(name, duration_minutes, slot_interval, buffer_minutes), tenants(name, slug, booking_horizon, plan)')
    .eq('cancel_token', token)
    .single()

  if (error || !data) {
    return NextResponse.json({ error: 'Nem található' }, { status: 404 })
  }

  return NextResponse.json(data)
}