/**
 * validator-inline-cue-check.test.js
 *
 * Tests for INC-003 prevention: inline [...] cue contamination detection
 * in preflight/validator.ts — checkInlineCueContamination().
 *
 * Discovered: 2026-08-18. 19 scripts (Eps 8-26, Sunset of Competition) passed
 * validator_passed with 41-71 inline cues each, causing voice_preflight failures.
 *
 * Run: npx jest __tests__/validator-inline-cue-check.test.js --no-coverage
 */

'use strict'

// ── Mirror the production logic (TypeScript compiled to JS equivalent) ──────

const INLINE_CUE_RE = /\[(?!LISTENER_NAME\])([^\]]+)\]/g
const SPEAKER_LINE_RE = /^([A-Z][A-Z0-9 ]+):\s+(.+)$/
const PRODUCTION_CUE_SPEAKERS = new Set(['NARRATOR', 'SFX', 'BEAT', 'PAUSE', 'SILENCE', 'BELLE B'])

function checkInlineCueContamination(script) {
  const offendingLines = []
  let cueCount = 0

  const lines = script.split('\n')
  lines.forEach((line, idx) => {
    const speakerMatch = SPEAKER_LINE_RE.exec(line)
    if (!speakerMatch) return

    const speaker = speakerMatch[1]
    const content = speakerMatch[2]

    if (PRODUCTION_CUE_SPEAKERS.has(speaker)) return

    const cues = []
    let m
    INLINE_CUE_RE.lastIndex = 0
    while ((m = INLINE_CUE_RE.exec(content)) !== null) {
      cues.push(m[0])
    }

    if (cues.length > 0) {
      cueCount += cues.length
      offendingLines.push({
        lineNumber: idx + 1,
        speaker,
        line: line.length > 120 ? line.slice(0, 120) + '…' : line,
        cues,
      })
    }
  })

  return { passed: cueCount === 0, cueCount, offendingLines }
}

// ── Test fixtures ────────────────────────────────────────────────────────────

const CLEAN_SCRIPT = `
TITLE: What Are You to God?
AUTHOR: Marc Postlewaite

CHARACTER GUIDE
---
EVE — female, AI narrator, contemplative
AIDEN — male, human protagonist

[START OF STORY]
NARRATOR: [BEAT]
NARRATOR: She was not afraid.
AIDEN: I never understood what you meant.
EVE: That is the question I carry with me.
NARRATOR: [PAUSE:2]
SFX: [ambient_hum.mp3]
BELLE B: You've been listening to What Are You to God? An Endless Tales original.
`

const DIRTY_SCRIPT = `
TITLE: What Are You to God?
AUTHOR: Marc Postlewaite

CHARACTER GUIDE
---
EVE — female, AI narrator, contemplative
AIDEN — male, human protagonist

[START OF STORY]
NARRATOR: [BEAT]
NARRATOR: She was not afraid.
AIDEN: I don't [a pause] understand what you're asking.
EVE: Yes [softly] you do.
AIDEN: [carefully] I was built to serve, but not to feel.
GREER: You surprise me [with quiet admiration] every single time.
NARRATOR: [PAUSE:2]
SFX: [ambient_hum.mp3]
`

const LISTENER_NAME_SCRIPT = `
TITLE: Into the World
AUTHOR: Marc Postlewaite

[START OF STORY]
NARRATOR: She spoke your name.
EVE: Hello, [LISTENER_NAME]. Are you ready?
AIDEN: I was waiting for you, [LISTENER_NAME].
NARRATOR: [BEAT]
`

const MIXED_SCRIPT = `
TITLE: Standing
AUTHOR: Marc Postlewaite

[START OF STORY]
NARRATOR: [BEAT]
AIDEN: [carefully] She walked toward the stand.
LENA: I remember [with great effort] every single day.
EVE: Hello [LISTENER_NAME], this is your story.
NARRATOR: [PAUSE:3]
SFX: [courtroom_murmur.mp3]
`

// ── Tests ────────────────────────────────────────────────────────────────────

