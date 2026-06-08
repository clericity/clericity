import type { Metadata } from 'next'
import './globals.css'
import CookieConsent from '@/components/CookieConsent'

export const metadata: Metadata = {
  title: 'CLERICITY',
  description: 'Online Foglalási Rendszer',
  verification: {
    google: 'JN2f_kTDbQ6mkRrRora31qzk0CAIlWmSY4X7n8Pnk0g',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="hu">
      <body style={{ margin: 0, padding: 0, fontFamily: "'Segoe UI', sans-serif" }}>
        {children}
        <CookieConsent />
      </body>
    </html>
  )
}