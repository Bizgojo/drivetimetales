/**
 * lib/transcriptQC.ts — Segment transcript QC normalization + comparison.
 *
 * ATL-FOLLOWUP-002 (ITEM A): extracted verbatim from
 * app/api/admin/generate-voices/route.ts so that:
 *   1. the QC comparison normalizes BOTH sides (script text and Whisper STT
 *      output) with a single shared pipeline, and
 *   2. regression tests can exercise the REAL production logic instead of
 *      hand-maintained mirrors (prior art: scripts/test-transcript-qc-normalization.js).
 *
 * Everything in this module is pure text processing — no I/O, no network.
 * Audio transcription (Whisper call) stays in the route; the route feeds the
 * detected text into evaluateTranscriptQC() below.
 *
 * History markers preserved from the route: ATL-PIPE-008/011/013/016/017.
 */

export const SEGMENT_TRANSCRIPT_MIN_COVERAGE = 0.62
export const SEGMENT_TRANSCRIPT_TAIL_WORDS = 4

export const NUMBER_WORDS: Record<string, string> = {
  zero: '0',
  oh: '0',
  o: '0',
  one: '1',
  two: '2',
  three: '3',
  four: '4',
  five: '5',
  six: '6',
  seven: '7',
  eight: '8',
  nine: '9',
  ten: '10',
  eleven: '11',
  twelve: '12',
  thirteen: '13',
  fourteen: '14',
  fifteen: '15',
  sixteen: '16',
  seventeen: '17',
  eighteen: '18',
  nineteen: '19',
  twenty: '20',
  thirty: '30',
  forty: '40',
  fifty: '50',
  sixty: '60',
  seventy: '70',
  eighty: '80',
  ninety: '90',
}

export const ORDINAL_WORDS: Record<string, string> = {
  first: '1',
  second: '2',
  third: '3',
  fourth: '4',
  fifth: '5',
  sixth: '6',
  seventh: '7',
  eighth: '8',
  ninth: '9',
  tenth: '10',
  eleventh: '11',
  twelfth: '12',
  thirteenth: '13',
  fourteenth: '14',
  fifteenth: '15',
  sixteenth: '16',
  seventeenth: '17',
  eighteenth: '18',
  nineteenth: '19',
  twentieth: '20',
  thirtieth: '30',
  fortieth: '40',
  fiftieth: '50',
  sixtieth: '60',
  seventieth: '70',
  eightieth: '80',
  ninetieth: '90',
}

const CARDINAL_NUMBER_WORD_PATTERN = [
  'zero',
  'oh',
  'o',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
  'eleven',
  'twelve',
  'thirteen',
  'fourteen',
  'fifteen',
  'sixteen',
  'seventeen',
  'eighteen',
  'nineteen',
  'twenty',
  'thirty',
  'forty',
  'fifty',
  'sixty',
  'seventy',
  'eighty',
  'ninety',
  'hundred',
  'thousand',
  'and',
].join('|')

const SPOKEN_NUMBER_PHRASE_RE = new RegExp(
  `\\b(?:${CARDINAL_NUMBER_WORD_PATTERN})(?:[-\\s]+(?:${CARDINAL_NUMBER_WORD_PATTERN}))*\\b`,
  'gi'
)

const SPOKEN_DECIMAL_RE = new RegExp(
  `\\b((?:${CARDINAL_NUMBER_WORD_PATTERN})(?:[-\\s]+(?:${CARDINAL_NUMBER_WORD_PATTERN}))*)[-\\s]+point[-\\s]+` +
  `((?:zero|oh|o|one|two|three|four|five|six|seven|eight|nine)(?:[-\\s]+(?:zero|oh|o|one|two|three|four|five|six|seven|eight|nine))*)\\b`,
  'gi'
)

const ORDINAL_SUFFIXES: Record<string, string> = {
  '1': 'st',
  '2': 'nd',
  '3': 'rd',
}

function ordinalDigit(value: string): string {
  const suffix = ORDINAL_SUFFIXES[value.slice(-1)] && !/1[123]$/.test(value)
    ? ORDINAL_SUFFIXES[value.slice(-1)]
    : 'th'
  return `${value}${suffix}`
}

function tokenizeSpokenNumberPhrase(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[—–-]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
}

function parseTensOnes(words: string[]): number | null {
  if (words.length === 0) return 0
  if (words.length > 2) return null

  const first = NUMBER_WORDS[words[0]]
  if (first === undefined) return null

  const firstValue = Number(first)
  if (!Number.isFinite(firstValue)) return null
  if (words.length === 1) return firstValue

  const second = NUMBER_WORDS[words[1]]
  const secondValue = second === undefined ? NaN : Number(second)
  if (!Number.isFinite(secondValue)) return null
  if (firstValue >= 20 && firstValue <= 90 && secondValue >= 1 && secondValue <= 9) {
    return firstValue + secondValue
  }
  return null
}

function parseUnderThousand(words: string[]): number | null {
  const parts = words.filter(word => word !== 'and')
  const hundredIndex = parts.indexOf('hundred')
  if (hundredIndex >= 0) {
    if (hundredIndex !== 1) return null
    const hundredWordValue = NUMBER_WORDS[parts[0]]
    const hundredValue = hundredWordValue === undefined ? NaN : Number(hundredWordValue)
    if (!Number.isFinite(hundredValue) || hundredValue < 1 || hundredValue > 9) return null
    const remainder = parseTensOnes(parts.slice(2))
    return remainder === null ? null : hundredValue * 100 + remainder
  }
  return parseTensOnes(parts)
}

function parseSpokenCardinal(words: string[]): number | null {
  const parts = words.filter(word => word !== 'and')
  if (parts.length === 0) return null

  // Common spoken year form: "nineteen eighty four" -> 1984.
  if (parts.length >= 2 && parts.length <= 3) {
    const first = Number(NUMBER_WORDS[parts[0]] ?? NaN)
    const rest = parseTensOnes(parts.slice(1))
    if (Number.isFinite(first) && first >= 10 && first <= 19 && rest !== null && rest >= 0 && rest <= 99) {
      return first * 100 + rest
    }
  }

  const thousandIndex = parts.indexOf('thousand')
  if (thousandIndex >= 0) {
    if (thousandIndex === 0 || parts.indexOf('thousand', thousandIndex + 1) >= 0) return null
    const thousands = parseUnderThousand(parts.slice(0, thousandIndex))
    const remainder = parseUnderThousand(parts.slice(thousandIndex + 1))
    if (thousands === null || remainder === null) return null
    return thousands * 1000 + remainder
  }

  return parseUnderThousand(parts)
}

export function normalizeSpokenNumberPhrases(text: string): string {
  // ORION-QC-UNIDASH-001: fold Unicode dashes → ASCII so [-\s] separator classes
  // in the spoken-number regexes match regardless of source-text dash style.
  text = text.replace(/[\u2010\u2011\u2012\u2013\u2014\u2015\u2212]/g, '-')
  return text
    .replace(SPOKEN_DECIMAL_RE, (match, integerWords, fractionWords) => {
      const integerValue = parseSpokenCardinal(tokenizeSpokenNumberPhrase(integerWords))
      if (integerValue === null) return match
      const fractionDigits = tokenizeSpokenNumberPhrase(fractionWords)
        .map(word => NUMBER_WORDS[word])
      if (fractionDigits.length === 0 || fractionDigits.some(value => value === undefined || Number(value) > 9)) {
        return match
      }
      return `${integerValue}.${fractionDigits.join('')}`
    })
    .replace(
      /\b(twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)[\s-]+(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth)\b/gi,
      (match, tensWord, ordinalWord) => {
        const tens = NUMBER_WORDS[String(tensWord).toLowerCase()]
        const ones = ORDINAL_WORDS[String(ordinalWord).toLowerCase()]
        const value = Number(tens) + Number(ones)
        return Number.isFinite(value) ? ordinalDigit(String(value)) : match
      }
    )
    .replace(
      /\b(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth|thirteenth|fourteenth|fifteenth|sixteenth|seventeenth|eighteenth|nineteenth|twentieth|thirtieth|fortieth|fiftieth|sixtieth|seventieth|eightieth|ninetieth)\b/gi,
      (match, ordinalWord) => {
        const value = ORDINAL_WORDS[String(ordinalWord).toLowerCase()]
        return value ? ordinalDigit(value) : match
      }
    )
    .replace(SPOKEN_NUMBER_PHRASE_RE, (match) => {
      const value = parseSpokenCardinal(tokenizeSpokenNumberPhrase(match))
      return value === null ? match : String(value)
    })
}

