'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function StaffLoginRedirect() {
  const router = useRouter()

  useEffect(() => {
    const check = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
        router.replace(profile?.role === 'staff' ? '/staff' : '/dashboard')
      } else {
        // Főoldalra küldés, ahol a Belépés tab van
        router.replace('/#auth-section')
      }
    }
    check()
  }, [router])

  return null
}
