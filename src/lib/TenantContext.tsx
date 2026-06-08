'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

interface Tenant {
  id: string
  name: string
  slug: string | null
  description: string | null
  logo_url: string | null
  email: string | null
  phone: string | null
  country: string | null
  timezone: string | null
  custom_domain: string | null
  booking_horizon: number
  google_calendar_id: string | null
  google_refresh_token: string | null
}

interface Profile {
  id: string
  full_name: string
  role: string
  tenant_id: string | null
}

interface TenantContextType {
  tenant: Tenant | null
  profile: Profile | null
  loading: boolean
  refresh: () => void
}

const TenantContext = createContext<TenantContextType>({
  tenant: null,
  profile: null,
  loading: true,
  refresh: () => {},
})

export function TenantProvider({ children }: { children: React.ReactNode }) {
  const [tenant, setTenant] = useState<Tenant | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  const loadData = async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }

    const { data: profileData } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single()

    setProfile(profileData)

    if (profileData?.tenant_id) {
      const { data: tenantData } = await supabase
        .from('tenants')
        .select('*')
        .eq('id', profileData.tenant_id)
        .single()
      setTenant(tenantData)
    }

    setLoading(false)
  }

  useEffect(() => {
    loadData()

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_OUT' || event === 'TOKEN_REFRESHED') {
        if (!session) {
          setTenant(null)
          setProfile(null)
          setLoading(false)
        } else {
          await loadData()
        }
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  return (
    <TenantContext.Provider value={{ tenant, profile, loading, refresh: loadData }}>
      {children}
    </TenantContext.Provider>
  )
}

export function useTenant() {
  return useContext(TenantContext)
}