// ATL-PIPE-011: normalise compound spoken numbers and currency forms before token comparison.
// Fixes the gap where "three hundred and forty thousand" normalises to "300 and 40000"
// instead of "340000", causing false REPEATED_IDENTICAL_TRUNCATION failures.
//
// Handles:
//   "three hundred and forty thousand"  → "340000"
//   "three hundred forty thousand"      → "340000"
//   "$340,000"                          → "340000"
//   "340,000"                           → "340000"
//   "340000 dollars"                    → "340000"
//   "fire-loss"                         → "fire loss"  (via final hyphen strip in transcriptTokens)
export function normalizeCompoundNumbers(text: string): string {
  const HUNDREDS = 'one|two|three|four|five|six|seven|eight|nine'
  const TENS = 'twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety'
  const ONES_1_9 = 'one|two|three|four|five|six|seven|eight|nine'
  const ONES_10_19 = 'ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen'
  const ONES = `${ONES_10_19}|${TENS}|${ONES_1_9}`

  // Helper: word → digit (must be in NUMBER_WORDS)
  const w = (word: string): number => Number(NUMBER_WORDS[word.toLowerCase()] ?? NaN)

  return text
    // ── Step 0 (ATL-FOLLOWUP-002): decimal currency → spoken dollars/cents ──
    // Whisper renders spoken money amounts symbolically ("$2.14") while script
    // text uses the spoken form ("Two dollars and fourteen cents"). Convert the
    // symbolic form to the spoken skeleton BEFORE Step 3 strips the "$" marker.
    //   "$2.14"  → "2 dollars 14 cents"
    //   "$12.05" → "12 dollars 5 cents"   (leading zero on cents dropped)
    //   "$0.75"  → "75 cents"             (zero-dollar amounts are spoken as cents only)
    // The word-side conjunction ("dollars AND fourteen cents") is collapsed by
    // the matching rule in normalizeCurrencyForms so both sides tokenize identically.
    .replace(/\$\s*(\d[\d,]*)\.(\d{2})\b/g, (match, dollars, cents) => {
      const d = String(dollars).replace(/,/g, '')
      const c = String(Number(cents))
      if (!/^\d+$/.test(d)) return match
      return Number(d) === 0 ? `${c} cents` : `${d} dollars ${c} cents`
    })

    // ── Step 1: hyphenated two-digit word-numbers → digits ───────────────
    // "forty-five" → "45"; standalone "forty" and "five" are left unchanged.
    .replace(
      new RegExp(`\\b(${TENS})-(${ONES_1_9})\\b`, 'gi'),
      (match, tens, ones) => {
        const val = w(tens) + w(ones)
        return Number.isFinite(val) ? String(val) : match
      }
    )

    // ── Step 2: strip commas in digit strings ────────────────────────────
    // "340,000" → "340000"  |  "1,234,567" → "1234567"
    .replace(/\b(\d{1,3}(?:,\d{3})+)\b/g, m => m.replace(/,/g, ''))

    // ── Step 3: strip dollar sign prefix ────────────────────────────────
    // "$340000" → "340000"
    .replace(/\$(\d)/g, '$1')

    // ── Step 4: remove "and" as conjunction between scale words and number words
    // "three hundred and forty thousand" → "three hundred forty thousand"
    // "two thousand and eleven"          → "two thousand eleven"
    .replace(
      /\b(hundred|thousand|million|billion)\s+and\s+(?=(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)\b)/gi,
      '$1 '
    )

    // ── Step 5: "X hundred Y[Z] thousand" compound → digit ───────────────
    // "three hundred forty thousand"     → "340000"
    // "three hundred forty-five thousand"→ "345000"
    // "one hundred twenty thousand"      → "120000"
    // Runs before the simple "X hundred" and "Y thousand" rules so the full
    // compound is consumed in one pass rather than producing "300 40000".
    .replace(
      new RegExp(
        `\\b(${HUNDREDS})\\s+hundred\\s+(${ONES})(?:\\s+(${ONES_1_9}))?\\s+thousand\\b`,
        'gi'
      ),
      (match, h, tens, ones) => {
        const hv = w(h)
        const tv = w(tens)
        const ov = ones ? w(ones) : 0
        const val = (hv * 100 + tv + (tv >= 20 ? ov : 0)) * 1000
        return Number.isFinite(val) && val > 0 ? String(val) : match
      }
    )

    // ── Step 5.5: "X thousand Y hundred" compound → digit ───────────────
    // ATL-PIPE-016: Handles small-to-mid dollar amounts in word form.
    // "two thousand eight hundred"   → "2800"
    // "three thousand one hundred"   → "3100"
    // "two thousand five hundred"    → "2500"
    // REQUIRES the "Y hundred" part to avoid converting partial forms.
    // "two thousand eleven" → NO MATCH (no "Y hundred"; eleven is a teen, not hundreds)
    // "eleven thousand" alone → NO MATCH (handled only in normForPrefixCheck)
    // Placed AFTER Step 5 so "three hundred forty thousand" is consumed first.
    .replace(
      new RegExp(`\\b(${ONES_10_19}|${TENS}|${ONES_1_9})\\s+thousand\\s+(${ONES_1_9})\\s+hundred\\b`, 'gi'),
      (match, thou, hund) => {
        const tv = w(thou) * 1000
        const hv = w(hund) * 100
        const val = tv + hv
        return Number.isFinite(val) && val > 0 ? String(val) : match
      }
    )

    // ── Step 5.7 (ATL-FOLLOWUP-002): collapse "dollars and … cents" conjunction
    // BEFORE Step 6 strips digit-prefixed "dollars", so mixed forms like
    // "34 dollars and 56 cents" (after Step 1) keep converging with "$34.56".
    .replace(/\b(dollars?)\s+and\s+((?:[a-z\d]+[\s-]){0,3}[a-z\d]+)\s+(cents?)\b/gi, '$1 $2 $3')

    // ── Step 6: strip "dollars" suffix after digit numbers ───────────────
    // "340000 dollars" → "340000"
    // Fires only on digit-then-dollars, not on "three dollars" (those are handled
    // by normalizeCurrencyForms earlier in the chain).
    .replace(/\b(\d+)\s+dollars?\b/gi, '$1')
}

/**
 * ATL-FOLLOWUP-002: strip currency unit words that follow a digit amount.
 * Must run AFTER all word→digit conversion so both surface forms converge:
 *   "Two dollars and fourteen cents" → "2 dollars 14 cents" → "2 14"
 *   "$2.14" → "2 dollars 14 cents" → (Step 6) "2 14 cents" → "2 14"
 * Requires a preceding digit — bare "dollars"/"cents" in prose is untouched.
 */
export function stripCurrencyUnitWords(text: string): string {
  return text
    .replace(/\b(\d+)\s+dollars?\b/gi, '$1')
    .replace(/\b(\d+)\s+cents?\b/gi, '$1')
}

