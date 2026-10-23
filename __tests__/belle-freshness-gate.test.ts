/**
 * BELLE-FRESHNESS-001 tests — publication-time render-freshness
 * enforcement (Marc 2026-10-23 standing invalidation/freshness rule +
 * 16:20 safeguard order; bound clearance Marc 2026-10-23 16:37 item 3).
 *
 * Proves, with zero DB / zero network / zero writes:
 *   (a) fingerprint: stable, flips on any Belle word change, ignores
 *       whitespace-only AND numeral-only rewrites (Two-vs-2 keeps the
 *       fingerprint — never regen), empty when no Belle text;
 *   (b) text-set stamp: first stamp (or changed text) marks the explicit
 *       stale flag and VOIDS the render bindings; identical text
 *       preserves render evidence;
 *   (c) rebuild clearance: clears ONLY when the render request's text
 *       fingerprint equals the current text AND the request produced an
 *       output asset (both bindings recorded). The render timestamp is
 *       audit-only: a LATER timestamp with broken bindings keeps stale,
 *       and an EARLIER/unparseable timestamp with intact bindings clears.
 *       Timestamp alone NEVER clears;
 *   (d) publish gate: stale-after-text-change refused, bound rebuild
 *       passes, asset mismatch refused, unbound legacy envelope refused,
 *       timestamp-equal-with-bindings passes, refusal performs ZERO
 *       writes, existing-file-without-evidence refused;
 *   (e) production wiring: persistBelleRepair stamps the envelope in the
 *       same atomic payload; rebase carries the stamp; the autonomous
 *       single/series readiness predicates refuse stale mixes;
 *   (f) transcription verification (verifyTranscriptAgainstScript) does
 *       an ACTUAL transcript-vs-script word comparison — the fingerprint
 *       is never called transcription verification.
 */

import {
  BELLE_FRESHNESS_STALE_CODE,
  applyMixRebuildClearance,
  assertBelleFreshForPublish,
  BelleFreshnessError,
  currentBelleFingerprint,
  evaluateBelleFreshnessForPublish,
  fingerprintBelleText,
  freshnessEnvelopeForTextSet,
  readBelleFreshness,
  setBelleFreshness,
  verifyTranscriptAgainstScript,
} from '@/lib/belleFreshness'
import {
  persistBelleRepair,
  rebaseRepairedScriptJson,
} from '@/lib/belleRepairPersist'
import {
  evaluateSeriesDirectReadiness,
  evaluateSingleDirectReadiness,
} from '@/lib/directPublish'

const T0 = '2026-10-23T15:00:00.000Z'
const T1 = '2026-10-23T16:00:00.000Z'
const T2 = '2026-10-23T17:00:00.000Z'
const T3 = '2026-10-23T18:00:00.000Z'

const MIX_URL = 'https://cdn.example/asc3/story-fresh-1/final_mix.mp3'
const OTHER_MIX_URL = 'https://cdn.example/asc3/story-fresh-1/final_mix_v2.mp3'

const INTRO_V1 =
  'The Hollow Ledger hides a ledger that was wrong, and no one knows why it never added up.'
const OUTRO_V1 =
  'The Hollow Ledger closes with Jane Doe reading for Marc Postlewaite, a quiet reckoning.'
const OUTRO_V2 =
  'The Hollow Ledger closes with Jane Doe reading for Marc Postlewaite, a quiet reckoning, and one last secret.'

function scriptFor(intro: string, outro: string): string {
  return [
    'TITLE: The Hollow Ledger',
    'NARRATOR: Jane Doe',
    `BELLE B: ${intro}`,
    'Once upon a ledger, numbers moved in the dark.',
    `BELLE B: ${outro}`,
  ].join('\n')
}

const SCRIPT_V1 = scriptFor(INTRO_V1, OUTRO_V1)
const SCRIPT_V2 = scriptFor(INTRO_V1, OUTRO_V2)

const FP_V1 = currentBelleFingerprint(SCRIPT_V1)
const FP_V2 = currentBelleFingerprint(SCRIPT_V2)

function freshEnvelope() {
  return {
    fingerprint: FP_V1,
    text_changed_at: T1,
    audio_stale: false,
    last_verified_render_at: T2,
    render_request_fingerprint: FP_V1,
    verified_audio_asset: MIX_URL,
  }
}

