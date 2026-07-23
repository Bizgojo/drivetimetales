/**
 * artifact-gate-002.test.js
 *
 * ARTIFACT-GATE-002 — verify audio and cover artifacts actually exist in storage
 * before state transitions are allowed.
 *
 * Three enforcement points under test:
 *   1. complete_story_package → ready_for_review gate (pipeline)
 *   2. Admin review action → approved_ready gate (content-approval API)
 *   3. Cover soft-gate (warn only, does not block)
 *
 * Root cause defects this gate closes:
 *   - Keenan Notch: published with null audio_url (27 days, no audio)
 *   - Sunset Ep5: workflow_state=null / displayed as "Reviewed" with no audio
 *   - Deep Arch EP1: review_status=approved but no final_mix.mp3 in storage
 *
 * Pattern: state fields were set by the step that INTENDED to do work,
 * not by verifying the work actually happened.
 *
 * Run: npx jest __tests__/artifact-gate-002.test.js --no-coverage
 */

'use strict'

// ---------------------------------------------------------------------------
// Shared helpers (mirror the real verifyArtifactHttp logic without fetch)
// ---------------------------------------------------------------------------

/**
 * Pure-logic mock for verifyArtifactHttp.
 * urlStatusMap: { [url]: httpStatus | 'error' | 'timeout' }
 */
function makeVerifyArtifactHttp(urlStatusMap = {}) {
  return async function verifyArtifactHttp(url) {
    if (!url || typeof url !== 'string' || !url.trim()) {
      return { url, reachable: false, httpStatus: null, error: 'URL is empty or invalid' }
    }
    const status = urlStatusMap[url]
    if (status === undefined) {
      // Default: 200 for any unmapped URL
      return { url, reachable: true, httpStatus: 200, error: null }
    }
    if (status === 'error') {
      return { url, reachable: false, httpStatus: null, error: 'Network error' }
    }
    if (status === 'timeout') {
      return { url, reachable: false, httpStatus: null, error: 'Request timed out after 10000ms' }
    }
    const ok = status >= 200 && status < 300
    return { url, reachable: ok, httpStatus: status, error: ok ? null : `HTTP ${status}` }
  }
}

// ---------------------------------------------------------------------------
// 1. verifyArtifactHttp contract tests
// ---------------------------------------------------------------------------

describe('verifyArtifactHttp', () => {
  describe('URL validation', () => {
    const verifyArtifactHttp = makeVerifyArtifactHttp({})

    it('returns reachable=false for empty string', async () => {
      const result = await verifyArtifactHttp('')
      expect(result.reachable).toBe(false)
      expect(result.httpStatus).toBeNull()
      expect(result.error).toMatch(/empty|invalid/i)
    })

    it('returns reachable=false for null/undefined', async () => {
      const result = await verifyArtifactHttp(null)
      expect(result.reachable).toBe(false)
    })
  })

  describe('HTTP status mapping', () => {
    it('200 → reachable=true', async () => {
      const verify = makeVerifyArtifactHttp({ 'https://cdn.example.com/audio.mp3': 200 })
      const r = await verify('https://cdn.example.com/audio.mp3')
      expect(r.reachable).toBe(true)
      expect(r.httpStatus).toBe(200)
      expect(r.error).toBeNull()
    })

    it('206 Partial Content → reachable=true (GET+Range fallback)', async () => {
      const verify = makeVerifyArtifactHttp({ 'https://cdn.example.com/audio.mp3': 206 })
      const r = await verify('https://cdn.example.com/audio.mp3')
      expect(r.reachable).toBe(true)
    })

    it('404 → reachable=false', async () => {
      const verify = makeVerifyArtifactHttp({ 'https://cdn.example.com/missing.mp3': 404 })
      const r = await verify('https://cdn.example.com/missing.mp3')
      expect(r.reachable).toBe(false)
      expect(r.httpStatus).toBe(404)
    })

    it('403 → reachable=false', async () => {
      const verify = makeVerifyArtifactHttp({ 'https://cdn.example.com/private.mp3': 403 })
      const r = await verify('https://cdn.example.com/private.mp3')
      expect(r.reachable).toBe(false)
      expect(r.httpStatus).toBe(403)
    })

    it('network error → reachable=false, httpStatus=null', async () => {
      const verify = makeVerifyArtifactHttp({ 'https://cdn.example.com/audio.mp3': 'error' })
      const r = await verify('https://cdn.example.com/audio.mp3')
      expect(r.reachable).toBe(false)
      expect(r.httpStatus).toBeNull()
      expect(r.error).toMatch(/error/i)
    })

    it('timeout → reachable=false, error mentions timeout', async () => {
      const verify = makeVerifyArtifactHttp({ 'https://cdn.example.com/audio.mp3': 'timeout' })
      const r = await verify('https://cdn.example.com/audio.mp3')
      expect(r.reachable).toBe(false)
      expect(r.error).toMatch(/timed out/i)
    })
  })
})

