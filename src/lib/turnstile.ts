export async function verifyTurnstile(token: unknown): Promise<boolean> {
  if (!token || typeof token !== 'string') return false
  const secret = process.env.TURNSTILE_SECRET_KEY
  if (!secret) {
    console.error('[turnstile] TURNSTILE_SECRET_KEY not set')
    return false
  }
  try {
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret, response: token }),
    })
    const data = await res.json()
    return data.success === true
  } catch (e) {
    console.error('[turnstile] verification error:', e)
    return false
  }
}