function freshEpisode() {
  return {
    id: 'story-fresh-1',
    title: 'The Hollow Ledger',
    script: SCRIPT_V1,
    script_json: { series_generation: { belle_freshness: freshEnvelope() } },
    audio_url: MIX_URL,
  }
}

function staleStampedDoc() {
  return setBelleFreshness({}, {
    fingerprint: FP_V1,
    text_changed_at: T1,
    audio_stale: true,
    last_verified_render_at: null,
    render_request_fingerprint: null,
    verified_audio_asset: null,
  })
}

// ── (a) fingerprint ────────────────────────────────────────────────────

describe('fingerprintBelleText', () => {
  test('stable for identical input', () => {
    expect(fingerprintBelleText(INTRO_V1, OUTRO_V1)).toBe(
      fingerprintBelleText(INTRO_V1, OUTRO_V1)
    )
  })

  test('flips on any Belle word change', () => {
    expect(fingerprintBelleText(INTRO_V1, OUTRO_V2)).not.toBe(
      fingerprintBelleText(INTRO_V1, OUTRO_V1)
    )
  })

  test('ignores whitespace-only rewrites', () => {
    expect(fingerprintBelleText(`  ${INTRO_V1}  \n`, OUTRO_V1)).toBe(
      fingerprintBelleText(INTRO_V1, OUTRO_V1)
    )
  })

  test('ignores numeral-only rewrites (Two-vs-2 never regenerates)', () => {
    expect(
      fingerprintBelleText('Hollow Ledger Episode Two: a ledger that was wrong', OUTRO_V1)
    ).toBe(
      fingerprintBelleText('Hollow Ledger Episode 2: a ledger that was wrong', OUTRO_V1)
    )
  })

  test('empty when there is no Belle text', () => {
    expect(fingerprintBelleText('', '')).toBe('')
    expect(currentBelleFingerprint('no belle markers here')).toBe('')
    expect(currentBelleFingerprint('')).toBe('')
  })

  test('extracts intro/outro from script Belle sections', () => {
    expect(currentBelleFingerprint(SCRIPT_V1)).toBeTruthy()
    expect(currentBelleFingerprint(SCRIPT_V1)).not.toBe(
      currentBelleFingerprint(SCRIPT_V2)
    )
  })
})

// ── (b) text-set stamp ─────────────────────────────────────────────────

describe('freshnessEnvelopeForTextSet', () => {
  test('first stamp (no prior envelope) marks stale with text_changed_at=now and void bindings', () => {
    const stamp = freshnessEnvelopeForTextSet({}, SCRIPT_V1, T1)
    expect(stamp.changed).toBe(true)
    expect(stamp.stale).toBe(true)
    expect(stamp.envelope).toMatchObject({
      fingerprint: FP_V1,
      text_changed_at: T1,
      audio_stale: true,
      render_request_fingerprint: null,
      verified_audio_asset: null,
    })
  })

  test('changed text marks stale, moves text_changed_at, and voids prior bindings', () => {
    const prior = {
      series_generation: {
        belle_freshness: {
          fingerprint: FP_V1,
          text_changed_at: T1,
          audio_stale: false,
          last_verified_render_at: T2,
          render_request_fingerprint: FP_V1,
          verified_audio_asset: MIX_URL,
        },
      },
    }
    const stamp = freshnessEnvelopeForTextSet(prior, SCRIPT_V2, T3)
    expect(stamp.changed).toBe(true)
    expect(stamp.stale).toBe(true)
    expect(stamp.envelope).toMatchObject({
      fingerprint: currentBelleFingerprint(SCRIPT_V2),
      text_changed_at: T3,
      audio_stale: true,
      last_verified_render_at: T2,
      render_request_fingerprint: null,
      verified_audio_asset: null,
    })
  })

  test('identical text preserves the prior envelope byte-for-byte (render evidence survives a no-op rewrite)', () => {
    const priorEnv = freshEnvelope()
    const prior = { series_generation: { belle_freshness: priorEnv } }
    const stamp = freshnessEnvelopeForTextSet(prior, SCRIPT_V1, T3)
    expect(stamp.changed).toBe(false)
    expect(stamp.stale).toBe(false)
    expect(stamp.envelope).toEqual(priorEnv)
  })

  test('script without Belle sections stamps nothing', () => {
    const stamp = freshnessEnvelopeForTextSet({}, 'plain prose', T1)
    expect(stamp.envelope).toBeNull()
  })

  test('read/set round-trips through script_json shape (legacy envelopes read with null bindings)', () => {
    const doc = setBelleFreshness({ other: 1, series_generation: { a: 2 } }, freshEnvelope())
    expect((doc as any).other).toBe(1)
    expect((doc as any).series_generation.a).toBe(2)
    expect(readBelleFreshness(doc)).toEqual(freshEnvelope())
    expect(readBelleFreshness(null)).toBeNull()
    expect(readBelleFreshness({ series_generation: { belle_freshness: { fingerprint: '' } } })).toBeNull()
    // Pre-binding envelope: tolerated on read, fails closed at the gate.
    expect(
      readBelleFreshness({
        series_generation: {
          belle_freshness: {
            fingerprint: FP_V1,
            text_changed_at: T1,
            audio_stale: false,
            last_verified_render_at: T2,
          },
        },
      })
    ).toEqual({
      fingerprint: FP_V1,
      text_changed_at: T1,
      audio_stale: false,
      last_verified_render_at: T2,
      render_request_fingerprint: null,
      verified_audio_asset: null,
    })
  })
})