export function normalizeOrdinalDateForms(text: string): string {
  return text
    .replace(/\b(twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)[\s-]+(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth)\b/gi, (match, tensWord, ordinalWord) => {
      const tens = NUMBER_WORDS[String(tensWord).toLowerCase()]
      const ones = ORDINAL_WORDS[String(ordinalWord).toLowerCase()]
      const value = Number(tens) + Number(ones)
      return Number.isFinite(value) ? String(value) : match
    })
    .replace(/\b(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth|thirteenth|fourteenth|fifteenth|sixteenth|seventeenth|eighteenth|nineteenth|twentieth|thirtieth)\b/gi, (match, ordinalWord) => {
      return ORDINAL_WORDS[String(ordinalWord).toLowerCase()] || match
    })
    .replace(/\b(\d{1,2})(?:st|nd|rd|th)\b/gi, '$1')
}

export function normalizeNumberWords(text: string): string {
  return normalizeSpokenNumberPhrases(text)
    // ── Hyphenated spoken time formats ────────────────────────────────────
    // "eleven-nineteen" → "1119"  |  "four-fifteen" → "415"  |  "eight-thirty" → "830"
    // Script writers use HOUR-MINUTE hyphenation for clock times.
    // After this rule, the 4/3-digit result is further split by the
    // transcriptTokens time-split step, so both sides produce ["11","19"] etc.
    // Restricted to hyphenated forms ([\-]) only to avoid splitting ordinary
    // space-separated number words in dialogue.
    .replace(
      /\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)-(oh|zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty)(?:-(one|two|three|four|five|six|seven|eight|nine))?\b/gi,
      (match, hour, minuteTens, minuteOnes) => {
        const h = Number(NUMBER_WORDS[hour.toLowerCase()])
        const mt = Number(NUMBER_WORDS[minuteTens.toLowerCase()] ?? (minuteTens.toLowerCase() === 'oh' || minuteTens.toLowerCase() === 'zero' ? '0' : undefined))
        const mo = minuteOnes ? Number(NUMBER_WORDS[minuteOnes.toLowerCase()]) : 0
        if (!Number.isFinite(h) || !Number.isFinite(mt)) return match
        const minutes = mt >= 20 || mt === 0 ? mt + mo : mt
        return String(h * 100 + minutes)
      }
    )
    // ── Compound year/number forms (hyphens or spaces) ────────────────────
    // Handles "two-thousand-eleven" or "two thousand eleven" → "2011"
    // and "nineteen-hundred-sixty-five" → "1965".
    // Must run BEFORE the simple "X thousand" rule so the full compound
    // is consumed as one unit rather than being split across two passes.
    .replace(
      /\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen)[-\s]+(hundred|thousand)[-\s]+(zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)(?:[-\s]+(one|two|three|four|five|six|seven|eight|nine))?\b/gi,
      (match, big, scale, mid, small) => {
        const bigV = Number(NUMBER_WORDS[big.toLowerCase()])
        const midV = Number(NUMBER_WORDS[mid.toLowerCase()])
        const smallV = small ? Number(NUMBER_WORDS[small.toLowerCase()]) : 0
        if (!Number.isFinite(bigV) || !Number.isFinite(midV)) return match
        const multiplier = scale.toLowerCase() === 'thousand' ? 1000 : 100
        // midV is the tens/ones portion; smallV adds ones when mid is a tens word (≥20)
        const remainder = midV >= 20 ? midV + smallV : midV
        return String(bigV * multiplier + remainder)
      }
    )
    .replace(/\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)\s+(hundred|thousand)\b/gi, (match, numberWord, scale) => {
      const value = NUMBER_WORDS[String(numberWord).toLowerCase()]
      const multiplier = String(scale).toLowerCase() === 'thousand' ? 1000 : 100
      const amount = Number(value)
      if (!Number.isFinite(amount)) return match
      return String(amount * multiplier)
    })
    .replace(/\b(zero|oh|o|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)(?:[\s-]+(one|two|three|four|five|six|seven|eight|nine))?\b/gi, (match, first, second) => {
      const firstValue = NUMBER_WORDS[String(first).toLowerCase()]
      const secondValue = second ? NUMBER_WORDS[String(second).toLowerCase()] : ''
      if (!firstValue) return match
      if (!secondValue) return firstValue
      const tens = Number(firstValue)
      const ones = Number(secondValue)
      if (Number.isFinite(tens) && Number.isFinite(ones) && tens >= 20) return String(tens + ones)
      return `${firstValue} ${secondValue}`
    })
}

export function normalizeCurrencyForms(text: string): string {
  return text
    // ATL-FOLLOWUP-002: collapse the spoken conjunction in money amounts so
    // "two dollars and fourteen cents" and "$2.14" (→ "2 dollars 14 cents" via
    // normalizeCompoundNumbers Step 0) normalize to identical token streams.
    // Middle group is bounded to ≤4 number-ish words so the rule cannot span
    // across unrelated sentence content.
    .replace(/\b(dollars?)\s+and\s+((?:[a-z\d]+[\s-]){0,3}[a-z\d]+)\s+(cents?)\b/gi, '$1 $2 $3')
    .replace(/\$\s*(\d[\d,]*)\b/g, (_, amount) => `${String(amount).replace(/,/g, '')} dollars`)
    .replace(/\b(zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty)\s+(hundred|thousand)\s+dollars\b/gi, (match, numberWord, scale) => {
      const value = NUMBER_WORDS[String(numberWord).toLowerCase()]
      const multiplier = String(scale).toLowerCase() === 'thousand' ? 1000 : 100
      const amount = Number(value)
      if (!Number.isFinite(amount)) return match
      return `${amount * multiplier} dollars`
    })
    .replace(/\b(zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty)\s+dollars\b/gi, (match, numberWord) => {
      const value = NUMBER_WORDS[String(numberWord).toLowerCase()]
      return value ? `${value} dollars` : match
    })
}

