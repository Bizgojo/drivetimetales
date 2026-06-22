import { doubleMetaphone } from 'double-metaphone'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

export type ResolvedNameKey = {
  pronunciationKey: string
  canonicalSpelling: string
  phoneticHint: string | null
}

const BUILT_IN_PRONUNCIATION_EXCEPTIONS: Record<string, ResolvedNameKey> = {
  sean: { pronunciationKey: 'XN', canonicalSpelling: 'Sean', phoneticHint: 'shawn' },
}

function titleCase(value: string) {
  const lower = value.toLowerCase()
  return lower.charAt(0).toUpperCase() + lower.slice(1)
}

export function normalizeName(raw: unknown): string | null {
  const firstToken = String(raw || '').trim().replace(/\s+/g, ' ').split(' ')[0] || ''
  const lettersOnly = firstToken.replace(/[^A-Za-z]/g, '')
  return lettersOnly || null
}

export async function resolveNameKey(raw: unknown): Promise<ResolvedNameKey | null> {
  const normalized = normalizeName(raw)
  if (!normalized) return null

  const inputSpelling = normalized.toLowerCase()
  const { data: override, error: overrideError } = await supabaseAdmin
    .from('name_overrides')
    .select('pronunciation_key,canonical_spelling,phonetic_hint')
    .eq('input_spelling', inputSpelling)
    .maybeSingle()

  if (overrideError) throw new Error(`name_overrides lookup failed: ${overrideError.message}`)
  if (override?.pronunciation_key) {
    return {
      pronunciationKey: String(override.pronunciation_key),
      canonicalSpelling: String(override.canonical_spelling || titleCase(normalized)),
      phoneticHint: override.phonetic_hint ? String(override.phonetic_hint) : null,
    }
  }

  const builtIn = BUILT_IN_PRONUNCIATION_EXCEPTIONS[inputSpelling]
  if (builtIn) return builtIn

  const [primary] = doubleMetaphone(normalized)
  if (!primary) return null
  return {
    pronunciationKey: primary,
    canonicalSpelling: titleCase(normalized),
    phoneticHint: null,
  }
}