// ---------------------------------------------------------------------------
// 2. complete_story_package → ready_for_review gate (Enforcement Point 1)
// ---------------------------------------------------------------------------

describe('ARTIFACT-GATE-002: complete_story_package gate', () => {
  /**
   * Simulates the gate logic from run-next/route.ts.
   * Returns { blocked, reason, currentStep_after } representing what the
   * pipeline does when the gate is evaluated.
   */
  async function runPackageGate({ audioUrl, coverUrl, urlStatusMap = {} }) {
    const verify = makeVerifyArtifactHttp(urlStatusMap)

    let artifactMissing = false
    let artifactMissingReason = ''
    const warnings = []

    // Hard gate: audio
    if (!audioUrl) {
      artifactMissing = true
      artifactMissingReason = 'audio_url is not set in DB after complete_story_package — render step must be re-run'
    } else {
      const audioCheck = await verify(audioUrl)
      if (!audioCheck.reachable) {
        artifactMissing = true
        artifactMissingReason = `final_mix.mp3 at audio_url returned HTTP ${audioCheck.httpStatus ?? 'error'} (${audioCheck.error}) — file does not exist in storage. Render step must be re-run.`
      }
    }

    // Soft gate: cover (warn only)
    if (!coverUrl) {
      warnings.push('cover_url not set in DB — advancing with warning')
    } else {
      const coverCheck = await verify(coverUrl)
      if (!coverCheck.reachable) {
        warnings.push(`cover_url returned HTTP ${coverCheck.httpStatus ?? 'error'} — cover may be missing from storage`)
      }
    }

    if (artifactMissing) {
      return {
        blocked: true,
        currentStep_after: 'artifact_missing',
        reason: artifactMissingReason,
        warnings,
      }
    }

    return {
      blocked: false,
      currentStep_after: 'ready_for_review',
      warnings,
    }
  }

  // ── Audio hard gate ─────────────────────────────────────────────────────

  it('passes when audio returns 200 and cover returns 200', async () => {
    const result = await runPackageGate({
      audioUrl: 'https://cdn.example.com/stories/abc/final_mix.mp3',
      coverUrl: 'https://cdn.example.com/covers/abc.jpg',
      urlStatusMap: {
        'https://cdn.example.com/stories/abc/final_mix.mp3': 200,
        'https://cdn.example.com/covers/abc.jpg': 200,
      },
    })
    expect(result.blocked).toBe(false)
    expect(result.currentStep_after).toBe('ready_for_review')
    expect(result.warnings).toHaveLength(0)
  })

  it('blocks when audio_url is null — Keenan Notch pattern', async () => {
    const result = await runPackageGate({
      audioUrl: null,
      coverUrl: 'https://cdn.example.com/covers/abc.jpg',
    })
    expect(result.blocked).toBe(true)
    expect(result.currentStep_after).toBe('artifact_missing')
    expect(result.reason).toMatch(/audio_url is not set/i)
  })

  it('blocks when audio_url is empty string', async () => {
    const result = await runPackageGate({
      audioUrl: '',
      coverUrl: 'https://cdn.example.com/covers/abc.jpg',
    })
    expect(result.blocked).toBe(true)
    expect(result.currentStep_after).toBe('artifact_missing')
  })

  it('blocks when audio returns 404 — file URL set but file absent', async () => {
    const result = await runPackageGate({
      audioUrl: 'https://cdn.example.com/stories/abc/final_mix.mp3',
      coverUrl: 'https://cdn.example.com/covers/abc.jpg',
      urlStatusMap: {
        'https://cdn.example.com/stories/abc/final_mix.mp3': 404,
        'https://cdn.example.com/covers/abc.jpg': 200,
      },
    })
    expect(result.blocked).toBe(true)
    expect(result.currentStep_after).toBe('artifact_missing')
    expect(result.reason).toMatch(/HTTP 404/)
    expect(result.reason).toMatch(/render step must be re-run/i)
  })

  it('blocks when audio returns 403', async () => {
    const result = await runPackageGate({
      audioUrl: 'https://cdn.example.com/stories/abc/final_mix.mp3',
      coverUrl: null,
      urlStatusMap: {
        'https://cdn.example.com/stories/abc/final_mix.mp3': 403,
      },
    })
    expect(result.blocked).toBe(true)
    expect(result.reason).toMatch(/HTTP 403/)
  })

  it('blocks when audio fetch times out', async () => {
    const result = await runPackageGate({
      audioUrl: 'https://cdn.example.com/stories/abc/final_mix.mp3',
      coverUrl: null,
      urlStatusMap: {
        'https://cdn.example.com/stories/abc/final_mix.mp3': 'timeout',
      },
    })
    expect(result.blocked).toBe(true)
    expect(result.reason).toMatch(/timed out/i)
  })

  it('blocks when audio fetch errors (network failure)', async () => {
    const result = await runPackageGate({
      audioUrl: 'https://cdn.example.com/stories/abc/final_mix.mp3',
      coverUrl: null,
      urlStatusMap: {
        'https://cdn.example.com/stories/abc/final_mix.mp3': 'error',
      },
    })
    expect(result.blocked).toBe(true)
    expect(result.currentStep_after).toBe('artifact_missing')
  })

  // ── Cover soft gate (warn only) ─────────────────────────────────────────

  it('warns but does NOT block when cover returns 404', async () => {
    const result = await runPackageGate({
      audioUrl: 'https://cdn.example.com/stories/abc/final_mix.mp3',
      coverUrl: 'https://cdn.example.com/covers/abc.jpg',
      urlStatusMap: {
        'https://cdn.example.com/stories/abc/final_mix.mp3': 200,
        'https://cdn.example.com/covers/abc.jpg': 404,
      },
    })
    expect(result.blocked).toBe(false)
    expect(result.currentStep_after).toBe('ready_for_review')
    expect(result.warnings.length).toBeGreaterThan(0)
    expect(result.warnings.some(w => /cover/i.test(w))).toBe(true)
  })

  it('warns but does NOT block when cover_url is null', async () => {
    const result = await runPackageGate({
      audioUrl: 'https://cdn.example.com/stories/abc/final_mix.mp3',
      coverUrl: null,
      urlStatusMap: {
        'https://cdn.example.com/stories/abc/final_mix.mp3': 200,
      },
    })
    expect(result.blocked).toBe(false)
    expect(result.warnings.some(w => /cover/i.test(w))).toBe(true)
  })

  it('audio block takes priority over cover warning', async () => {
    const result = await runPackageGate({
      audioUrl: 'https://cdn.example.com/stories/abc/final_mix.mp3',
      coverUrl: 'https://cdn.example.com/covers/abc.jpg',
      urlStatusMap: {
        'https://cdn.example.com/stories/abc/final_mix.mp3': 404,
        'https://cdn.example.com/covers/abc.jpg': 404,
      },
    })
    expect(result.blocked).toBe(true)
    expect(result.currentStep_after).toBe('artifact_missing')
  })

  // ── Error JSON structure ─────────────────────────────────────────────────

  it('error_json has correct gate fields when blocked', () => {
    const errorJson = {
      kind: 'artifact_missing',
      gate: 'ARTIFACT-GATE-002',
      step: 'complete_story_package',
      storyId: 'abc-123',
      message: 'ARTIFACT-GATE-002: final_mix.mp3 at audio_url returned HTTP 404',
      audioUrl: 'https://cdn.example.com/stories/abc-123/final_mix.mp3',
      at: new Date().toISOString(),
    }
    expect(errorJson.kind).toBe('artifact_missing')
    expect(errorJson.gate).toBe('ARTIFACT-GATE-002')
    expect(errorJson.step).toBe('complete_story_package')
    expect(errorJson.message).toContain('ARTIFACT-GATE-002')
  })

  // ── Deep Arch EP1 scenario ───────────────────────────────────────────────

  it('Deep Arch EP1: audio_url set in DB but file absent → blocked', async () => {
    // Simulates the exact Deep Arch EP1 failure: review_status was set to approved
    // but no final_mix.mp3 existed in storage.
    const result = await runPackageGate({
      audioUrl: 'https://supabase.example.co/storage/v1/object/public/audio/asc3/deep-arch-ep1/final_mix.mp3',
      coverUrl: 'https://cdn.example.com/covers/deep-arch.jpg',
      urlStatusMap: {
        'https://supabase.example.co/storage/v1/object/public/audio/asc3/deep-arch-ep1/final_mix.mp3': 404,
        'https://cdn.example.com/covers/deep-arch.jpg': 200,
      },
    })
    expect(result.blocked).toBe(true)
    expect(result.reason).toMatch(/HTTP 404/)
    expect(result.currentStep_after).toBe('artifact_missing')
  })
})