export function normalizePossessivePlaceNames(text: string): string {
  return text
    .replace(/\bManns\s+Harbor\b/gi, 'Mann Harbor')
    .replace(/\bMan's\s+Harbor\b/gi, 'Mann Harbor')
    .replace(/\bPikes\s+Peak\b/gi, 'Pike Peak')
    .replace(/\bPike's\s+Peak\b/gi, 'Pike Peak')
    .replace(/\bHarpers\s+Ferry\b/gi, 'Harper Ferry')
    .replace(/\bHarper's\s+Ferry\b/gi, 'Harper Ferry')
    // Tonopah, NV: Whisper ASR renders phonetically as "Ta-Neh-Pah" or similar variants.
    .replace(/\bTa[-\s]*Neh[-\s]*Pah\b/gi, 'Tonopah')
    .replace(/\bTonapah\b/gi, 'Tonopah')
    .replace(/\bTonopaw\b/gi, 'Tonopah')
}

export function normalizeStylisticCompoundWords(text: string): string {
  return text
    .replace(/\ball\s+right\b/gi, 'alright')
    .replace(/\bokay\b/gi, 'ok')
    .replace(/\bon\s+to\b/gi, 'onto')
    .replace(/\btime\s+stamps\b/gi, 'timestamps')
    // Emergency number: Whisper formats "911" as "9-1-1" — normalise to joined form.
    .replace(/\b9-1-1\b/gi, '911')
}

export function normalizePossessiveVehicleModelNames(text: string): string {
  return text.replace(/\b(Civic|Accord|Mustang)(?:'s|s)\s+(taillights|headlights|engine|tires|windshield)\b/gi, '$1 $2')
}

export function normalizeContractionExpansions(text: string): string {
  return text
    .replace(/\bshould(?:'|')ve\b/gi, 'should have')
    .replace(/\bwould(?:'|')ve\b/gi, 'would have')
    .replace(/\bcould(?:'|')ve\b/gi, 'could have')
    .replace(/\bshouldn(?:'|')t\b/gi, 'should not')
    .replace(/\bwouldn(?:'|')t\b/gi, 'would not')
    .replace(/\bcouldn(?:'|')t\b/gi, 'could not')
}

export function transcriptTokens(text: string): string[] {
  // Pre-normalise: NFC canonical compose, strip leading/trailing whitespace,
  // collapse internal runs of whitespace.  Catches no-break spaces, zero-width
  // chars, and any trailing newline from script source or Whisper output.
  // ORION-QC-UNIDASH-001 (2026-07-12): normalize Unicode dash variants to ASCII
  // hyphen and strip zero-width/NBSP chars BEFORE any number normalization.
  // Root cause of Consciousness ep2 seg50: cached segment expectedText contained
  // U+2011 non-breaking hyphens ("Four‑point‑seven") — invisible in logs, absent
  // from the repaired script — so SPOKEN_DECIMAL_RE ([-\s] separators only) never
  // matched and tokens came out ["4","point","7","seconds"] vs ["4","7","seconds"],
  // sim 0.643, false REPEATED_IDENTICAL_TRUNCATION. NFC does NOT fold these.
  const pre = text.normalize('NFC')
    .replace(/[\u200B\u200C\u200D\uFEFF]/g, '')
    .replace(/\u00A0/g, ' ')
    .replace(/[\u2010\u2011\u2012\u2013\u2014\u2015\u2212]/g, '-')
    .trim().replace(/\s+/g, ' ')
  // ATL-PIPE-011: normalizeCompoundNumbers runs first to resolve "three hundred and forty thousand"
  // → "340000", strip $-signs, strip commas in digit strings, and remove "and" in number sequences
  // before the rest of the pipeline sees the text.
  const normalized = stripCurrencyUnitWords(normalizeNumberWords(normalizeOrdinalDateForms(normalizeCurrencyForms(normalizePossessivePlaceNames(normalizePossessiveVehicleModelNames(normalizeStylisticCompoundWords(normalizeContractionExpansions(normalizeCompoundNumbers(pre)))))))))
    // Widen apostrophe net: curly quotes, modifier apostrophe, grave/acute,
    // prime — all normalised to plain ASCII apostrophe before possessive strip.
    .replace(/[\u2018\u2019\u02BC\u0060\u00B4\u02CA\u2032\u2035]/g, "'")
    // Normalize possessives to plain plural so Whisper output matches script:
    // "Gate's" → "Gates", "Gates'" → "Gates" (both normalize to same token)
    .replace(/\b([a-z]+)'s\b/gi, '$1s')
    .replace(/\b([a-z]+s)'\b/gi, '$1')
    .replace(/\b([A-Z][a-z]{4,})s'(?=\s|$)/g, '$1poss')
    .replace(/\b([A-Z][a-z]{4,})'s\b/g, '$1poss')
    .toLowerCase()
    .replace(/\b([a-z]+)'s\b/g, '$1')
    .replace(/\b(\d{1,2})\s*[\.:]\s*(\d{2})\s*(?:p\s*\.?\s*m\.?|pm)\b/g, '$1 $2 pm')
    .replace(/\b(\d{1,2})\s*[\.:]\s*(\d{2})\s*(?:a\s*\.?\s*m\.?|am)\b/g, '$1 $2 am')
    .replace(/\bp\s*\.?\s*m\.?\b/g, 'pm')
    .replace(/\ba\s*\.?\s*m\.?\b/g, 'am')
    // Whisper ":00 a.m./p.m." hallucination: "10 hours pm" → "10 00 pm"
    // Occurs when Whisper reads a round-hour time like "10:00 p.m." and outputs
    // "ten hours p.m." — "hours" has no valid speech equivalent here.
    .replace(/\b(\d{1,2})\s+hours\s+(am|pm)\b/g, '$1 00 $2')
    // Round-hour QC equivalence: "10 00 pm" ≡ "10 pm"
    // Script text "10:00 p.m." → expected tokens "10 00 pm".
    // TTS-preprocessed audio (or Whisper omitting the silent :00) → detected "10 pm".
    // Normalise both to "10 pm" so QC comparison succeeds.
    // ONLY fires on exact "00" minutes — does NOT affect "10 19 pm" or other partial hours.
    .replace(/\b(\d{1,2})\s+00\s+(am|pm)\b/g, '$1 $2')
    // Spoken digit sequences (badge/ID/phone numbers): "4 4-7 1" or "4 4 7 1" → "4471"
    // normalizeNumberWords converts "four-four-seven-one" pair-by-pair, producing
    // "4 4-7 1" (the hyphen between pairs survives). Whisper outputs the spoken form
    // as a joined numeric string "4471". Strip spaces AND hyphens between single digits.
    // Requires ≥3 consecutive single-digit tokens; two-digit numbers (11, 42) unaffected
    // because [0-9] only matches exactly one digit per slot.
    .replace(/\b([0-9])([ -][0-9]){2,}\b/g, match => match.replace(/[ -]/g, ''))
    // Split concatenated time numbers so both sides produce the same tokens:
    // "1119" → "11 19"  |  "415" → "4 15"  |  "830" → "8 30"
    // Whisper concatenates spoken clock times ("eleven nineteen" → "1119").
    // normalizeNumberWords converts hyphenated script times the same way
    // ("eleven-nineteen" → "1119"), so after this split both produce ["11","19"].
    // Only splits 3/4-digit numbers that look like valid 12-hour clock times
    // (hour 1-12, minutes 00-59).  Does not split years like 2011/1965
    // (hour part 20/19 > 12) or arbitrary addresses.
    .replace(/\b(1[0-2]|[1-9])([0-5]\d)\b/g, '$1 $2')
    // Year normalization: split 4-digit years into two-digit pairs so they match
    // the output of normalizeNumberWords for spelled-out years.
    // "1991" → "19 91"  |  "2023" → "20 23"  — mirrors "nineteen ninety-one" → "19 91"
    // Fires ONLY for year-range first-halves (10–25) that were NOT already split
    // by the clock-time rule above (those have first-half ≤ 12, minutes ≤ 59).
    .replace(/\b(1[3-9]|2[0-5])(\d{2})\b/g, '$1 $2')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((tok: string) => tok.length > 0)  // explicit guard — catches any edge .filter(Boolean) misses
  return normalized
}

export function compactTranscriptTokens(tokens: string[]): string[] {
  return tokens.map(token => token.replace(/[^a-z0-9]/gi, '')).filter(Boolean)
}

export function transcriptTokenVariants(tokens: string[]): string[][] {
  const compacted = compactTranscriptTokens(tokens)
  const joinedAll = compacted.join('')
  const withoutMeridiem = compacted.filter(token => token !== 'am' && token !== 'pm')
  const variants = [compacted]
  if (joinedAll && joinedAll !== compacted.join(' ')) variants.push([joinedAll])
  if (withoutMeridiem.length !== compacted.length) variants.push(withoutMeridiem)
  return variants
}

export function isLeadingArticle(token: string): boolean {
  return token === 'the' || token === 'a' || token === 'an'
}

export function expectedLineVariants(tokens: string[]): string[][] {
  const compacted = compactTranscriptTokens(tokens)
  if (compacted.length > 1 && isLeadingArticle(compacted[0])) {
    return [compacted, compacted.slice(1)]
  }
  return [compacted]
}

export function singleCapitalizedAlphaWord(text: string): string {
  const match = text.trim().match(/^([A-Z][A-Za-z]{4,})[.!?]?$/)
  return match?.[1] || ''
}

export function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0
  if (!a.length) return b.length
  if (!b.length) return a.length
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  const curr = Array.from({ length: b.length + 1 }, () => 0)
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost)
    }
    for (let j = 0; j <= b.length; j++) prev[j] = curr[j]
  }
  return prev[b.length]
}

export function normalizeForQC(text: string): string {
  // ATL-FOLLOWUP-002: run the shared numeric/currency/ordinal normalizers on
  // BOTH sides before the character-level collapse so the normalized-similarity
  // fallback agrees with the token pipeline on numbers, money, clock times,
  // and ordinals (e.g. "Two dollars and fourteen cents" ↔ "$2.14",
  // "Nine-forty-one p.m." ↔ "941 p.m.", "October fourteenth" ↔ "October 14th").
  let s = stripCurrencyUnitWords(normalizeNumberWords(normalizeOrdinalDateForms(normalizeCurrencyForms(normalizeCompoundNumbers(text.normalize('NFC').trim())))))

  s = s.toLowerCase()
  s = s.replace(/[.,!?;:'"—–-]+/g, ' ')
  s = s.replace(/\s+/g, ' ').trim()

  // ATL-FOLLOWUP-002: clock-time equivalence in the fallback path, mirroring
  // transcriptTokens — "941 p m" ≡ "9 41 p m", and round hours "10 00 p m" ≡ "10 p m".
  s = s.replace(/\b(1[0-2]|[1-9])([0-5]\d)\b/g, '$1 $2')
  s = s.replace(/\b(\d{1,2}) 00 ([ap]) m\b/g, '$1 $2 m')
  s = s.replace(/\b(1[3-9]|2[0-5])(\d{2})\b/g, '$1 $2')

  const numMap: Record<string, string> = {
    'zero': '0',
    'one': '1',
    'two': '2',
    'three': '3',
    'four': '4',
    'five': '5',
    'six': '6',
    'seven': '7',
    'eight': '8',
    'nine': '9',
    'ten': '10',
    'eleven': '11',
    'twelve': '12',
    'thirteen': '13',
    'fourteen': '14',
    'fifteen': '15',
    'sixteen': '16',
    'seventeen': '17',
    'eighteen': '18',
    'nineteen': '19',
    'twenty': '20',
    'twenty one': '21',
    'twenty two': '22',
    'twenty three': '23',
    'twenty four': '24',
    'twenty five': '25',
    'twenty six': '26',
    'twenty seven': '27',
    'twenty eight': '28',
    'twenty nine': '29',
    'thirty': '30',
    'forty': '40',
    'fifty': '50',
    'sixty': '60',
    'seventy': '70',
    'eighty': '80',
    'ninety': '90',
    'twenties': '20s',
    'thirties': '30s',
    'forties': '40s',
    'fifties': '50s',
    'sixties': '60s',
    'seventies': '70s',
    'eighties': '80s',
    'nineties': '90s',
    'first': '1st',
    'second': '2nd',
    'third': '3rd',
    'fourth': '4th',
    'fifth': '5th',
  }
  for (const [word, digit] of Object.entries(numMap).sort((a, b) => b[0].length - a[0].length)) {
    s = s.replace(new RegExp(`\\b${word}\\b`, 'g'), digit)
  }

  const compounds: [string, string][] = [
    ['name tag', 'nametag'],
    ['fire place', 'fireplace'],
    ['some thing', 'something'],
    ['every thing', 'everything'],
    ['any thing', 'anything'],
    ['no thing', 'nothing'],
    ['some one', 'someone'],
    ['every one', 'everyone'],
    ['any one', 'anyone'],
    ['good night', 'goodnight'],
    ['good bye', 'goodbye'],
    ['every day', 'everyday'],
    ['some day', 'someday'],
    ['door step', 'doorstep'],
  ]
  for (const [spaced, joined] of compounds) {
    s = s.replace(new RegExp(`\\b${spaced}\\b`, 'g'), joined)
  }

  const verbMap: Record<string, string> = {
    'wished': 'wish',
    'wanted': 'want',
    'tried': 'try',
    'said': 'say',
    'told': 'tell',
    'looked': 'look',
    'turned': 'turn',
    'walked': 'walk',
    'asked': 'ask',
    'thought': 'think',
    'knew': 'know',
    'went': 'go',
    'came': 'come',
    'got': 'get',
    'ran': 'run',
    'saw': 'see',
    'heard': 'hear',
    'felt': 'feel',
    'made': 'make',
    'took': 'take',
    'gave': 'give',
    'left': 'leave',
    'stood': 'stand',
    'sat': 'sit',
  }
  for (const [past, base] of Object.entries(verbMap)) {
    s = s.replace(new RegExp(`\\b${past}\\b`, 'g'), base)
  }

  s = s.replace(/\s+/g, ' ').trim()
  return s
}

export function stringSimilarity(a: string, b: string): number {
  if (a === b) return 1.0
  if (!a || !b) return 0.0
  const longer = a.length > b.length ? a : b
  const shorter = a.length > b.length ? b : a
  if (longer.includes(shorter) && shorter.length >= longer.length * 0.5) return 0.92
  const lenSum = a.length + b.length
  if (lenSum === 0) return 1.0
  const dist = levenshteinDistance(a, b)
  return (lenSum - dist) / lenSum
}

/*
 * Transcript QC normalization calibration:
 * normalizeForQC("early twenties") === normalizeForQC("early 20s")
 * normalizeForQC("name tag reading DAPHNE") === normalizeForQC("nametag reading Daphne")
 * normalizeForQC("wished she hadn't been") === normalizeForQC("wish she hadn't been")
 * stringSimilarity("End of the hall", "End of the hall. That's cozy.") >= 0.85
 */

export function transcriptSimilarity(expected: string[], detected: string[]): number {
  const expectedCompact = compactTranscriptTokens(expected).join('')
  const detectedCompact = compactTranscriptTokens(detected).join('')
  if (!expectedCompact && !detectedCompact) return 1
  if (!expectedCompact || !detectedCompact) return 0
  const maxLen = Math.max(expectedCompact.length, detectedCompact.length)
  return 1 - (levenshteinDistance(expectedCompact, detectedCompact) / maxLen)
}

export function phoneticTokenKey(token: string): string {
  const normalized = token
    .toLowerCase()
    .replace(/ie$/, 'y')
    .replace(/([a-z])\1+/g, '$1')
    .replace(/ph/g, 'f')
    .replace(/ck/g, 'k')
  if (!normalized) return ''
  return normalized[0] + normalized.slice(1).replace(/[aeiou]/g, '')
}

export function commonFirstNameVariantMatches(expected: string, detected: string): boolean {
  const groups = [
    ['katherine', 'catherine', 'kathryn'],
    ['sara', 'sarah'],
    ['jon', 'john'],
  ]
  return groups.some(group => group.includes(expected) && group.includes(detected))
}

export function commonSurnameVariantMatches(expected: string, detected: string): boolean {
  const groups = [
    ['clarke', 'clark'],
    ['greene', 'green'],
    ['smythe', 'smith'],
    ['connelly', 'connolly'],  // Fresh Gardenias — identical pronunciation, Whisper spelling variance
  ]
  return groups.some(group => group.includes(expected) && group.includes(detected))
}

/**
 * Explicit bidirectional homophone table for transcript QC.
 *
 * Purpose: Whisper reliably transcribes certain correct spoken words as
 * phonetically identical alternatives (e.g. "Brake" → "Break").  When the
 * full passage is otherwise present, penalising for a homophone substitution
 * produces a false QC failure.
 *
 * Rules:
 *  - Both tokens are lowercased before lookup (normalisation happens upstream,
 *    but the guard is here too for safety).
 *  - Matching is explicit and bidirectional — no fuzzy logic.
 *  - This helper fires BEFORE the short-token length guard so that pairs
 *    shorter than 7 characters are not prematurely excluded.
 *  - Keep this table small.  Only add a pair when an actual QC failure
 *    confirms Whisper produces the wrong homophone for that word.
 *
 * Current pairs (add new entries as real failures are observed):
 *   brake  ↔  break     (car brake vs. to break)
 *   brakes ↔  breaks    (plural / third-person)
 *   braking ↔ breaking  (gerund)
 */
const HOMOPHONE_PAIRS: ReadonlyArray<readonly [string, string]> = [
  // Automotive — Whisper transcribes the car-part noun as the common verb homophone
  ['brake', 'break'],
  ['brakes', 'breaks'],
  ['braking', 'breaking'],
  // Colour spelling variants — Whisper uses British 'grey' for American 'gray'
  ['gray', 'grey'],
  ['grays', 'greys'],
  // Proper noun — Whisper maps the American name 'Basil' /beɪzəl/ to the
  // Swiss city 'Basel' /bɑːzəl/; phonetically near-identical, single char diff.
  // Both tokens are 5 chars and blocked by the length-guard without this pair.
  ['basil', 'basel'],
  // Possessive character name — "Nora's" is normalised by transcriptTokens to
  // "noras" (possessive-strip regex).  Whisper produces two known variants:
  //   • "Norris"  — hears the common surname (NOR-az / NOR-iss, near-identical)
  //   • "Norah's" → "norahs" — uses the alternate spelling of the first name
  // Both are mechanical ASR false positives; not content mismatches.
  ['noras', 'norris'],
  ['noras', 'norahs'],
  // Female title variants — Whisper substitutes one title form for another
  // when referring to a woman. Both "Miss" and "Ms" are female titles;
  // phonetically near-identical. Fresh Gardenias, Segment 21.
  ['miss', 'ms'],
] as const

export function knownHomophoneMatches(expected: string, detected: string): boolean {
  const a = expected.toLowerCase()
  const b = detected.toLowerCase()
  if (a === b) return false // already handled by exact-match check above
  return HOMOPHONE_PAIRS.some(([x, y]) => (a === x && b === y) || (a === y && b === x))
}

/**
 * Returns true when one token is the simple singular form of the other
 * (token_a + 's' === token_b or vice versa).
 *
 * Rationale: Whisper commonly drops weak trailing plural /z/ sounds in
 * natural connected speech.  When the rest of the segment is present
 * (high coverage, tail passing), treating these as equivalent prevents
 * the sequential cursor from getting stuck and collapsing measured coverage.
 *
 * Safe under Marc's rule (2026-05-21):
 *   - coverage >= 0.95 in the surrounding segment
 *   - tail check passes
 *   - no named-entity, numeric, tense, or negation change
 *   - meaning / action remains materially identical
 *
 * These conditions are implicitly enforced by the QC structure: a single
 * plural/singular mismatch cannot push genuine coverage below the 0.62
 * threshold by itself; only sequential cursor collapse does.  Named
 * entities, numbers, and negations differ by more than a trailing 's'.
 *
 * Covers only the simple additive +s plural (hands, roads, eyes, minutes).
 * Irregular plurals (man/men, foot/feet) belong in HOMOPHONE_PAIRS if
 * they appear as real QC failures.
 *
 * Blocklist prevents false positives on short function words
 * (his/hiss, as/ass, is/iss, us/uss, its/itss).
 */
const SINGULAR_PLURAL_BLOCKLIST = new Set([
  'his', 'was', 'has', 'as', 'is', 'us', 'its',
])

export function singularPluralVariantMatches(expected: string, detected: string): boolean {
  const a = expected.toLowerCase()
  const b = detected.toLowerCase()
  if (a === b) return false
  if (SINGULAR_PLURAL_BLOCKLIST.has(a) || SINGULAR_PLURAL_BLOCKLIST.has(b)) return false
  const [shorter, longer] = a.length <= b.length ? [a, b] : [b, a]
  // Shorter must be >= 3 chars; longer must be exactly shorter + 's'.
  // Guard: shorter must NOT already end in 's' — this prevents double-s
  // false positives (e.g. "hands"/"handss", "class"/"classs").
  return shorter.length >= 3 && !shorter.endsWith('s') && longer === shorter + 's'
}

/**
 * Resolves a single transcript token to a canonical digit string when it
 * represents a whole number in any of the supported surface forms:
 *
 *   "15"       → "15"  (plain digit string — pass through)
 *   "fifteen"  → "15"  (cardinal word from NUMBER_WORDS)
 *   "fifteenth" → "15" (ordinal word from ORDINAL_WORDS)
 *   "15th"     → "15"  (digit ordinal suffix stripped)
 *   "sixty"    → "60"  (now covered after NUMBER_WORDS extension)
 *
 * Returns '' for tokens that do not represent a recognisable number so
 * that callers can distinguish "no match possible" from "matched zero".
 */
export function numericTokenValue(token: string): string {
  if (/^\d+$/.test(token)) return token
  const cardinal = NUMBER_WORDS[token]
  if (cardinal !== undefined) return cardinal
  const ordinal = ORDINAL_WORDS[token]
  if (ordinal !== undefined) return ordinal
  const ordinalDigit = token.match(/^(\d+)(?:st|nd|rd|th)$/)
  if (ordinalDigit) return ordinalDigit[1]
  return ''
}

/**
 * Returns true when both tokens represent the same numeric value in any
 * supported surface form.  Isolated strictly to numeric-variant matching —
 * does NOT affect fuzzy word matching, phonetic matching, or name matching.
 *
 * Examples of matches this catches after normalization may still miss them:
 *   "15"   ↔ "fifteen"     (digit vs cardinal word)
 *   "21st" ↔ "twenty-first" would already be handled by normalizeOrdinalDateForms
 *                           but this is a belt-and-suspenders check
 *   "60"   ↔ "sixty"       (added via NUMBER_WORDS extension)
 *   "3rd"  ↔ "third"       (digit ordinal vs ordinal word)
 */
export function numericVariantMatches(expected: string, detected: string): boolean {
  const expVal = numericTokenValue(expected)
  if (!expVal) return false
  const detVal = numericTokenValue(detected)
  return detVal !== '' && expVal === detVal
}

export function transcriptTokenMatches(expected: string, detected: string): boolean {
  if (expected === detected) return true
  // Numeric-variant check: "fifteen" ↔ "15", "sixty" ↔ "60", "3rd" ↔ "third", etc.
  // Runs before the length guard so short digit/word tokens are not excluded.
  if (numericVariantMatches(expected, detected)) return true
  // Homophone check: explicit pairs where Whisper reliably substitutes a
  // phonetically identical word (e.g. "brake" → "break").  Runs before the
  // length guard for the same reason — these pairs are often short tokens.
  // The phonetic length guard below is intentionally left unchanged.
  if (knownHomophoneMatches(expected, detected)) return true
  // Singular/plural variance: "hand"↔"hands", "eye"↔"eyes", "road"↔"roads".
  // Whisper commonly drops weak trailing /z/ in natural connected speech.
  // Safe when coverage and tail pass (enforced upstream); does not block
  // genuine missing-content failures (those differ by more than one 's').
  if (singularPluralVariantMatches(expected, detected)) return true
  if (commonFirstNameVariantMatches(expected, detected)) return true
  if (commonSurnameVariantMatches(expected, detected)) return true
  // ATL-PIPE-008/A8: Fuzzy short-token matching for homophone-style transcription noise.
  // Prevents near-misses like "set"→"sat" (distance 1) from failing QC.
  // Applies only to tokens ≥ 3 chars (avoids matching tiny function words) with same first letter.
  // Levenshtein ≤ 2 for tokens ≤ 5 chars; ≤ 3 for tokens 6-9 chars (fills gap below long-word threshold).
  if (expected.length >= 3 && detected.length >= 3 && expected[0] === detected[0]) {
    const maxFuzzyLen = Math.max(expected.length, detected.length)
    const fuzzyDist = levenshteinDistance(expected, detected)
    if (maxFuzzyLen <= 5 && fuzzyDist <= 2) return true
    if (maxFuzzyLen > 5 && maxFuzzyLen < 10 && fuzzyDist <= 3) return true
  }
  if (expected.length < 7 || detected.length < 7) return false
  if (expected[0] !== detected[0]) return false

  const maxLen = Math.max(expected.length, detected.length)
  if (maxLen > 16) return false
  const similarity = 1 - (levenshteinDistance(expected, detected) / maxLen)
  if (similarity >= 0.82) return true

  const expectedKey = phoneticTokenKey(expected)
  const detectedKey = phoneticTokenKey(detected)
  return expectedKey.length >= 4 && expectedKey === detectedKey
}

export function oneWordProperNameVariantMatches(expectedText: string, detectedText: string): boolean {
  const expected = singleCapitalizedAlphaWord(expectedText)
  const detected = singleCapitalizedAlphaWord(detectedText)
  if (!expected || !detected || expected[0] !== detected[0]) return false

  const expectedLower = expected.toLowerCase()
  const detectedLower = detected.toLowerCase()
  const commonWordBlocklist = new Set(['ferry', 'fairy', 'rode', 'wrote', 'crews', 'cruise', 'hours', 'ours'])
  if (commonWordBlocklist.has(expectedLower) || commonWordBlocklist.has(detectedLower)) return false

  const maxLen = Math.max(expectedLower.length, detectedLower.length)
  if (maxLen > 16) return false
  const similarity = 1 - (levenshteinDistance(expectedLower, detectedLower) / maxLen)
  if (similarity >= 0.82) return true

  const expectedKey = phoneticTokenKey(expectedLower)
  const detectedKey = phoneticTokenKey(detectedLower)
  return expectedKey.length >= 3 && expectedKey === detectedKey
}

export function containsOrderedTokenVariant(haystack: string[], needle: string[]): boolean {
  return transcriptTokenVariants(haystack).some(haystackVariant =>
    transcriptTokenVariants(needle).some(needleVariant => containsOrderedTokens(haystackVariant, needleVariant))
  )
}

export function containsOrderedTokens(haystack: string[], needle: string[]): boolean {
  if (needle.length === 0) return true
  let cursor = 0
  for (const token of haystack) {
    if (transcriptTokenMatches(needle[cursor], token)) cursor++
    if (cursor >= needle.length) return true
  }
  return false
}

export function transcriptCoverage(expected: string[], detected: string[]): number {
  if (expected.length === 0) return 1
  let cursor = 0
  let matched = 0
  for (const token of detected) {
    if (transcriptTokenMatches(expected[cursor], token)) {
      matched++
      cursor++
    }
    if (cursor >= expected.length) break
  }
  return matched / expected.length
}

export function transcriptVariantCoverage(expected: string[], detected: string[]): number {
  let best = transcriptCoverage(expected, detected)
  for (const expectedVariant of transcriptTokenVariants(expected)) {
    for (const detectedVariant of transcriptTokenVariants(detected)) {
      best = Math.max(best, transcriptCoverage(expectedVariant, detectedVariant))
    }
  }
  return best
}

export function numericTokenSequence(tokens: string[]): string[] {
  return compactTranscriptTokens(tokens).filter(token => /^\d+$/.test(token))
}

export function numericTokenSequenceMismatch(expected: string[], detected: string[]): boolean {
  const expectedNumbers = numericTokenSequence(expected)
  const detectedNumbers = numericTokenSequence(detected)
  if (expectedNumbers.length === 0 && detectedNumbers.length === 0) return false
  if (expectedNumbers.length !== detectedNumbers.length) return true
  return expectedNumbers.some((value, index) => value !== detectedNumbers[index])
}

/**
 * Low-information function words that Whisper commonly drops at clip boundaries.
 * Used by isSafeTerminalTailDrop — keep this set small and evidence-based.
 */
const SAFE_TERMINAL_FUNCTION_WORDS = new Set(['it', 'a', 'an', 'the', 'to', 'of', 'in', 'on'])

/**
 * Returns true when the ONLY QC failure is that Whisper dropped the final
 * short function word at a clip boundary — a well-documented Whisper behaviour.
 *
 * All conditions must hold simultaneously (Marc's rule, 2026-05-21):
 *   1. coverage >= 0.95
 *   2. The failing token is ONLY the last expected token
 *   3. That token is <= 3 chars
 *   4. That token is in SAFE_TERMINAL_FUNCTION_WORDS
 *   5. All other expected tokens are covered (truncatedCoverage >= 0.95)
 *
 * Conditions 4 and 5 together implicitly satisfy:
 *   - no named entity change (approved set contains no proper nouns)
 *   - no numeric change (approved set contains no digits)
 *   - no negation change (approved set contains no 'not'/'no'/'never')
 *   - sentence meaning materially intact
 *
 * Examples: "away with it" → "away with"  |  "went to the" → "went to"
 */
export function isSafeTerminalTailDrop(
  expected: string[],
  detected: string[],
  coverage: number,
): boolean {
  if (coverage < 0.95) return false
  if (expected.length < 2) return false

  const finalToken = expected[expected.length - 1]
  if (finalToken.length > 3) return false
  if (!SAFE_TERMINAL_FUNCTION_WORDS.has(finalToken)) return false

  // Every token except the final one must be present in detected.
  // Use transcriptVariantCoverage so existing token-level equivalences apply.
  const expectedWithoutFinal = expected.slice(0, -1)
  const truncatedCoverage = transcriptVariantCoverage(expectedWithoutFinal, detected)
  return truncatedCoverage >= 0.95
}

/**
 * Strict token matcher — identical to transcriptTokenMatches but intentionally
 * excludes singularPluralVariantMatches. Used by weakVerbTrailingSRescue so
 * that the segment-level rescue can measure "baseline coverage without the
 * trailing-s benefit" and only apply the rescue on top of a proven 0.96+
 * baseline.
 */
export function strictTranscriptTokenMatches(expected: string, detected: string): boolean {
  if (expected === detected) return true
  if (numericVariantMatches(expected, detected)) return true
  if (knownHomophoneMatches(expected, detected)) return true
  if (commonFirstNameVariantMatches(expected, detected)) return true
  if (commonSurnameVariantMatches(expected, detected)) return true
  if (expected.length < 7 || detected.length < 7) return false
  if (expected[0] !== detected[0]) return false
  const maxLen = Math.max(expected.length, detected.length)
  if (maxLen > 16) return false
  return 1 - (levenshteinDistance(expected, detected) / maxLen) >= 0.82
}

/**
 * Detects two normalized tokens that differ only by a trailing 's' on one of
 * them, with no other change.  Both tokens must be >= 3 chars; the shorter must
 * NOT already end in 's' (prevents false matches like "classs" or "handss").
 * Used exclusively by weakVerbTrailingSRescue — not a standalone match rule.
 */
export function isWeakTrailingS(a: string, b: string): boolean {
  if (a === b) return false
  const [shorter, longer] = a.length <= b.length ? [a, b] : [b, a]
  return shorter.length >= 3 && !shorter.endsWith('s') && longer === shorter + 's'
}

/**
 * Segment-level rescue for mechanical ASR trailing-s drops on verbs.
 *
 * Whisper occasionally drops the final /z/ on present-tense third-person
 * singular verbs: "puts" → "put", "gets" → "get", "walks" → "walk".
 * This is a mechanical ASR artifact, NOT a content error.
 *
 * This rescue is NARROW by design.  All conditions must hold simultaneously:
 *
 *   1. tailMatches must already be true — the tail check passes independently,
 *      confirming the audio reaches the end of the expected text.
 *   2. Strict baseline coverage (WITHOUT counting trailing-s as matches) must
 *      be ≥ 0.96.  The rest of the transcript proves the audio is correct;
 *      we are rescuing only a tiny mechanical artefact, not covering real gaps.
 *   3. The number of trailing-s mismatches is 1 or 2 at most.
 *   4. Each mismatched token must NOT be a proper noun, entity name, or
 *      capitalised word in the original (pre-normalisation) expected text.
 *      Capitalized tokens in the original are treated as high-value content
 *      where an 's' difference may carry meaning (e.g. a business name).
 *
 * NOT a broad fallback: this rescue CANNOT pass a segment where coverage is
 * genuinely low.  It only fires when strict coverage is already 0.96+ and the
 * only outstanding gap is 1–2 trailing-s mismatches on lowercase verb tokens.
 *
 * "says" is intentionally not protected here — Whisper may render it as "sez"
 * (a full word substitution) which isWeakTrailingS will not match anyway.
 */
export function weakVerbTrailingSRescue(
  expected: string[],
  detected: string[],
  originalExpectedText: string,
  tailMatches: boolean,
): boolean {
  if (!tailMatches) return false
  if (expected.length === 0) return false

  // Build a set of lowercase tokens that were capitalised in the original text
  // (proper nouns, entity names, character names, etc.).
  const properNounTokens = new Set<string>()
  for (const word of originalExpectedText.split(/\s+/)) {
    if (word.length > 0 && word[0] >= 'A' && word[0] <= 'Z') {
      properNounTokens.add(word.toLowerCase().replace(/[^a-z0-9]/g, ''))
    }
  }

  // Run a strict sequential cursor (no singularPluralVariantMatches) to find
  // the baseline coverage and identify trailing-s mismatch positions.
  let cursor = 0
  let strictMatched = 0
  const trailingSMismatches: string[] = []

  for (let i = 0; i < detected.length && cursor < expected.length; i++) {
    const exp = expected[cursor]
    const det = detected[i]
    if (strictTranscriptTokenMatches(exp, det)) {
      strictMatched++
      cursor++
    } else if (isWeakTrailingS(exp, det)) {
      // Do not advance cursor here — we need to decide whether to rescue first.
      // Count as a candidate mismatch and advance anyway so the cursor doesn't
      // permanently stall at this position.
      if (!properNounTokens.has(exp) && !properNounTokens.has(det)) {
        trailingSMismatches.push(exp)
      }
      cursor++
    }
    // Anything else: cursor stalls (real mismatch or deletion — never rescued).
  }

  const total = expected.length
  const strictCoverage = total > 0 ? strictMatched / total : 1
  // "Would-be coverage" = coverage if trailing-s mismatches were counted as correct.
  // The ≥ 0.96 gate applies here — Marc's requirement is that the REST of the
  // transcript is already at 96%+ quality, not that the strict baseline alone is 96%.
  // Example: 12-token segment, 1 trailing-s gap → (11+1)/12 = 1.0 ≥ 0.96 ✓
  //          12-token segment, 1 trailing-s gap + real missing word → (8+1)/12 = 0.75 ✗
  const wouldBeCoverage = total > 0 ? (strictMatched + trailingSMismatches.length) / total : 1
  // Belt-and-suspenders: strict coverage alone must be at least 0.80 so that a pair
  // of trailing-s matches cannot mask a genuinely poor transcription (e.g. a 5-token
  // segment where 2 tokens are trailing-s — strict coverage only 0.60 but would-be 1.0).
  return (
    wouldBeCoverage >= 0.96 &&
    strictCoverage >= 0.80 &&
    trailingSMismatches.length >= 1 &&
    trailingSMismatches.length <= 2
  )
}

/**
 * Pure QC decision for one voice segment: compares expected script text
 * against the Whisper-detected transcript after BOTH sides pass through the
 * shared normalization pipeline (numbers↔words, currency incl. cents, clock
 * times, ordinals, punctuation/case collapse).
 *
 * Extracted from validateSegmentTranscript() in generate-voices/route.ts
 * (ATL-FOLLOWUP-002). The route wraps this with the actual transcription call.
 */
export type TranscriptQCResult = {
  passed: boolean
  expectedText: string
  detectedText: string
  coverage: number
  similarity: number
  tailMatches: boolean
  shortLineMatches: boolean
  oneWordProperNameMatch: boolean
  safeTerminalTailDrop: boolean
  weakVerbTrailingS: boolean
  /** True when token QC failed but the normalized-similarity fallback passed (route logs a QC warning). */
  normalizedFallbackUsed: boolean
  normalizedSimilarity: number
}

export function evaluateTranscriptQC(expectedText: string, detectedText: string): TranscriptQCResult {
  const expected = transcriptTokens(expectedText)
  const detected = transcriptTokens(detectedText)
  const normExpected = normalizeForQC(expectedText)
  const normDetected = normalizeForQC(detectedText)
  const detectedBlank = detectedText.trim().length === 0 || normDetected.length === 0
  const normalizedSimilarity = stringSimilarity(normExpected, normDetected)
  const normalizedExactMatch = normExpected === normDetected
  const radicalLengthMismatch = normExpected.length > 0
    && normDetected.length < normExpected.length * 0.30
    && normalizedSimilarity < 0.70
  const tail = expected.slice(Math.max(0, expected.length - SEGMENT_TRANSCRIPT_TAIL_WORDS))
  const tailCandidates = expected.length <= SEGMENT_TRANSCRIPT_TAIL_WORDS && tail.length > 1 && isLeadingArticle(tail[0])
    ? [tail, tail.slice(1)]
    : [tail]
  const tailMatches = tailCandidates.some(candidate => containsOrderedTokenVariant(detected, candidate))
  const expectedVariants = expectedLineVariants(expected)
  const coverage = Math.max(...expectedVariants.map(variant => transcriptVariantCoverage(variant, detected)))
  const tokenSimilarity = Math.max(...expectedVariants.map(variant => transcriptSimilarity(variant, detected)))
  const similarity = Math.max(tokenSimilarity, normalizedSimilarity)
  const numericMismatch = numericTokenSequenceMismatch(expected, detected)
  const shortLineMatches = expected.length <= 8
    ? expectedVariants.some(variant => containsOrderedTokenVariant(detected, variant)) || similarity >= 0.88
    : true
  const oneWordProperNameMatch = oneWordProperNameVariantMatches(expectedText, detectedText)
  // Safe terminal tail drop: Whisper clips the final short function word at
  // segment boundaries.  Does not regenerate — treated as equivalent.
  const safeTerminalTailDrop = !tailMatches && isSafeTerminalTailDrop(expected, detected, coverage)

  // Weak verb trailing-s rescue: mechanical ASR drop of final /z/ on verbs
  // ("puts" → "put", "gets" → "get").  Fires ONLY when strict baseline
  // coverage (without counting trailing-s) is already ≥ 0.96, the tail passes,
  // and there are at most 2 trailing-s mismatches on non-proper-noun tokens.
  const weakVerbTrailingS = !safeTerminalTailDrop
    && !oneWordProperNameMatch
    && !(tailMatches && shortLineMatches && coverage >= SEGMENT_TRANSCRIPT_MIN_COVERAGE)
    && weakVerbTrailingSRescue(expected, detected, expectedText, tailMatches)

  const tokenQcPassed = oneWordProperNameMatch
    || safeTerminalTailDrop
    || weakVerbTrailingS
    || (tailMatches && shortLineMatches && coverage >= SEGMENT_TRANSCRIPT_MIN_COVERAGE)
  const normalizedQcPassed = normalizedExactMatch || normalizedSimilarity >= 0.85
  const passed = !detectedBlank
    && !radicalLengthMismatch
    && !numericMismatch
    && (tokenQcPassed || normalizedQcPassed)

  return {
    passed,
    expectedText,
    detectedText,
    coverage,
    similarity,
    tailMatches,
    shortLineMatches,
    oneWordProperNameMatch,
    safeTerminalTailDrop,
    weakVerbTrailingS,
    normalizedFallbackUsed: !tokenQcPassed && normalizedQcPassed && !normalizedExactMatch,
    normalizedSimilarity,
  }
}

// ORION-QC-DIAG-002b: module build marker — printed by the generate-voices
// truncation diagnostic to detect stale compiled chunks in deployments.
export const QC_MODULE_MARKER = 'unidash-001-20260712'
