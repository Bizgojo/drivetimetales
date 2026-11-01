/**
 * PORTRAITS-001 (Marc 2026-11-01): every pen-name author and narrator gets a
 * photo. These are invented people, so the prompt never names the real author
 * an ET author writes like, and always says the person is fictional.
 */
export type PortraitSubject = {
  kind: 'author' | 'narrator'
  name: string
  gender?: string | null
  age?: string | null
  bio?: string | null
  genre?: string | null
  accent?: string | null
  tone?: string | null
}

export function genderFromBio(bio: string | null | undefined): string | null {
  const t = ` ${String(bio || '').toLowerCase()} `
  const he = (t.match(/\b(he|his|him)\b/g) || []).length
  const she = (t.match(/\b(she|her|hers)\b/g) || []).length
  if (he > she) return 'man'
  if (she > he) return 'woman'
  return null
}

export function ageFromBirthYear(birthYear: number | null | undefined, now = new Date()): string | null {
  const y = Number(birthYear)
  if (!Number.isFinite(y) || y < 1900) return null
  const age = now.getFullYear() - y
  if (age < 18 || age > 100) return null
  return `about ${Math.round(age / 5) * 5} years old`
}

function genderWord(g: string | null | undefined): string {
  const s = String(g || '').toLowerCase()
  if (/^(f|female|woman)/.test(s)) return 'woman'
  if (/^(m|male|man)/.test(s)) return 'man'
  return 'person'
}

export function slugForPortrait(name: string): string {
  return String(name || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'portrait'
}

export function buildPortraitPrompt(s: PortraitSubject): string {
  const who = genderWord(s.gender)
  const age = s.age ? `, ${s.age}` : ''
  const role = s.kind === 'author' ? `a fiction author${s.genre ? ` who writes ${s.genre}` : ''}` : 'an audiobook narrator'
  const mood = s.kind === 'author'
    ? 'thoughtful, approachable expression'
    : `warm, friendly expression${s.tone ? `, with a ${String(s.tone).toLowerCase()} presence` : ''}`
  return [
    `Realistic professional headshot photograph of an invented ${who}${age}, ${role}.`,
    `Head and shoulders, ${mood}, looking at the camera.`,
    'Soft natural window light, shallow depth of field, plain warm neutral background, 85mm portrait lens, natural skin texture, tasteful everyday clothing.',
    'This is a fictional person: do not resemble any real, famous, or historical individual. No text, no logos, no watermark, no props in hand.',
  ].join(' ')
}
