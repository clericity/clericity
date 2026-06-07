import { supabaseAdmin } from './supabaseServer'

type TokenContext =
  | { type: 'staff'; staffId: string }
  | { type: 'tenant'; tenantId: string }

/**
 * Frissíti a Google access tokent a refresh tokennel.
 * Ha Google új refresh tokent ad vissza (token rotation), automatikusan menti az adatbázisba.
 * Returns null ha a refresh token érvénytelen vagy lejárt.
 */
export async function getGoogleAccessToken(
  refreshToken: string,
  context?: TokenContext
): Promise<string | null> {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      grant_type: 'refresh_token',
    }),
  })

  const data = await response.json()

  if (!data.access_token) {
    console.error('[googleAuth] Token refresh failed:', data.error, data.error_description)
    return null
  }

  // Ha Google új refresh tokent adott (token rotation), mentsük el
  if (data.refresh_token && data.refresh_token !== refreshToken && context) {
    console.log('[googleAuth] New refresh token received, saving to DB...')
    if (context.type === 'staff') {
      await supabaseAdmin
        .from('staff')
        .update({ google_refresh_token: data.refresh_token })
        .eq('id', context.staffId)
    } else {
      await supabaseAdmin
        .from('tenants')
        .update({ google_refresh_token: data.refresh_token })
        .eq('id', context.tenantId)
    }
  }

  return data.access_token
}