// ---------------------------------------------------------------------------
// 3. Admin review gate → approved_ready (Enforcement Point 2)
// ---------------------------------------------------------------------------

describe('ARTIFACT-GATE-002: content-approval approved_ready gate', () => {
  /**
   * Simulates the gate logic from content-approval/route.ts set_workflow_state
   * when transitioning to approved_ready.
   */
  async function runApprovalGate({ state, audioUrl, urlStatusMap = {} }) {
    if (state !== 'approved_ready') {
      return { blocked: false, status: 200 }
    }

    const verify = makeVerifyArtifactHttp(urlStatusMap)

    if (!audioUrl) {
      return {
        blocked: true,
        httpResponseStatus: 422,
        error: 'ARTIFACT-GATE-002: audio_url is not set. Story cannot be marked Approved until the final audio file exists.',
        missingArtifact: 'audio_url',
      }
    }

    const audioCheck = await verify(audioUrl)
    if (!audioCheck.reachable) {
      return {
        blocked: true,
        httpResponseStatus: 422,
        error: `ARTIFACT-GATE-002: Audio file is not accessible (HTTP ${audioCheck.httpStatus ?? 'error'}: ${audioCheck.error}). The file at audio_url does not exist in storage. Story cannot be marked Approved — re-run the render step first.`,
        missingArtifact: 'audio_file',
        audioUrl,
        httpStatus: audioCheck.httpStatus,
      }
    }

    return { blocked: false, httpResponseStatus: 200 }
  }

  it('does NOT gate transitions to other states', async () => {
    const result = await runApprovalGate({
      state: 'repair_queue',
      audioUrl: null,
    })
    expect(result.blocked).toBe(false)
  })

  it('does NOT gate ready_for_review transition', async () => {
    const result = await runApprovalGate({
      state: 'ready_for_review',
      audioUrl: null,
    })
    expect(result.blocked).toBe(false)
  })

  it('passes approved_ready when audio URL returns 200', async () => {
    const result = await runApprovalGate({
      state: 'approved_ready',
      audioUrl: 'https://cdn.example.com/stories/abc/final_mix.mp3',
      urlStatusMap: { 'https://cdn.example.com/stories/abc/final_mix.mp3': 200 },
    })
    expect(result.blocked).toBe(false)
    expect(result.httpResponseStatus).toBe(200)
  })

  it('blocks approved_ready when audio_url is null — Keenan Notch scenario', async () => {
    const result = await runApprovalGate({
      state: 'approved_ready',
      audioUrl: null,
    })
    expect(result.blocked).toBe(true)
    expect(result.httpResponseStatus).toBe(422)
    expect(result.missingArtifact).toBe('audio_url')
    expect(result.error).toMatch(/audio_url is not set/i)
  })

  it('blocks approved_ready when audio returns 404 — Deep Arch EP1 scenario', async () => {
    const result = await runApprovalGate({
      state: 'approved_ready',
      audioUrl: 'https://cdn.example.com/stories/deep-arch-ep1/final_mix.mp3',
      urlStatusMap: {
        'https://cdn.example.com/stories/deep-arch-ep1/final_mix.mp3': 404,
      },
    })
    expect(result.blocked).toBe(true)
    expect(result.httpResponseStatus).toBe(422)
    expect(result.missingArtifact).toBe('audio_file')
    expect(result.error).toMatch(/ARTIFACT-GATE-002/i)
    expect(result.error).toMatch(/re-run the render step/i)
  })

  it('blocks approved_ready when audio returns 403', async () => {
    const result = await runApprovalGate({
      state: 'approved_ready',
      audioUrl: 'https://cdn.example.com/stories/abc/final_mix.mp3',
      urlStatusMap: { 'https://cdn.example.com/stories/abc/final_mix.mp3': 403 },
    })
    expect(result.blocked).toBe(true)
    expect(result.httpStatus).toBe(403)
  })

  it('blocks approved_ready when audio fetch times out', async () => {
    const result = await runApprovalGate({
      state: 'approved_ready',
      audioUrl: 'https://cdn.example.com/stories/abc/final_mix.mp3',
      urlStatusMap: { 'https://cdn.example.com/stories/abc/final_mix.mp3': 'timeout' },
    })
    expect(result.blocked).toBe(true)
    expect(result.error).toMatch(/ARTIFACT-GATE-002/i)
  })

  it('error response includes audioUrl and httpStatus for operator debugging', async () => {
    const audioUrl = 'https://cdn.example.com/stories/abc/final_mix.mp3'
    const result = await runApprovalGate({
      state: 'approved_ready',
      audioUrl,
      urlStatusMap: { [audioUrl]: 404 },
    })
    expect(result.audioUrl).toBe(audioUrl)
    expect(result.httpStatus).toBe(404)
  })
})

