'use client'

import { useEffect, useState, useRef, useCallback } from 'react'

const cleanPhone = (phone: string | null | undefined) => (phone || '').replace(/^'+/, '').trim()
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { useLanguage } from '@/hooks/useLanguage'
import { unzip } from 'fflate'

// ─── Types ───────────────────────────────────────────────────────────────────

interface Client {
  email: string
  first_name: string
  last_name: string
  phone: string
  booking_count: number
  last_booking: string       // utolsó múltbeli látogatás
  next_appointment?: string  // következő jövőbeli foglalás
  source?: 'import'
  import_source?: string
}

interface ImportedClient {
  id: string
  tenant_id: string
  first_name: string
  last_name: string
  email: string
  phone: string
  notes: string
  source: string
  imported_at: string
  last_visit?: string
  next_appointment?: string
}

// ─── CSV helpers ──────────────────────────────────────────────────────────────

function parseCSVLine(line: string): string[] {
  const cells: string[] = []
  let current = ''
  let inQuote = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuote && line[i + 1] === '"') { current += '"'; i++ }
      else inQuote = !inQuote
    } else if ((ch === ',' || ch === ';') && !inQuote) {
      cells.push(current.trim())
      current = ''
    } else {
      current += ch
    }
  }
  cells.push(current.trim())
  return cells
}

