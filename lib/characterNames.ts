/**
 * CHARACTER-NAMES-001 (Marc 2026-10-30): "make sure characters use the same
 * voice throughout the story even when they are referred to with slightly
 * different names, i.e. John SMITH, Mr. SMITH or John."
 *
 * The series plan (SERIES-OUTLINE-001) fixes each character's ONE speaker
 * label and full name before any episode is written. This module turns that
 * into a name index (label, full name, name without title, first name, last
 * name, plan aliases → label) and uses it to:
 *   1. rewrite every speaker label and CHARACTER GUIDE entry in a fresh draft
 *      to the plan's label ("MR. SMITH:" → "SMITH:"), before any check runs;
 *   2. flag a NEW name that shares a name with a main character (would get a
 *      second voice) so the writer fixes it;
 *   3. give the roster every alias up front.
 * A name two characters share (Thomas and Amelia Raines → "RAINES") is never
 * used alone to match either of them.
 */

export type NamedCharacter = { label: string; name: string; aliases?: string[] }

const TITLES = new Set([
  'MR', 'MRS', 'MS', 'MISS', 'MISTER', 'DR', 'DOCTOR', 'PROF', 'PROFESSOR', 'SIR', 'MADAM', 'MA\'AM', 'LADY', 'LORD',
  'DETECTIVE', 'DET', 'OFFICER', 'SERGEANT', 'SGT', 'LIEUTENANT', 'LT', 'CAPTAIN', 'CAPT', 'COMMANDER', 'CHIEF', 'DEPUTY',
  'SHERIFF', 'AGENT', 'SPECIAL', 'INSPECTOR', 'MARSHAL', 'TROOPER', 'COLONEL', 'MAJOR', 'GENERAL', 'PRIVATE', 'CORPORAL',
  'ALDERMAN', 'ALDERWOMAN', 'MAYOR', 'SENATOR', 'GOVERNOR', 'JUDGE', 'JUSTICE', 'COUNCILMAN', 'COUNCILWOMAN', 'PRESIDENT',
  'FATHER', 'REVEREND', 'REV', 'PASTOR', 'SISTER', 'BROTHER', 'NURSE', 'COACH', 'UNCLE', 'AUNT', 'GRANDMA', 'GRANDPA',
])

/** Labels that are never characters. */
const NON_CHARACTER = new Set(['NARRATOR', 'BELLE B', 'BELLE', 'ANNOUNCER', 'SFX', 'MUSIC', 'TITLE', 'DESCRIPTION', 'NOTE', 'NOTES'])

