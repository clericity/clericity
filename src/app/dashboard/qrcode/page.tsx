'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import QRCode from 'qrcode'
import Image from 'next/image'
import { useLanguage } from '@/hooks/useLanguage'

export default function QRCodePage() {
  const router = useRouter()
  const { t } = useLanguage()
  const [slug, setSlug] = useState('')
  const [qrUrl, setQrUrl] = useState('')
  const [loading, setLoading] = useState(true)
  const [businessName, setBusinessName] = useState('')
  const [plan, setPlan] = useState('free')
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 640)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  useEffect(() => {
    const getData = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/auth'); return }

      const { data: profile } = await supabase
        .from('profiles')
        .select('tenant_id')
        .eq('id', user.id)
        .single()

      if (profile?.tenant_id) {
        const { data: tenant } = await supabase
          .from('tenants')
          .select('slug, name, plan')
          .eq('id', profile.tenant_id)
          .single()

        if (tenant?.slug) {
          setSlug(tenant.slug)
          setBusinessName(tenant.name)
          setPlan(tenant.plan || 'free')

          const bookingUrl = `${window.location.origin}/${tenant.slug}`
          const qr = await QRCode.toDataURL(bookingUrl, {
            width: 300,
            margin: 2,
            color: { dark: '#0f172a', light: '#ffffff' }
          })
          setQrUrl(qr)
        }
      }
      setLoading(false)
    }
    getData()
  }, [router])

  const handleDownload = () => {
    const link = document.createElement('a')
    link.download = `${slug}-qrcode.png`
    link.href = qrUrl
    link.click()
  }

  const handlePrint = () => {
    const printWindow = window.open('', '_blank')
    if (!printWindow) return
    printWindow.document.write(`
      <html>
        <head>
          <title>${t.dash.qr_title} - ${businessName}</title>
          <style>
            body { font-family: 'Segoe UI', sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background: white; }
            img { width: 280px; height: 280px; }
            h2 { font-size: 1.5rem; color: #0f172a; margin-top: 1rem; }
            p { color: #6b7280; font-size: 0.9rem; margin-top: 0.5rem; }
          </style>
        </head>
        <body>
          <img src="${qrUrl}" />
          <h2>${businessName}</h2>
          <p>${t.booking.click_to_book.replace(' →', '')}</p>
        </body>
      </html>
    `)
    printWindow.document.close()
    printWindow.print()
  }

  return (
    <div>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#111827', marginBottom: '0.5rem' }}>
        {t.dash.qr_title}
      </h1>
      <p style={{ color: '#6b7280', marginBottom: '2rem', fontSize: '0.875rem' }}>
        {t.dash.qr_desc}
      </p>

      {loading ? (
        <p style={{ color: '#6b7280' }}>{t.dash.loading}</p>
      ) : !slug ? (
        <div style={{ backgroundColor: 'white', padding: '2rem', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', textAlign: 'center' }}>
          <p style={{ color: '#6b7280', marginBottom: '1rem' }}>{t.dash.qr_no_slug}</p>
          <button
            onClick={() => router.push('/dashboard/settings')}
            style={{ backgroundColor: '#2563eb', color: 'white', padding: '0.75rem 1.5rem', borderRadius: '8px', border: 'none', cursor: 'pointer', fontWeight: '500' }}
          >
            {t.dash.qr_settings_btn}
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: isMobile ? '1rem' : '2rem', alignItems: 'flex-start' }}>

          {/* QR kód */}
          <div style={{ backgroundColor: 'white', padding: isMobile ? '1.25rem' : '2rem', borderRadius: '16px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', textAlign: 'center', width: isMobile ? '100%' : undefined, boxSizing: 'border-box' }}>
            {qrUrl && (
              <Image src={qrUrl} alt="QR Kód" width={220} height={220} style={{ borderRadius: '8px', filter: plan === 'free' ? 'blur(6px)' : 'none', opacity: plan === 'free' ? 0.6 : 1 }} />
            )}
            <p style={{ fontWeight: '700', color: '#111827', marginTop: '1rem', fontSize: '1.1rem' }}>{businessName}</p>
            <p style={{ color: '#6b7280', fontSize: '0.8rem', marginTop: '0.25rem', wordBreak: 'break-all' }}>
              {typeof window !== 'undefined' ? window.location.origin : ''}/{slug}
            </p>

            <div style={{ position: 'relative', marginTop: '1.5rem' }}>
              <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: '0.75rem', justifyContent: 'center', opacity: plan === 'free' ? 0.4 : 1, pointerEvents: plan === 'free' ? 'none' : 'auto', filter: plan === 'free' ? 'blur(1px)' : 'none' }}>
                <button
                  onClick={handleDownload}
                  style={{ padding: '0.625rem 1.25rem', backgroundColor: '#2563eb', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: '500', fontSize: '0.875rem' }}
                >
                  {t.dash.qr_download}
                </button>
                <button
                  onClick={handlePrint}
                  style={{ padding: '0.625rem 1.25rem', backgroundColor: '#f3f4f6', color: '#374151', border: '1px solid #e5e7eb', borderRadius: '8px', cursor: 'pointer', fontWeight: '500', fontSize: '0.875rem' }}
                >
                  {t.dash.qr_print}
                </button>
              </div>
              {plan === 'free' && (
                <div style={{ marginTop: '0.75rem', backgroundColor: '#fffbeb', border: '1px solid #fde68a', borderRadius: '10px', padding: '0.875rem 1rem', textAlign: 'center' }}>
                  <p style={{ fontSize: '0.8rem', fontWeight: '700', color: '#92400e', margin: '0 0 0.25rem' }}>🔒 {t.dash.qr_download}</p>
                  <p style={{ fontSize: '0.75rem', color: '#78350f', margin: 0 }}>{t.dash.qr_upgrade}</p>
                </div>
              )}
            </div>
          </div>

          {/* Miért jó */}
          <div style={{ flex: 1, minWidth: 0, width: isMobile ? '100%' : undefined }}>
            <div style={{ backgroundColor: '#eff6ff', padding: isMobile ? '1rem' : '1.5rem', borderRadius: '16px', border: '1px solid #bfdbfe', marginBottom: '1rem' }}>
              <h3 style={{ fontWeight: '700', color: '#1d4ed8', marginBottom: '1rem', fontSize: '1rem' }}>
                {t.dash.qr_why_title}
              </h3>
              {[t.dash.qr_why_1, t.dash.qr_why_2, t.dash.qr_why_3, t.dash.qr_why_4].map((text, i) => (
                <div key={i} style={{ display: 'flex', gap: '0.75rem', marginBottom: '0.75rem' }}>
                  <p style={{ color: '#1e40af', fontSize: '0.875rem', lineHeight: 1.6, margin: 0 }}>{text}</p>
                </div>
              ))}
            </div>

            <div style={{ backgroundColor: 'white', padding: isMobile ? '1rem' : '1.5rem', borderRadius: '16px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
              <h3 style={{ fontWeight: '700', color: '#111827', marginBottom: '0.75rem', fontSize: '1rem' }}>
                {t.dash.qr_link_label}
              </h3>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', backgroundColor: '#f9fafb', padding: '0.75rem 1rem', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
                <p style={{ fontSize: '0.8rem', color: '#374151', flex: 1, wordBreak: 'break-all', margin: 0 }}>
                  {typeof window !== 'undefined' ? window.location.origin : ''}/{slug}
                </p>
                <button
                  onClick={() => plan !== 'free' && navigator.clipboard.writeText(`${window.location.origin}/${slug}`)}
                  style={{ backgroundColor: plan === 'free' ? '#e5e7eb' : '#2563eb', color: plan === 'free' ? '#9ca3af' : 'white', border: 'none', borderRadius: '6px', padding: '0.375rem 0.75rem', cursor: plan === 'free' ? 'not-allowed' : 'pointer', fontSize: '0.75rem', whiteSpace: 'nowrap', flexShrink: 0 }}
                  title={plan === 'free' ? 'Magasabb csomag szükséges' : ''}
                >
                  {plan === 'free' ? `🔒 ${t.dash.qr_copy.replace('📋 ', '')}` : t.dash.qr_copy}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}