// Normalizes a string: lowercase, strip diacritics, collapse spaces
function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // á→a, ő→o, š→s, etc.
    .replace(/\s+/g, ' ')
    .trim()
}

// Blocked anywhere as a substring (specific enough to have no false positives)
const BLOCKED_ANYWHERE: string[] = [
  // Nazi leadership
  'hitler', 'himmler', 'goebbels', 'gobbels', 'goering', 'goring',
  'mengele', 'eichmann', 'heydrich', 'streicher', 'bormann',
  // Organizations
  'nsdap', 'gestapo',
  // Other dictators / terrorists
  'mussolini', 'binladen',
  // Slurs (EN)
  'nigger', 'nigga', 'faggot',
  // HU compound profanity
  'bazmeg', 'faszfej', 'gecis', 'rohadek',
  // SK compound profanity
  'pickat', 'jebat',
]

// Blocked as whole words only (to avoid false positives in compound names)
const BLOCKED_WORDS: string[] = [
  // Nazi / fascist terms
  'nazi', 'naci', 'nazista', 'nacista', 'heil',
  // EN profanity
  'fuck', 'shit', 'cunt', 'bitch', 'whore',
  // HU profanity
  'kurva', 'fasz', 'pina', 'segg', 'szar', 'geci', 'bazd', 'baszd',
  // SK profanity
  'kurva', 'picka', 'hovno', 'jebem',
  // Generic insults
  'idiot', 'idióta', 'debil', 'retard',
]

export function isNameBlocked(name: string): boolean {
  const n = normalize(name)

  for (const term of BLOCKED_ANYWHERE) {
    if (n.includes(term)) return true
  }

  const words = n.split(' ')
  for (const word of words) {
    if (BLOCKED_WORDS.includes(word)) return true
  }

  return false
}

// Check multiple name parts at once (first + last name combined)
export function areNamesBlocked(...names: string[]): boolean {
  for (const name of names) {
    if (name && isNameBlocked(name)) return true
  }
  // Also check combined (catches e.g. firstName="Adolf" lastName="Hitler")
  const combined = names.filter(Boolean).join(' ')
  if (isNameBlocked(combined)) return true
  return false
}