// ── (c) rebuild clearance ──────────────────────────────────────────────

describe('applyMixRebuildClearance', () => {
  test('bound render request for the current text clears stale', () => {
    const res = applyMixRebuildClearance({
      scriptJson: staleStampedDoc(),
      scriptText: SCRIPT_V1,
      renderRequestFingerprint: FP_V1,
      outputAsset: MIX_URL,
      renderAtIso: T2,
    })
    expect(res.cleared).toBe(true)
    expect(res.changed).toBe(true)
    expect(readBelleFreshness(res.scriptJson)).toMatchObject({
      fingerprint: FP_V1,
      text_changed_at: T1,
      audio_stale: false,
      last_verified_render_at: T2,
      render_request_fingerprint: FP_V1,
      verified_audio_asset: MIX_URL,
    })
  })

  test('timestamp is audit-only: an EARLIER render timestamp still clears when bindings hold', () => {
    const res = applyMixRebuildClearance({
      scriptJson: staleStampedDoc(),
      scriptText: SCRIPT_V1,
      renderRequestFingerprint: FP_V1,
      outputAsset: MIX_URL,
      renderAtIso: T0, // BEFORE text_changed_at — irrelevant to the verdict
    })
    expect(res.cleared).toBe(true)
    expect(readBelleFreshness(res.scriptJson)?.audio_stale).toBe(false)
  })

  test('timestamp is audit-only: an UNPARSEABLE render timestamp still clears when bindings hold', () => {
    const res = applyMixRebuildClearance({
      scriptJson: staleStampedDoc(),
      scriptText: SCRIPT_V1,
      renderRequestFingerprint: FP_V1,
      outputAsset: MIX_URL,
      renderAtIso: 'not-a-time',
    })
    expect(res.cleared).toBe(true)
    expect(readBelleFreshness(res.scriptJson)?.audio_stale).toBe(false)
  })

  test('timestamp alone NEVER clears: LATER timestamp with a mismatched request fingerprint keeps stale', () => {
    const res = applyMixRebuildClearance({
      scriptJson: staleStampedDoc(),
      scriptText: SCRIPT_V1,
      renderRequestFingerprint: FP_V2, // the request rendered OTHER text
      outputAsset: MIX_URL,
      renderAtIso: T3, // later than the text change — still not evidence
    })
    expect(res.cleared).toBe(false)
    expect(readBelleFreshness(res.scriptJson)?.audio_stale).toBe(true)
  })

  test('timestamp alone NEVER clears: LATER timestamp with no output asset keeps stale', () => {
    const res = applyMixRebuildClearance({
      scriptJson: staleStampedDoc(),
      scriptText: SCRIPT_V1,
      renderRequestFingerprint: FP_V1,
      outputAsset: '',
      renderAtIso: T3,
    })
    expect(res.cleared).toBe(false)
    expect(readBelleFreshness(res.scriptJson)?.audio_stale).toBe(true)
  })

  test('bindings mismatch on a matching fingerprint voids the prior asset binding', () => {
    const bound = setBelleFreshness({}, freshEnvelope())
    const res = applyMixRebuildClearance({
      scriptJson: bound,
      scriptText: SCRIPT_V1,
      renderRequestFingerprint: FP_V2, // request rendered other text
      outputAsset: OTHER_MIX_URL,
      renderAtIso: T3,
    })
    expect(res.cleared).toBe(false)
    expect(res.changed).toBe(true)
    expect(readBelleFreshness(res.scriptJson)).toMatchObject({
      fingerprint: FP_V1,
      audio_stale: true,
      verified_audio_asset: null,
    })
  })

  test('missing envelope is baselined by a bound rebuild (fresh, binding-bound)', () => {
    const res = applyMixRebuildClearance({
      scriptJson: {},
      scriptText: SCRIPT_V1,
      renderRequestFingerprint: FP_V1,
      outputAsset: MIX_URL,
      renderAtIso: T2,
    })
    expect(res.cleared).toBe(true)
    expect(res.established).toBe(true)
    expect(readBelleFreshness(res.scriptJson)).toMatchObject({
      fingerprint: FP_V1,
      audio_stale: false,
      last_verified_render_at: T2,
      render_request_fingerprint: FP_V1,
      verified_audio_asset: MIX_URL,
    })
  })

  test('missing envelope with broken bindings stamps stale (no baseline without evidence)', () => {
    const res = applyMixRebuildClearance({
      scriptJson: {},
      scriptText: SCRIPT_V1,
      renderRequestFingerprint: FP_V2,
      outputAsset: MIX_URL,
      renderAtIso: T2,
    })
    expect(res.cleared).toBe(false)
    expect(res.established).toBe(false)
    expect(readBelleFreshness(res.scriptJson)?.audio_stale).toBe(true)
  })

  test('unstamped fingerprint drift marks stale (second bound rebuild clears)', () => {
    const drifted = setBelleFreshness({}, {
      fingerprint: FP_V1,
      text_changed_at: T1,
      audio_stale: false,
      last_verified_render_at: T2,
      render_request_fingerprint: FP_V1,
      verified_audio_asset: MIX_URL,
    })
    const first = applyMixRebuildClearance({
      scriptJson: drifted,
      scriptText: SCRIPT_V2,
      renderRequestFingerprint: FP_V2,
      outputAsset: OTHER_MIX_URL,
      renderAtIso: T3,
    })
    expect(first.cleared).toBe(false)
    expect(readBelleFreshness(first.scriptJson)?.audio_stale).toBe(true)
    const second = applyMixRebuildClearance({
      scriptJson: first.scriptJson,
      scriptText: SCRIPT_V2,
      renderRequestFingerprint: FP_V2,
      outputAsset: OTHER_MIX_URL,
      renderAtIso: '2026-10-23T19:00:00.000Z',
    })
    expect(second.cleared).toBe(true)
    expect(readBelleFreshness(second.scriptJson)).toMatchObject({
      fingerprint: FP_V2,
      audio_stale: false,
      verified_audio_asset: OTHER_MIX_URL,
    })
  })

  test('mid-render text repair fails closed: request rendered pre-repair text, re-read shows new text', () => {
    // Race the deployed caller guards against (core.ts clearance): storyRow
    // was read as V1 BEFORE the render, a Belle repair landed V2 DURING
    // the render, and the post-render re-read (scriptText) shows V2.
    // A post-hoc recompute of the request fingerprint from the re-read
    // text would certify stale audio — the mismatch must keep stale even
    // with a later timestamp and a real output asset.
    const doc = { series_generation: { belle_freshness: freshEnvelope() } }
    const res = applyMixRebuildClearance({
      scriptJson: doc,
      scriptText: SCRIPT_V2, // post-render re-read: repair landed mid-render
      renderRequestFingerprint: FP_V1, // pre-render input: the mix was built from V1
      outputAsset: OTHER_MIX_URL, // this request DID produce an asset
      renderAtIso: T3, // later than the repair — still not evidence
    })
    expect(res.cleared).toBe(false)
    expect(res.changed).toBe(true)
    expect(readBelleFreshness(res.scriptJson)).toMatchObject({
      fingerprint: FP_V2,
      audio_stale: true,
      render_request_fingerprint: FP_V1,
      verified_audio_asset: null, // prior V1 asset binding VOIDED
    })
  })

  test('already-fresh-and-bound envelope is untouched (no write churn)', () => {
    const doc = { series_generation: { belle_freshness: freshEnvelope() } }
    const res = applyMixRebuildClearance({
      scriptJson: doc,
      scriptText: SCRIPT_V1,
      renderRequestFingerprint: FP_V1,
      outputAsset: MIX_URL,
      renderAtIso: T3,
    })
    expect(res.cleared).toBe(true)
    expect(res.changed).toBe(false)
    expect(res.scriptJson).toBe(doc)
  })

  test('bound re-render to a new output asset re-binds (changed, still cleared)', () => {
    const doc = { series_generation: { belle_freshness: freshEnvelope() } }
    const res = applyMixRebuildClearance({
      scriptJson: doc,
      scriptText: SCRIPT_V1,
      renderRequestFingerprint: FP_V1,
      outputAsset: OTHER_MIX_URL,
      renderAtIso: T3,
    })
    expect(res.cleared).toBe(true)
    expect(res.changed).toBe(true)
    expect(readBelleFreshness(res.scriptJson)?.verified_audio_asset).toBe(OTHER_MIX_URL)
  })
})

