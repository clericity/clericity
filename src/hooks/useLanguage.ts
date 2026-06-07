'use client'

import { useState, useEffect } from 'react'
import { translations, Lang } from '@/lib/translations'

const STORAGE_KEY = 'CLERICITY_lang'
const BROADCAST_EVENT = 'CLERICITY-lang-change'

export function useLanguage() {
  const [lang, setLangState] = useState<Lang>('hu')

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY) as Lang | null
    if (saved && ['hu', 'en', 'sk'].includes(saved)) setLangState(saved)

    const handler = (e: Event) => {
      const newLang = (e as CustomEvent<Lang>).detail
      if (['hu', 'en', 'sk'].includes(newLang)) setLangState(newLang)
    }
    window.addEventListener(BROADCAST_EVENT, handler)
    return () => window.removeEventListener(BROADCAST_EVENT, handler)
  }, [])

  const setLang = (l: Lang) => {
    setLangState(l)
    localStorage.setItem(STORAGE_KEY, l)
    window.dispatchEvent(new CustomEvent<Lang>(BROADCAST_EVENT, { detail: l }))
  }

  const t = translations[lang]
  return { lang, setLang, t }
}
