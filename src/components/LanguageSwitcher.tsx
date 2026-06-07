'use client'

import { useState, useRef, useEffect } from 'react'
import { Lang } from '@/lib/translations'

const FLAGS: Record<Lang, string> = { hu: '🇭🇺', en: '🇬🇧', sk: '🇸🇰' }
const LABELS: Record<Lang, string> = { hu: 'Magyar', en: 'English', sk: 'Slovenčina' }
const SHORT: Record<Lang, string> = { hu: 'HU', en: 'EN', sk: 'SK' }

interface Props {
  lang: Lang
  setLang: (l: Lang) => void
  dark?: boolean
}

export default function LanguageSwitcher({ lang, setLang, dark }: Props) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const textColor = dark ? 'white' : '#374151'
  const borderColor = dark ? 'rgba(255,255,255,0.25)' : '#e5e7eb'
  const bgColor = dark ? 'rgba(255,255,255,0.1)' : 'white'
  const hoverBg = dark ? 'rgba(255,255,255,0.15)' : '#f9fafb'

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      {/* Trigger gomb */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: '0.4rem',
          padding: '0.35rem 0.65rem',
          borderRadius: '8px',
          border: `1.5px solid ${borderColor}`,
          backgroundColor: bgColor,
          color: textColor,
          cursor: 'pointer',
          fontSize: '0.8rem',
          fontWeight: '600',
          lineHeight: 1,
          userSelect: 'none',
        }}
      >
        <span style={{ fontSize: '1rem', lineHeight: 1 }}>{FLAGS[lang]}</span>
        <span>{SHORT[lang]}</span>
        <span style={{ fontSize: '0.55rem', opacity: 0.7, marginLeft: '0.1rem' }}>{open ? '▲' : '▼'}</span>
      </button>

      {/* Lenyíló lista */}
      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 6px)', right: 0,
          backgroundColor: 'white',
          border: '1px solid #e5e7eb',
          borderRadius: '10px',
          boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
          overflow: 'hidden',
          zIndex: 1000,
          minWidth: '148px',
        }}>
          {(['hu', 'en', 'sk'] as Lang[]).map((l, i) => (
            <button
              key={l}
              onClick={() => { setLang(l); setOpen(false) }}
              style={{
                display: 'flex', alignItems: 'center', gap: '0.625rem',
                width: '100%', padding: '0.625rem 1rem',
                border: 'none',
                borderBottom: i < 2 ? '1px solid #f3f4f6' : 'none',
                backgroundColor: lang === l ? '#eff6ff' : 'white',
                color: lang === l ? '#2563eb' : '#374151',
                cursor: 'pointer',
                fontSize: '0.85rem',
                fontWeight: lang === l ? '700' : '400',
                textAlign: 'left',
                transition: 'background-color 0.1s',
              }}
              onMouseEnter={e => { if (lang !== l) (e.currentTarget as HTMLButtonElement).style.backgroundColor = hoverBg }}
              onMouseLeave={e => { if (lang !== l) (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'white' }}
            >
              <span style={{ fontSize: '1.15rem', lineHeight: 1 }}>{FLAGS[l]}</span>
              <span>{LABELS[l]}</span>
              {lang === l && <span style={{ marginLeft: 'auto', fontSize: '0.75rem' }}>✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
