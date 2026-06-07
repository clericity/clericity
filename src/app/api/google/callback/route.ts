import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseServer'
import { registerCalendarWatch } from '@/lib/googleWatch'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const state = searchParams.get('state') || ''
  const [tenantId, staffId] = state.includes('|') ? state.split('|') : [state, null]
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
  const redirectBase = staffId ? `${siteUrl}/staff/settings` : `${siteUrl}/dashboard/settings`

  if (!code || !tenantId) {
    return NextResponse.redirect(`${redirectBase}?error=no_code`)
  }

  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: `${siteUrl}/api/google/callback`,
      grant_type: 'authorization_code',
    }),
  })

  const tokens = await tokenResponse.json()

  if (tokens.error) {
    console.error('Google token error:', tokens.error, tokens.error_description)
    return NextResponse.redirect(`${redirectBase}?error=token_exchange_failed`)
  }

  if (!tokens.refresh_token) {
    // Próbáljuk az access_token-nel is lekérni a naptárat, de jelezzük a hibát
    console.error('No refresh_token returned. tokens:', JSON.stringify(tokens))
    return NextResponse.redirect(`${redirectBase}?error=no_refresh_token`)
  }

  // Google Calendar ID lekérése
  const calendarResponse = await fetch(
    'https://www.googleapis.com/calendar/v3/calendars/primary',
    { headers: { Authorization: `Bearer ${tokens.access_token}` } }
  )
  const calendarData = await calendarResponse.json()
  const calendarId = calendarData.id || calendarData.summary || 'primary'

  if (staffId) {
    const { error } = await supabaseAdmin
      .from('staff')
      .update({ google_calendar_id: calendarId, google_refresh_token: tokens.refresh_token })
      .eq('id', staffId)
    if (error) {
      console.error('Staff update error:', error)
      return NextResponse.redirect(`${redirectBase}?error=db_save_failed`)
    }
    // Watch regisztrálása az új kapcsolathoz
    registerCalendarWatch({
      type: 'staff',
      staffId,
      refreshToken: tokens.refresh_token,
      calendarId,
    }).catch(e => console.error('[callback] Staff watch registration failed:', e))
  } else {
    const { error } = await supabaseAdmin
      .from('tenants')
      .update({ google_calendar_id: calendarId, google_refresh_token: tokens.refresh_token })
      .eq('id', tenantId)
    if (error) {
      console.error('Tenant update error:', error)
      return NextResponse.redirect(`${redirectBase}?error=db_save_failed`)
    }
    // Watch regisztrálása az új kapcsolathoz
    registerCalendarWatch({
      type: 'tenant',
      tenantId,
      refreshToken: tokens.refresh_token,
      calendarId,
    }).catch(e => console.error('[callback] Tenant watch registration failed:', e))
  }

  return NextResponse.redirect(`${redirectBase}?success=google_connected`)
}
