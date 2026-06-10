import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseServer'
import { Resend } from 'resend'
import { getAuthUser, getUserTenantId, unauthorizedResponse, forbiddenResponse } from '@/lib/auth'
import { writeAuditLog } from '@/lib/audit'
import { translations } from '@/lib/translations'
import type { Lang } from '@/lib/translations'

const resend = new Resend(process.env.RESEND_API_KEY)

export async function POST(request: Request) {
  const user = await getAuthUser(request)
  if (!user) return unauthorizedResponse()

  const { tenantId, name, email, phone, initialPassword } = await request.json()

  const userTenantId = await getUserTenantId(user.id)
  if (tenantId !== userTenantId) return forbiddenResponse()

  if (!tenantId || !name || !email || !initialPassword) {
    return NextResponse.json({ error: 'Név, email és jelszó megadása kötelező' }, { status: 400 })
  }

  if (initialPassword.length < 6) {
    return NextResponse.json({ error: 'A jelszónak legalább 6 karakter hosszúnak kell lennie' }, { status: 400 })
  }

  // Munkás limit csomagonként (nem-tulajdonos staff max)
  const STAFF_LIMITS: Record<string, number> = { free: 0, basic: 1, pro: 4, business: 9 }

  const { data: tenantPlan } = await supabaseAdmin
    .from('tenants').select('plan').eq('id', tenantId).single()

  const currentPlan = tenantPlan?.plan || 'free'
  const staffLimit = STAFF_LIMITS[currentPlan] ?? 0

  const { count: staffCount } = await supabaseAdmin
    .from('staff')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .eq('is_owner', false)

  if ((staffCount ?? 0) >= staffLimit) {
    const planNames: Record<string, string> = { free: 'Ingyenes (1 fő)', basic: 'Alap (2 fő)', pro: 'Pro (5 fő)', business: 'Business (10 fő)' }
    return NextResponse.json(
      { error: 'free_plan_staff_limit', message: `A(z) ${planNames[currentPlan] ?? currentPlan} csomagban elérted a munkás limitet. Válts magasabb csomagra több munkás hozzáadásához.` },
      { status: 403 }
    )
  }

  // Ellenőrzés: van-e már ilyen email a rendszerben
  const { data: existing } = await supabaseAdmin
    .from('staff')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('email', email)
    .single()

  if (existing) {
    return NextResponse.json({ error: 'Ezzel az email címmel már létezik munkás ennél a vállalkozásnál' }, { status: 400 })
  }

  // Supabase Auth felhasználó létrehozása
  const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password: initialPassword,
    email_confirm: true,
  })

  if (authError || !authData.user) {
    // Ha az email már foglalt a rendszerben
    if (authError?.message?.includes('already registered')) {
      return NextResponse.json({ error: 'Ez az email cím már regisztrálva van a rendszerben' }, { status: 400 })
    }
    return NextResponse.json({ error: authError?.message || 'Hiba a felhasználó létrehozásakor' }, { status: 400 })
  }

  const userId = authData.user.id

  // Staff rekord létrehozása
  const { data: staffRecord, error: staffError } = await supabaseAdmin
    .from('staff')
    .insert({ tenant_id: tenantId, name, email, phone: phone || null, user_id: userId })
    .select()
    .single()

  if (staffError) {
    await supabaseAdmin.auth.admin.deleteUser(userId)
    return NextResponse.json({ error: staffError.message }, { status: 400 })
  }

  // Profiles rekord létrehozása
  const { error: profileError } = await supabaseAdmin
    .from('profiles')
    .insert({ id: userId, full_name: name, role: 'staff', tenant_id: tenantId })

  if (profileError) {
    await supabaseAdmin.auth.admin.deleteUser(userId)
    return NextResponse.json({ error: profileError.message }, { status: 400 })
  }

  // Tenant neve és nyelve az emailhez
  const { data: tenant } = await supabaseAdmin
    .from('tenants')
    .select('name, language')
    .eq('id', tenantId)
    .single()

  const staffLang: Lang = (tenant?.language && tenant.language in translations) ? tenant.language as Lang : 'hu'
  const sw = translations[staffLang].email

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'

  // Üdvözlő email küldése a munkásnak
  const { data: emailData, error: emailError } = await resend.emails.send({
    from: `CLERICITY <onboarding@resend.dev>`,
    to: [email],
    subject: sw.staff_welcome_subject,
    html: `
      <!DOCTYPE html>
      <html>
        <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
        <body style="margin:0;padding:0;background:#f8fafc;font-family:'Segoe UI',sans-serif;">
          <div style="max-width:560px;margin:2rem auto;background:white;border-radius:16px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.08);">

            <div style="background:linear-gradient(135deg,#0f172a,#1e3a8a);padding:2rem;text-align:center;">
              <h1 style="color:white;font-size:1.75rem;font-weight:800;margin:0;">CLERICITY</h1>
              <p style="color:#93c5fd;margin:0.5rem 0 0;font-size:0.9rem;">${sw.staff_welcome_subtitle}</p>
            </div>

            <div style="padding:2rem;">
              <h2 style="color:#111827;font-size:1.25rem;font-weight:700;margin:0 0 0.5rem;">${sw.staff_welcome_greeting.replace('{name}', name)}</h2>
              <p style="color:#374151;font-size:0.9rem;line-height:1.6;margin:0 0 1.5rem;">
                ${sw.staff_welcome_body.replace('{businessName}', `<strong>${tenant?.name || 'CLERICITY'}</strong>`)}
              </p>

              <div style="background:#f8fafc;border:1px solid #e5e7eb;border-radius:12px;padding:1.25rem;margin-bottom:1.5rem;">
                <p style="margin:0 0 0.75rem;font-size:0.8rem;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:0.08em;">${sw.staff_welcome_credentials_title}</p>
                <div style="margin-bottom:0.625rem;">
                  <span style="font-size:0.8rem;color:#6b7280;">${sw.staff_welcome_email_label}</span>
                  <span style="font-size:0.9rem;font-weight:700;color:#111827;margin-left:0.5rem;">${email}</span>
                </div>
                <div>
                  <span style="font-size:0.8rem;color:#6b7280;">${sw.staff_welcome_password_label}</span>
                  <span style="font-size:0.9rem;font-weight:700;color:#111827;margin-left:0.5rem;font-family:monospace;background:#eff6ff;padding:0.2rem 0.5rem;border-radius:4px;">${initialPassword}</span>
                </div>
              </div>

              <a href="${siteUrl}"
                style="display:block;text-align:center;background:#2563eb;color:white;padding:0.875rem;border-radius:10px;text-decoration:none;font-weight:700;font-size:1rem;margin-bottom:1.25rem;">
                ${sw.staff_welcome_login_btn}
              </a>

              <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:1rem;font-size:0.85rem;color:#92400e;">
                ${sw.staff_welcome_password_tip}
              </div>
            </div>

            <div style="background:#f8fafc;padding:1.25rem;text-align:center;border-top:1px solid #e5e7eb;">
              <p style="color:#9ca3af;font-size:0.75rem;margin:0;">${sw.staff_welcome_footer}</p>
            </div>
          </div>
        </body>
      </html>
    `,
  })

  await writeAuditLog({
    tenantId,
    userId: user.id,
    action: 'staff.create',
    entityType: 'staff',
    entityId: staffRecord.id,
    metadata: { name },
  })

  if (emailError) {
    console.error('Staff welcome email error:', emailError)
    // Munkás sikeresen létrehozva, de email nem ment el
    return NextResponse.json({ success: true, staff: staffRecord, emailWarning: 'A munkás létrejött, de az üdvözlő email nem ment el: ' + emailError.message })
  }

  console.log('Staff welcome email sent:', emailData)
  return NextResponse.json({ success: true, staff: staffRecord })
}