// ── (d) publish gate ───────────────────────────────────────────────────

describe('evaluateBelleFreshnessForPublish', () => {
  test('fresh bound episode passes', () => {
    expect(evaluateBelleFreshnessForPublish([freshEpisode()])).toEqual({ ok: true })
  })

  test('stale-after-text-change is refused', () => {
    const ep = {
      ...freshEpisode(),
      script: SCRIPT_V2, // text changed after the verified render
    }
    const verdict = evaluateBelleFreshnessForPublish([ep])
    expect(verdict.ok).toBe(false)
    expect((verdict as { code: string }).code).toBe(BELLE_FRESHNESS_STALE_CODE)
    expect((verdict as { blockers: string[] }).blockers).toHaveLength(1)
  })

  test('explicit stale flag is refused even with matching fingerprint', () => {
    const ep = {
      ...freshEpisode(),
      script_json: {
        series_generation: {
          belle_freshness: { ...freshEnvelope(), audio_stale: true },
        },
      },
    }
    const verdict = evaluateBelleFreshnessForPublish([ep])
    expect(verdict.ok).toBe(false)
    expect((verdict as { blockers: string[] }).blockers[0]).toMatch(/explicitly marked stale/)
  })

  test('timestamps are never consulted: equal render/change timestamps pass when bound', () => {
    const ep = {
      ...freshEpisode(),
      script_json: {
        series_generation: {
          belle_freshness: {
            ...freshEnvelope(),
            text_changed_at: T2,
            last_verified_render_at: T2, // equal, NOT after — passes anyway
          },
        },
      },
    }
    expect(evaluateBelleFreshnessForPublish([ep])).toEqual({ ok: true })
  })

  test('unbound render request (legacy envelope without bindings) is refused', () => {
    const ep = {
      ...freshEpisode(),
      script_json: {
        series_generation: {
          belle_freshness: {
            fingerprint: FP_V1,
            text_changed_at: T1,
            audio_stale: false,
            last_verified_render_at: T2,
            render_request_fingerprint: null,
            verified_audio_asset: null,
          },
        },
      },
    }
    const verdict = evaluateBelleFreshnessForPublish([ep])
    expect(verdict.ok).toBe(false)
    expect((verdict as { blockers: string[] }).blockers[0]).toMatch(/never certifies/)
  })

  test('request fingerprint mismatch is refused (request rendered other text)', () => {
    const ep = {
      ...freshEpisode(),
      script_json: {
        series_generation: {
          belle_freshness: { ...freshEnvelope(), render_request_fingerprint: FP_V2 },
        },
      },
    }
    const verdict = evaluateBelleFreshnessForPublish([ep])
    expect(verdict.ok).toBe(false)
    expect((verdict as { blockers: string[] }).blockers[0]).toMatch(/render-request fingerprint mismatch/)
  })

  test('asset mismatch is refused (the mix on file is not the verified output)', () => {
    const ep = {
      ...freshEpisode(),
      audio_url: OTHER_MIX_URL, // file swapped after verification
    }
    const verdict = evaluateBelleFreshnessForPublish([ep])
    expect(verdict.ok).toBe(false)
    expect((verdict as { blockers: string[] }).blockers[0]).toMatch(/asset binding mismatch/)
  })

  test('existing file without evidence is refused (file is never evidence)', () => {
    const ep = { ...freshEpisode(), script_json: { series_generation: {} } }
    const verdict = evaluateBelleFreshnessForPublish([ep])
    expect(verdict.ok).toBe(false)
    expect((verdict as { blockers: string[] }).blockers[0]).toMatch(/no Belle-freshness evidence/)
  })

  test('episode without a final mix passes vacuously (nothing to be stale about)', () => {
    const ep = { ...freshEpisode(), audio_url: '' }
    expect(evaluateBelleFreshnessForPublish([ep])).toEqual({ ok: true })
    const pending = { ...freshEpisode(), audio_url: 'pending:render' }
    expect(evaluateBelleFreshnessForPublish([pending])).toEqual({ ok: true })
  })

  test('script without Belle sections passes vacuously', () => {
    const ep = { ...freshEpisode(), script: 'plain prose, no Belle by design' }
    expect(evaluateBelleFreshnessForPublish([ep])).toEqual({ ok: true })
  })

  test('refusal carries the audited code and per-episode labels', () => {
    const verdict = evaluateBelleFreshnessForPublish([
      { ...freshEpisode(), id: 'ep-A', script: SCRIPT_V2 },
      { ...freshEpisode(), id: 'ep-B', script_json: {} },
    ])
    expect(verdict.ok).toBe(false)
    const blockers = (verdict as { blockers: string[] }).blockers
    expect(blockers).toHaveLength(2)
    expect(blockers[0]).toMatch(/ep-A/)
    expect(blockers[1]).toMatch(/ep-B/)
  })
})

