import { NextResponse } from 'next/server'
import { Resend } from 'resend'
import { supabaseAdmin } from '@/lib/supabaseServer'

const resend = new Resend(process.env.RESEND_API_KEY)

const DEFAULT_REMINDER_SUBJECT = '👋 Rég látogattál meg minket — {businessName}'
const DEFAULT_REMINDER_BODY = `Kedves {customerName}!\n\nMár egy ideje nem jártál nálunk. Szívesen látunk újra!\n\nFoglalj időpontot most:\n{bookingUrl}\n\nÜdvözlettel,\n{businessName}`

export async function POST(request: Request) {
  const { tenantId, clients } = await request.json()
  if (!tenantId || !clients?.length) {
    return NextResponse.json({ error: 'Hiányzó adatok' }, { status: 400 })
  }

  const { data: tenant } = await supabaseAdmin
    .from('tenants')
    .select('name, email_from_name, reminder_email_subject, reminder_email_body, slug')
    .eq('id', tenantId)
    .single()

  if (!tenant) return NextResponse.json({ error: 'Tenant nem található' }, { status: 404 })

  const fromName = tenant.email_from_name || tenant.name || 'CLERICITY'
  const subjectTpl = tenant.reminder_email_subject || DEFAULT_REMINDER_SUBJECT
  const bodyTpl = tenant.reminder_email_body || DEFAULT_REMINDER_BODY
  const bookingUrl = `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/${tenant.slug}`

  let sent = 0
  const failed: string[] = []

  for (const client of clients as { email: string; name: string }[]) {
    const replacements: Record<string, string> = {
      '{customerName}': client.name || client.email,
      '{businessName}': tenant.name || '',
      '{bookingUrl}': bookingUrl,
    }

    let subject = subjectTpl
    let body = bodyTpl
    Object.entries(replacements).forEach(([k, v]) => {
      subject = subject.replaceAll(k, v)
      body = body.replaceAll(k, v)
    })

    const bodyHtml = body.trim().startsWith('<')
      ? body
      : body
          .split('\n')
          .map((line: string) =>
            line.trim() === ''
              ? '<br>'
              : `<p style="margin:0 0 0.5rem;color:#374151;font-size:0.875rem;line-height:1.6;">${line}</p>`
          )
          .join('')

    const { error } = await resend.emails.send({
      from: `${fromName} <onboarding@resend.dev>`,
      to: [client.email],
      subject,
      html: `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
        <body style="margin:0;padding:0;background:#f8fafc;font-family:'Segoe UI',sans-serif;">
          <div style="max-width:560px;margin:2rem auto;background:white;border-radius:16px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.08);">
            <div style="background:linear-gradient(135deg,#0f172a,#1e3a8a);padding:2rem;text-align:center;">
              <h1 style="color:white;font-size:1.75rem;font-weight:800;margin:0;">CLERICITY</h1>
            </div>
            <div style="padding:2rem;">
              ${bodyHtml}
              <div style="text-align:center;margin-top:1.5rem;">
                <a href="${bookingUrl}" style="display:inline-block;background:linear-gradient(135deg,#1d4ed8,#2563eb);color:white;padding:0.875rem 2rem;border-radius:10px;text-decoration:none;font-weight:700;font-size:1rem;">
                  📅 Időpontot foglalok →
                </a>
              </div>
            </div>
            <div style="background:#f8fafc;padding:1.25rem;text-align:center;border-top:1px solid #e5e7eb;">
              <p style="color:#9ca3af;font-size:0.75rem;margin:0;">Powered by CLERICITY</p>
            </div>
          </div>
        </body></html>`,
    })

    if (error) {
      failed.push(client.email)
    } else {
      sent++
    }
  }

  return NextResponse.json({ sent, failed })
}
