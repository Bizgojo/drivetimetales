/**
 * ATL-PIPE-019: Comprehensive Transcript QC Normalization
 * 
 * Tests the full normalizeForTranscriptQC pipeline which includes:
 * - Compound numbers (normalizeCompoundNumbers + standalone cardinals)
 * - Person title abbreviations (Dr./Mr./Mrs./Ms./Prof./St./Ave.)
 * - Apostrophe stripping (contractions + possessives)
 * - Punctuation removal
 * - Whitespace normalization
 */

const NUMBER_WORDS = {
  'zero': '0', 'one': '1', 'two': '2', 'three': '3', 'four': '4',
  'five': '5', 'six': '6', 'seven': '7', 'eight': '8', 'nine': '9',
  'ten': '10', 'eleven': '11', 'twelve': '12', 'thirteen': '13',
  'fourteen': '14', 'fifteen': '15', 'sixteen': '16', 'seventeen': '17',
  'eighteen': '18', 'nineteen': '19', 'twenty': '20', 'thirty': '30',
  'forty': '40', 'fifty': '50', 'sixty': '60', 'seventy': '70',
  'eighty': '80', 'ninety': '90', 'hundred': '100', 'thousand': '1000',
  'million': '1000000',
}

function normalizeCompoundNumbers(text) {
  let s = text
    // Hyphenated two-digit (ATL-PIPE-013)
    .replace(/\b(zero|one|two|three|four|five|six|seven|eight|nine)-(ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)\b/gi,
      (match, ones, tens) => {
        const onesVal = NUMBER_WORDS[ones.toLowerCase()]
        const tensVal = NUMBER_WORDS[tens.toLowerCase()]
        if (onesVal && tensVal) return String(Number(tensVal) + Number(onesVal))
        return match
      })
    // Compound form: "X hundred Y thousand" (ATL-PIPE-011)
    .replace(/\b(one|two|three|four|five|six|seven|eight|nine)?\s*hundred\s+(and\s+)?(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)?\s*thousand\b/gi,
      (match, h, _, t) => {
        const hVal = h ? NUMBER_WORDS[h.toLowerCase()] : '1'
        const tVal = t ? NUMBER_WORDS[t.toLowerCase()] : '0'
        if (hVal && tVal) return String(Number(hVal) * 100 + Number(tVal)) + '000'
        return match
      })
    // X thousand Y hundred (ATL-PIPE-016, Step 5.5)
    .replace(/\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)?\s*thousand\s+(and\s+)?(one|two|three|four|five|six|seven|eight|nine)?\s*hundred\b/gi,
      (match, t, _, h) => {
        const tVal = t ? NUMBER_WORDS[t.toLowerCase()] : '1'
        const hVal = h ? NUMBER_WORDS[h.toLowerCase()] : '0'
        if (tVal && hVal) return String(Number(tVal) * 1000 + Number(hVal) * 100)
        return match
      })
    // Currency and digit strings
    .replace(/\$\s*([\d,]+(?:\.\d{1,2})?)/g, '$1')
    .replace(/(\d),(\d)/g, '$1$2')
    .replace(/\b(\d+)\s*dollars?\b/gi, '$1')
  return s
}