describe('assertBelleFreshForPublish', () => {
  test('fresh bound passes silently', () => {
    expect(() => assertBelleFreshForPublish([freshEpisode()])).not.toThrow()
  })

  test('stale throws BelleFreshnessError with the audited code and performs zero writes (pure — no client)', () => {
    const ep = { ...freshEpisode(), script: SCRIPT_V2 }
    let thrown: unknown = null
    try {
      assertBelleFreshForPublish([ep])
    } catch (e) {
      thrown = e
    }
    expect(thrown).toBeInstanceOf(BelleFreshnessError)
    expect((thrown as BelleFreshnessError).code).toBe(BELLE_FRESHNESS_STALE_CODE)
    expect((thrown as BelleFreshnessError).blockers).toHaveLength(1)
    // Zero writes by construction: the guard takes plain rows, never a
    // client — the episode object is untouched.
    expect(ep.script_json).toEqual({ series_generation: { belle_freshness: freshEnvelope() } })
  })
})

// ── (e) production wiring ──────────────────────────────────────────────

describe('persistBelleRepair freshness stamp', () => {
  /** Minimal fake: plain update path + CAS rpc path, captures payloads. */
  function fakeClient() {
    const captured: Array<{ table: string; values: unknown }> = []
    const rpcCalls: Array<{ fn: string; args: unknown }> = []
    return {
      captured,
      rpcCalls,
      from(table: string) {
        return {
          update(values: unknown) {
            return {
              eq: async () => {
                captured.push({ table, values })
                return { error: null }
              },
            }
          },
        }
      },
      rpc: async (fn: string, _args: unknown) => {
        rpcCalls.push({ fn, args: _args })
        if (fn === 'cas_update_story') return { data: [{ updated_id: 'story-1' }], error: null }
        return { data: null, error: { message: `unknown rpc ${fn}` } }
      },
    }
  }

  test('text set without prior evidence stamps fingerprint + explicit stale + void bindings in the same payload', async () => {
    const db = fakeClient()
    await persistBelleRepair(db as never, {
      repairedStoryId: 'story-1',
      storyUpdates: {
        script: SCRIPT_V2,
        script_json: { series_generation: { some: 'other' } },
      },
      pendingEntries: [],
    })
    expect(db.captured).toHaveLength(1)
    const env = readBelleFreshness((db.captured[0].values as any).script_json)
    expect(env).toMatchObject({
      fingerprint: currentBelleFingerprint(SCRIPT_V2),
      audio_stale: true,
      render_request_fingerprint: null,
      verified_audio_asset: null,
    })
    expect(typeof env?.text_changed_at).toBe('string')
    // Unrelated script_json shape preserved.
    expect((db.captured[0].values as any).script_json.series_generation.some).toBe('other')
  })

  test('identical-text rewrite preserves prior render evidence (no-op does not burn freshness)', async () => {
    const db = fakeClient()
    const priorJson = { series_generation: { belle_freshness: freshEnvelope() } }
    await persistBelleRepair(db as never, {
      repairedStoryId: 'story-1',
      storyUpdates: { script: SCRIPT_V1, script_json: priorJson },
      pendingEntries: [],
      expectedRepairedScriptJson: priorJson,
    })
    const rpcPayload = db.captured
    expect(rpcPayload.length).toBe(0) // CAS path uses rpc, not from().update
    // The CAS updates carry the preserved (still-fresh) envelope.
    const casArgs = db.rpcCalls.find((c) => c.fn === 'cas_update_story')?.args as any
    expect(readBelleFreshness(casArgs?.p_updates?.script_json)).toEqual(freshEnvelope())
    // Re-run through the plain path shape: no prior snapshot on hand, so
    // fail-closed stale is stamped (unknown prior can never preserve).
    // Fingerprint still binds to the written text.
    const db2 = fakeClient()
    await persistBelleRepair(db2 as never, {
      repairedStoryId: 'story-1',
      storyUpdates: {
        script: SCRIPT_V1,
        script_json: { series_generation: { belle_freshness: freshEnvelope() } },
      },
      pendingEntries: [],
    })
    expect(readBelleFreshness((db2.captured[0].values as any).script_json)).toMatchObject({
      fingerprint: FP_V1,
      audio_stale: true,
    })
  })

  test('rebase carries the attempted stamp (never invents a clearance)', () => {
    const attempted = setBelleFreshness({ series_generation: { x: 1 } }, {
      fingerprint: currentBelleFingerprint(SCRIPT_V2),
      text_changed_at: T3,
      audio_stale: true,
      last_verified_render_at: T2,
      render_request_fingerprint: null,
      verified_audio_asset: null,
    })
    const rebased = rebaseRepairedScriptJson(
      { series_generation: { belle_freshness: freshEnvelope() } },
      attempted
    )
    const env = readBelleFreshness(rebased)
    expect(env?.fingerprint).toBe(currentBelleFingerprint(SCRIPT_V2))
    expect(env?.audio_stale).toBe(true)
  })
})