function parseCSV(text: string): { headers: string[]; rows: string[][] } {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim().split('\n')
  const headers = parseCSVLine(lines[0]).map(h => h.replace(/^﻿/, '').replace(/^["']|["']$/g, ''))
  const rows = lines.slice(1).map(l => parseCSVLine(l)).filter(r => r.some(c => c.trim()))
  return { headers, rows }
}

function findCol(headers: string[], candidates: string[]): number {
  const lower = headers.map(h => h.toLowerCase().trim())
  for (const c of candidates) {
    const idx = lower.findIndex(h => h === c || h.includes(c))
    if (idx !== -1) return idx
  }
  return -1
}

// ─── XLSX parser (fflate + DOMParser, no external xlsx lib needed) ────────────

function colLetterToIndex(letters: string): number {
  return letters.toUpperCase().split('').reduce((acc, ch) => acc * 26 + ch.charCodeAt(0) - 64, 0) - 1
}

async function parseXlsx(file: File): Promise<string[][]> {
  const buffer = await file.arrayBuffer()
  const uint8 = new Uint8Array(buffer)

  return new Promise((resolve, reject) => {
    unzip(uint8, (err, files) => {
      if (err) { reject(err); return }
      try {
        const dec = new TextDecoder('utf-8')

        // Case-insensitive file lookup
        const findFile = (end: string) => {
          const key = Object.keys(files).find(k => k.toLowerCase() === end.toLowerCase())
          return key ? files[key] : undefined
        }
        const findFileContaining = (sub: string) => {
          const key = Object.keys(files).find(k => k.toLowerCase().includes(sub.toLowerCase()))
          return key ? files[key] : undefined
        }

        // 1. Shared strings — try multiple possible paths
        const sharedStrings: string[] = []
        const ssFile = findFile('xl/sharedStrings.xml') || findFileContaining('sharedstrings.xml')
        if (ssFile) {
          const xml = dec.decode(ssFile)
          // Use regex to extract <t> content — avoids namespace issues with DOMParser
          const siMatches = xml.match(/<si[\s>][\s\S]*?<\/si>/gi) || []
          for (const si of siMatches) {
            const tMatches = si.match(/<t[^>]*>([\s\S]*?)<\/t>/gi) || []
            const text = tMatches.map(m => m.replace(/<[^>]+>/g, '')).join('')
            sharedStrings.push(text)
          }
        }

        // 2. Find first sheet path
        let sheetPath = 'xl/worksheets/sheet1.xml'
        const relsFile = findFile('xl/_rels/workbook.xml.rels')
        if (relsFile) {
          const relsXml = dec.decode(relsFile)
          const relMatch = relsXml.match(/Type="[^"]*worksheet[^"]*"[^>]*Target="([^"]+)"/i)
            || relsXml.match(/Target="([^"]*sheet[^"]*\.xml)"/i)
          if (relMatch) {
            const target = relMatch[1]
            sheetPath = target.startsWith('/') ? target.slice(1) : `xl/${target.replace(/^\.\.\//, '')}`
          }
        }

        // 3. Parse sheet with regex (avoids namespace issues)
        const sheetFile = findFile(sheetPath) || findFileContaining('sheet1.xml')
        if (!sheetFile) { reject(new Error('No sheet found in xlsx')); return }
        const sheetXml = dec.decode(sheetFile)

        const result: string[][] = []

        // Extract rows
        const rowMatches = sheetXml.match(/<row\b[^>]*>[\s\S]*?<\/row>/gi) || []
        for (const rowStr of rowMatches) {
          const rAttr = rowStr.match(/\br="(\d+)"/)
          const rowIdx = rAttr ? parseInt(rAttr[1]) - 1 : result.length
          while (result.length <= rowIdx) result.push([])
          const row = result[rowIdx]

          const cellMatches = rowStr.match(/<c\b[^>]*>[\s\S]*?<\/c>/gi) || []
          for (const cellStr of cellMatches) {
            const rMatch = cellStr.match(/\br="([A-Z]+)(\d+)"/)
            const tMatch = cellStr.match(/\bt="([^"]+)"/)
            const vMatch = cellStr.match(/<v[^>]*>([\s\S]*?)<\/v>/)
            const isMatch = cellStr.match(/<is[^>]*>[\s\S]*?<t[^>]*>([\s\S]*?)<\/t>/)

            if (!rMatch) continue
            const colIdx = colLetterToIndex(rMatch[1])
            while (row.length <= colIdx) row.push('')

            const t = tMatch?.[1] || ''
            const v = vMatch?.[1] ?? ''
            const isText = isMatch?.[1] ?? ''

            if (t === 's') {
              row[colIdx] = sharedStrings[parseInt(v)] ?? ''
            } else if (t === 'inlineStr' || t === 'str') {
              row[colIdx] = isText || v
            } else if (t === 'b') {
              row[colIdx] = v === '1' ? 'true' : 'false'
            } else {
              row[colIdx] = v
            }
          }
        }

        resolve(result.filter(row => row.some(c => c)))
      } catch (e) {
        reject(e)
      }
    })
  })
}

// ─────────────────────────────────────────────────────────────────────────────

const PLATFORM_SIGNATURES: Record<string, string[]> = {
  'Calendly':  ['invitee email', 'invitee name', 'start date'],
  'Bookio':    ['ügyfél neve', 'email cím', 'telefonszám'],
  'Salonic':   ['customer', 'mobile', 'appointment date'],
  'Freshea':   ['client name', 'appointment', 'service'],
  'SimplyBook':['client_name', 'client_email', 'service_name'],
}

function detectPlatform(headers: string[]): string {
  const lower = headers.map(h => h.toLowerCase())
  for (const [name, sigs] of Object.entries(PLATFORM_SIGNATURES)) {
    if (sigs.every(s => lower.some(h => h.includes(s)))) return name
  }
  return 'Általános'
}

function autoMap(headers: string[]) {
  return {
    email:            findCol(headers, ['email', 'e-mail', 'invitee email', 'email cím', 'client email', 'customer email']),
    full_name:        findCol(headers, ['invitee name', 'client name', 'customer', 'full name', 'name', 'ügyfél neve', 'név', 'teljes név']),
    first_name:       findCol(headers, ['first name', 'firstname', 'keresztnév', 'prénom', 'vorname']),
    last_name:        findCol(headers, ['last name', 'lastname', 'vezetéknév', 'nom', 'nachname']),
    phone:            findCol(headers, ['phone', 'telefon', 'mobile', 'telefonszám', 'tel', 'invitee phone number', 'phone number']),
    last_visit:       findCol(headers, ['last visit', 'utolsó látogatás', 'last appointment', 'utolsó időpont', 'last booking', 'last seen', 'utolsó foglalás']),
    next_appointment: findCol(headers, ['next appointment', 'következő időpont', 'next visit', 'upcoming appointment', 'következő foglalás', 'next booking']),
  }
}

// ─── ImportModal ─────────────────────────────────────────────────────────────

export function ImportModal({ tenantId, onClose, onImported }: {
  tenantId: string
  onClose: () => void
  onImported: (count: number) => void
}) {
  const [step, setStep] = useState<'upload' | 'map' | 'importing'>('upload')
  const [headers, setHeaders] = useState<string[]>([])
  const [rows, setRows] = useState<string[][]>([])
  const [platform, setPlatform] = useState('')
  const [fileName, setFileName] = useState('')
  const [mapping, setMapping] = useState({ email: -1, full_name: -1, first_name: -1, last_name: -1, phone: -1, last_visit: -1, next_appointment: -1 })
  const [progress, setProgress] = useState(0)
  const [done, setDone] = useState(false)
  const [importedCount, setImportedCount] = useState(0)
  const [skippedCount, setSkippedCount] = useState(0)
  const [error, setError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  const handleFile = async (file: File) => {
    setFileName(file.name)
    const ext = file.name.split('.').pop()?.toLowerCase()

    if (ext === 'xlsx' || ext === 'xls') {
      try {
        const data = await parseXlsx(file)
        if (!data.length) { setError('Az Excel fájl üres.'); return }

        // Find first row with ≥2 non-empty cells as headers
        let headerIdx = 0
        for (let i = 0; i < Math.min(data.length, 10); i++) {
          if (data[i].filter(c => c.trim()).length >= 2) { headerIdx = i; break }
        }

        const h = data[headerIdx].map(c => c.trim())
        const r = data.slice(headerIdx + 1)
          .map(row => {
            const padded = [...row]
            while (padded.length < h.length) padded.push('')
            return padded.map(c => c.trim())
          })
          .filter(row => row.some(c => c))
        setHeaders(h); setRows(r)
        setPlatform(detectPlatform(h))
        setMapping(Object.assign({ email: -1, full_name: -1, first_name: -1, last_name: -1, phone: -1, last_visit: -1, next_appointment: -1 }, autoMap(h)))
        setStep('map')
      } catch (err) {
        setError(`Nem sikerült olvasni az Excel fájlt: ${err instanceof Error ? err.message : 'ismeretlen hiba'}. Próbáld CSV formátumban menteni.`)
      }
    } else {
      const reader = new FileReader()
      reader.onload = e => {
        const text = e.target?.result as string
        const { headers: h, rows: r } = parseCSV(text)
        setHeaders(h); setRows(r)
        setPlatform(detectPlatform(h))
        setMapping(Object.assign({ email: -1, full_name: -1, first_name: -1, last_name: -1, phone: -1, last_visit: -1, next_appointment: -1 }, autoMap(h)))
        setStep('map')
      }
      reader.readAsText(file, 'UTF-8')
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file).catch(err => setError(String(err)))
  }

  const handleImport = async () => {
    if (mapping.email === -1) { setError('Az Email oszlop megadása kötelező!'); return }
    setStep('importing')
    setError('')
    let imported = 0

    try {
      const BATCH = 50
      for (let i = 0; i < rows.length; i += BATCH) {
        const batch = rows.slice(i, i + BATCH)
        const records = batch.map(row => {
          const email = (row[mapping.email] || '').toLowerCase().trim()
          if (!email || !email.includes('@')) return null

          let first = '', last = ''
          if (mapping.first_name !== -1) first = row[mapping.first_name]?.trim() || ''
          if (mapping.last_name !== -1) last = row[mapping.last_name]?.trim() || ''
          if (!first && !last && mapping.full_name !== -1) {
            const full = (row[mapping.full_name] || '').trim()
            const parts = full.split(' ')
            last = parts[0] || ''; first = parts.slice(1).join(' ') || ''
          }
          const phone = mapping.phone !== -1 ? (row[mapping.phone]?.trim() || '') : ''

          const record: Record<string, string> = {
            tenant_id: tenantId,
            email,
            first_name: first,
            last_name: last,
            phone,
            source: platform,
          }
          // Csak akkor küldjük, ha van érték (így ha nincs az oszlop, nem törik)
          const lv = mapping.last_visit !== -1 ? (row[mapping.last_visit]?.trim() || '') : ''
          const na = mapping.next_appointment !== -1 ? (row[mapping.next_appointment]?.trim() || '') : ''
          if (lv) record.last_visit = lv
          if (na) record.next_appointment = na

          return record
        }).filter(Boolean) as Record<string, string>[]

        if (records.length === 0) continue

        const { data: inserted, error: dbErr } = await supabase
          .from('imported_clients')
          .upsert(records, { onConflict: 'tenant_id,email', ignoreDuplicates: false })
          .select('id')

        if (dbErr) {
          setError(`Adatbázis hiba: ${dbErr.message}`)
          setDone(true)
          onImported(imported)
          return
        }
        imported += inserted?.length ?? records.length
        setProgress(Math.round(Math.min(100, ((i + BATCH) / rows.length) * 100)))
      }
    } catch (e) {
      setError(`Váratlan hiba: ${e instanceof Error ? e.message : String(e)}`)
    }

    setImportedCount(imported)
    setSkippedCount(Math.max(0, rows.length - imported))
    setDone(true)
    onImported(imported)
  }

  const emailOk = mapping.email !== -1
  const nameOk = mapping.full_name !== -1 || (mapping.first_name !== -1 && mapping.last_name !== -1)
  const colOptions = [
    { value: -1, label: '— nem importálom —' },
    ...headers.map((h, i) => ({ value: i, label: h || `(${i + 1}. oszlop)` }))
  ]
  const preview = rows.slice(0, 5)

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}>
      <div style={{ backgroundColor: 'white', borderRadius: '16px', width: '100%', maxWidth: '620px', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1.5rem', borderBottom: '1px solid #f3f4f6' }}>
          <div>
            <h2 style={{ fontSize: '1.1rem', fontWeight: '800', color: '#111827', margin: 0 }}>📥 Ügyfelek importálása</h2>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', fontSize: '1.5rem', lineHeight: 1 }}>×</button>
        </div>

        <div style={{ padding: '1.5rem' }}>

          {/* ── STEP 1: Upload ── */}
          {step === 'upload' && (
            <div>
              <div
                onDragOver={e => { e.preventDefault(); setDragging(true) }}
                onDragLeave={() => setDragging(false)}
                onDrop={handleDrop}
                onClick={() => fileRef.current?.click()}
                style={{ border: `2px dashed ${dragging ? '#2563eb' : '#d1d5db'}`, borderRadius: '12px', padding: '3rem 2rem', textAlign: 'center', cursor: 'pointer', backgroundColor: dragging ? '#eff6ff' : '#f9fafb', transition: 'all 0.15s' }}
              >
                <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>📂</div>
                <p style={{ fontWeight: '700', color: '#111827', marginBottom: '0.4rem' }}>Húzd ide a fájlt, vagy kattints a feltöltéshez</p>
                <div style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem', marginBottom: '0.4rem' }}>
                  <span style={{ fontSize: '0.78rem', fontWeight: '700', backgroundColor: '#dbeafe', color: '#1d4ed8', padding: '0.2rem 0.6rem', borderRadius: '6px' }}>.csv</span>
                  <span style={{ fontSize: '0.78rem', fontWeight: '700', backgroundColor: '#dcfce7', color: '#15803d', padding: '0.2rem 0.6rem', borderRadius: '6px' }}>.xlsx</span>
                  <span style={{ fontSize: '0.78rem', fontWeight: '700', backgroundColor: '#f3f4f6', color: '#6b7280', padding: '0.2rem 0.6rem', borderRadius: '6px' }}>.xls</span>
                </div>
                <p style={{ fontSize: '0.78rem', color: '#9ca3af' }}>A rendszer automatikusan felismeri a fájl típusát</p>
                <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls,.ods,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f).catch(err => setError(String(err))) }} />
              </div>

              {error && (
                <div style={{ marginTop: '1rem', backgroundColor: '#fee2e2', border: '1px solid #fca5a5', borderRadius: '8px', padding: '0.75rem 1rem' }}>
                  <p style={{ color: '#dc2626', fontSize: '0.85rem', margin: 0 }}>⚠️ {error}</p>
                </div>
              )}

              <div style={{ marginTop: '1.5rem' }}>
                <p style={{ fontSize: '0.75rem', fontWeight: '700', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.75rem' }}>Támogatott platformok</p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                  {['Calendly', 'Bookio', 'Salonic', 'Freshea', 'SimplyBook', 'Timify', 'Setmore', 'Acuity', 'Egyéb CSV'].map(p => (
                    <span key={p} style={{ fontSize: '0.8rem', padding: '0.3rem 0.75rem', backgroundColor: '#f3f4f6', borderRadius: '999px', color: '#374151', fontWeight: '500' }}>{p}</span>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── STEP 2: Map columns ── */}
          {step === 'map' && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', backgroundColor: '#eff6ff', padding: '0.75rem 1rem', borderRadius: '8px', marginBottom: '1.5rem' }}>
                <span style={{ fontSize: '1.25rem' }}>✅</span>
                <div>
                  <p style={{ fontWeight: '700', color: '#1d4ed8', margin: 0, fontSize: '0.9rem' }}>{fileName} — {rows.length} sor · {headers.filter(h => h).length} oszlop</p>
                  <p style={{ color: '#3b82f6', fontSize: '0.8rem', margin: 0 }}>Felismert platform: <strong>{platform}</strong></p>
                  {headers.filter(h => h).length > 0 && (
                    <p style={{ color: '#3b82f6', fontSize: '0.75rem', margin: '0.25rem 0 0' }}>
                      Oszlopok: {headers.filter(h => h).join(', ')}
                    </p>
                  )}
                </div>
              </div>

              <p style={{ fontSize: '0.875rem', fontWeight: '600', color: '#374151', marginBottom: '1rem' }}>Melyik CSV oszlop melyik mezőnek felel meg?</p>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1.5rem' }}>
                {[
                  { key: 'email', label: '📧 Email *', required: true },
                  { key: 'phone', label: '📞 Telefon', required: false },
                  { key: 'last_name', label: '👤 Vezetéknév', required: false },
                  { key: 'first_name', label: '👤 Keresztnév', required: false },
                  { key: 'full_name', label: '👤 Teljes név (ha nincs külön)', required: false },
                  { key: 'last_visit', label: '🕐 Utolsó látogatás (dátum)', required: false },
                  { key: 'next_appointment', label: '📅 Következő időpont (dátum)', required: false },
                ].map(field => (
                  <div key={field.key}>
                    <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: '600', color: '#374151', marginBottom: '0.3rem' }}>
                      {field.label}
                    </label>
                    <select
                      value={mapping[field.key as keyof typeof mapping]}
                      onChange={e => setMapping(m => ({ ...m, [field.key]: parseInt(e.target.value) }))}
                      style={{ width: '100%', border: `1px solid ${field.required && mapping[field.key as keyof typeof mapping] === -1 ? '#fca5a5' : '#d1d5db'}`, borderRadius: '8px', padding: '0.5rem 0.625rem', color: '#111827', outline: 'none', backgroundColor: 'white', fontSize: '0.8rem' }}
                    >
                      {colOptions.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                    </select>
                  </div>
                ))}
              </div>

              {/* Preview */}
              {preview.length > 0 && (
                <div style={{ marginBottom: '1.5rem' }}>
                  <p style={{ fontSize: '0.75rem', fontWeight: '700', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>Előnézet (első {preview.length} sor)</p>
                  <div style={{ overflowX: 'auto', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem' }}>
                      <thead>
                        <tr style={{ backgroundColor: '#f9fafb' }}>
                          {[mapping.email, mapping.last_name !== -1 ? mapping.last_name : mapping.full_name, mapping.phone]
                            .filter(i => i !== -1)
                            .map(i => (
                              <th key={i} style={{ padding: '0.5rem 0.75rem', textAlign: 'left', fontWeight: '700', color: '#374151', borderBottom: '1px solid #e5e7eb' }}>
                                {headers[i]}
                              </th>
                            ))}
                        </tr>
                      </thead>
                      <tbody>
                        {preview.map((row, ri) => (
                          <tr key={ri} style={{ borderBottom: ri < preview.length - 1 ? '1px solid #f3f4f6' : 'none' }}>
                            {[mapping.email, mapping.last_name !== -1 ? mapping.last_name : mapping.full_name, mapping.phone]
                              .filter(i => i !== -1)
                              .map(i => (
                                <td key={i} style={{ padding: '0.5rem 0.75rem', color: '#374151', maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {row[i] || '—'}
                                </td>
                              ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {error && <p style={{ color: '#ef4444', fontSize: '0.85rem', marginBottom: '1rem' }}>{error}</p>}
              {!emailOk && <p style={{ color: '#f59e0b', fontSize: '0.82rem', marginBottom: '1rem' }}>⚠️ Az Email oszlopot kötelező kiválasztani az importáláshoz.</p>}
              {emailOk && !nameOk && <p style={{ color: '#6b7280', fontSize: '0.8rem', marginBottom: '1rem' }}>💡 Tipp: ha nincs külön &bdquo;Teljes név&rdquo; oszlop, válaszd ki a Vezetéknevet és Keresztnevet.</p>}

              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <button onClick={handleImport} disabled={!emailOk}
                  style={{ flex: 1, backgroundColor: emailOk ? '#2563eb' : '#e5e7eb', color: emailOk ? 'white' : '#9ca3af', padding: '0.75rem', borderRadius: '10px', border: 'none', cursor: emailOk ? 'pointer' : 'not-allowed', fontWeight: '700', fontSize: '0.95rem' }}>
                  📥 {rows.length} ügyfél importálása
                </button>
                <button onClick={() => setStep('upload')}
                  style={{ backgroundColor: '#f3f4f6', color: '#374151', padding: '0.75rem 1.25rem', borderRadius: '10px', border: '1px solid #e5e7eb', cursor: 'pointer', fontWeight: '500' }}>
                  Vissza
                </button>
              </div>
            </div>
          )}

          {/* ── STEP 3: Importing / Done ── */}
          {step === 'importing' && (
            <div style={{ textAlign: 'center', padding: '2rem 1rem' }}>
              {!done ? (
                <>
                  <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>⏳</div>
                  <p style={{ fontWeight: '700', color: '#111827', marginBottom: '1rem' }}>Importálás folyamatban...</p>
                  <div style={{ backgroundColor: '#f3f4f6', borderRadius: '999px', height: '8px', overflow: 'hidden', marginBottom: '0.5rem' }}>
                    <div style={{ height: '100%', backgroundColor: '#2563eb', width: `${progress}%`, transition: 'width 0.3s', borderRadius: '999px' }} />
                  </div>
                  <p style={{ fontSize: '0.8rem', color: '#6b7280' }}>{progress}%</p>
                </>
              ) : (
                <>
                  <div style={{ width: '64px', height: '64px', borderRadius: '50%', backgroundColor: error ? '#fee2e2' : '#dcfce7', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem', fontSize: '2rem' }}>{error ? '❌' : '✅'}</div>
                  <h3 style={{ fontSize: '1.25rem', fontWeight: '800', color: '#111827', marginBottom: '0.5rem' }}>{error ? 'Hiba történt' : 'Importálás kész!'}</h3>
                  {error ? (
                    <div style={{ backgroundColor: '#fee2e2', border: '1px solid #fca5a5', borderRadius: '10px', padding: '1rem', marginBottom: '1.5rem', textAlign: 'left' }}>
                      <p style={{ color: '#dc2626', fontSize: '0.875rem', margin: 0, wordBreak: 'break-word' }}>{error}</p>
                      <p style={{ color: '#6b7280', fontSize: '0.78rem', marginTop: '0.5rem', marginBottom: 0 }}>
                        Ellenőrizd, hogy az <strong>imported_clients</strong> tábla létezik-e Supabase-ben, és futtattad-e a szükséges SQL parancsokat.
                      </p>
                    </div>
                  ) : (
                    <p style={{ color: '#6b7280', marginBottom: '1.5rem', lineHeight: 1.6 }}>
                      <strong style={{ color: '#16a34a' }}>{importedCount}</strong> ügyfél sikeresen importálva
                      {skippedCount > 0 && <>, <strong>{skippedCount}</strong> frissítve/kihagyva</>}.
                    </p>
                  )}
                  <button onClick={onClose}
                    style={{ backgroundColor: '#2563eb', color: 'white', padding: '0.75rem 2rem', borderRadius: '10px', border: 'none', cursor: 'pointer', fontWeight: '700' }}>
                    Bezárás
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── ClientsPage ──────────────────────────────────────────────────────────────

export default function ClientsPage() {
  const router = useRouter()
  const { t } = useLanguage()
  const [tenantId, setTenantId] = useState<string | null>(null)
  const [ownerStaffId, setOwnerStaffId] = useState<string | null>(null)
  const [clients, setClients] = useState<Client[]>([])
  const [importedClients, setImportedClients] = useState<Client[]>([])
  const [filtered, setFiltered] = useState<Client[]>([])
  const [blacklistedEmails, setBlacklistedEmails] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showImport, setShowImport] = useState(false)

  const loadImportedClients = useCallback(async (tid: string) => {
    const { data } = await supabase
      .from('imported_clients')
      .select('*')
      .eq('tenant_id', tid)
      .order('last_visit', { ascending: false, nullsFirst: false })
    return (data || []).map((c: ImportedClient) => ({
      email: c.email,
      first_name: c.first_name || '',
      last_name: c.last_name || '',
      phone: c.phone || '',
      booking_count: 0,
      last_booking: c.last_visit || c.imported_at,
      next_appointment: c.next_appointment || undefined,
      source: 'import' as const,
      import_source: c.source,
    }))
  }, [])

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/auth'); return }

      const { data: profile } = await supabase
        .from('profiles').select('tenant_id').eq('id', user.id).single()
      if (!profile?.tenant_id) return
      setTenantId(profile.tenant_id)

      const { data: ownerStaff } = await supabase
        .from('staff').select('id').eq('tenant_id', profile.tenant_id).eq('is_owner', true).single()

      if (ownerStaff?.id) {
        setOwnerStaffId(ownerStaff.id)
        const { data: bl } = await supabase.from('staff_blacklist').select('email').eq('staff_id', ownerStaff.id)
        setBlacklistedEmails(new Set((bl || []).map((b: { email: string }) => b.email.toLowerCase())))
      }

      let query = supabase
        .from('bookings')
        .select('customer_first_name, customer_last_name, customer_email, customer_phone, start_time')
        .eq('tenant_id', profile.tenant_id)
        .order('start_time', { ascending: false })
      if (ownerStaff?.id) query = query.eq('staff_id', ownerStaff.id)

      const { data: bookings } = await query
      const bookingClients = deduplicate(bookings || [])
      setClients(bookingClients)

      const imported = await loadImportedClients(profile.tenant_id)
      setImportedClients(imported)
      setLoading(false)
    }
    load()
  }, [router, loadImportedClients])

  // Lejárt next_appointment → last_visit frissítés (importált ügyfelek)
  const cleanupPastAppointments = useCallback(async (tid: string) => {
    const now = new Date().toISOString()
    const { data: past } = await supabase
      .from('imported_clients')
      .select('id, next_appointment, last_visit')
      .eq('tenant_id', tid)
      .not('next_appointment', 'is', null)
      .lt('next_appointment', now)
    if (!past || past.length === 0) return false
    for (const c of past) {
      const newLastVisit = !c.last_visit || new Date(c.next_appointment) > new Date(c.last_visit)
        ? c.next_appointment : c.last_visit
      await supabase.from('imported_clients')
        .update({ last_visit: newLastVisit, next_appointment: null })
        .eq('id', c.id)
    }
    return true
  }, [])

  // Booking ügyfelek next_appointment → last_booking ha lejárt
  const cleanupClientsState = useCallback(() => {
    const now = new Date()
    setClients(prev => prev.map(c => {
      if (c.next_appointment && new Date(c.next_appointment) < now) {
        return {
          ...c,
          last_booking: !c.last_booking || new Date(c.next_appointment) > new Date(c.last_booking)
            ? c.next_appointment : c.last_booking,
          next_appointment: undefined,
        }
      }
      return c
    }))
  }, [])

  // Percenkénti ellenőrzés
  useEffect(() => {
    if (!tenantId) return
    const run = async () => {
      cleanupClientsState()
      const changed = await cleanupPastAppointments(tenantId)
      if (changed) {
        const updated = await loadImportedClients(tenantId)
        setImportedClients(updated)
      }
    }
    run()
    const interval = setInterval(run, 60 * 1000)
    return () => clearInterval(interval)
  }, [tenantId, cleanupPastAppointments, cleanupClientsState, loadImportedClients])

  // Realtime: új foglalás érkezésekor azonnal frissíti a kliens listát
  useEffect(() => {
    if (!tenantId) return
    const channel = supabase
      .channel(`clients-bookings-${tenantId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'bookings', filter: `tenant_id=eq.${tenantId}` },
        (payload) => {
          const b = payload.new as { customer_email: string; customer_first_name: string; customer_last_name: string; customer_phone: string; start_time: string; status: string }
          const email = b.customer_email?.toLowerCase()
          if (!email) return
          const isFuture = new Date(b.start_time) > new Date()
          const isConfirmed = !b.status || b.status === 'confirmed'
          setClients(prev => {
            const idx = prev.findIndex(c => c.email.toLowerCase() === email)
            if (idx !== -1) {
              return prev.map((c, i) => {
                if (i !== idx) return c
                return {
                  ...c,
                  booking_count: c.booking_count + 1,
                  next_appointment: isFuture && isConfirmed && (!c.next_appointment || new Date(b.start_time) < new Date(c.next_appointment)) ? b.start_time : c.next_appointment,
                  last_booking: !isFuture && isConfirmed && (!c.last_booking || new Date(b.start_time) > new Date(c.last_booking)) ? b.start_time : c.last_booking,
                }
              })
            }
            return [...prev, {
              email,
              first_name: b.customer_first_name || '',
              last_name: b.customer_last_name || '',
              phone: b.customer_phone || '',
              booking_count: 1,
              last_booking: !isFuture && isConfirmed ? b.start_time : '',
              next_appointment: isFuture && isConfirmed ? b.start_time : undefined,
            }]
          })
        })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [tenantId])

  // Merge booking + imported clients, sorted by last_booking desc
  const merged = (() => {
    const bookingEmails = new Set(clients.map(c => c.email.toLowerCase()))
    const uniqueImported = importedClients.filter(c => !bookingEmails.has(c.email.toLowerCase()))
    return [...clients, ...uniqueImported].sort((a, b) =>
      new Date(b.last_booking || 0).getTime() - new Date(a.last_booking || 0).getTime()
    )
  })()

  useEffect(() => {
    const compute = () => {
      const q = search.toLowerCase()
      setFiltered(q ? merged.filter(c =>
        c.email.includes(q) ||
        c.first_name.toLowerCase().includes(q) ||
        c.last_name.toLowerCase().includes(q) ||
        (c.phone || '').includes(q)
      ) : merged)
    }
    compute()
  }, [search, clients, importedClients]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleImported = async () => {
    if (!tenantId) return
    const imported = await loadImportedClients(tenantId)
    setImportedClients(imported)
  }

  const handleDeleteOne = async (email: string) => {
    if (!tenantId) return
    await supabase.from('imported_clients').delete().eq('tenant_id', tenantId).eq('email', email)
    setImportedClients(prev => prev.filter(c => c.email !== email))
    if (ownerStaffId) {
      await supabase.from('staff_blacklist').delete().eq('staff_id', ownerStaffId).eq('email', email.toLowerCase())
      setBlacklistedEmails(prev => { const s = new Set(prev); s.delete(email.toLowerCase()); return s })
    }
  }

  const handleBlacklistOne = async (email: string, name: string, phone?: string): Promise<string | null> => {
    if (!tenantId) return 'Nincs tenant azonosító.'
    let staffId = ownerStaffId
    if (!staffId) {
      const { data: owner, error: ownerErr } = await supabase.from('staff').select('id').eq('tenant_id', tenantId).eq('is_owner', true).single()
      if (ownerErr || !owner) return `Staff nem található: ${ownerErr?.message || 'ismeretlen hiba'}`
      staffId = owner.id
      setOwnerStaffId(staffId)
    }
    const { error } = await supabase.from('staff_blacklist')
      .insert({ staff_id: staffId, tenant_id: tenantId, email: email.toLowerCase(), phone: phone?.trim() || null, reason: `Tiltólistára helyezve: ${name}` })
    if (error && error.code !== '23505') return error.message
    setBlacklistedEmails(prev => new Set([...prev, email.toLowerCase()]))
    return null
  }

  const handleDeleteSelected = async (emails: string[]) => {
    if (!tenantId) return
    // Csak az importált ügyfeleket töröljük (foglalásból deriváltak nem törölhetők)
    const toDelete = emails.filter(e => importedClients.some(c => c.email.toLowerCase() === e.toLowerCase()))
    if (toDelete.length === 0) return
    await supabase.from('imported_clients').delete().eq('tenant_id', tenantId).in('email', toDelete)
    const updated = await loadImportedClients(tenantId)
    setImportedClients(updated)
  }

  const exportCSV = () => {
    const header = 'Vezetéknév,Keresztnév,Email,Telefon,Forrás'
    const rows = filtered.map(c =>
      `"${c.last_name}","${c.first_name}","${c.email}","${c.phone || ''}","${c.source === 'import' ? c.import_source || 'Import' : 'Foglalás'}"`
    )
    const blob = new Blob(['﻿' + [header, ...rows].join('\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `ugyfelek_${new Date().toISOString().slice(0, 10)}.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  if (loading) return <p style={{ color: '#6b7280' }}>{t.dash.loading}</p>

  return (
    <>
      <ClientList
        title={`👥 ${t.dash.tab_clients}`}
        clients={merged}
        filtered={filtered}
        search={search}
        setSearch={setSearch}
        exportCSV={exportCSV}
        onImportClick={() => setShowImport(true)}
        onDeleteSelected={handleDeleteSelected}
        onDeleteOne={handleDeleteOne}
        onBlacklistOne={handleBlacklistOne}
        blacklistedEmails={blacklistedEmails}
        tenantId={tenantId || undefined}
      />
      {showImport && tenantId && (
        <ImportModal
          tenantId={tenantId}
          onClose={() => setShowImport(false)}
          onImported={handleImported}
        />
      )}
    </>
  )
}

function deduplicate(bookings: { customer_first_name: string; customer_last_name: string; customer_email: string; customer_phone: string; start_time: string; status?: string }[]): Client[] {
  const now = new Date()
  const map = new Map<string, Client>()
  for (const b of bookings) {
    const email = b.customer_email?.toLowerCase() || ''
    if (!email) continue
    const confirmed = !b.status || b.status === 'confirmed'
    const future = new Date(b.start_time) > now
    if (!map.has(email)) {
      map.set(email, { email, first_name: b.customer_first_name || '', last_name: b.customer_last_name || '', phone: b.customer_phone || '', booking_count: 1, last_booking: (!future && confirmed) ? b.start_time : '', next_appointment: (future && confirmed) ? b.start_time : undefined })
    } else {
      const c = map.get(email)!
      c.booking_count++
      if (confirmed && !future) {
        if (!c.last_booking || new Date(b.start_time) > new Date(c.last_booking)) c.last_booking = b.start_time
      }
      if (confirmed && future) {
        if (!c.next_appointment || new Date(b.start_time) < new Date(c.next_appointment)) c.next_appointment = b.start_time
      }
    }
  }
  return Array.from(map.values()).sort((a, b) => new Date(b.last_booking || 0).getTime() - new Date(a.last_booking || 0).getTime())
}

// ─── ClientList (exported, used in bookings/page.tsx too) ────────────────────

export function ClientList({ filtered, search, setSearch, exportCSV, onImportClick, onDeleteOne, onBlacklistOne, blacklistedEmails, hideSearch, tenantId }: {
  title: string
  clients: Client[]
  filtered: Client[]
  search: string
  setSearch: (v: string) => void
  exportCSV: () => void
  onImportClick?: () => void
  onDeleteSelected?: (emails: string[]) => void
  onDeleteOne?: (email: string) => Promise<void>
  onBlacklistOne?: (email: string, name: string, phone?: string) => Promise<string | null>
  blacklistedEmails?: Set<string>
  hideSearch?: boolean
  tenantId?: string
  lang?: string
}) {
  const { lang, t } = useLanguage()
  const dateLocale = lang === 'en' ? 'en-US' : lang === 'sk' ? 'sk-SK' : 'hu-HU'
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [isMobile, setIsMobile] = useState(false)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [reminderModal, setReminderModal] = useState(false)
  const [reminderCutoff, setReminderCutoff] = useState('')
  const [reminderSending, setReminderSending] = useState(false)
  const [reminderResult, setReminderResult] = useState<{ sent: number; failed: string[] } | null>(null)

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 680)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  const handleBulkBlacklist = async () => {
    if (!onBlacklistOne || selected.size === 0) return
    setActionLoading('__bl__')
    setActionError(null)
    for (const email of Array.from(selected)) {
      const client = filtered.find(c => c.email === email)
      const name = client ? `${client.last_name} ${client.first_name}`.trim() : email
      const err = await onBlacklistOne(email, name, client?.phone || undefined)
      if (err) { setActionError(`Hiba (${email}): ${err}`); setActionLoading(null); return }
    }
    setSelected(new Set())
    setActionLoading(null)
  }

  const executeDelete = async () => {
    if (!onDeleteOne || selected.size === 0) return
    setDeleteConfirmOpen(false)
    setActionLoading('__del__')
    const importedEmails = Array.from(selected).filter(e => filtered.find(c => c.email === e)?.source === 'import')
    for (const email of importedEmails) await onDeleteOne(email)
    setSelected(new Set())
    setActionLoading(null)
  }

  const handleBulkDelete = () => {
    if (!onDeleteOne || selected.size === 0) return
    setDeleteConfirmOpen(true)
  }

  const toggleOne = (email: string) =>
    setSelected(prev => { const s = new Set(prev); if (s.has(email)) s.delete(email); else s.add(email); return s })

  const toggleAll = () =>
    setSelected(prev => prev.size === filtered.length ? new Set() : new Set(filtered.map(c => c.email)))

  const allSelected = filtered.length > 0 && selected.size === filtered.length
  const someSelected = selected.size > 0

  const qualifyingClients = reminderCutoff
    ? filtered.filter(c => !c.last_booking || new Date(c.last_booking) < new Date(reminderCutoff + 'T23:59:59'))
    : filtered

  const handleSelectClients = () => {
    setSelected(new Set(qualifyingClients.map(c => c.email)))
    setReminderModal(false)
    setReminderCutoff('')
  }

  const handleSelectAndSend = async () => {
    if (!tenantId || qualifyingClients.length === 0) return
    setReminderSending(true)
    setReminderResult(null)
    setSelected(new Set(qualifyingClients.map(c => c.email)))
    const res = await fetch('/api/email/send-reminder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tenantId,
        clients: qualifyingClients.map(c => ({
          email: c.email,
          name: `${c.last_name} ${c.first_name}`.trim() || c.email,
        })),
      }),
    })
    const data = await res.json()
    setReminderResult({ sent: data.sent || 0, failed: data.failed || [] })
    setReminderSending(false)
  }

  return (
    <>
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '0.5rem' }}>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
          {tenantId && (
            <button onClick={() => { setReminderModal(true); setReminderResult(null); setReminderCutoff('') }}
              style={{ backgroundColor: 'white', color: '#374151', padding: '0.625rem 1.25rem', borderRadius: '8px', border: '1px solid #e5e7eb', cursor: 'pointer', fontWeight: '600', fontSize: '0.875rem' }}>
              📧 Emlékeztető küldése
            </button>
          )}
          {onImportClick && (
            <button onClick={onImportClick}
              style={{ backgroundColor: '#eff6ff', color: '#2563eb', padding: '0.625rem 1.25rem', borderRadius: '8px', border: '2px solid #bfdbfe', cursor: 'pointer', fontWeight: '600', fontSize: '0.875rem' }}>
              📥 Ügyfelek importálása
            </button>
          )}
          <button onClick={exportCSV} disabled={filtered.length === 0}
            style={{ backgroundColor: '#16a34a', color: 'white', padding: '0.625rem 1.25rem', borderRadius: '8px', border: 'none', cursor: 'pointer', fontWeight: '600', fontSize: '0.875rem', opacity: filtered.length === 0 ? 0.5 : 1 }}>
            {t.dash.export_excel} ({filtered.length})
          </button>
        </div>
      </div>

      {!hideSearch && (
        <div style={{ marginBottom: someSelected ? '0.75rem' : '1.25rem', maxWidth: isMobile ? '100%' : '400px' }}>
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder={t.dash.search_ph}
            style={{ width: '100%', border: '1px solid #d1d5db', borderRadius: '8px', padding: '0.625rem 1rem', color: '#111827', outline: 'none', boxSizing: 'border-box', fontSize: '0.875rem' }} />
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', flexWrap: 'wrap', marginBottom: '1rem', backgroundColor: someSelected ? '#eff6ff' : '#f9fafb', border: `1px solid ${someSelected ? '#bfdbfe' : '#e5e7eb'}`, borderRadius: '10px', padding: '0.625rem 1rem', transition: 'background 0.15s, border-color 0.15s' }}>
        <span style={{ fontSize: '0.82rem', fontWeight: '600', color: someSelected ? '#1d4ed8' : '#9ca3af' }}>
          {someSelected ? `${selected.size} ügyfél kiválasztva` : 'Jelölj ki ügyfeleket a műveletekhez'}
        </span>
        {onBlacklistOne && (
          <button
            onClick={handleBulkBlacklist}
            disabled={!someSelected || actionLoading === '__bl__'}
            style={{ backgroundColor: '#fef3c7', color: '#92400e', padding: '0.4rem 0.875rem', borderRadius: '7px', border: '1px solid #fde68a', cursor: (!someSelected || actionLoading === '__bl__') ? 'not-allowed' : 'pointer', fontWeight: '600', fontSize: '0.8rem', opacity: (!someSelected || actionLoading === '__bl__') ? 0.45 : 1 }}>
            🚫 {actionLoading === '__bl__' ? 'Folyamatban...' : 'Tiltólistára'}
          </button>
        )}
        {onDeleteOne && (
          <button
            onClick={handleBulkDelete}
            disabled={!someSelected || actionLoading === '__del__'}
            style={{ backgroundColor: '#fee2e2', color: '#dc2626', padding: '0.4rem 0.875rem', borderRadius: '7px', border: '1px solid #fca5a5', cursor: (!someSelected || actionLoading === '__del__') ? 'not-allowed' : 'pointer', fontWeight: '600', fontSize: '0.8rem', opacity: (!someSelected || actionLoading === '__del__') ? 0.45 : 1 }}>
            🗑️ {actionLoading === '__del__' ? 'Törlés...' : 'Törlés'}
          </button>
        )}
        {someSelected && (
          <button
            onClick={() => { setSelected(new Set()); setActionError(null) }}
            style={{ background: 'none', border: 'none', color: '#6b7280', fontSize: '0.8rem', cursor: 'pointer', padding: '0.4rem 0.5rem', marginLeft: 'auto' }}>
            ✕ Mégse
          </button>
        )}
      </div>
      {actionError && (
        <div style={{ marginBottom: '1rem', backgroundColor: '#fee2e2', border: '1px solid #fca5a5', borderRadius: '8px', padding: '0.625rem 1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '0.82rem', color: '#dc2626' }}>⚠️ {actionError}</span>
          <button onClick={() => setActionError(null)} style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', fontSize: '1rem', padding: '0 0.25rem' }}>×</button>
        </div>
      )}

      {filtered.length === 0 ? (
        <div style={{ backgroundColor: 'white', padding: '3rem', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', textAlign: 'center', color: '#9ca3af' }}>
          {t.dash.no_results}
        </div>
      ) : isMobile ? (
        /* ── MOBIL: kártya nézet ── */
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {filtered.map(client => {
            const isSelected = selected.has(client.email)
            const isBlacklisted = blacklistedEmails?.has(client.email.toLowerCase()) ?? false
            return (
              <div key={client.email}
                style={{ backgroundColor: isSelected ? '#eff6ff' : isBlacklisted ? '#fff5f5' : 'white', borderRadius: '12px', padding: '0.875rem 1rem', boxShadow: '0 1px 3px rgba(0,0,0,0.08)', border: `2px solid ${isSelected ? '#2563eb' : isBlacklisted ? '#fca5a5' : 'transparent'}`, display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
                <input type="checkbox" checked={isSelected} onChange={() => toggleOne(client.email)}
                  style={{ width: '16px', height: '16px', marginTop: '2px', cursor: 'pointer', accentColor: '#2563eb', flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  {/* Név + badge */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '0.2rem' }}>
                    <span style={{ fontWeight: '700', color: isBlacklisted ? '#dc2626' : '#111827', fontSize: '0.9rem' }}>{client.last_name} {client.first_name}</span>
                    {isBlacklisted && (
                      <span style={{ fontSize: '0.6rem', fontWeight: '700', color: '#dc2626', backgroundColor: '#fee2e2', padding: '0.1rem 0.4rem', borderRadius: '999px' }}>🚫 Tiltólista</span>
                    )}
                    {client.source === 'import' && client.import_source && client.import_source !== 'Általános' && (
                      <span style={{ fontSize: '0.6rem', fontWeight: '700', color: '#7c3aed', backgroundColor: '#ede9fe', padding: '0.1rem 0.4rem', borderRadius: '999px' }}>{client.import_source}</span>
                    )}
                  </div>
                  {/* Email */}
                  <p style={{ fontSize: '0.78rem', margin: '0 0 0.3rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    <a href={`mailto:${client.email}`} style={{ color: '#2563eb', textDecoration: 'none' }} title="Email küldése">📧 {client.email}</a>
                  </p>
                  {/* Telefon */}
                  {client.phone && <p style={{ fontSize: '0.78rem', margin: '0 0 0.3rem' }}>
                    <a href={`tel:${cleanPhone(client.phone)}`} style={{ color: '#2563eb', textDecoration: 'none' }} title="Hívás">📞 {cleanPhone(client.phone)}</a>
                  </p>}
                  {/* Dátumok */}
                  <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginTop: '0.25rem' }}>
                    {client.last_booking && (
                      <span style={{ fontSize: '0.72rem', color: '#9ca3af' }}>
                        🕐 {new Date(client.last_booking).toLocaleDateString(dateLocale, { year: 'numeric', month: 'short', day: 'numeric' })}
                      </span>
                    )}
                    {client.next_appointment && (
                      <span style={{ fontSize: '0.72rem', fontWeight: '700', color: '#15803d', backgroundColor: '#dcfce7', padding: '0.1rem 0.45rem', borderRadius: '999px' }}>
                        📅 {new Date(client.next_appointment).toLocaleDateString(dateLocale, { month: 'short', day: 'numeric' })}
                        {' · '}
                        {new Date(client.next_appointment).toLocaleTimeString(dateLocale, { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div style={{ backgroundColor: 'white', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', overflow: 'hidden' }}>
          {/* Egyetlen grid — fejléc + összes sor együtt → törés nélküli függőleges vonalak */}
          <div style={{ display: 'grid', gridTemplateColumns: '32px 2.5fr 1.2fr 0.85fr 1.1fr' }}>

            {/* ── Fejléc cellák ── */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0.6rem 0', backgroundColor: '#f9fafb', borderBottom: '2px solid #e5e7eb', borderRight: '1px solid #e5e7eb' }}>
              <input type="checkbox" checked={allSelected} onChange={toggleAll} style={{ width: '14px', height: '14px', cursor: 'pointer', accentColor: '#2563eb' }} />
            </div>
            {[
              `${t.dash.col_guest} / ${t.dash.col_email}`,
              t.dash.col_phone,
              '🕐 Utolsó látogatás',
              '📅 Következő időpont',
            ].map((h, idx, arr) => (
              <div key={h + idx} style={{ padding: '0.6rem 0.875rem', backgroundColor: '#f9fafb', borderBottom: '2px solid #e5e7eb', borderRight: idx < arr.length - 1 ? '1px solid #e5e7eb' : 'none' }}>
                <p style={{ fontSize: '0.68rem', fontWeight: '700', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0, whiteSpace: 'nowrap' }}>{h}</p>
              </div>
            ))}

            {/* ── Adatsorok cellái ── */}
            {filtered.map((client, i) => {
              const isLast = i === filtered.length - 1
              const isSelected = selected.has(client.email)
              const isBlacklisted = blacklistedEmails?.has(client.email.toLowerCase()) ?? false
              const bg = isSelected ? '#eff6ff' : isBlacklisted ? '#fff5f5' : 'white'
              const hBorder = isLast ? 'none' : '1px solid #e5e7eb'
              const vBorder = '1px solid #e5e7eb'

              return [
                /* Checkbox */
                <div key={`cb-${client.email}`} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: bg, borderBottom: hBorder, borderRight: vBorder }}>
                  <input type="checkbox" checked={isSelected} onChange={() => toggleOne(client.email)} style={{ width: '14px', height: '14px', cursor: 'pointer', accentColor: '#2563eb' }} />
                </div>,

                /* Vendég + email */
                <div key={`name-${client.email}`} style={{ padding: '0.55rem 0.875rem', backgroundColor: bg, borderBottom: hBorder, borderRight: vBorder }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    <span style={{ fontWeight: '600', color: isBlacklisted ? '#dc2626' : '#111827', fontSize: '0.85rem', whiteSpace: 'nowrap' }}>
                      {client.last_name} {client.first_name}
                    </span>
                    {isBlacklisted && (
                      <span style={{ fontSize: '0.56rem', fontWeight: '700', color: '#dc2626', backgroundColor: '#fee2e2', padding: '0.1rem 0.35rem', borderRadius: '999px', flexShrink: 0 }}>🚫 Tiltólista</span>
                    )}
                    {client.source === 'import' && client.import_source && client.import_source !== 'Általános' && (
                      <span style={{ fontSize: '0.58rem', fontWeight: '700', color: '#7c3aed', backgroundColor: '#ede9fe', padding: '0.1rem 0.35rem', borderRadius: '999px', flexShrink: 0 }}>{client.import_source}</span>
                    )}
                  </div>
                  <a href={`mailto:${client.email}`} style={{ color: '#2563eb', textDecoration: 'none', fontSize: '0.72rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }} title="Email küldése">{client.email}</a>
                </div>,

                /* Telefon */
                <div key={`ph-${client.email}`} style={{ padding: '0.55rem 0.875rem', backgroundColor: bg, borderBottom: hBorder, borderRight: vBorder, display: 'flex', alignItems: 'center' }}>
                  {client.phone
                    ? <a href={`tel:${cleanPhone(client.phone)}`} style={{ color: '#2563eb', textDecoration: 'none', fontSize: '0.8rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }} title="Hívás">{cleanPhone(client.phone)}</a>
                    : <p style={{ color: '#d1d5db', margin: 0, fontSize: '0.8rem' }}>—</p>
                  }
                </div>,

                /* Utolsó látogatás */
                <div key={`lv-${client.email}`} style={{ padding: '0.55rem 0.875rem', backgroundColor: bg, borderBottom: hBorder, borderRight: vBorder, display: 'flex', alignItems: 'center' }}>
                  <p style={{ color: '#6b7280', margin: 0, fontSize: '0.75rem', whiteSpace: 'nowrap' }}>
                    {client.last_booking
                      ? new Date(client.last_booking).toLocaleDateString(dateLocale, { year: 'numeric', month: 'short', day: 'numeric' })
                      : <span style={{ color: '#e5e7eb' }}>—</span>}
                  </p>
                </div>,

                /* Következő időpont */
                <div key={`na-${client.email}`} style={{ padding: '0.55rem 0.875rem', backgroundColor: bg, borderBottom: hBorder, display: 'flex', alignItems: 'center' }}>
                  {client.next_appointment
                    ? <span style={{ backgroundColor: '#dcfce7', color: '#15803d', fontSize: '0.72rem', fontWeight: '700', padding: '0.15rem 0.45rem', borderRadius: '999px', whiteSpace: 'nowrap' }}>
                        {new Date(client.next_appointment).toLocaleDateString(dateLocale, { month: 'short', day: 'numeric' })}
                        {' · '}
                        {new Date(client.next_appointment).toLocaleTimeString(dateLocale, { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    : <span style={{ color: '#e5e7eb', fontSize: '0.75rem' }}>—</span>
                  }
                </div>,

              ]
            })}
          </div>
        </div>
      )}
    </div>

      {reminderModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}>
          <div style={{ backgroundColor: 'white', borderRadius: '16px', padding: '2rem', maxWidth: '460px', width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>
            {!reminderResult ? (
              <>
                <h3 style={{ fontSize: '1.1rem', fontWeight: '800', color: '#111827', marginBottom: '0.375rem' }}>📧 Emlékeztető küldése</h3>
                <p style={{ fontSize: '0.82rem', color: '#6b7280', marginBottom: '1.25rem', lineHeight: 1.5 }}>
                  Válassz dátumot — azok az ügyfelek lesznek kijelölve akik azóta nem jártak.
                </p>

                <div style={{ marginBottom: '1.25rem' }}>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '600', color: '#374151', marginBottom: '0.4rem' }}>
                    Akik nem jártak azóta:
                  </label>
                  <input type="date" value={reminderCutoff} onChange={e => setReminderCutoff(e.target.value)}
                    style={{ width: '100%', border: '1px solid #d1d5db', borderRadius: '8px', padding: '0.5rem 0.875rem', color: '#111827', outline: 'none', boxSizing: 'border-box', fontSize: '0.875rem' }} />
                  <p style={{ fontSize: '0.75rem', color: '#9ca3af', marginTop: '0.3rem' }}>Ha üresen hagyod, az összes jelenlegi ügyfél.</p>
                </div>

                <div style={{ backgroundColor: reminderCutoff && qualifyingClients.length === 0 ? '#fee2e2' : '#eff6ff', border: `1px solid ${reminderCutoff && qualifyingClients.length === 0 ? '#fca5a5' : '#bfdbfe'}`, borderRadius: '10px', padding: '0.875rem 1rem', marginBottom: '1.5rem' }}>
                  <p style={{ fontSize: '0.875rem', fontWeight: '700', color: reminderCutoff && qualifyingClients.length === 0 ? '#dc2626' : '#1d4ed8', margin: 0 }}>
                    {reminderCutoff && qualifyingClients.length === 0
                      ? '⚠️ Nincs ügyfél aki megfelel a feltételnek.'
                      : `👥 ${qualifyingClients.length} ügyfél lesz kijelölve`}
                  </p>
                  {reminderCutoff && qualifyingClients.length > 0 && filtered.length > qualifyingClients.length && (
                    <p style={{ fontSize: '0.78rem', color: '#3b82f6', marginTop: '0.25rem', marginBottom: 0 }}>
                      ({filtered.length - qualifyingClients.length} ügyfél kizárva, mert újabban járt)
                    </p>
                  )}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
                  <button onClick={handleSelectClients} disabled={qualifyingClients.length === 0}
                    style={{ backgroundColor: qualifyingClients.length === 0 ? '#e5e7eb' : '#eff6ff', color: qualifyingClients.length === 0 ? '#9ca3af' : '#2563eb', padding: '0.7rem', borderRadius: '10px', border: `1px solid ${qualifyingClients.length === 0 ? '#e5e7eb' : '#bfdbfe'}`, cursor: qualifyingClients.length === 0 ? 'not-allowed' : 'pointer', fontWeight: '700', fontSize: '0.875rem' }}>
                    ✅ Csak kijelölés ({qualifyingClients.length})
                  </button>
                  <button onClick={handleSelectAndSend} disabled={reminderSending || qualifyingClients.length === 0}
                    style={{ backgroundColor: qualifyingClients.length === 0 ? '#e5e7eb' : '#2563eb', color: qualifyingClients.length === 0 ? '#9ca3af' : 'white', padding: '0.7rem', borderRadius: '10px', border: 'none', cursor: qualifyingClients.length === 0 ? 'not-allowed' : 'pointer', fontWeight: '700', fontSize: '0.875rem', opacity: reminderSending ? 0.6 : 1 }}>
                    {reminderSending ? '📤 Küldés...' : `📧 Kijelölés + emlékeztető küldése (${qualifyingClients.length})`}
                  </button>
                  <button onClick={() => { setReminderModal(false); setReminderCutoff(''); setReminderResult(null) }}
                    style={{ backgroundColor: '#f3f4f6', color: '#374151', padding: '0.65rem', borderRadius: '10px', border: '1px solid #e5e7eb', cursor: 'pointer', fontWeight: '600', fontSize: '0.875rem' }}>
                    Mégse
                  </button>
                </div>
              </>
            ) : (
              <>
                <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
                  <div style={{ fontSize: '3rem', marginBottom: '0.75rem' }}>{reminderResult.failed.length === 0 ? '✅' : '⚠️'}</div>
                  <h3 style={{ fontSize: '1.1rem', fontWeight: '800', color: '#111827', marginBottom: '0.5rem' }}>
                    {reminderResult.failed.length === 0 ? 'Email sikeresen elküldve!' : 'Küldés részben sikeres'}
                  </h3>
                  <p style={{ fontSize: '0.875rem', color: '#6b7280', lineHeight: 1.6 }}>
                    <strong style={{ color: '#16a34a' }}>{reminderResult.sent}</strong> email sikeresen elküldve
                    {reminderResult.failed.length > 0 && <>, <strong style={{ color: '#dc2626' }}>{reminderResult.failed.length}</strong> sikertelen</>}.
                  </p>
                </div>
                <button onClick={() => { setReminderModal(false); setReminderCutoff(''); setReminderResult(null) }}
                  style={{ width: '100%', backgroundColor: '#2563eb', color: 'white', padding: '0.75rem', borderRadius: '10px', border: 'none', cursor: 'pointer', fontWeight: '700' }}>
                  Bezárás
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {deleteConfirmOpen && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}>
          <div style={{ backgroundColor: 'white', borderRadius: '16px', padding: '2rem', maxWidth: '400px', width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.25)', textAlign: 'center' }}>
            <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>🗑️</div>
            <h3 style={{ fontSize: '1.1rem', fontWeight: '800', color: '#111827', marginBottom: '0.5rem' }}>Biztosan törlöd?</h3>
            <p style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '1.5rem', lineHeight: 1.6 }}>
              {selected.size} ügyfél törlése végleges és nem visszavonható.
            </p>
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
              <button onClick={() => setDeleteConfirmOpen(false)}
                style={{ flex: 1, backgroundColor: '#f3f4f6', color: '#374151', padding: '0.75rem', borderRadius: '10px', border: '1px solid #e5e7eb', cursor: 'pointer', fontWeight: '600', fontSize: '0.9rem' }}>
                Mégse
              </button>
              <button disabled={actionLoading === '__del__'} onClick={executeDelete}
                style={{ flex: 1, backgroundColor: '#dc2626', color: 'white', padding: '0.75rem', borderRadius: '10px', border: 'none', cursor: actionLoading === '__del__' ? 'not-allowed' : 'pointer', fontWeight: '700', fontSize: '0.9rem', opacity: actionLoading === '__del__' ? 0.6 : 1 }}>
                {actionLoading === '__del__' ? 'Törlés...' : 'Igen, törlöm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
