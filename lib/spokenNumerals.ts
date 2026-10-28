/**
 * NUMERAL-AUTOFIX-001 (job 707e3808, 2026-10-28): EP5 of "The Saturday Repair
 * Shop" failed the writer self-check after 3 drafts on two digit numerals
 * ("07", "19") although the feedback quoted the lines. Rewriting a whole
 * episode to spell two numbers is waste, so simple spoken numerals are now
 * spelled out deterministically before the self-check:
 *   - clock times h:mm (1–12) → "seven nineteen", "ten o'clock", "nine oh five"
 *   - zero-led pairs "07" → "oh seven"
 *   - whole numbers 0–999 → words ("19" → "nineteen")
 * Only story-body speaker lines are touched; BELLE lines (Episode N passthrough),
 * [bracketed] cues, decimals, money, percentages, grouped thousands, and
 * 4-digit numbers (years stay digits by rule YEAR-DIGITS-001) are left alone,
 * so anything else still reaches the self-check and its rewrite feedback.
 */
const ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen']
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety']

export function integerToWords(n: number): string {
  if (!Number.isInteger(n) || n < 0 || n > 999) throw new Error(`integerToWords: out of range ${n}`)
  if (n < 20) return ONES[n]
  if (n < 100) return TENS[Math.floor(n / 10)] + (n % 10 ? '-' + ONES[n % 10] : '')
  const rest = n % 100
  return ONES[Math.floor(n / 100)] + ' hundred' + (rest ? ' ' + integerToWords(rest) : '')
}

function minutesWords(mm: number): string {
  if (mm === 0) return "o'clock"
  if (mm < 10) return 'oh ' + ONES[mm]
  return integerToWords(mm)
}

/** Spell simple numerals in one spoken text fragment (no brackets inside). */
export function spellSimpleNumerals(text: string): string {
  return text
    // clock times: 7:19, 10:00, 9:05 (hours 1–12), not part of a longer number
    .replace(/(?<![\d$]|\d[.,:])\b(1[0-2]|0?[1-9]):([0-5]\d)\b(?!\d|[.,:]\d|[%°])/g, (_m, h, mm) => `${integerToWords(Number(h))} ${minutesWords(Number(mm))}`)
    // zero-led pair: "07" → "oh seven"
    .replace(/(?<![\d$'’]|\d[.,:])\b0([1-9])\b(?!\d|[.,:]\d|[%°])/g, (_m, d) => `oh ${ONES[Number(d)]}`)
    // whole numbers 0–999, standalone (not decimals, money, %, °, grouped, or glued to letters)
    .replace(/(?<![\d$£€'’\w-]|\d[.,:])(\d{1,3})(?!\d|[.,:]\d|[%°\w])/g, (m, d) => (d.length > 1 && d.startsWith('0') ? m : integerToWords(Number(d))))
}

const BODY_START = '[START AUDIO DRAMA SCRIPT]'

export function spellOutSpokenNumerals(script: string): { script: string; changes: number } {
  const lines = script.split('\n')
  const startIdx = lines.findIndex((l) => l.includes(BODY_START))
  if (startIdx === -1) return { script, changes: 0 }
  let changes = 0
  for (let i = startIdx + 1; i < lines.length; i++) {
    const m = lines[i].match(/^(\s*([A-Z][A-Z .'()-]{0,40}):)(.*)$/)
    if (!m || /^BELLE\b/.test(m[2].trim()) || m[2].trim() === 'SFX') continue
    // only outside [bracketed] cues
    const body = m[3].split(/(\[[^\]]*\])/).map((part) => (part.startsWith('[') ? part : spellSimpleNumerals(part))).join('')
    if (body !== m[3]) {
      lines[i] = m[1] + body
      changes++
    }
  }
  return { script: lines.join('\n'), changes }
}
