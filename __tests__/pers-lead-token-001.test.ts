/**
 * PERS-LEAD-TOKEN-001 (Orion, 2026-11-17)
 *
 * A Belle intro whose [LISTENER_NAME] LEADS the line must still produce a
 * non-null announcement_url. Before this fix, generateBelleIntroWithName took
 * the standalone branch and wrote announcement_url = null, which permanently
 * blocked publishing under personalizationPublishBlockers() (CANON-04 rule 44 /
 * CANON-08 rule 27). 112 stories were stranded this way.
 *
 * These are source-level assertions: the route module needs a live Supabase +
 * ElevenLabs context to execute, so we lock the structure instead.
 */
import fs from 'fs'
import { personalizationPublishBlockers } from '@/lib/personalization/publishGuard'

const SRC = fs.readFileSync('app/api/admin/generate-voices/route.ts', 'utf8')

describe('PERS-LEAD-TOKEN-001 — lead-token intros still get an announcement_url', () => {
  test('stripListenerToken helper exists and removes the token plus leading punctuation', () => {
    expect(SRC).toMatch(/function stripListenerToken\(text: string\): string/)
    // eslint-disable-next-line no-new-func
    const fn = new Function(
      'text',
      `return String(text || '')
        .replace(/\\[LISTENER_NAME\\]/g, '')
        .replace(/\\s{2,}/g, ' ')
        .replace(/^\\s*[,;:.!?\\u2014\\u2013-]+\\s*/, '')
        .trim()`
    ) as (t: string) => string
    expect(fn('[LISTENER_NAME], "Mercy Island," Episode Sixteen: "What Maeve Kept."'))
      .toBe('"Mercy Island," Episode Sixteen: "What Maeve Kept."')
    expect(fn('Hi, [LISTENER_NAME], welcome back.').startsWith('Hi,')).toBe(true)
    expect(fn('[LISTENER_NAME]')).toBe('')
  })

  test('no Belle-intro path writes announcement_url: null unconditionally', () => {
    // Every `announcement_url: null` in this route must now be a fallback that is
    // preceded by a name-free render attempt, never the split-branch default.
    // Call sites only (skip the `async function generateBelleIntroWithName(` definition).
    const splitBranches = SRC.split('await generateBelleIntroWithName(').slice(1)
    expect(splitBranches.length).toBeGreaterThanOrEqual(2)
    for (const branch of splitBranches) {
      const window = branch.slice(0, 2000)
      expect(window).toContain('stripListenerToken(announcementText)')
      expect(window).toContain("'announcement'")
    }
  })

  test('both split branches reference a name-free announcement variable', () => {
    const hits = SRC.match(/leadAnnouncementUrl/g) || []
    expect(hits.length).toBeGreaterThanOrEqual(6) // declare + assign x2 + set x2 (approx)
  })

  test('a lead-token story with a name-free announcement passes the publish guard', () => {
    const story = {
      announcement_url: 'https://example.test/announcement.mp3',
      announcement_text: '[LISTENER_NAME], "Mercy Island," Episode Sixteen.',
      script: 'BELLE B: [LISTENER_NAME], "Mercy Island," Episode Sixteen.\nNARRATOR: The rain came.',
    }
    expect(personalizationPublishBlockers(story)).toEqual([])
  })

  test('a lead-token story WITHOUT a name-free announcement is still blocked (guard intact)', () => {
    const story = {
      announcement_url: null,
      announcement_text: '[LISTENER_NAME], "Mercy Island," Episode Sixteen.',
      script: 'BELLE B: [LISTENER_NAME], "Mercy Island," Episode Sixteen.\nNARRATOR: The rain came.',
    }
    const blockers = personalizationPublishBlockers(story)
    expect(blockers.length).toBeGreaterThan(0)
    expect(blockers.join(' ')).toMatch(/announcement_url is missing/)
  })
})
