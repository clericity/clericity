import { NextResponse } from 'next/server'
import { Resend } from 'resend'
import { supabaseAdmin } from '@/lib/supabaseServer'
import { getIP, checkRateLimit, rateLimitResponse } from '@/lib/rateLimit'
import { sanitizeEmail } from '@/lib/validate'

const resend = new Resend(process.env.RESEND_API_KEY)

const DEFAULT_EMAIL_BODY = `Kedves {customerName}!

Köszönjük a foglalásodat! Az alábbiakban találod a foglalásod részleteit:

🗓 Szolgáltatás: {serviceName}
📅 Dátum: {date}
🕐 Időpont: {slot}

Ha kérdésed van, kérjük vedd fel velünk a kapcsolatot.

Üdvözlettel,
{businessName}`

export async function POST(request: Request) {
  if (!checkRateLimit(getIP(request), 'email/send', 30, 60 * 60 * 1000)) {
    return rateLimitResponse()
  }
  const body = await request.json()
  const { to: rawTo, customerName, serviceName, date, slot, duration, businessName, cancelToken, tenantId, emailType, bookingUrl, freedDate, freedSlot, serviceDuration, notificationType, customerEmail, customerPhone, staffName, staffPhoto } = body

  const to = sanitizeEmail(rawTo)
  if (!to) {
    return NextResponse.json({ error: 'Érvénytelen email cím.' }, { status: 400 })
  }

  // emailType: 'confirmation' | 'cancel' | 'reschedule' | 'waitlist_notify' | 'welcome'
  const type = emailType || 'confirmation'

  // Regisztrációs üdvözlő email
  if (type === 'welcome') {
    const displayName = customerName || 'Felhasználó'
    const businessSlug = businessName || ''
    const siteUrlW = process.env.NEXT_PUBLIC_SITE_URL || 'https://clericity.com'
    const dashboardUrl = `${siteUrlW}/dashboard`
    const tenantBookingUrl = businessSlug ? `${siteUrlW}/${businessSlug}` : siteUrlW

    const { data, error } = await resend.emails.send({
      from: 'CLERICITY <onboarding@resend.dev>',
      to: [to],
      subject: '🎉 Sikeres regisztráció — Üdvözöl a CLERICITY!',
      html: `
        <!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
        <body style="margin:0;padding:0;background:#f8fafc;font-family:'Segoe UI',sans-serif;">
          <div style="max-width:560px;margin:2rem auto;background:white;border-radius:16px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.08);">
            <div style="background:linear-gradient(135deg,#0f172a,#1e3a8a);padding:2.5rem 2rem;text-align:center;">
              <h1 style="color:white;font-size:1.75rem;font-weight:800;margin:0 0 0.5rem;">CLERICITY</h1>
              <p style="color:#93c5fd;margin:0;font-size:0.9rem;">Online Foglalási Rendszer</p>
            </div>
            <div style="padding:2rem;">
              <h2 style="color:#111827;font-size:1.25rem;font-weight:700;margin:0 0 0.75rem;">🎉 Üdvözlünk, ${displayName}!</h2>
              <p style="color:#374151;font-size:0.9rem;line-height:1.7;margin:0 0 1.5rem;">
                Regisztrációd sikeresen megtörtént. Mostantól saját online foglalási rendszered van — ügyfeleid könnyedén tudnak időpontot foglalni hozzád.
              </p>

              <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;padding:1.25rem;margin-bottom:1.5rem;">
                <p style="color:#15803d;font-size:0.75rem;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;margin:0 0 0.75rem;">✅ Mi történt most?</p>
                <ul style="color:#374151;font-size:0.875rem;line-height:1.8;margin:0;padding-left:1.25rem;">
                  <li>Létrehoztuk a fiókodat</li>
                  <li>Beállítottuk az online foglalási oldalad</li>
                  <li>Megkaptad a saját foglalási linket</li>
                </ul>
              </div>

              ${businessSlug ? `
              <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:12px;padding:1.25rem;margin-bottom:1.5rem;">
                <p style="color:#1d4ed8;font-size:0.75rem;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;margin:0 0 0.5rem;">🔗 Foglalási linked</p>
                <p style="color:#111827;font-size:0.875rem;margin:0;word-break:break-all;"><a href="${tenantBookingUrl}" style="color:#2563eb;font-weight:600;">${tenantBookingUrl}</a></p>
                <p style="color:#6b7280;font-size:0.78rem;margin:0.375rem 0 0;">Ezt a linket küldd el az ügyfeleidnek!</p>
              </div>
              ` : ''}

              <div style="text-align:center;margin:1.5rem 0;">
                <a href="${dashboardUrl}" style="display:inline-block;background:linear-gradient(135deg,#1d4ed8,#2563eb);color:white;padding:0.875rem 2.5rem;border-radius:10px;text-decoration:none;font-weight:700;font-size:1rem;box-shadow:0 4px 12px rgba(37,99,235,0.3);">
                  Belépés a dashboardra →
                </a>
              </div>

              <div style="background:#fafafa;border-radius:10px;padding:1rem 1.25rem;border:1px solid #e5e7eb;">
                <p style="color:#374151;font-size:0.8rem;line-height:1.7;margin:0;">
                  <strong>Következő lépések:</strong><br>
                  1. Állítsd be a nyitvatartásodat<br>
                  2. Add hozzá a szolgáltatásaidat<br>
                  3. Kösd össze a Google Naptáradat<br>
                  4. Oszd meg a foglalási linkedet
                </p>
              </div>
            </div>
            <div style="background:#f8fafc;padding:1.5rem;text-align:center;border-top:1px solid #e5e7eb;">
              <p style="color:#9ca3af;font-size:0.75rem;margin:0;">Kérdésed van? Írj nekünk: <a href="mailto:clericity.booking@gmail.com" style="color:#6b7280;">clericity.booking@gmail.com</a></p>
              <p style="color:#9ca3af;font-size:0.72rem;margin:0.4rem 0 0;">Powered by CLERICITY</p>
            </div>
          </div>
        </body></html>
      `,
    })
    if (error) return NextResponse.json({ error }, { status: 400 })
    return NextResponse.json({ success: true, data })
  }

  // Várólistás értesítő email
  if (type === 'waitlist_notify') {
    let waitlistSubject = `🎉 Szabad időpont nyílt meg — {businessName}`
    let waitlistBody = `Kedves {customerName}!\n\nÖrömmel értesítünk, hogy szabad időpont nyílt meg a {businessName} naptárában!\n\nSiess, foglald le mielőtt elfogy!\n\nÜdvözlettel,\n{businessName}`
    let fromName = 'CLERICITY'

    if (tenantId) {
      const { data: tenant } = await supabaseAdmin
        .from('tenants')
        .select('waitlist_email_subject, waitlist_email_body, email_from_name')
        .eq('id', tenantId)
        .single()
      if (tenant?.email_from_name) fromName = tenant.email_from_name
      if (tenant?.waitlist_email_subject) waitlistSubject = tenant.waitlist_email_subject
      if (tenant?.waitlist_email_body) waitlistBody = tenant.waitlist_email_body
    }

    const replacements: Record<string, string> = {
      '{customerName}': customerName || '',
      '{businessName}': businessName || '',
      '{bookingUrl}': bookingUrl || '',
      '{serviceName}': serviceName || '',
    }
    Object.entries(replacements).forEach(([k, v]) => {
      waitlistSubject = waitlistSubject.replaceAll(k, v)
      waitlistBody = waitlistBody.replaceAll(k, v)
    })

    const bodyHtml = waitlistBody.trim().startsWith('<')
      ? waitlistBody
      : waitlistBody
          .split('\n')
          .map(line => line.trim() === '' ? '<br>' : `<p style="margin:0 0 0.5rem;color:#374151;font-size:0.875rem;line-height:1.6;">${line}</p>`)
          .join('')

    // Felszabadult időpont kártya (ha konkrét adatok vannak)
    const slotCardHtml = freedDate && freedSlot ? (() => {
      const dateFormatted = new Date(freedDate + 'T12:00:00').toLocaleDateString('hu-HU', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })
      const durationLabel = serviceDuration ? `⏱ ${serviceDuration} perc` : ''
      return `
        <div style="margin:1.25rem 0;background:#eff6ff;border:2px solid #bfdbfe;border-radius:12px;padding:1.25rem;">
          <p style="color:#1d4ed8;font-size:0.75rem;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;margin:0 0 0.75rem;">🎉 Felszabadult időpont</p>
          <p style="color:#111827;font-weight:700;font-size:1rem;margin:0 0 0.375rem;">✂️ ${serviceName || 'Szolgáltatás'}</p>
          <p style="color:#374151;font-size:0.875rem;margin:0 0 0.25rem;">📅 ${dateFormatted}</p>
          <p style="color:#374151;font-size:0.875rem;margin:0;">>🕐 ${freedSlot} ${durationLabel}</p>
        </div>
      `
    })() : ''

    const { data, error } = await resend.emails.send({
      from: `${fromName} <onboarding@resend.dev>`,
      to: [to],
      subject: waitlistSubject,
      html: `
        <!DOCTYPE html><html><head><meta charset="utf-8"></head>
        <body style="margin:0;padding:0;background:#f8fafc;font-family:'Segoe UI',sans-serif;">
          <div style="max-width:560px;margin:2rem auto;background:white;border-radius:16px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.08);">
            <div style="background:linear-gradient(135deg,#0f172a,#1e3a8a);padding:2rem;text-align:center;">
              <h1 style="color:white;font-size:1.75rem;font-weight:800;margin:0;">CLERICITY</h1>
            </div>
            <div style="padding:2rem;">
              ${bodyHtml}
              ${slotCardHtml}
              <div style="text-align:center;margin-top:1.5rem;">
                <a href="${bookingUrl}" style="display:inline-block;background:linear-gradient(135deg,#1d4ed8,#2563eb);color:white;padding:0.875rem 2rem;border-radius:10px;text-decoration:none;font-weight:700;font-size:1.05rem;">
                  📅 Foglalom ezt az időpontot →
                </a>
              </div>
              <p style="text-align:center;color:#9ca3af;font-size:0.75rem;margin-top:0.75rem;">A gombra kattintva az időpont előre ki lesz választva — csak az adataidat kell megadnod.</p>
            </div>
            <div style="background:#f8fafc;padding:1.25rem;text-align:center;border-top:1px solid #e5e7eb;">
              <p style="color:#9ca3af;font-size:0.75rem;margin:0;">Powered by CLERICITY</p>
            </div>
          </div>
        </body></html>
      `,
    })
    if (error) return NextResponse.json({ error }, { status: 400 })
    return NextResponse.json({ success: true, data })
  }

  // Munkás értesítő email
  if (type === 'staff_notification') {
    const nType = notificationType || 'new_booking'
    const icons: Record<string, string> = { new_booking: '🆕', cancel: '❌', reschedule: '🔄' }
    const labels: Record<string, string> = { new_booking: 'Új foglalás érkezett', cancel: 'Foglalás lemondva', reschedule: 'Foglalás átütemezve' }
    const colors: Record<string, string> = { new_booking: '#16a34a', cancel: '#dc2626', reschedule: '#2563eb' }
    const icon = icons[nType] || '📅'
    const label = labels[nType] || 'Foglalás értesítő'
    const color = colors[nType] || '#2563eb'

    const dateFormatted = date ? new Date(date + 'T12:00:00').toLocaleDateString('hu-HU', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' }) : ''

    const { data, error } = await resend.emails.send({
      from: `CLERICITY <onboarding@resend.dev>`,
      to: [to],
      subject: `${icon} ${label} — ${serviceName || ''} (${date || ''} ${slot || ''})`,
      html: `
        <!DOCTYPE html><html><head><meta charset="utf-8"></head>
        <body style="margin:0;padding:0;background:#f8fafc;font-family:'Segoe UI',sans-serif;">
          <div style="max-width:520px;margin:2rem auto;background:white;border-radius:16px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.08);">
            <div style="background:${color};padding:1.5rem 2rem;">
              <p style="color:white;font-size:0.8rem;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;margin:0 0 0.25rem;">${icon} ${label}</p>
              <h1 style="color:white;font-size:1.25rem;font-weight:800;margin:0;">${serviceName || ''}</h1>
            </div>
            <div style="padding:1.75rem 2rem;">
              <div style="background:#f8fafc;border-radius:10px;padding:1rem 1.25rem;margin-bottom:1rem;">
                <p style="font-size:0.7rem;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:0.06em;margin:0 0 0.625rem;">📅 Foglalás adatai</p>
                <p style="color:#111827;font-size:0.9rem;margin:0 0 0.3rem;"><strong>Dátum:</strong> ${dateFormatted}</p>
                <p style="color:#111827;font-size:0.9rem;margin:0 0 0.3rem;"><strong>Időpont:</strong> ${slot || ''}</p>
                <p style="color:#111827;font-size:0.9rem;margin:0;"><strong>Szolgáltatás:</strong> ${serviceName || ''}</p>
              </div>
              <div style="background:#f8fafc;border-radius:10px;padding:1rem 1.25rem;">
                <p style="font-size:0.7rem;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:0.06em;margin:0 0 0.625rem;">👤 Vendég adatai</p>
                <p style="color:#111827;font-size:0.9rem;margin:0 0 0.3rem;"><strong>Név:</strong> ${customerName || ''}</p>
                ${customerPhone ? `<p style="color:#111827;font-size:0.9rem;margin:0 0 0.3rem;"><strong>Telefon:</strong> ${customerPhone}</p>` : ''}
                ${customerEmail ? `<p style="color:#111827;font-size:0.9rem;margin:0;"><strong>Email:</strong> ${customerEmail}</p>` : ''}
              </div>
            </div>
            <div style="background:#f8fafc;padding:1rem 2rem;text-align:center;border-top:1px solid #e5e7eb;">
              <p style="color:#9ca3af;font-size:0.75rem;margin:0;">Powered by CLERICITY</p>
            </div>
          </div>
        </body></html>
      `,
    })
    if (error) return NextResponse.json({ error }, { status: 400 })
    return NextResponse.json({ success: true, data })
  }

  const defaultSubjects: Record<string, string> = {
    confirmation: '✅ Foglalás visszaigazolása — {businessName}',
    cancel:       '❌ Foglalás lemondva — {businessName}',
    reschedule:   '🔄 Foglalás átütemezve — {businessName}',
  }
  const defaultBodies: Record<string, string> = {
    confirmation: DEFAULT_EMAIL_BODY,
    cancel: `Kedves {customerName}!\n\nFoglalásod sikeresen lemondásra került.\n\n🗓 Szolgáltatás: {serviceName}\n📅 Dátum: {date}\n🕐 Időpont: {slot}\n\nReméljük hamarosan viszontlátjuk!\n\nÜdvözlettel,\n{businessName}`,
    reschedule: `Kedves {customerName}!\n\nFoglalásod sikeresen átütemezésre került.\n\n🗓 Szolgáltatás: {serviceName}\n📅 Új dátum: {date}\n🕐 Új időpont: {slot}\n\nHa kérdésed van, vedd fel velünk a kapcsolatot.\n\nÜdvözlettel,\n{businessName}`,
  }

  let subject = defaultSubjects[type]
  let fromName = 'CLERICITY'
  let bodyText = defaultBodies[type]

  if (tenantId) {
    const { data: tenant } = await supabaseAdmin
      .from('tenants')
      .select('email_subject, email_body, email_from_name, cancel_email_subject, cancel_email_body, reschedule_email_subject, reschedule_email_body')
      .eq('id', tenantId)
      .single()

    if (tenant) {
      if (tenant.email_from_name) fromName = tenant.email_from_name
      if (type === 'confirmation') {
        if (tenant.email_subject) subject = tenant.email_subject
        if (tenant.email_body) bodyText = tenant.email_body
      } else if (type === 'cancel') {
        if (tenant.cancel_email_subject) subject = tenant.cancel_email_subject
        if (tenant.cancel_email_body) bodyText = tenant.cancel_email_body
      } else if (type === 'reschedule') {
        if (tenant.reschedule_email_subject) subject = tenant.reschedule_email_subject
        if (tenant.reschedule_email_body) bodyText = tenant.reschedule_email_body
      }
    }
  }

  // Változók behelyettesítése
  const replacements: Record<string, string> = {
    '{customerName}': customerName,
    '{serviceName}': serviceName,
    '{date}': date,
    '{slot}': slot,
    '{businessName}': businessName,
  }

  let finalSubject = subject
  let finalBody = bodyText

  Object.entries(replacements).forEach(([key, value]) => {
    finalSubject = finalSubject.replaceAll(key, value)
    finalBody = finalBody.replaceAll(key, value)
  })

  // HTML generálás — ha már HTML, közvetlenül használjuk
  const bodyHtml = finalBody.trim().startsWith('<')
    ? finalBody
    : finalBody
        .split('\n')
        .map(line => line.trim() === '' ? '<br>' : `<p style="margin:0 0 0.5rem;color:#374151;font-size:0.875rem;line-height:1.6;">${line}</p>`)
        .join('')

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'

  // Munkás kártya (ha van munkás adat)
  const staffCardHtml = staffName ? `
    <div style="margin:1.25rem 0;background:#f8fafc;border-radius:10px;padding:1rem 1.25rem;display:flex;align-items:center;gap:0.875rem;border:1px solid #e5e7eb;">
      ${staffPhoto
        ? `<img src="${staffPhoto}" alt="${staffName}" width="48" height="48" style="border-radius:50%;object-fit:cover;border:2px solid #e5e7eb;flex-shrink:0;" />`
        : `<div style="width:48px;height:48px;border-radius:50%;background:#e5e7eb;display:flex;align-items:center;justify-content:center;font-size:1.375rem;flex-shrink:0;">👤</div>`
      }
      <div>
        <p style="font-size:0.7rem;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:0.06em;margin:0 0 0.25rem;">Munkatárs</p>
        <p style="color:#111827;font-weight:700;font-size:0.9rem;margin:0;">${staffName}</p>
      </div>
    </div>
  ` : ''

  // Naptár gombok (csak visszaigazolónál és átütemezésnél)
  const calendarHtml = (type === 'confirmation' || type === 'reschedule') && cancelToken && date && slot ? (() => {
    const durationMin = duration || 60
    const [h, m] = slot.split(':').map(Number)
    const endTotalMin = h * 60 + m + durationMin
    const endH = Math.floor(endTotalMin / 60) % 24
    const endM = endTotalMin % 60
    const gcalStart = `${date.replace(/-/g, '')}T${slot.replace(':', '')}00`
    const gcalEnd   = `${date.replace(/-/g, '')}T${endH.toString().padStart(2,'0')}${endM.toString().padStart(2,'0')}00`
    const gcalTitle = encodeURIComponent(`${serviceName} – ${businessName}`)
    const gcalUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${gcalTitle}&dates=${gcalStart}/${gcalEnd}&details=${encodeURIComponent(`Vendég: ${customerName}`)}`
    const icsUrl = `${siteUrl}/api/calendar/ics/${cancelToken}`
    return `
      <div style="margin:1.5rem 0;padding:1rem 1.25rem;background:#f8fafc;border-radius:10px;border:1px solid #e5e7eb;text-align:center;">
        <p style="color:#6b7280;font-size:0.78rem;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;margin:0 0 0.75rem;">📅 Mentsd el a naptáradba</p>
        <div style="display:flex;gap:0.625rem;justify-content:center;flex-wrap:wrap;">
          <a href="${gcalUrl}" target="_blank"
            style="display:inline-block;background:#4285f4;color:white;padding:0.5rem 1.125rem;border-radius:7px;text-decoration:none;font-weight:700;font-size:0.82rem;">
            Google Naptár
          </a>
          <a href="${icsUrl}"
            style="display:inline-block;background:#374151;color:white;padding:0.5rem 1.125rem;border-radius:7px;text-decoration:none;font-weight:700;font-size:0.82rem;">
            iCal / Outlook
          </a>
        </div>
      </div>
    `
  })() : ''

  const cancelHtml = cancelToken ? `
    <div style="text-align:center;margin:1.5rem 0;display:flex;gap:0.75rem;justify-content:center;flex-wrap:wrap;">
      <a href="${siteUrl}/reschedule/${cancelToken}"
        style="display:inline-block;background:#2563eb;color:white;padding:0.75rem 1.5rem;border-radius:8px;text-decoration:none;font-weight:700;font-size:0.9rem;">
        🔄 Átütemezés
      </a>
      <a href="${siteUrl}/cancel/${cancelToken}"
        style="display:inline-block;background:#ef4444;color:white;padding:0.75rem 1.5rem;border-radius:8px;text-decoration:none;font-weight:700;font-size:0.9rem;">
        ❌ Lemondás
      </a>
    </div>
  ` : ''

  const { data, error } = await resend.emails.send({
    from: `${fromName} <onboarding@resend.dev>`,
    to: [to],
    subject: finalSubject,
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

            <div style="padding:2rem;">
              ${bodyHtml}
              ${staffCardHtml}
              ${calendarHtml}
              ${cancelHtml}
            </div>

            <div style="background:#f8fafc;padding:1.5rem;text-align:center;border-top:1px solid #e5e7eb;">
              <p style="color:#9ca3af;font-size:0.8rem;margin:0;">
                Ez az email automatikusan lett küldve a <strong>${businessName}</strong> foglalási rendszeréből.
              </p>
              <p style="color:#9ca3af;font-size:0.75rem;margin:0.5rem 0 0;">Powered by CLERICITY</p>
            </div>
          </div>
        </body>
      </html>
    `,
  })

  if (error) {
    return NextResponse.json({ error }, { status: 400 })
  }

  return NextResponse.json({ success: true, data })
}