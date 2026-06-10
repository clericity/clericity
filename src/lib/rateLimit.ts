import { NextResponse } from 'next/server'

// Sliding window in-memory rate limiter
// On Vercel each serverless instance has its own store — provides per-instance burst protection.
// For global rate limiting across instances, swap the store for Upstash Redis.

const store = new Map<string, number[]>()

export function getIP(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0].trim()
  return request.headers.get('x-real-ip') || '127.0.0.1'
}

export function checkRateLimit(ip: string, key: string, limit: number, windowMs: number): boolean {
  const now = Date.now()
  const mapKey = `${key}:${ip}`
  const timestamps = (store.get(mapKey) ?? []).filter(t => now - t < windowMs)

  if (timestamps.length >= limit) {
    store.set(mapKey, timestamps)
    return false
  }

  timestamps.push(now)
  store.set(mapKey, timestamps)
  return true
}

export function rateLimitResponse(): NextResponse {
  return NextResponse.json(
    { error: 'Túl sok kérés. Kérjük próbálkozz pár perc múlva.' },
    { status: 429, headers: { 'Retry-After': '60' } }
  )
}