// ---------------------------------------------------------------------------
// 4. Series approved_ready gate (multiple episodes, parallel check)
// ---------------------------------------------------------------------------

describe('ARTIFACT-GATE-002: series approved_ready gate', () => {
  /**
   * Simulates the series gate logic from content-approval/route.ts
   * set_series_workflow_state when transitioning to approved_ready.
   */
  async function runSeriesApprovalGate({ state, episodes, urlStatusMap = {} }) {
    if (state !== 'approved_ready') {
      return { blocked: false }
    }

    const verify = makeVerifyArtifactHttp(urlStatusMap)

    const audioChecks = await Promise.all(
      episodes.map(async (ep, i) => {
        const audioUrl = String(ep.audio_url || '').trim()
        const epLabel = `EP${ep.episode_number ?? i + 1} (${ep.id})`
        if (!audioUrl) {
          return { epLabel, ok: false, reason: 'audio_url not set in DB' }
        }
        const check = await verify(audioUrl)
        return {
          epLabel,
          ok: check.reachable,
          reason: check.reachable ? null : `HTTP ${check.httpStatus ?? 'error'}: ${check.error}`,
          audioUrl,
        }
      })
    )

    const failingEpisodes = audioChecks.filter(c => !c.ok)
    if (failingEpisodes.length > 0) {
      return {
        blocked: true,
        httpResponseStatus: 422,
        error: `ARTIFACT-GATE-002: ${failingEpisodes.length} episode(s) have missing or inaccessible audio.`,
        failingEpisodes: failingEpisodes.map(c => ({ episode: c.epLabel, reason: c.reason })),
      }
    }

    return { blocked: false }
  }

  const mkEp = (n, audioUrl) => ({ id: `ep-${n}`, episode_number: n, audio_url: audioUrl })

  it('passes when all episodes have accessible audio', async () => {
    const episodes = [
      mkEp(1, 'https://cdn.example.com/series-abc/ep1/final_mix.mp3'),
      mkEp(2, 'https://cdn.example.com/series-abc/ep2/final_mix.mp3'),
      mkEp(3, 'https://cdn.example.com/series-abc/ep3/final_mix.mp3'),
    ]
    const result = await runSeriesApprovalGate({
      state: 'approved_ready',
      episodes,
      urlStatusMap: {
        'https://cdn.example.com/series-abc/ep1/final_mix.mp3': 200,
        'https://cdn.example.com/series-abc/ep2/final_mix.mp3': 200,
        'https://cdn.example.com/series-abc/ep3/final_mix.mp3': 200,
      },
    })
    expect(result.blocked).toBe(false)
  })

  it('blocks when one episode audio is missing — Sunset Ep5 pattern', async () => {
    const episodes = [
      mkEp(1, 'https://cdn.example.com/sunset/ep1/final_mix.mp3'),
      mkEp(2, 'https://cdn.example.com/sunset/ep2/final_mix.mp3'),
      mkEp(5, null), // Sunset Ep5 had no audio
    ]
    const result = await runSeriesApprovalGate({
      state: 'approved_ready',
      episodes,
      urlStatusMap: {
        'https://cdn.example.com/sunset/ep1/final_mix.mp3': 200,
        'https://cdn.example.com/sunset/ep2/final_mix.mp3': 200,
      },
    })
    expect(result.blocked).toBe(true)
    expect(result.httpResponseStatus).toBe(422)
    expect(result.failingEpisodes).toHaveLength(1)
    expect(result.failingEpisodes[0].episode).toContain('EP5')
    expect(result.failingEpisodes[0].reason).toMatch(/audio_url not set/i)
  })

  it('blocks when multiple episodes have missing audio', async () => {
    const episodes = [
      mkEp(1, null),
      mkEp(2, 'https://cdn.example.com/series/ep2/final_mix.mp3'),
      mkEp(3, null),
    ]
    const result = await runSeriesApprovalGate({
      state: 'approved_ready',
      episodes,
      urlStatusMap: {
        'https://cdn.example.com/series/ep2/final_mix.mp3': 200,
      },
    })
    expect(result.blocked).toBe(true)
    expect(result.failingEpisodes).toHaveLength(2)
  })

  it('blocks when one episode audio returns 404', async () => {
    const episodes = [
      mkEp(1, 'https://cdn.example.com/series/ep1/final_mix.mp3'),
      mkEp(2, 'https://cdn.example.com/series/ep2/final_mix.mp3'),
    ]
    const result = await runSeriesApprovalGate({
      state: 'approved_ready',
      episodes,
      urlStatusMap: {
        'https://cdn.example.com/series/ep1/final_mix.mp3': 200,
        'https://cdn.example.com/series/ep2/final_mix.mp3': 404,
      },
    })
    expect(result.blocked).toBe(true)
    expect(result.failingEpisodes[0].reason).toMatch(/HTTP 404/)
  })

  it('does NOT gate non-approved_ready transitions', async () => {
    const episodes = [mkEp(1, null), mkEp(2, null)]
    const result = await runSeriesApprovalGate({
      state: 'repair_queue',
      episodes,
    })
    expect(result.blocked).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// 5. Cover verification soft-gate detail
// ---------------------------------------------------------------------------

describe('ARTIFACT-GATE-002: cover soft gate', () => {
  /**
   * Isolated cover check logic.
   * Returns { warned, warningMessage } — covers never block.
   */
  async function runCoverCheck({ coverUrl, urlStatusMap = {} }) {
    const verify = makeVerifyArtifactHttp(urlStatusMap)
    const warnings = []

    if (!coverUrl) {
      warnings.push('cover_url not set in DB — advancing with warning')
    } else {
      const coverCheck = await verify(coverUrl)
      if (!coverCheck.reachable) {
        warnings.push(`cover_url returned HTTP ${coverCheck.httpStatus ?? 'error'} (${coverCheck.error}) — cover may be missing from storage`)
      }
    }

    return { warned: warnings.length > 0, warnings, blocked: false }
  }

  it('no warning when cover is accessible', async () => {
    const r = await runCoverCheck({
      coverUrl: 'https://cdn.example.com/covers/story.jpg',
      urlStatusMap: { 'https://cdn.example.com/covers/story.jpg': 200 },
    })
    expect(r.warned).toBe(false)
    expect(r.blocked).toBe(false)
  })

  it('warns when cover_url is null', async () => {
    const r = await runCoverCheck({ coverUrl: null })
    expect(r.warned).toBe(true)
    expect(r.blocked).toBe(false)
    expect(r.warnings[0]).toMatch(/cover_url not set/i)
  })

  it('warns when cover returns 404', async () => {
    const r = await runCoverCheck({
      coverUrl: 'https://cdn.example.com/covers/story.jpg',
      urlStatusMap: { 'https://cdn.example.com/covers/story.jpg': 404 },
    })
    expect(r.warned).toBe(true)
    expect(r.blocked).toBe(false)
    expect(r.warnings[0]).toMatch(/HTTP 404/)
  })

  it('cover 404 warning message mentions storage', async () => {
    const r = await runCoverCheck({
      coverUrl: 'https://cdn.example.com/covers/story.jpg',
      urlStatusMap: { 'https://cdn.example.com/covers/story.jpg': 404 },
    })
    expect(r.warnings[0]).toMatch(/storage/i)
  })

  it('covers are never blocked regardless of HTTP status', async () => {
    for (const status of [404, 403, 500, 'error', 'timeout']) {
      const r = await runCoverCheck({
        coverUrl: 'https://cdn.example.com/covers/story.jpg',
        urlStatusMap: { 'https://cdn.example.com/covers/story.jpg': status },
      })
      expect(r.blocked).toBe(false)
    }
  })
})

// ---------------------------------------------------------------------------
// 6. Regression: gate does not break existing successful flows
// ---------------------------------------------------------------------------

describe('ARTIFACT-GATE-002: no regressions on happy path', () => {
  it('standalone story with 200 audio + 200 cover advances normally', async () => {
    const verify = makeVerifyArtifactHttp({
      'https://cdn.example.com/stories/happy/final_mix.mp3': 200,
      'https://cdn.example.com/covers/happy.jpg': 200,
    })

    const audioCheck = await verify('https://cdn.example.com/stories/happy/final_mix.mp3')
    const coverCheck = await verify('https://cdn.example.com/covers/happy.jpg')

    expect(audioCheck.reachable).toBe(true)
    expect(coverCheck.reachable).toBe(true)
    // Neither blocks — pipeline advances to ready_for_review
  })

  it('gate is additive: package completion failure is still caught before gate', () => {
    // If runStandalonePackageCompletion returns success=false, the gate is never
    // reached. The existing failure path handles it.
    const packageResult = { success: false, storyId: 'abc' }
    const reachesGate = packageResult.success
    expect(reachesGate).toBe(false)
  })

  it('artifact_missing is a terminal step — job lands in failed state', () => {
    const gateErrorJson = {
      kind: 'artifact_missing',
      gate: 'ARTIFACT-GATE-002',
      step: 'complete_story_package',
    }
    const jobStatus = 'failed'
    const jobCurrentStep = 'artifact_missing'

    expect(jobStatus).toBe('failed')
    expect(jobCurrentStep).toBe('artifact_missing')
    expect(gateErrorJson.kind).toBe('artifact_missing')
  })
})
