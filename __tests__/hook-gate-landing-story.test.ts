/**
 * hook-gate-landing-story.test.ts
 *
 * Tests the LANDING-STORY-001 hook keyword gate exemption (Option A — Marc ruling 2026-07-25)
 * using the REAL runHookGate exported from lib/hookGate.ts, not a local reimplementation.
 *
 * Marc requirement (2026-07-25 11:32 EDT): import and exercise the actual runHookGate path;
 * verify the exact bug fix: isLandingHookExempt gates the hook check while isBelleExempt
 * (which also matches "No Belle B") only gates the Belle check.
 *
 * Mocking strategy:
 *   - @supabase/supabase-js: stub createClient so module load succeeds; checkGenre returns pass
 *   - lib/artifactGate: stub verifyArtifactHttp to return 200 for any URL
 */

// ── Mocks (must be before any imports that load the mocked modules) ────────

jest.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: () => ({
      select: () => ({
        ilike: () => ({
          single: () => Promise.resolve({
            data: { name: 'Mystery', sound_profile: 'atmospheric-mystery' },
            error: null,
          }),
        }),
      }),
    }),
  }),
}))

jest.mock('../lib/artifactGate', () => ({
  verifyArtifactHttp: async (url: string) => ({
    reachable: Boolean(url),
    httpStatus: url ? 200 : null,
    error: null,
  }),
}))

// ── Real import ─────────────────────────────────────────────────────────────

import { runHookGate } from '../lib/hookGate'

// ── Test helpers ─────────────────────────────────────────────────────────────

const AUDIO_URL = 'https://cdn.example.com/test_mix.mp3'
const COVER_URL = 'https://cdn.example.com/test_cover.jpg'
const GENRE = 'Mystery'

// A script with no hook-signal NARRATOR lines — would fail on any normal story
const NO_HOOK_NARRATOR = `
[START AUDIO DRAMA SCRIPT]
NARRATOR: It was a calm and ordinary evening in the suburbs.
NARRATOR: The neighbourhood was quiet, children long since in bed.
NARRATOR: Nothing about the night suggested anything would change.
`

// ── Tests ───────────────────────────────────────────────────────────────────

describe('runHookGate — LANDING-STORY-001 hook exemption (real function, Marc ruling 2026-07-25)', () => {
  test('LANDING-STORY-001 variant: hook check returns "na", gate does not fail on hook', async () => {
    const script = `VARIANT: LANDING-STORY-001
NARRATOR: Iris Calloway
GENRE: Mystery
${NO_HOOK_NARRATOR}
BELLE B OUTRO
BELLE B: Thanks for listening.
`
    const result = await runHookGate({
      storyId: 'test-landing-story-001',
      script,
      genre: GENRE,
      audioUrl: AUDIO_URL,
      coverUrl: COVER_URL,
    })

    // Hook must be 'na' — exempt, not 'fail'
    expect(result.checks.hook.status).toBe('na')
    expect(result.checks.hook.detail).toMatch(/LANDING-STORY-001/i)
    expect(result.checks.hook.detail).toMatch(/LLM hook rubric/i)

    // No hook failure in the failures array
    expect(result.failures.some(f => f.includes('[hook]'))).toBe(false)

    // Belle: LANDING-STORY-001 also grants Belle exemption (isBelleExempt matches)
    // Belle check returns 'pass' even though the script has a BELLE B OUTRO present
    // (the exemption skips the check entirely)
    expect(result.checks.belle.status).toBe('pass')
  })

  test('"No Belle B" variant (non-LANDING-STORY-001): hook FAILS, Belle exempt — regression guard', async () => {
    // This is the exact regression the scope fix prevents:
    // A story with VARIANT: No Belle B (not LANDING-STORY-001) must NOT get the hook exemption.
    // isBelleExempt matches "No Belle B" — but isLandingHookExempt does NOT.
    // Hook keyword gate fires normally → no hooks → 'fail'.
    // Belle check is still exempt (isBelleExempt = true for "No Belle B").
    const script = `VARIANT: No Belle B
NARRATOR: Clara Voss
GENRE: Drama
${NO_HOOK_NARRATOR}
`
    const result = await runHookGate({
      storyId: 'test-no-belle-b-non-landing',
      script,
      genre: GENRE,
      audioUrl: AUDIO_URL,
      coverUrl: COVER_URL,
    })

    // Hook must FAIL — "No Belle B" does NOT grant hook keyword exemption
    expect(result.checks.hook.status).toBe('fail')
    expect(result.checks.hook.detail).not.toMatch(/LANDING-STORY-001/i)
    expect(result.failures.some(f => f.includes('[hook]'))).toBe(true)

    // Belle IS exempt — "No Belle B" grants Belle exemption (correct behaviour)
    expect(result.checks.belle.status).toBe('pass')

    // Gate fails overall (hook is hard-fail)
    expect(result.pass).toBe(false)
  })

  test('Ordinary story with VARIANT: STANDARD and no hook keywords: hook fails, Belle required', async () => {
    // Baseline: a standard story with no hook or Belle blocks fails both checks.
    const script = `VARIANT: STANDARD
NARRATOR: Jane Smith
GENRE: Drama
${NO_HOOK_NARRATOR}
`
    const result = await runHookGate({
      storyId: 'test-standard-no-hook',
      script,
      genre: GENRE,
      audioUrl: AUDIO_URL,
      coverUrl: COVER_URL,
    })

    // Hook fails — no hook keywords
    expect(result.checks.hook.status).toBe('fail')

    // Belle fails — no BELLE B ANNOUNCEMENT or OUTRO
    expect(result.checks.belle.status).toBe('fail')

    // Gate fails overall
    expect(result.pass).toBe(false)
  })
})
