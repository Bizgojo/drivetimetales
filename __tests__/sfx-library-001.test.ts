import { matchSfxCue, sfxWords, sfxLibraryEnabled, type SfxLibraryEntry } from '@/lib/sfxLibrary'
import { nameFromFile } from '../scripts/sfx-library-ingest'

const e = (id: string, name: string, extra = ''): SfxLibraryEntry => ({ id, path: `sfx-library/${id}.mp3`, name, tags: sfxWords(`${name} ${extra}`) })

const LIB: SfxLibraryEntry[] = [
  e('sonniss/weapgun-pistol-shot-close', 'Pistol Shot Close Indoor', 'WEAPGun'),
  e('sonniss/door-wood-slam', 'Door Wood Slam Heavy', 'DOORWood'),
  e('sonniss/door-creak-open', 'Door Creak Open Slow'),
  e('sonniss/phone-vibrate-table', 'Cell Phone Vibrate On Table'),
  e('sonniss/car-tire-skid', 'Car Tire Skid Asphalt'),
  e('sonniss/footsteps-concrete', 'Footsteps Concrete Walking Hard Shoes'),
  e('sonniss/rain-window', 'Rain On Window Steady'),
  e('sonniss/glass-shatter', 'Glass Window Shatter'),
]

describe('SFX-LIBRARY-001 matcher', () => {
  test.each([
    ['[SFX: a single gunshot, close]', 'sonniss/weapgun-pistol-shot-close'],
    ['door slams shut', 'sonniss/door-wood-slam'],
    ['a door creaks open', 'sonniss/door-creak-open'],
    ['phone buzzing on the desk', 'sonniss/phone-vibrate-table'],
    ['tires screeching', 'sonniss/car-tire-skid'],
    ['footsteps on concrete', 'sonniss/footsteps-concrete'],
    ['heavy rain against the window', 'sonniss/rain-window'],
    ['glass shattering', 'sonniss/glass-shatter'],
  ])('%s → %s', (cue, id) => {
    expect(matchSfxCue(cue, LIB)?.entry.id).toBe(id)
  })

  test('no good match → null (falls back to ElevenLabs)', () => {
    expect(matchSfxCue('a helicopter passes overhead', LIB)).toBeNull()
    expect(matchSfxCue('tense silence', LIB)).toBeNull()
    expect(matchSfxCue('', LIB)).toBeNull()
  })

  test('shared filler words alone never match', () => {
    expect(matchSfxCue('slow and heavy', LIB)).toBeNull()
  })

  test('UCS file names become readable names', () => {
    expect(nameFromFile('/x/WEAPGun_Pistol Shot Close Indoor_SNS_GDC.wav')).toBe('Pistol Shot Close Indoor')
    expect(nameFromFile('/x/door_slam-heavy.wav')).toBe('door slam heavy')
  })

  test('off unless SFX_LIBRARY=on', () => {
    expect(sfxLibraryEnabled({})).toBe(false)
    expect(sfxLibraryEnabled({ SFX_LIBRARY: 'on' })).toBe(true)
  })
})
