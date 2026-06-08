import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  }
})

supabase.auth.onAuthStateChange((event) => {
  if (event === 'SIGNED_OUT') {
    // Stale token cleared — no action needed, UI reacts via TenantContext
  }
})

if (typeof window !== 'undefined') {
  supabase.auth.getSession().then(({ error }) => {
    if (error?.message?.includes('Refresh Token')) {
      supabase.auth.signOut()
    }
  })
}