describe('autonomous direct-publish readiness refuses stale mixes', () => {
  function standaloneRow(script: string, scriptJson: unknown) {
    return {
      id: 'story-solo-1',
      title: 'The Hollow Ledger',
      author: 'Marc Postlewaite',
      genre: 'Mystery',
      audio_url: MIX_URL,
      cover_url: 'https://cdn.example/cover.jpg',
      description: 'A ledger mystery.',
      duration_mins: 18,
      announcement_url: 'https://cdn.example/asc3/story-solo-1/announcement.mp3',
      announcement_text: 'hello listener',
      script,
      script_json: scriptJson,
      status: 'audio_ready',
      is_hidden: true,
      review_status: 'pending',
      workflow_state: 'ready_for_review',
    }
  }

  test('fresh bound standalone has no freshness blockers', () => {
    const readiness = evaluateSingleDirectReadiness(
      standaloneRow(SCRIPT_V1, { series_generation: { belle_freshness: freshEnvelope() } }) as never,
      []
    )
    const blockers = (readiness as { blockers?: string[] }).blockers ?? []
    expect(blockers.filter((b) => b.includes('freshness') || b.includes('stale'))).toHaveLength(0)
  })

  test('stale standalone is held with freshness blockers (zero writes — pure predicate)', () => {
    const readiness = evaluateSingleDirectReadiness(
      standaloneRow(SCRIPT_V2, { series_generation: { belle_freshness: freshEnvelope() } }) as never,
      []
    )
    expect(readiness.ok).toBe(false)
    const blockers = (readiness as { blockers: string[] }).blockers
    expect(blockers.some((b) => b.includes('stale') || b.includes('freshness') || b.includes('re-rendered'))).toBe(true)
  })

  test('series readiness refuses when any episode is stale', () => {
    // Series-valid copy (non-finale predicates): intro names series +
    // number + title + hook; outro carries residue + companion + tease
    // with no author/narrator credit.
    const seriesScript = (epNum: number, teaseTo: number) =>
      [
        'TITLE: The Hollow Ledger',
        'NARRATOR: Jane Doe',
        `BELLE B: Hollow Ledger Episode ${epNum}: The Hollow Ledger hides a ledger that was wrong, and no one knows why it never added up.`,
        'Once upon a ledger, numbers moved in the dark.',
        `BELLE B: Sit with that unease, listener — I'm Belle, and what you uncovered leads directly into Episode ${teaseTo}, where the ledger fights back.`,
      ].join('\n')
    const ep1Script = seriesScript(1, 2)
    const ep1Env = {
      fingerprint: currentBelleFingerprint(ep1Script),
      text_changed_at: T1,
      audio_stale: false,
      last_verified_render_at: T2,
      render_request_fingerprint: currentBelleFingerprint(ep1Script),
      verified_audio_asset: 'https://cdn.example/asc3/ep-1/final_mix.mp3',
    }
    const ep1 = {
      ...standaloneRow(ep1Script, { series_generation: { belle_freshness: ep1Env } }),
      id: 'ep-1',
      series_id: 'series-1',
      series_name: 'Hollow Ledger',
      episode_number: 1,
      audio_url: 'https://cdn.example/asc3/ep-1/final_mix.mp3',
      status: 'published',
      is_hidden: false,
    }
    // EP2 text changed after its verified render → stale.
    const ep2FreshScript = seriesScript(2, 3)
    const ep2StaleScript = `${ep2FreshScript} ` // trailing space: exercises normalization — fingerprint UNCHANGED
    const ep2Env = {
      fingerprint: currentBelleFingerprint(ep2FreshScript),
      text_changed_at: T1,
      audio_stale: false,
      last_verified_render_at: T2,
      render_request_fingerprint: currentBelleFingerprint(ep2FreshScript),
      verified_audio_asset: 'https://cdn.example/asc3/ep-2/final_mix.mp3',
    }
    const ep2 = {
      ...standaloneRow(ep2StaleScript, { series_generation: { belle_freshness: ep2Env } }),
      id: 'ep-2',
      title: 'The Hollow Ledger',
      series_id: 'series-1',
      series_name: 'Hollow Ledger',
      episode_number: 2,
      audio_url: 'https://cdn.example/asc3/ep-2/final_mix.mp3',
    }
    // Sanity: whitespace-only drift is NOT staleness — prove the refusal
    // below comes from a REAL text change, not the trailing space.
    expect(currentBelleFingerprint(ep2StaleScript)).toBe(currentBelleFingerprint(ep2FreshScript))
    const realStaleScript = ep2FreshScript.replace('fights back', 'strikes back')
    const ep2Real = { ...ep2, script: realStaleScript }
    const readiness = evaluateSeriesDirectReadiness([ep1, ep2Real] as never[])
    expect(readiness.ok).toBe(false)
    const blockers = (readiness as { blockers: string[] }).blockers
    expect(blockers.some((b) => b.includes('stale') || b.includes('freshness') || b.includes('re-rendered'))).toBe(true)
  })
})