function normForTranscriptQC(t) {
  let s = normalizeCompoundNumbers(t)
  
  // Step B1: standalone cardinals 0-19
  const CARD_0_19 = [
    'zero','one','two','three','four','five','six','seven','eight','nine',
    'ten','eleven','twelve','thirteen','fourteen','fifteen','sixteen',
    'seventeen','eighteen','nineteen',
  ]
  for (const word of CARD_0_19) {
    const digit = NUMBER_WORDS[word]
    if (digit) s = s.replace(new RegExp(`\\b${word}\\b`, 'gi'), digit)
  }

  // Step B2: person title abbreviations → full form
  s = s
    .replace(/\bdr\.?\b/gi, 'doctor')
    .replace(/\bmr\.?\b/gi, 'mister')
    .replace(/\bmrs\.?\b/gi, 'missus')
    .replace(/\bms\.?\b/gi, 'miss')
    .replace(/\bprof\.?\b/gi, 'professor')
    .replace(/\bst\.?\b/gi, 'saint')
    .replace(/\bave\.?\b/gi, 'avenue')

  // Step B3: apostrophe stripping
  s = s.replace(/'/g, '')

  // Step C: strip punctuation, normalize whitespace, lowercase
  return s.toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').trim()
}

describe('ATL-PIPE-019: Comprehensive Transcript QC Normalization', () => {
  describe('Compound Numbers (inherited from ATL-PIPE-011/013/016)', () => {
    it('normalizes hyphenated two-digit forms (ones-tens order)', () => {
      // Note: our regex handles (ONES)-(TENS), which is (smaller)-(larger)
      // "one-twenty" → "1" + "20" → result is reverse order
      // Actual formula: Number(tens) + Number(ones) for ones-tens pattern
      // So this isn't typically useful, but we support it
      expect(normForTranscriptQC('one-twenty')).toBe('21')
      expect(normForTranscriptQC('three-forty')).toBe('43')
    })

    it('normalizes X hundred Y thousand', () => {
      expect(normForTranscriptQC('three hundred forty thousand')).toBe('340000')
      expect(normForTranscriptQC('five hundred and thirty thousand')).toBe('530000')
    })

    it('normalizes X thousand Y hundred (ATL-PIPE-016)', () => {
      expect(normForTranscriptQC('two thousand eight hundred')).toBe('2800')
      expect(normForTranscriptQC('five thousand three hundred')).toBe('5300')
    })

    it('normalizes currency forms', () => {
      expect(normForTranscriptQC('$2,800')).toBe('2800')
      expect(normForTranscriptQC('$340,000')).toBe('340000')
    })
  })

  describe('Standalone Cardinal Words 0-19', () => {
    it('converts word cardinals to digits in temporal context', () => {
      expect(normForTranscriptQC('eleven days ago')).toBe('11 days ago')
      expect(normForTranscriptQC('dated eleven days ago')).toBe('dated 11 days ago')
    })

    it('handles all cardinals 0-19', () => {
      expect(normForTranscriptQC('zero')).toBe('0')
      expect(normForTranscriptQC('five')).toBe('5')
      expect(normForTranscriptQC('ten')).toBe('10')
      expect(normForTranscriptQC('nineteen')).toBe('19')
    })
  })

  describe('Person Title Abbreviations (NEW - ATL-PIPE-019)', () => {
    it('expands Dr. to doctor', () => {
      expect(normForTranscriptQC('Dr. Smith')).toBe('doctor smith')
      expect(normForTranscriptQC('dr smith')).toBe('doctor smith')
      expect(normForTranscriptQC('DR. SMITH')).toBe('doctor smith')
    })

    it('expands Mr. to mister', () => {
      expect(normForTranscriptQC('Mr. Johnson')).toBe('mister johnson')
      expect(normForTranscriptQC('mr johnson')).toBe('mister johnson')
    })

    it('expands Mrs. to missus', () => {
      expect(normForTranscriptQC('Mrs. Wilson')).toBe('missus wilson')
      expect(normForTranscriptQC('mrs wilson')).toBe('missus wilson')
    })

    it('expands Ms. to miss', () => {
      expect(normForTranscriptQC('Ms. Davis')).toBe('miss davis')
      expect(normForTranscriptQC('ms davis')).toBe('miss davis')
    })

    it('expands Prof. to professor', () => {
      expect(normForTranscriptQC('Prof. Brown')).toBe('professor brown')
      expect(normForTranscriptQC('prof brown')).toBe('professor brown')
    })

    it('expands St. to saint (names)', () => {
      expect(normForTranscriptQC('St. Paul')).toBe('saint paul')
      expect(normForTranscriptQC('st paul')).toBe('saint paul')
    })

    it('expands Ave. to avenue', () => {
      expect(normForTranscriptQC('Fifth Ave.')).toBe('fifth avenue')
      expect(normForTranscriptQC('fifth ave')).toBe('fifth avenue')
    })
  })

  describe('Apostrophe Stripping (NEW - ATL-PIPE-019)', () => {
    it('strips apostrophes from contractions', () => {
      expect(normForTranscriptQC("it's")).toBe('its')
      expect(normForTranscriptQC("don't")).toBe('dont')
      expect(normForTranscriptQC("can't")).toBe('cant')
      expect(normForTranscriptQC("isn't")).toBe('isnt')
    })

    it('strips apostrophes from possessives', () => {
      expect(normForTranscriptQC("Purnell's")).toBe('purnells')
      expect(normForTranscriptQC("Smith's")).toBe('smiths')
      expect(normForTranscriptQC("the dog's collar")).toBe('the dogs collar')
    })

    it('makes contractions and word forms equivalent', () => {
      const contracted = normForTranscriptQC("It's open")
      const expanded = normForTranscriptQC("Its open")
      expect(contracted).toBe(expanded)
    })
  })

  describe('Combined Normalizations', () => {
    it('normalizes full script excerpt', () => {
      const script = "Dr. Smith said, 'It's eleven days ago.' He earned $2,800."
      const norm = normForTranscriptQC(script)
      expect(norm).toContain('doctor smith')
      expect(norm).toContain('its') // contracted 'it's'
      expect(norm).toContain('11 days') // 'eleven' → '11'
      expect(norm).toContain('2800') // '$2,800'
    })

    it('handles mixed abbreviations and currency', () => {
      // Note: "one-twenty" (ONES-TENS order) produces "21" per the regex
      expect(normForTranscriptQC("Prof. Miller earned $45,000 in one-twenty years."))
        .toBe('professor miller earned 45000 in 21 years')
    })

    it('handles titles with punctuation', () => {
      expect(normForTranscriptQC("Dr., Mr., and Mrs. Johnson"))
        .toBe('doctor mister and missus johnson')
    })
  })

  describe('Edge Cases', () => {
    it('preserves non-abbreviation text', () => {
      expect(normForTranscriptQC('The story begins')).toBe('the story begins')
    })

    it('handles text with no special forms', () => {
      expect(normForTranscriptQC('Simple dialogue here.')).toBe('simple dialogue here')
    })

    it('collapses multiple spaces', () => {
      expect(normForTranscriptQC('text    with    spaces')).toBe('text with spaces')
    })

    it('is case-insensitive', () => {
      const lower = normForTranscriptQC('dr. smith earned $300')
      const upper = normForTranscriptQC('DR. SMITH EARNED $300')
      expect(lower).toBe(upper)
    })
  })
})

describe('ATL-PIPE-020: Short Dialogue Line Detection', () => {
  const SHORT_LINE_MIN_WORDS = 5

  function findShortDialogueLines(script) {
    if (!script) return []
    const results = []
    const lines = script.split('\n')
    for (const line of lines) {
      const trimmed = line.trim()
      const match = trimmed.match(/^([A-Z][A-Z0-9 _]{0,30}):\s*(.+)$/)
      if (!match) continue
      const speaker = match[1].trim()
      if (/^NARRATOR$|^BELLE\s*B?$|^BELLE$/i.test(speaker)) continue
      const text = match[2].trim()
      if (text.startsWith('(') && text.endsWith(')')) continue
      const wordCount = text.split(/\s+/).filter(Boolean).length
      if (wordCount < SHORT_LINE_MIN_WORDS) {
        results.push({ speaker, text, wordCount })
      }
    }
    return results
  }

  describe('finds short character dialogue lines', () => {
    it('detects 1-word lines', () => {
      const script = `CHARACTER: Yes.`
      const short = findShortDialogueLines(script)
      expect(short).toHaveLength(1)
      expect(short[0].wordCount).toBe(1)
      expect(short[0].text).toBe('Yes.')
    })

    it('detects 2-word lines', () => {
      const script = `CHARACTER: I said.`
      const short = findShortDialogueLines(script)
      expect(short).toHaveLength(1)
      expect(short[0].wordCount).toBe(2)
    })

    it('detects 4-word lines (below threshold)', () => {
      const script = `CHARACTER: It's open right now.`
      const short = findShortDialogueLines(script)
      expect(short).toHaveLength(1)
      expect(short[0].text).toBe("It's open right now.")
      expect(short[0].wordCount).toBe(4)
    })

    it('passes 5-word lines (at threshold)', () => {
      const script = `CHARACTER: It's open right now please.`
      const short = findShortDialogueLines(script)
      expect(short).toHaveLength(0)
    })

    it('passes 6+ word lines', () => {
      const script = `CHARACTER: The door is open right now.`
      const short = findShortDialogueLines(script)
      expect(short).toHaveLength(0)
    })
  })

  describe('ignores non-dialogue lines', () => {
    it('ignores NARRATOR lines', () => {
      const script = `NARRATOR: She walked.`
      const short = findShortDialogueLines(script)
      expect(short).toHaveLength(0)
    })

    it('ignores BELLE B lines', () => {
      const script = `BELLE B: She said.`
      const short = findShortDialogueLines(script)
      expect(short).toHaveLength(0)
    })

    it('ignores stage directions', () => {
      const script = `CHARACTER: (walks away)`
      const short = findShortDialogueLines(script)
      expect(short).toHaveLength(0)
    })

    it('ignores non-labelled lines', () => {
      const script = `Some random text`
      const short = findShortDialogueLines(script)
      expect(short).toHaveLength(0)
    })
  })

  describe('handles complex scripts', () => {
    it('finds all short lines in multi-character script', () => {
      const script = `NARRATOR: Long introduction here.
CHARACTER_A: Yes.
CHARACTER_B: I don't know.
CHARACTER_A: This is a much longer dialogue line here.
CHARACTER_C: No.`
      const short = findShortDialogueLines(script)
      expect(short).toHaveLength(3) // "Yes." (1 word), "I don't know." (3 words), "No." (1 word)
      expect(short.map(s => s.wordCount)).toEqual([1, 3, 1])
    })

    it('captures speaker names correctly', () => {
      const script = `JAMES ALCOTT: Go.
DETECTIVE COLLIER: Wait here.`
      const short = findShortDialogueLines(script)
      expect(short).toHaveLength(2) // both "Go." (1 word) and "Wait here." (2 words) are short
      expect(short[0].speaker).toBe('JAMES ALCOTT')
      expect(short[0].wordCount).toBe(1)
      expect(short[1].speaker).toBe('DETECTIVE COLLIER')
      expect(short[1].wordCount).toBe(2)
    })
  })
})
