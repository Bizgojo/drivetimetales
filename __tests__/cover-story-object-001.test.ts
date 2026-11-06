/**
 * COVER-STORY-OBJECT-001 regression tests.
 *
 * Root defect: series scripts open with a hidden production-notes block
 * ("STORY RESOLUTION MAP — remove before audio"). The cover pipeline read the
 * first ~650 chars of the script, so the image prompt got production notes
 * instead of story — and inferKeyObjectSymbol()'s substring matching turned
 * notes vocabulary into cover directions (~30 covers since Oct 1 told to show
 * a map; "ring" also matched "during", "watch" matched "watched", "key"
 * matched "keyboard").
 *
 * Pure-module tests: no DB, no network, no image spend.
 */
import {
  stripProductionNotes,
  inferKeyObjectSymbol,
  buildCoverDirectionBrief,
  buildCoverPrompt,
} from '@/lib/coverPrompt'

const SERIES_SCRIPT_WITH_NOTES = `STORY RESOLUTION MAP — remove before audio
Ep1: introduce the map of Hollow Creek. Beat sheet: ring the bell twice, watch the stairs, key confrontation at keyboard.
Resolution: the map leads them home.

CHAPTER ONE — The Creek That Wasn't There
Mara stood at the dry creek bed where water should have been, holding her grandmother's brass compass. The wind moved through the cottonwoods while the old lantern swung from the porch rail.`;

const GENUINE_MAP_STORY = `CHAPTER ONE — The Creek That Wasn't There
Mara unfolded the surveyor's map across the tailgate, tracing the creek's vanished path with one finger. The old map showed water where only dust remained.`;

describe('COVER-STORY-OBJECT-001: production notes never drive cover direction', () => {
  it('(a) a series script WITH the STORY RESOLUTION MAP notes block must NOT yield "a visible map"', () => {
    const brief = buildCoverDirectionBrief({
      title: 'The Creek That Wasn\'t There',
      author: 'Test Author',
      genre: 'mystery',
      script: SERIES_SCRIPT_WITH_NOTES,
    })
    expect(brief.keyObjectSymbol).not.toContain('a visible map')
    // The genuine story object (lantern / compass-adjacent) may surface, but
    // the notes-driven map must not.
    expect(brief.keyObjectSymbol).not.toMatch(/map/i)
    expect(brief.settingBackground).not.toMatch(/resolution map|beat sheet/i)
  })

  it('(a2) the same notes script must not leak notes into the full prompt', () => {
    const prompt = buildCoverPrompt({
      title: 'The Creek That Wasn\'t There',
      author: 'Test Author',
      genre: 'mystery',
      concept: SERIES_SCRIPT_WITH_NOTES,
    })
    expect(prompt).not.toMatch(/STORY RESOLUTION MAP/i)
    expect(prompt).not.toMatch(/beat sheet/i)
  })

  it('(b) control: genuine story text mentioning a map still MAY yield map', () => {
    expect(inferKeyObjectSymbol(GENUINE_MAP_STORY)).toContain('a visible map')
    const brief = buildCoverDirectionBrief({
      title: 'The Creek That Wasn\'t There',
      author: 'Test Author',
      genre: 'mystery',
      script: GENUINE_MAP_STORY,
    })
    expect(brief.keyObjectSymbol).toContain('a visible map')
  })

  it('(c) whole-word matching: during/watched/keyboard must not match ring/watch/key', () => {
    expect(inferKeyObjectSymbol('The bells rang out during the storm as they crossed the bridge.')).not.toContain('ring')
    expect(inferKeyObjectSymbol('She watched the river from the porch of the old house.')).not.toContain('watch')
    expect(inferKeyObjectSymbol('He typed the confession on a dusty keyboard by the fire.')).not.toContain('key')
    // Sanity: the real whole words still match.
    expect(inferKeyObjectSymbol('She twisted the brass ring on her finger by the fire.')).toContain('ring')
    expect(inferKeyObjectSymbol('The old watch stopped at midnight near the station.')).toContain('watch')
    expect(inferKeyObjectSymbol('He turned the iron key in the chapel door. The key was cold.')).toContain('key')
  })

  it('COVER-NO-KEYS-001: one passing mention of key or map does not put it on the cover', () => {
    expect(inferKeyObjectSymbol('The key is to stay calm on the night shift.')).not.toContain('key')
    expect(inferKeyObjectSymbol('She checked the map once and drove on.')).not.toContain('map')
    expect(inferKeyObjectSymbol('A widow returns to the old house.')).not.toContain('house')
    const brief = buildCoverDirectionBrief({ title: 'T', author: 'A', genre: 'thriller', script: 'A nurse walks home.' })
    expect(brief.whatToAvoid.join(' ')).toContain('keys')
  })
})

describe('COVER-STORY-OBJECT-001: stripProductionNotes unit cases', () => {
  it('removes /* */ blocks', () => {
    const out = stripProductionNotes('Mara stood by the creek. /* PRODUCER: trim this beat */ The wind rose.')
    expect(out).not.toContain('PRODUCER')
    expect(out).toContain('Mara stood by the creek.')
    expect(out).toContain('The wind rose.')
  })

  it('removes <!-- --> blocks', () => {
    const out = stripProductionNotes('Mara stood by the creek. <!-- timing: hold 2s --> The wind rose.')
    expect(out).not.toContain('timing')
    expect(out).toContain('Mara stood by the creek.')
  })

  it('removes a STORY RESOLUTION MAP block through the next blank line, keeping the story', () => {
    const out = stripProductionNotes(SERIES_SCRIPT_WITH_NOTES)
    expect(out).not.toMatch(/STORY RESOLUTION MAP/i)
    expect(out).not.toMatch(/beat sheet/i)
    expect(out).toContain("CHAPTER ONE — The Creek That Wasn't There")
    expect(out).toContain('brass compass')
  })

  it('handles a notes header with no trailing blank line (safety bound, story preserved)', () => {
    const out = stripProductionNotes(
      'STORY RESOLUTION MAP — remove before audio\nnote line one\nnote line two'
    )
    expect(out).not.toMatch(/STORY RESOLUTION MAP/i)
  })

  it('passes clean story text through untouched', () => {
    expect(stripProductionNotes(GENUINE_MAP_STORY)).toBe(GENUINE_MAP_STORY.trim())
  })

  it('returns empty string for non-string input', () => {
    expect(stripProductionNotes(undefined)).toBe('')
  })
})
