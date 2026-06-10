import { NextResponse } from 'next/server'
import { Resend } from 'resend'
import { supabaseAdmin } from '@/lib/supabaseServer'
import { getIP, checkRateLimit, rateLimitResponse } from '@/lib/rateLimit'
import { sanitizeText, sanitizeEmail, sanitizePhone, isValidUUID } from '@/lib/validate'

const resend = new Resend(process.env.RESEND_API_KEY)

export async function POST(request: Request) {
  if (!checkRateLimit(getIP(request), 'waitlist', 5, 60 * 60 * 1000)) {
    return rateLimitResponse()
  }

  const body = await request.json()
  const tenantId = body.tenantId
  const staffId = body.staffId ?? null
  const serviceId = body.serviceId ?? null
  const firstName = sanitizeText(body.firstName, 100)
  const lastName = sanitizeText(body.lastName, 100)
  const email = sanitizeEmail(body.email)
  const phone = sanitizePhone(body.phone)

  if (!isValidUUID(tenantId)) {
    return NextResponse.json({ error: 'Érvénytelen kérés.' }, { status: 400 })
  }
  if (!email) {
    return NextResponse.json({ error: 'Érvénytelen email cím.' }, { status: 400 })
  }
  if (staffId && !isValidUUID(staffId)) {
    return NextResponse.json({ error: 'Érvénytelen kérés.' }, { status: 400 })
  }
  if (serviceId && !isValidUUID(serviceId)) {
    return NextResponse.json({ error: 'Érvénytelen kérés.' }, { status: 400 })
  }

  // Ellenőrzés: már feliratkozott-e ugyanerre
  const { data: existing } = await supabaseAdmin
    .from('waitlist')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('customer_email', email)
    .eq('status', 'waiting')
    .limit(1)

  if (existing && existing.length > 0) {
    return NextResponse.json({ error: 'Ezzel az email címmel már fel vagy iratkozva a várólistára.' }, { status: 409 })
  }

  const { error } = await supabaseAdmin.from('waitlist').insert({
    tenant_id: tenantId,
    staff_id: staffId || null,
    service_id: serviceId || null,
    customer_first_name: firstName || null,
    customer_last_name: lastName || null,
    customer_email: email.toLowerCase(),
    customer_phone: phone || null,
    status: 'waiting',
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  // Visszaigazoló email küldése
  const [tenantRes, serviceRes] = await Promise.all([
    supabaseAdmin.from('tenants').select('name, email_from_name').eq('id', tenantId).single(),
    serviceId
      ? supabaseAdmin.from('services').select('name').eq('id', serviceId).single()
      : Promise.resolve({ data: null }),
  ])

  const businessName = tenantRes.data?.name || 'Az üzlet'
  const fromName = tenantRes.data?.email_from_name || businessName
  const serviceName = serviceRes.data?.name || null
  const customerName = firstName ? `${lastName || ''} ${firstName}`.trim() : null

  await resend.emails.send({
    from: `${fromName} <onboarding@resend.dev>`,
    to: [email.toLowerCase()],
    subject: `📋 Várólistára feliratkozás — ${businessName}`,
    html: `
      <!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
      <body style="margin:0;padding:0;background:#f8fafc;font-family:'Segoe UI',sans-serif;">
        <div style="max-width:520px;margin:2rem auto;background:white;border-radius:16px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.08);">
          <div style="background:linear-gradient(135deg,#0f172a,#1e3a8a);padding:2rem;text-align:center;">
            <h1 style="color:white;font-size:1.75rem;font-weight:800;margin:0;">${businessName}</h1>
            <p style="color:#93c5fd;margin:0.5rem 0 0;font-size:0.9rem;">Várólistára feliratkozás</p>
          </div>
          <div style="padding:2rem;">
            <p style="color:#374151;font-size:0.9rem;line-height:1.7;margin:0 0 1.25rem;">
              Kedves ${customerName || 'Ügyfelünk'}!
            </p>
            <p style="color:#374151;font-size:0.9rem;line-height:1.7;margin:0 0 1.25rem;">
              Sikeresen feliratkozott a <strong>${businessName}</strong> várólistájára.
              Amint szabad időpont nyílik meg, azonnal értesítjük.
            </p>
            ${serviceName ? `
            <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;padding:1rem 1.25rem;margin-bottom:1.25rem;">
              <p style="font-size:0.72rem;font-weight:700;color:#1d4ed8;text-transform:uppercase;letter-spacing:0.06em;margin:0 0 0.375rem;">Kiválasztott szolgáltatás</p>
              <p style="color:#111827;font-weight:700;font-size:0.95rem;margin:0;">✂️ ${serviceName}</p>
            </div>` : ''}
            <p style="color:#6b7280;font-size:0.82rem;line-height:1.6;margin:0;">
              Ha mégsem szeretnél értesítést kapni, egyszerűen hagyja figyelmen kívül ezt az emailt.
            </p>
          </div>
          <div style="background:#f8fafc;padding:1.25rem;text-align:center;border-top:1px solid #e5e7eb;">
            <p style="color:#9ca3af;font-size:0.75rem;margin:0;">Powered by CLERICITY</p>
          </div>
        </div>
      </body></html>
    `,
  })

  return NextResponse.json({ success: true })
}