// ── (f) transcription verification ─────────────────────────────────────

describe('verifyTranscriptAgainstScript (the ONLY transcription verification)', () => {
  test('exact match verifies (punctuation and case ignored)', () => {
    const res = verifyTranscriptAgainstScript(
      'The footage is gone. Formatted clean!',
      'the footage is gone — formatted clean'
    )
    expect(res).toMatchObject({
      match: true,
      transcriptWords: 6,
      scriptWords: 6,
      firstDivergenceIndex: null,
      coverage: 1,
    })
  })

  test('divergence reports the first differing word index', () => {
    const res = verifyTranscriptAgainstScript(
      'the footage is gone',
      'the footage vanished today'
    )
    expect(res.match).toBe(false)
    expect(res.firstDivergenceIndex).toBe(2)
    expect(res.transcriptWords).toBe(4)
    expect(res.scriptWords).toBe(4)
    expect(res.coverage).toBeCloseTo(0.5)
  })

  test('length mismatch never verifies', () => {
    const res = verifyTranscriptAgainstScript('the footage is gone today', 'the footage is gone')
    expect(res.match).toBe(false)
    expect(res.firstDivergenceIndex).toBe(4)
  })

  test('empty transcript never verifies against non-empty script', () => {
    expect(verifyTranscriptAgainstScript('', 'the footage is gone').match).toBe(false)
  })
})