export function normName(s: string): string {
  return String(s || '')
    .toUpperCase()
    .replace(/[“”"]/g, '')
    .replace(/[^A-Z0-9 '\-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function nameTokens(s: string): string[] {
  return normName(s).split(' ').filter((t) => t && !TITLES.has(t.replace(/\.$/, '')))
}

function withoutTitles(s: string): string {
  return nameTokens(s).join(' ')
}

export type NameIndex = { byName: Map<string, string>; ambiguous: Set<string>; labels: Set<string>; tokensByLabel: Map<string, Set<string>> }

/** Every way a character may be named → their label. Shared names are dropped. */
export function buildNameIndex(chars: NamedCharacter[]): NameIndex {
  const claims = new Map<string, Set<string>>()
  const claim = (key: string, label: string) => {
    const k = normName(key)
    if (!k) return
    if (!claims.has(k)) claims.set(k, new Set())
    claims.get(k)!.add(label)
  }
  const labels = new Set<string>()
  const tokensByLabel = new Map<string, Set<string>>()
  for (const c of chars) {
    const label = normName(c.label)
    if (!label) continue
    labels.add(label)
    const forms = [c.label, c.name, ...(c.aliases || [])]
    const toks = new Set<string>()
    for (const f of forms) {
      claim(f, label)
      claim(withoutTitles(f), label)
      const t = nameTokens(f)
      t.forEach((x) => toks.add(x))
      if (t.length > 1) {
        claim(t[0], label) // first name
        claim(t[t.length - 1], label) // last name
      }
    }
    tokensByLabel.set(label, toks)
  }
  const byName = new Map<string, string>()
  const ambiguous = new Set<string>()
  claims.forEach((owners, key) => {
    if (owners.size === 1) byName.set(key, Array.from(owners)[0])
    else ambiguous.add(key)
  })
  // A character's own label always maps to itself, even if another character shares that word.
  labels.forEach((l) => byName.set(l, l))
  return { byName, ambiguous, labels, tokensByLabel }
}

/** The plan label for a name, or null (unknown or shared). */
export function resolveCharacterName(index: NameIndex, name: string): string | null {
  const n = normName(name)
  if (!n) return null
  if (index.byName.has(n)) return index.byName.get(n)!
  const stripped = withoutTitles(n)
  if (stripped && index.byName.has(stripped)) return index.byName.get(stripped)!
  return null
}

/** Unknown name that shares a (non-shared) name word with a main character → that label. */
function sharesNameWith(index: NameIndex, name: string): string | null {
  const toks = nameTokens(name).filter((t) => t.length >= 3)
  for (const [label, own] of Array.from(index.tokensByLabel.entries())) {
    if (toks.some((t) => own.has(t) && !index.ambiguous.has(t))) return label
  }
  return null
}

/** All aliases (normalized, unambiguous) for one label, for the roster. */
export function aliasesForLabel(index: NameIndex, label: string): string[] {
  const l = normName(label)
  const out: string[] = []
  index.byName.forEach((owner, key) => {
    if (owner === l && key !== l) out.push(key)
  })
  return out.sort()
}

export type CanonicalizeResult = {
  script: string
  changes: Array<{ from: string; to: string }>
  /** New names that would get a second voice for a main character. */
  conflicts: Array<{ name: string; looksLike: string }>
}

/**
 * Rewrite speaker labels and CHARACTER GUIDE entries to the plan's labels.
 * Lines before [START AUDIO DRAMA SCRIPT] other than guide entries are left alone.
 */
export function canonicalizeCharacterNames(script: string, chars: NamedCharacter[]): CanonicalizeResult {
  const index = buildNameIndex(chars)
  const changes: CanonicalizeResult['changes'] = []
  const conflicts: CanonicalizeResult['conflicts'] = []
  const noteConflict = (name: string) => {
    const like = sharesNameWith(index, name)
    if (like && !conflicts.some((c) => c.name === name)) conflicts.push({ name, looksLike: like })
  }
  const lines = String(script || '').split('\n')
  let inGuide = false
  let inBody = false
  const guideSeen = new Set<string>()
  const out: string[] = []
  for (const line of lines) {
    if (/^\s*CHARACTER GUIDE\s*$/i.test(line)) { inGuide = true; out.push(line); continue }
    if (/\[START AUDIO DRAMA SCRIPT\]/i.test(line)) { inGuide = false; inBody = true; out.push(line); continue }
    if (inGuide && /^\s*(BELLE B ANNOUNCEMENT|BELLE B OUTRO)\b/i.test(line)) { inGuide = false; out.push(line); continue }

    if (inGuide) {
      const m = line.match(/^\s*([A-Za-z][A-Za-z .'\-]{0,60}?)\s*([—–:]|\s-\s)\s*(.*)$/)
      if (m && !/^-+$/.test(line.trim())) {
        const name = m[1].trim()
        const rest = m[3]
        const label = resolveCharacterName(index, name)
        if (label) {
          if (guideSeen.has(label)) { changes.push({ from: name, to: `${label} (duplicate guide entry removed)` }); continue }
          guideSeen.add(label)
          if (normName(name) !== label) {
            const fullName = chars.find((c) => normName(c.label) === label)?.name || name
            const restHasName = normName(rest).includes(withoutTitles(fullName))
            out.push(`${label} — ${restHasName ? '' : `${fullName}, `}${rest}`.replace(/,\s*$/, ''))
            changes.push({ from: name, to: label })
            continue
          }
        } else if (!NON_CHARACTER.has(normName(name))) {
          noteConflict(name)
        }
      }
      out.push(line)
      continue
    }

    if (inBody) {
      const m = line.match(/^([A-Z][A-Z .'\-]{0,60}?):(\s.*|)$/)
      if (m) {
        const raw = m[1].trim()
        const n = normName(raw)
        if (!NON_CHARACTER.has(n) && !index.labels.has(n)) {
          const label = resolveCharacterName(index, raw)
          if (label) {
            out.push(`${label}:${m[2]}`)
            if (!changes.some((c) => c.from === raw && c.to === label)) changes.push({ from: raw, to: label })
            continue
          }
          noteConflict(raw)
        }
      }
    }
    out.push(line)
  }
  return { script: out.join('\n'), changes, conflicts }
}

/** Writer feedback for conflicts. */
export function characterNameConflictDetails(conflicts: CanonicalizeResult['conflicts']): string[] {
  return conflicts.map((c) => `"${c.name}" is a new character who shares a name with ${c.looksLike}. If it is ${c.looksLike}, use the label ${c.looksLike}. If it is a different person, give them a name that shares no name with any main character.`)
}

/** Cast-review warning: two cast entries that look like the same person. */
export function possibleDuplicateCast(names: string[]): Array<[string, string]> {
  const pairs: Array<[string, string]> = []
  for (let i = 0; i < names.length; i += 1) {
    for (let j = i + 1; j < names.length; j += 1) {
      const a = nameTokens(names[i]).filter((t) => t.length >= 3)
      const b = nameTokens(names[j]).filter((t) => t.length >= 3)
      if (!a.length || !b.length) continue
      const aSubB = a.every((t) => b.includes(t))
      const bSubA = b.every((t) => a.includes(t))
      if (aSubB || bSubA) pairs.push([names[i], names[j]])
    }
  }
  return pairs
}
