// Strip HTML tags and XSS-dangerous characters from user-supplied text
export function sanitizeText(value: unknown, maxLength = 500): string {
  if (typeof value !== 'string') return ''
  return value
    .replace(/<[^>]*>/g, '')
    .replace(/[<>"'`]/g, '')
    .trim()
    .slice(0, maxLength)
}

// Returns normalized email or null if invalid
export function sanitizeEmail(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const cleaned = value.toLowerCase().trim().slice(0, 254)
  return /^[^\s@,<>]+@[^\s@,<>]+\.[^\s@,<>]+$/.test(cleaned) ? cleaned : null
}

// Returns cleaned phone (digits, +, -, spaces, parens) or null if too short/invalid
export function sanitizePhone(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const cleaned = value.replace(/[^\d+\-()\s]/g, '').trim().slice(0, 30)
  return cleaned.replace(/\D/g, '').length >= 5 ? cleaned : null
}

// UUID v4 format check
export function isValidUUID(value: unknown): boolean {
  if (typeof value !== 'string') return false
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
}

// YYYY-MM-DD
export function isValidDate(value: unknown): boolean {
  if (typeof value !== 'string') return false
  return /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/.test(value)
}

// HH:MM
export function isValidTime(value: unknown): boolean {
  if (typeof value !== 'string') return false
  return /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)
}

// Escape characters that would break PostgREST .or() filter string
// Prevents filter injection via email/phone in .or(`email.eq.${value}`)
export function safeFilterValue(value: string): string {
  return value.replace(/[,()\\]/g, '')
}
