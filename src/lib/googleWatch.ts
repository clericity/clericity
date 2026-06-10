import { createHmac } from 'crypto'
import { supabaseAdmin } from './supabaseServer'
import { getGoogleAccessToken } from './googleAuth'

// HMAC-SHA256 token a webhook hitelesítéshez — stateless, nincs DB oszlop szükséges.
// Google visszaküldi X-Goog-Channel-Token headerben minden értesítésnél.
export function generateWebhookToken(channelId: string): string {
  const secret = process.env.WEBHOOK_SECRET
  if (!secret) throw new Error('WEBHOOK_SECRET env variable is not set')
  return createHmac('sha256', secret).update(channelId).digest('hex')
}

type WatchTarget =
  | { type: 'staff'; staffId: string; refreshToken: string; calendarId: string }
  | { type: 'tenant'; tenantId: string; refreshToken: string; calendarId: string }

export async function registerCalendarWatch(target: WatchTarget): Promise<void> {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'

  // Localhost-on nem működik a Google webhook (HTTPS szükséges)
  if (siteUrl.includes('localhost')) {
    console.log('[googleWatch] Skipping watch registration on localhost')
    return
  }

  const context = target.type === 'staff'
    ? { type: 'staff' as const, staffId: target.staffId }
    : { type: 'tenant' as const, tenantId: target.tenantId }

  const accessToken = await getGoogleAccessToken(target.refreshToken, context)
  if (!accessToken) {
    console.error('[googleWatch] Cannot get access token for watch registration')
    return
  }

  // Inicializáló sync: lekérjük az aktuális eseményeket hogy kapjunk egy syncToken-t
  const syncRes = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(target.calendarId)}/events?singleEvents=true&timeMin=${new Date().toISOString()}&maxResults=1`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  )
  const syncData = await syncRes.json()
  const syncToken = syncData.nextSyncToken || null

  // Watch channel regisztrálása
  const channelId = crypto.randomUUID()
  const webhookToken = generateWebhookToken(channelId)
  const watchRes = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(target.calendarId)}/events/watch`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: channelId,
        type: 'web_hook',
        address: `${siteUrl}/api/google/webhook`,
        token: webhookToken,
      }),
    }
  )
  const watchData = await watchRes.json()

  if (!watchData.resourceId) {
    console.error('[googleWatch] Watch registration failed:', watchData)
    return
  }

  const expiry = new Date(parseInt(watchData.expiration)).toISOString()

  if (target.type === 'staff') {
    await supabaseAdmin.from('staff').update({
      google_channel_id: channelId,
      google_resource_id: watchData.resourceId,
      google_sync_token: syncToken,
      google_channel_expiry: expiry,
    }).eq('id', target.staffId)
  } else {
    await supabaseAdmin.from('tenants').update({
      google_channel_id: channelId,
      google_resource_id: watchData.resourceId,
      google_sync_token: syncToken,
      google_channel_expiry: expiry,
    }).eq('id', target.tenantId)
  }

  console.log(`[googleWatch] Watch registered for ${target.type}, channel: ${channelId}, expires: ${expiry}`)
}

export async function stopCalendarWatch(
  resourceId: string,
  channelId: string,
  accessToken: string
): Promise<void> {
  await fetch('https://www.googleapis.com/calendar/v3/channels/stop', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: channelId, resourceId }),
  })
}
