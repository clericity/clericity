import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseServer'
import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)

const LOOKBACK_MS = 2 * 60 * 60 * 1000 // 2 órás visszatekintési ablak (kihagyott cron futásokhoz)

function replaceVars(text: string, vars: Record<string, string>): string {
  return Object.entries(vars).reduce((t, [k, v]) => t.replaceAll(k, v), text)
}

function toHtml(text: string): string {
  return text
    .split('\n')
    .map(line =>
      line.trim() === ''
        ? '<br>'
        : `<p style="margin:0 0 0.5rem;color:#374151;font-size:0.875rem;line-height:1.6;">${line}</p>`
    )
    .join('')
}

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const now = new Date()
  let totalSent = 0
  const errors: string[] = []

  // Összes bekapcsolt automatizáció lekérése
  const { data: automations } = await supabaseAdmin
    .from('email_automations')
    .select('*')
    .eq('enabled', true)

  if (!automations?.length) {
    return NextResponse.json({ sent: 0, message: 'Nincs aktív automatizáció' })
  }

  for (const automation of automations) {
    const delayMs = automation.trigger_delay_minutes * 60 * 1000

    // Időablak számítása az adott automatizáció típusához
    let column: string
    let gte: string
    let lte: string

    if (automation.trigger_type === 'before_appointment') {
      // Küldés ideje = start_time - delay
      // Akkor kell küldeni ha: start_time - delay <= most
      // → start_time <= most + delay
      column = 'start_time'
      lte = new Date(now.getTime() + delayMs).toISOString()
      gte = new Date(now.getTime() + delayMs - LOOKBACK_MS).toISOString()
    } else if (automation.trigger_type === 'after_appointment') {
      // Küldés ideje = end_time + delay
      // Akkor kell küldeni ha: end_time + delay <= most
      // → end_time <= most - delay
      column = 'end_time'
      lte = new Date(now.getTime() - delayMs).toISOString()
      gte = new Date(now.getTime() - delayMs - LOOKBACK_MS).toISOString()
    } else if (automation.trigger_type === 'booking_confirmed' && automation.trigger_delay_minutes > 0) {
      // Küldés ideje = created_at + delay
      column = 'created_at'
      lte = new Date(now.getTime() - delayMs).toISOString()
      gte = new Date(now.getTime() - delayMs - LOOKBACK_MS).toISOString()
    } else {
      // booking_confirmed delay=0 → már a foglalás létrehozásakor elküldjük
      continue
    }

    // Matching foglalások lekérése
    const { data: bookings } = await supabaseAdmin
      .from('bookings')
      .select('*, services(name), tenants(name, email_from_name)')
      .eq('tenant_id', automation.tenant_id)
      .eq('status', 'confirmed')
      .gte(column, gte)
      .lte(column, lte)

    if (!bookings?.length) continue

    // Már elküldöttek szűrése (log tábla alapján)
    const { data: logs } = await supabaseAdmin
      .from('email_automation_logs')
      .select('booking_id')
      .eq('automation_id', automation.id)
      .in('booking_id', bookings.map(b => b.id))

    const alreadySent = new Set(logs?.map(l => l.booking_id) ?? [])

    for (const booking of bookings) {
      if (alreadySent.has(booking.id)) continue

      // Dátum és időpont formázása (a tárolt start_time stringből)
      const dateStr = booking.start_time.slice(0, 10)  // "2026-06-01"
      const timeStr = booking.start_time.slice(11, 16) // "09:00"

      const vars: Record<string, string> = {
        '{customerName}': `${booking.customer_last_name} ${booking.customer_first_name}`,
        '{serviceName}': (booking.services as { name: string } | null)?.name ?? '',
        '{date}': dateStr,
        '{slot}': timeStr,
        '{businessName}': (booking.tenants as { name: string } | null)?.name ?? '',
      }

      const subject = replaceVars(automation.subject, vars)
      const body = replaceVars(automation.body, vars)
      const fromName = (booking.tenants as { email_from_name: string | null } | null)?.email_from_name ?? 'CLERICITY'

      const { error } = await resend.emails.send({
        from: `${fromName} <onboarding@resend.dev>`,
        to: [booking.customer_email],
        subject,
        html: `
          <!DOCTYPE html>
          <html>
            <head>
              <meta charset="utf-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
            </head>
            <body style="margin:0;padding:0;background:#f8fafc;font-family:'Segoe UI',sans-serif;">
              <div style="max-width:560px;margin:2rem auto;background:white;border-radius:16px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.08);">
                <div style="background:linear-gradient(135deg,#0f172a,#1e3a8a);padding:2rem;text-align:center;">
                  <h1 style="color:white;font-size:1.75rem;font-weight:800;margin:0;">CLERICITY</h1>
                  <p style="color:#93c5fd;margin:0.5rem 0 0;font-size:0.9rem;">Online Foglalási Rendszer</p>
                </div>
                <div style="padding:2rem;">${toHtml(body)}</div>
                <div style="background:#f8fafc;padding:1.5rem;text-align:center;border-top:1px solid #e5e7eb;">
                  <p style="color:#9ca3af;font-size:0.75rem;margin:0;">Powered by CLERICITY</p>
                </div>
              </div>
            </body>
          </html>
        `,
      })

      if (error) {
        errors.push(`Booking ${booking.id}: ${error.message}`)
        continue
      }

      // Naplózás (dupla küldés megelőzése)
      await supabaseAdmin
        .from('email_automation_logs')
        .insert({ automation_id: automation.id, booking_id: booking.id })

      totalSent++
    }
  }

  return NextResponse.json({
    sent: totalSent,
    errors: errors.length > 0 ? errors : undefined,
    timestamp: now.toISOString(),
  })
}