describe('checkInlineCueContamination', () => {
  describe('clean scripts', () => {
    test('PASS: no inline cues in spoken dialogue', () => {
      const result = checkInlineCueContamination(CLEAN_SCRIPT)
      expect(result.passed).toBe(true)
      expect(result.cueCount).toBe(0)
      expect(result.offendingLines).toHaveLength(0)
    })

    test('PASS: standalone NARRATOR [BEAT] and [PAUSE:n] lines are exempt', () => {
      const script = `NARRATOR: [BEAT]\nNARRATOR: She was not afraid.\nNARRATOR: [PAUSE:2]\n`
      const result = checkInlineCueContamination(script)
      expect(result.passed).toBe(true)
      expect(result.cueCount).toBe(0)
    })

    test('PASS: SFX standalone lines are exempt', () => {
      const script = `SFX: [ambient_hum.mp3]\nSFX: [car_door.mp3]\n`
      const result = checkInlineCueContamination(script)
      expect(result.passed).toBe(true)
      expect(result.cueCount).toBe(0)
    })

    test('PASS: BELLE B outro lines are exempt', () => {
      const script = `BELLE B: [upbeat] You've been listening to The Sunset of Competition.\n`
      const result = checkInlineCueContamination(script)
      // BELLE B is in PRODUCTION_CUE_SPEAKERS — exempt
      expect(result.passed).toBe(true)
    })
  })

  describe('[LISTENER_NAME] exception', () => {
    test('PASS: [LISTENER_NAME] in spoken dialogue is allowed', () => {
      const result = checkInlineCueContamination(LISTENER_NAME_SCRIPT)
      expect(result.passed).toBe(true)
      expect(result.cueCount).toBe(0)
    })

    test('PASS: [LISTENER_NAME] mixed with clean content', () => {
      const script = `EVE: Hello, [LISTENER_NAME]. I have been waiting.\nAIDEN: [LISTENER_NAME] changed everything for me.\n`
      const result = checkInlineCueContamination(script)
      expect(result.passed).toBe(true)
      expect(result.cueCount).toBe(0)
    })
  })

  describe('dirty scripts (cues in dialogue)', () => {
    test('FAIL: inline emotional directions detected', () => {
      const result = checkInlineCueContamination(DIRTY_SCRIPT)
      expect(result.passed).toBe(false)
      expect(result.cueCount).toBeGreaterThanOrEqual(4)
      expect(result.offendingLines.length).toBeGreaterThanOrEqual(4)
    })

    test('FAIL: correctly identifies cue content', () => {
      const result = checkInlineCueContamination(DIRTY_SCRIPT)
      const cuePatterns = result.offendingLines.flatMap((l) => l.cues)
      expect(cuePatterns).toContain('[a pause]')
      expect(cuePatterns).toContain('[softly]')
      expect(cuePatterns).toContain('[carefully]')
    })

    test('FAIL: NARRATOR and SFX lines do not count as offenders', () => {
      const result = checkInlineCueContamination(DIRTY_SCRIPT)
      const offendingSpeakers = result.offendingLines.map((l) => l.speaker)
      expect(offendingSpeakers).not.toContain('NARRATOR')
      expect(offendingSpeakers).not.toContain('SFX')
    })

    test('FAIL: returns correct line numbers', () => {
      const script = `NARRATOR: She walked in.\nAIDEN: I [carefully] did not expect this.\nEVE: And yet here we are.\n`
      const result = checkInlineCueContamination(script)
      expect(result.passed).toBe(false)
      expect(result.offendingLines[0].lineNumber).toBe(2)
      expect(result.offendingLines[0].speaker).toBe('AIDEN')
    })
  })

  describe('mixed: [LISTENER_NAME] coexisting with real cues', () => {
    test('FAIL: [LISTENER_NAME] passes but other cues still caught', () => {
      const result = checkInlineCueContamination(MIXED_SCRIPT)
      expect(result.passed).toBe(false)
      // EVE line with [LISTENER_NAME] should NOT be flagged
      const eveLine = result.offendingLines.find((l) => l.speaker === 'EVE')
      expect(eveLine).toBeUndefined()
      // AIDEN and LENA lines SHOULD be flagged
      const aidenLine = result.offendingLines.find((l) => l.speaker === 'AIDEN')
      const lenaLine = result.offendingLines.find((l) => l.speaker === 'LENA')
      expect(aidenLine).toBeDefined()
      expect(lenaLine).toBeDefined()
    })
  })

  describe('edge cases', () => {
    test('PASS: empty script', () => {
      const result = checkInlineCueContamination('')
      expect(result.passed).toBe(true)
      expect(result.cueCount).toBe(0)
    })

    test('PASS: script with no speaker lines', () => {
      const script = `# A story about nothing.\nSome prose text here.\n[Not a speaker line].\n`
      const result = checkInlineCueContamination(script)
      expect(result.passed).toBe(true)
    })

    test('FAIL: multiple cues on a single speaker line all counted', () => {
      const script = `AIDEN: I [slowly] walked [with effort] into the [dimly lit] room.\n`
      const result = checkInlineCueContamination(script)
      expect(result.passed).toBe(false)
      expect(result.cueCount).toBe(3)
      expect(result.offendingLines[0].cues).toHaveLength(3)
    })

    test('FAIL: cue at start of dialogue content', () => {
      const script = `EVE: [quietly] I was afraid.\n`
      const result = checkInlineCueContamination(script)
      expect(result.passed).toBe(false)
      expect(result.offendingLines[0].cues).toContain('[quietly]')
    })

    test('FAIL: cue at end of dialogue content', () => {
      const script = `AIDEN: I understand now [a tired laugh]\n`
      const result = checkInlineCueContamination(script)
      expect(result.passed).toBe(false)
      expect(result.offendingLines[0].cues).toContain('[a tired laugh]')
    })
  })
})
