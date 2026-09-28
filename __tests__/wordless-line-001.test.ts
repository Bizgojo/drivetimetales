/**
 * WORDLESS-LINE-001 (Marc GO 2026-09-28)
 *
 * Origin 2.0 EP03 had 8 audible artifacts. Cause: the script uses
 * "NARRATOR: ---" as a scene break; the pipeline sent "---" to ElevenLabs,
 * which produced random noises (Whisper heard "guitar", "Bye", "Alright").
 *
 * A speaker line with no letters/digits must become a short PAUSE at the SAME
 * index (so no existing story's segment numbering shifts), and every copy of
 * the ATL-PARSER-001 parser must agree.
 */

import fs from 'fs'
import path from 'path'
import {
  parseScriptPositions,
  isWordlessSpokenText,
  SCENE_BREAK_PAUSE_SECONDS,
} from '@/lib/scriptLineIndex'

// eslint-disable-next-line @typescript-eslint/no-var-requires
const check1 = require('../lib/validation-gate/check1-duplicate-segments.js')

/** Load the garble gate's parser port without running the CLI (it executes on require). */
function loadGarbleGateParser(): (script: string) => any[] {
  const src = fs.readFileSync(path.join(__dirname, '..', 'garble-detection-gate.js'), 'utf8')
  const start = src.indexOf('const HEADER_KEYS')
  const end = src.indexOf('// Argument parsing')
  expect(start).toBeGreaterThan(-1)
  expect(end).toBeGreaterThan(start)
  // eslint-disable-next-line no-new-func
  return new Function(`${src.slice(start, end)}; return parseScriptPositions;`)()
}

// Shape of the real EP03 script (excerpt): intro, narration, "NARRATOR: ---" breaks, outro.
const EP03_LIKE = [
  'NARRATOR: Ray Dolan - Science',
  '',
  'BELLE B: [LISTENER_NAME], welcome to Origin 2.0: A Cosmic Journey. Episode Three.',
  '',
  'NARRATOR: Three thousand Kelvin.',
  '',
  'NARRATOR: That is the temperature at which the universe changed.',
  '',
  'NARRATOR: ---',
  '',
  'NARRATOR: Before recombination, photons could not travel.',
  '',
  'NARRATOR: ---',
  '',
  'NARRATOR: We call it the Cosmic Microwave Background.',
  '',
  'BELLE B: Origin 2.0, written by Marc Postlewaite — an Endless Tales original.',
].join('\n')

describe('isWordlessSpokenText', () => {
  test.each(['---', '— — —', '* * *', '…', '...', '###', '', '   '])('%p is wordless', (t) => {
    expect(isWordlessSpokenText(t)).toBe(true)
  })

  test.each(['A supernova.', '3', '2.7 Kelvin', 'Hmm.', 'Él', 'OK — go.', '1965'])('%p is spoken', (t) => {
    expect(isWordlessSpokenText(t)).toBe(false)
  })
})

describe('parseScriptPositions — scene breaks become silence at the same index', () => {
  const positions = parseScriptPositions(EP03_LIKE)
  const byText = (t: string) => positions.find((p) => p.text === t)

  test('"NARRATOR: ---" is silence, not voice', () => {
    const breaks = positions.filter((p) => p.kind === 'silence')
    expect(breaks).toHaveLength(2)
    for (const b of breaks) {
      expect(b.speaker).toBe('PAUSE')
      expect(b.text).toBe(SCENE_BREAK_PAUSE_SECONDS)
      expect(b.isExpected).toBe(true) // still gets a segment_NNNN.mp3 (silence) so the mix has the gap
    }
    expect(positions.some((p) => p.kind === 'voice' && p.text === '---')).toBe(false)
  })

  test('indices do NOT shift — same count and order as before the fix', () => {
    // Every counted line still counts exactly once, in order.
    expect(positions.map((p) => p.index)).toEqual(positions.map((_, i) => i))
    expect(byText('Before recombination, photons could not travel.')?.index).toBe(4)
    expect(byText('We call it the Cosmic Microwave Background.')?.index).toBe(6)
  })

  test('announcer lines are untouched', () => {
    const ann = positions.filter((p) => p.speaker === 'BELLE B')
    expect(ann).toHaveLength(2)
    expect(ann.every((p) => p.kind === 'voice' && p.isExpected === false)).toBe(true)
  })

  test('bracketed form "[NARRATOR]: ---" is handled the same way', () => {
    const p = parseScriptPositions('[NARRATOR]: One.\n[NARRATOR]: ---\n[NARRATOR]: Two.')
    expect(p.map((x) => x.kind)).toEqual(['voice', 'silence', 'voice'])
    expect(p.map((x) => x.index)).toEqual([0, 1, 2])
  })
})

describe('every parser copy agrees (ATL-PARSER-001 "MUST stay in sync")', () => {
  const garbleParse = loadGarbleGateParser()
  const EP2_BACKUP = path.join(__dirname, '../docs/bell-ep2/backup/EP2-DB-SCRIPT-BACKUP-20260808.md')
  const scripts: Array<[string, string]> = [
    ['EP03-like', EP03_LIKE],
    ['bracketed', '[NARRATOR]: One.\n[NARRATOR]: ---\n[PAUSE]\n[NARRATOR]: Two.\n[SFX: door]\nNARRATOR: * * *'],
  ]
  if (fs.existsSync(EP2_BACKUP)) scripts.push(['Bell EP2 backup', fs.readFileSync(EP2_BACKUP, 'utf8')])

  const shape = (ps: any[]) => ps.map((p) => [p.index, p.kind, p.speaker, p.text, p.isExpected])

  test.each(scripts)('%s: validation-gate check1 port matches lib', (_name, script) => {
    expect(shape(check1.parseScriptPositions(script))).toEqual(shape(parseScriptPositions(script)))
  })

  test.each(scripts)('%s: garble gate port matches lib', (_name, script) => {
    expect(shape(garbleParse(script))).toEqual(shape(parseScriptPositions(script)))
  })
})
