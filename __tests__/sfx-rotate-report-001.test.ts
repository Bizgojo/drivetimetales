import { pickSfxVariant, sfxWords, type SfxLibraryEntry } from '@/lib/sfxLibrary'
import { buildSfxReport } from '@/lib/sfxReport'
import { parseSFXDuration, cleanSFXDescription } from '@/lib/sfxGenerate'

const e = (id: string, name: string): SfxLibraryEntry => ({ id, path: `sfx-library/${id}.mp3`, name, tags: sfxWords(name), status: 'approved' })
const LIB = [
  e('s2/pistol-1', 'pistol shot close indoor 1'),
  e('s2/pistol-2', 'pistol shot close indoor 2'),
  e('s2/pistol-3', 'pistol shot close indoor 3'),
  e('s2/door', 'door slam'),
]

describe('SFX-ROTATE-001', () => {
  test('different places in a story get different takes; the same place always the same', () => {
    const picks = new Set(Array.from({ length: 12 }, (_, i) => pickSfxVariant('a pistol shot close by', LIB, `story:${i}`)!.entry.id))
    expect(picks.size).toBeGreaterThan(1)
    expect([...picks].every((id) => id.startsWith('s2/pistol'))).toBe(true)
    expect(pickSfxVariant('a pistol shot', LIB, 'story:7')!.entry.id).toBe(pickSfxVariant('a pistol shot', LIB, 'story:7')!.entry.id)
  })
  test('never rotates into a worse match', () => {
    for (let i = 0; i < 10; i += 1) expect(pickSfxVariant('door slams', LIB, `s:${i}`)!.entry.id).toBe('s2/door')
  })
})

describe('SFX-REPORT-001', () => {
  test('lists every effect with where it plays and where it came from', () => {
    const report = buildSfxReport('Wrong Side of the River', [{
      episodeNumber: 1,
      title: 'Lower Wacker',
      positions: [
        { index: 4, kind: 'voice', speaker: 'NARRATOR', text: 'Rain on Lower Wacker.' } as any,
        { index: 5, kind: 'sfx', text: 'three pistol shots echo' } as any,
        { index: 6, kind: 'voice', speaker: 'NICK', text: 'Get down!' } as any,
      ],
      scriptSources: { 5: { cue: 'three pistol shots echo', kind: 'library', libraryName: 'pistol shots rapid three 1', at: '' } },
      overlay: { storyId: 's', genre: 'Thriller', createdAt: '', model: null, cues: [{ beforeIndex: 4, cue: 'rain on concrete', durationSec: 3, file: 'f.mp3', source: { kind: 'ai' } }] },
    }])
    expect(report).toMatch(/1 effects used your kept sounds; 1 were AI-made/)
    expect(report).toMatch(/line 5 \(script\): asked for "three pistol shots echo" → YOUR SOUND: pistol shots rapid three 1/)
    expect(report).toMatch(/plays before NICK: Get down!/)
    expect(report).toMatch(/line 4 \(action\): asked for "rain on concrete" → AI-made/)
    expect(report.indexOf('line 4')).toBeLessThan(report.indexOf('line 5'))
  })
})

describe('sfxGenerate helpers moved intact', () => {
  test('durations and cleaning', () => {
    expect(parseSFXDuration('massive iron bell strike, 8s')).toBe(8)
    expect(parseSFXDuration('heavy door slam')).toBe(1.5)
    expect(cleanSFXDescription('latch snap 1.5s')).toBe('latch snap')
  })
})
