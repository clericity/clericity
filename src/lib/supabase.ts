import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

const REMEMBER_KEY = 'clericity_remember_me'

// Custom storage: ha remember=false → sessionStorage (tab bezárásakor törlődik)
//                 ha remember=true  → localStorage  (böngésző újraindítás után is megmarad)
const authStorage = typeof window !== 'undefined' ? {
  getItem: (key: string): string | null =>
    sessionStorage.getItem(key) ?? localStorage.getItem(key),
  setItem: (key: string, value: string) => {
    const remember = localStorage.getItem(REMEMBER_KEY) !== 'false'
    if (remember) {
      localStorage.setItem(key, value)
      sessionStorage.removeItem(key)
    } else {
      sessionStorage.setItem(key, value)
      localStorage.removeItem(key)
    }
  },
  removeItem: (key: string) => {
    localStorage.removeItem(key)
    sessionStorage.removeItem(key)
  },
} : undefined

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    ...(authStorage ? { storage: authStorage } : {}),
  },
})

export function setRememberMe(remember: boolean) {
  if (typeof window !== 'undefined') {
    localStorage.setItem(REMEMBER_KEY, String(remember))
  }
}

if (typeof window !== 'undefined') {
  supabase.auth.getSession().then(({ error }) => {
    if (error?.message?.includes('Refresh Token')) {
      supabase.auth.signOut()
    }
  })
}