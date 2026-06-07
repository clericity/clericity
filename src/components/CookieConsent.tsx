'use client'

import { useState } from 'react'
import Link from 'next/link'

export default function CookieConsent() {
  const [visible, setVisible] = useState(() =>
    typeof window !== 'undefined' ? !localStorage.getItem('cookie_consent') : false
  )

  const accept = () => {
    localStorage.setItem('cookie_consent', '1')
    setVisible(false)
  }

  if (!visible) return null

  return (
    <div style={{
      position: 'fixed', bottom: '1.5rem', left: '50%', transform: 'translateX(-50%)',
      width: 'min(560px, calc(100vw - 2rem))',
      backgroundColor: '#0f172a', borderRadius: '14px',
      padding: '1.25rem 1.5rem',
      boxShadow: '0 8px 32px rgba(0,0,0,0.35)',
      display: 'flex', alignItems: 'center', gap: '1.25rem', flexWrap: 'wrap',
      zIndex: 9999,
    }}>
      <p style={{ color: '#cbd5e1', fontSize: '0.85rem', lineHeight: 1.6, margin: 0, flex: 1, minWidth: '200px' }}>
        🍪 Weboldalunk technikai cookie-kat használ a működéshez. Részletek az{' '}
        <Link href="/privacy-policy" style={{ color: '#60a5fa', textDecoration: 'underline' }}>adatvédelmi tájékoztatóban</Link>.
      </p>
      <button
        onClick={accept}
        style={{
          backgroundColor: '#2563eb', color: 'white', border: 'none',
          padding: '0.6rem 1.5rem', borderRadius: '8px',
          cursor: 'pointer', fontWeight: '700', fontSize: '0.875rem', whiteSpace: 'nowrap', flexShrink: 0,
        }}
      >
        Rendben
      </button>
    </div>
  )
}
