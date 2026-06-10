import type { NextConfig } from 'next'

const csp = [
  "default-src 'self'",
  // Next.js inline hydration scripteket használ — unsafe-inline szükséges nonce nélkül
  "script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com",
  // Inline style attribútumok az egész appban (JSX style={{}})
  "style-src 'self' 'unsafe-inline'",
  // Supabase Storage logók/fotók + Google profilképek
  "img-src 'self' data: blob: https://smheyvllxkhjfrapuufb.supabase.co https://lh3.googleusercontent.com",
  "font-src 'self'",
  // Supabase HTTP + WebSocket (Realtime), Google Auth, Cloudflare Turnstile
  "connect-src 'self' https://smheyvllxkhjfrapuufb.supabase.co wss://smheyvllxkhjfrapuufb.supabase.co https://accounts.google.com https://challenges.cloudflare.com",
  // Cloudflare Turnstile iframe (csak challenge domain — clickjacking ellen az X-Frame-Options véd)
  "frame-src https://challenges.cloudflare.com",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ')

const securityHeaders = [
  // Clickjacking védelem
  { key: 'X-Frame-Options', value: 'DENY' },
  // MIME sniffing tiltása
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  // HTTPS kikényszerítése 2 évre (preload listára kerüléshez is elegendő)
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  // Referer header csak azonos origin esetén küldi a teljes URL-t
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // Kamera, mikrofon, geolokáció, fizetés tiltása
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
  { key: 'Content-Security-Policy', value: csp },
]

const nextConfig: NextConfig = {
  transpilePackages: ['read-excel-file'],
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'smheyvllxkhjfrapuufb.supabase.co',
      },
    ],
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: securityHeaders,
      },
    ]
  },
}

export default nextConfig