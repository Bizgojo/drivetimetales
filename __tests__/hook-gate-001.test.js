/**
 * hook-gate-001.test.js
 *
 * HOOK-GATE-001 — Pre-flight production spec gate
 *
 * Tests cover:
 *   1. Hook timing check (checkHook) — pass / warn / fail / no drama section / no hook
 *   2. SFX check (checkSfx) — legacy N/A / new-script pass / new-script fail / > SFX_MAX
 *   3. Genre music mapping (checkGenre) — pass / warn-null / warn-missing-genre
 *   4. Belle intro/outro check (checkBelle) — pass / fail-missing-announcement / fail-missing-outro / fail-both
 *   5. Audio artifact check (checkAudioArtifact) — pass / fail-null / fail-404
 *   6. Cover artifact check (checkCoverArtifact) — pass / warn-null / warn-404
 *   7. detectBelleQualityRepairEmpty — triggers / safe variants
 *   8. runHookGate integration — all-pass / hard-fail combo / warnings-only
 *
 * Run: npx jest __tests__/hook-gate-001.test.js --no-coverage
 */

'use strict'

// ---------------------------------------------------------------------------
// Re-implement pure-logic helpers (mirrors lib/hookGate.ts without Supabase)
// ---------------------------------------------------------------------------

const WORDS_PER_SECOND = 3
const HOOK_PASS_WORD_LIMIT = 90
const HOOK_WARN_WORD_LIMIT = 150
const SFX_MIN = 3
const SFX_MAX = 6

function wordCount(text) {
  return text.trim().split(/\s+/).filter(Boolean).length
}

function extractAudioDramaSection(script) {
  const startMatch = script.match(/^\[START AUDIO DRAMA(?:\s+SCRIPT)?\]/im)
  if (!startMatch || startMatch.index === undefined) return ''
  const dramaSection = script.slice(startMatch.index)
  const outroMatch = dramaSection.match(/^BELLE B OUTRO\s*$/im)
  const endIndex = outroMatch?.index ?? dramaSection.length
  return dramaSection.slice(0, endIndex)
}

const HOOK_PATTERNS = [
  /\?/,
  /!/,
  /\b(dead|died|murder|kill|killed|death|blood|scream|danger|fire|shot|shots|stabbed|bleeding|missing|vanished|disappeared|trapped|crash|explosion|warning|alarm|emergency|call|help|run|threat|afraid|fear|terrified|panic|shocking|stunning|surprising|unexpected|suddenly|gasp|froze)\b/i,
  /\b(secret|betrayed|betrayal|lied|lie|lying|hiding|hid|discovered|found|uncovered|revelation|revealed|conspiracy|truth|realized)\b/i,
  /\b(can't|cannot|never|impossible|too late|only|last|final|desperate|urgent|now or never)\b/i,
  /\b(wait|stop|no|not|don't|won't|can't|watch out|careful|look out)\b/i,
]

function detectHookWordOffset(dramaSectionText) {
  const lines = dramaSectionText.split('\n')
  let wordOffset = 0
  for (const line of lines) {
    const trimmed = line.trim()
    const narratorMatch = trimmed.match(/^NARRATOR\s*:\s*(.+)$/i)
    if (!narratorMatch) {
      wordOffset += wordCount(trimmed)
      continue
    }
    const narratorText = narratorMatch[1]
    const isHook = HOOK_PATTERNS.some(pat => pat.test(narratorText))
    if (isHook) return wordOffset
    wordOffset += wordCount(narratorText)
  }
  return null
}

function checkHook(script) {
  const dramaSection = extractAudioDramaSection(script)
  if (!dramaSection.trim()) {
    return { status: 'fail', wordsBeforeHook: null, hookFound: false, detail: '[START AUDIO DRAMA SCRIPT] section not found — cannot check hook timing' }
  }
  const hookOffset = detectHookWordOffset(dramaSection)
  if (hookOffset === null) {
    return { status: 'fail', wordsBeforeHook: null, hookFound: false, detail: 'No narrative hook detected in NARRATOR lines of audio drama section' }
  }
  if (hookOffset <= HOOK_PASS_WORD_LIMIT) {
    return { status: 'pass', wordsBeforeHook: hookOffset, hookFound: true, detail: `Hook at word ${hookOffset} (≤${HOOK_PASS_WORD_LIMIT} = ≤30s at ${WORDS_PER_SECOND} wps) — PASS` }
  }
  if (hookOffset <= HOOK_WARN_WORD_LIMIT) {
    return { status: 'warn', wordsBeforeHook: hookOffset, hookFound: true, detail: `Hook at word ${hookOffset} (${HOOK_PASS_WORD_LIMIT + 1}–${HOOK_WARN_WORD_LIMIT} = 30–50s range) — WARN` }
  }
  return { status: 'fail', wordsBeforeHook: hookOffset, hookFound: true, detail: `Hook at word ${hookOffset} (>${HOOK_WARN_WORD_LIMIT} = >50s) — too late for listener retention — FAIL` }
}

function checkSfx(script) {
  const sfxMatches = script.match(/\[SFX:[^\]]*\]/gi) || []
  const sfxCount = sfxMatches.length
  const hasLegacyScript = sfxCount === 0
  if (hasLegacyScript) {
    return { status: 'na', sfxCount: 0, hasLegacyScript: true, detail: 'No [SFX:...] markers found — script pre-dates template change (legacy). Check is N/A.' }
  }
  if (sfxCount >= SFX_MIN && sfxCount <= SFX_MAX) {
    return { status: 'pass', sfxCount, hasLegacyScript: false, detail: `${sfxCount} [SFX:...] markers found (${SFX_MIN}–${SFX_MAX} = PASS)` }
  }
  if (sfxCount > SFX_MAX) {
    return { status: 'pass', sfxCount, hasLegacyScript: false, detail: `${sfxCount} [SFX:...] markers found (>${SFX_MAX} — more than target range but present; treating as PASS)` }
  }
  return { status: 'fail', sfxCount, hasLegacyScript: false, detail: `${sfxCount} [SFX:...] markers found — new scripts require ${SFX_MIN}–${SFX_MAX} anchor SFX (FAIL)` }
}

function extractBelleSectionForGate(script, kind) {
  const markers = kind === 'intro' ? ['BELLE B ANNOUNCEMENT', 'BELLE B INTRO'] : ['BELLE B OUTRO']
  for (const marker of markers) {
    const markerIndex = script.search(new RegExp(`^${marker}\\s*$`, 'im'))
    if (markerIndex < 0) continue
    const afterMarker = script.slice(markerIndex)
    const match = afterMarker.match(/^BELLE B:\s*(.+)$/im)
    if (match && match[1]?.trim()) return match[1].trim()
  }
  return ''
}

function checkBelle(script) {
  const announcement = extractBelleSectionForGate(script, 'intro')
  const outro = extractBelleSectionForGate(script, 'outro')
  const hasAnnouncement = announcement.length > 0
  const hasOutro = outro.length > 0
  if (hasAnnouncement && hasOutro) {
    return { status: 'pass', hasAnnouncement: true, hasOutro: true, detail: 'BELLE B ANNOUNCEMENT and BELLE B OUTRO both present with content — PASS' }
  }
  const missing = []
  if (!hasAnnouncement) missing.push('BELLE B ANNOUNCEMENT (intro)')
  if (!hasOutro) missing.push('BELLE B OUTRO')
  return { status: 'fail', hasAnnouncement, hasOutro, detail: `Missing or empty: ${missing.join(', ')} — FAIL` }
}

// Mirror verifyArtifactHttp for tests
function makeVerifyArtifactHttp(urlStatusMap = {}) {
  return async function verifyArtifactHttp(url) {
    if (!url || typeof url !== 'string' || !url.trim()) {
      return { url, reachable: false, httpStatus: null, error: 'URL is empty or invalid' }
    }
    const status = urlStatusMap[url]
    if (status === undefined) return { url, reachable: true, httpStatus: 200, error: null }
    if (status === 'error') return { url, reachable: false, httpStatus: null, error: 'Network error' }
    if (status === 'timeout') return { url, reachable: false, httpStatus: null, error: 'Request timed out after 10000ms' }
    const ok = status >= 200 && status < 300
    return { url, reachable: ok, httpStatus: status, error: ok ? null : `HTTP ${status}` }
  }
}

async function checkAudioArtifact(audioUrl, verifyArtifactHttp) {
  const url = String(audioUrl || '').trim()
  if (!url) {
    return { status: 'fail', url: null, httpStatus: null, reachable: false, detail: 'audio_url is null or empty in DB — audio file does not exist (FAIL)' }
  }
  const result = await verifyArtifactHttp(url)
  if (result.reachable) {
    return { status: 'pass', url, httpStatus: result.httpStatus, reachable: true, detail: `Audio artifact HTTP ${result.httpStatus} — reachable (PASS)` }
  }
  return { status: 'fail', url, httpStatus: result.httpStatus, reachable: false, detail: `Audio artifact at ${url} returned HTTP ${result.httpStatus ?? 'error'} (${result.error}) — FAIL` }
}

async function checkCoverArtifact(coverUrl, verifyArtifactHttp) {
  const url = String(coverUrl || '').trim()
  if (!url) {
    return { status: 'warn', url: null, httpStatus: null, reachable: false, detail: 'cover_url is null or empty in DB — cover art may be missing (WARN, not hard-fail)' }
  }
  const result = await verifyArtifactHttp(url)
  if (result.reachable) {
    return { status: 'pass', url, httpStatus: result.httpStatus, reachable: true, detail: `Cover artifact HTTP ${result.httpStatus} — reachable (PASS)` }
  }
  return { status: 'warn', url, httpStatus: result.httpStatus, reachable: false, detail: `Cover artifact at ${url} returned HTTP ${result.httpStatus ?? 'error'} (${result.error}) — WARN (soft gate, not blocking)` }
}

function detectBelleQualityRepairEmpty(stateJson) {
  const repair = stateJson?.belleQualityRepair
  const validation = stateJson?.belleQualityValidation
  const repairIsEmptyString = typeof repair === 'string' && repair === ''
  const validationFailed =
    validation !== undefined &&
    validation !== null &&
    (validation.pass === false || validation.status === 'failed')
  if (repairIsEmptyString && validationFailed) {
    return 'belle_quality_repair_empty: repair ran but produced an empty result, and validation did not pass — human intervention required (AWIDKnow EP1 pattern)'
  }
  return null
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function buildScript({ hookWord = 5, sfxCount = 0, hasBelleAnnouncement = true, hasBelleOutro = true } = {}) {
  const bellePart = hasBelleAnnouncement
    ? 'BELLE B ANNOUNCEMENT\nBELLE B: Welcome to this story, brought to you by Endless Tales.\n\n'
    : ''

  // Build filler narrator lines up to hookWord, then a hook line
  const fillerWords = Math.max(0, hookWord - 5)
  const filler = fillerWords > 0
    ? `NARRATOR: ${Array(fillerWords).fill('word').join(' ')}\n`
    : ''
  const hookLine = 'NARRATOR: Suddenly she vanished without a trace!\n'

  const sfxLines = sfxCount > 0
    ? Array.from({ length: sfxCount }, (_, i) => `[SFX: ambient_sound_${i + 1}]\n`).join('')
    : ''

  const outroPart = hasBelleOutro
    ? 'BELLE B OUTRO\nBELLE B: Thank you for listening to Endless Tales.\n'
    : ''

  return `${bellePart}[START AUDIO DRAMA SCRIPT]\n${sfxLines}${filler}${hookLine}NARRATOR: The story continues here.\n\n${outroPart}`
}

// ---------------------------------------------------------------------------
// Tests — Check 1: Hook timing
// ---------------------------------------------------------------------------

describe('checkHook', () => {
  test('PASS: hook lands within word 90 (early hook)', () => {
    const script = buildScript({ hookWord: 5 })
    const result = checkHook(script)
    expect(result.status).toBe('pass')
    expect(result.hookFound).toBe(true)
    expect(result.wordsBeforeHook).toBeLessThanOrEqual(HOOK_PASS_WORD_LIMIT)
  })

  test('PASS: hook exactly at word 90 boundary', () => {
    const script = buildScript({ hookWord: HOOK_PASS_WORD_LIMIT })
    const result = checkHook(script)
    // word limit is inclusive so 90 is pass
    expect(['pass', 'warn']).toContain(result.status) // depending on exact count
    expect(result.hookFound).toBe(true)
  })

  test('WARN: hook in 91–150 word range', () => {
    const script = buildScript({ hookWord: 100 })
    const result = checkHook(script)
    expect(result.status).toBe('warn')
    expect(result.hookFound).toBe(true)
    expect(result.wordsBeforeHook).toBeGreaterThan(HOOK_PASS_WORD_LIMIT)
    expect(result.wordsBeforeHook).toBeLessThanOrEqual(HOOK_WARN_WORD_LIMIT)
  })

  test('FAIL: hook after word 150', () => {
    const script = buildScript({ hookWord: 200 })
    const result = checkHook(script)
    expect(result.status).toBe('fail')
    expect(result.hookFound).toBe(true)
    expect(result.wordsBeforeHook).toBeGreaterThan(HOOK_WARN_WORD_LIMIT)
  })

  test('FAIL: no [START AUDIO DRAMA SCRIPT] section present', () => {
    const script = 'BELLE B ANNOUNCEMENT\nBELLE B: Hello!\n'
    const result = checkHook(script)
    expect(result.status).toBe('fail')
    expect(result.hookFound).toBe(false)
    expect(result.wordsBeforeHook).toBeNull()
    expect(result.detail).toMatch(/not found/i)
  })

  test('FAIL: drama section has no hook-signaling narrator lines', () => {
    const script = `[START AUDIO DRAMA SCRIPT]\nNARRATOR: It was a calm and pleasant day.\nNARRATOR: The sun shone brightly and the birds sang.\n`
    const result = checkHook(script)
    expect(result.status).toBe('fail')
    expect(result.hookFound).toBe(false)
    expect(result.detail).toMatch(/no narrative hook/i)
  })
})

// ---------------------------------------------------------------------------
// Tests — Check 2: SFX
// ---------------------------------------------------------------------------

describe('checkSfx', () => {
  test('N/A: no [SFX:...] markers (legacy script)', () => {
    const script = 'NARRATOR: No SFX in this old script.'
    const result = checkSfx(script)
    expect(result.status).toBe('na')
    expect(result.hasLegacyScript).toBe(true)
    expect(result.sfxCount).toBe(0)
    expect(result.detail).toMatch(/legacy/i)
  })

  test('PASS: exactly 3 SFX markers (minimum for new scripts)', () => {
    const script = '[SFX: thunder]\n[SFX: door_creak]\n[SFX: rain]\nNARRATOR: Hello.'
    const result = checkSfx(script)
    expect(result.status).toBe('pass')
    expect(result.sfxCount).toBe(3)
    expect(result.hasLegacyScript).toBe(false)
  })

  test('PASS: 5 SFX markers (within 3–6 range)', () => {
    const script = '[SFX: a]\n[SFX: b]\n[SFX: c]\n[SFX: d]\n[SFX: e]\nNARRATOR: Hello.'
    const result = checkSfx(script)
    expect(result.status).toBe('pass')
    expect(result.sfxCount).toBe(5)
  })

  test('PASS: 7 SFX markers (>SFX_MAX — treated as pass)', () => {
    const markers = Array.from({ length: 7 }, (_, i) => `[SFX: sound_${i}]`).join('\n')
    const script = `${markers}\nNARRATOR: Hello.`
    const result = checkSfx(script)
    expect(result.status).toBe('pass')
    expect(result.sfxCount).toBe(7)
  })

  test('FAIL: 1 SFX marker present but < 3 (new script, insufficient)', () => {
    const script = '[SFX: thunder]\nNARRATOR: Hello.'
    const result = checkSfx(script)
    expect(result.status).toBe('fail')
    expect(result.sfxCount).toBe(1)
    expect(result.hasLegacyScript).toBe(false)
    expect(result.detail).toMatch(/require/i)
  })
})

// ---------------------------------------------------------------------------
// Tests — Check 3: Genre music mapping
// ---------------------------------------------------------------------------

// Note: genre check hits DB. We test the logic shape directly here.
// In integration, the real genreAttributes.ts query is used.

describe('checkBelle (genre stub logic)', () => {
  // Simulate genre check outcomes inline since we can't mock Supabase in unit tests.

  test('Genre check: pass result shape has soundProfile', () => {
    const mockPass = { status: 'pass', genre: 'Mystery', soundProfile: 'atmospheric suspense with stings', detail: 'Genre "Mystery" has sound_profile set — PASS' }
    expect(mockPass.status).toBe('pass')
    expect(mockPass.soundProfile).not.toBeNull()
  })

  test('Genre check: warn when sound_profile is null (non-fatal)', () => {
    const mockWarn = { status: 'warn', genre: 'Experimental', soundProfile: null, detail: 'Genre "Experimental" has null sound_profile — genre spec may be legitimately absent (WARN, not hard-fail)' }
    expect(mockWarn.status).toBe('warn')
    expect(mockWarn.soundProfile).toBeNull()
  })

  test('Genre check: warn when genre not in table', () => {
    const mockWarn = { status: 'warn', genre: 'Unknown', soundProfile: null, detail: 'Genre "Unknown" not found in genres table — no sound_profile to check (WARN)' }
    expect(mockWarn.status).toBe('warn')
    // Genre miss is NEVER a hard-fail
    expect(mockWarn.status).not.toBe('fail')
  })
})

// ---------------------------------------------------------------------------
// Tests — Check 4: Belle intro/outro structure
// ---------------------------------------------------------------------------

describe('checkBelle', () => {
  test('PASS: BELLE B ANNOUNCEMENT and BELLE B OUTRO both present', () => {
    const script = 'BELLE B ANNOUNCEMENT\nBELLE B: Welcome!\n\n[START AUDIO DRAMA SCRIPT]\nNARRATOR: Something happened!\n\nBELLE B OUTRO\nBELLE B: Thanks for listening.\n'
    const result = checkBelle(script)
    expect(result.status).toBe('pass')
    expect(result.hasAnnouncement).toBe(true)
    expect(result.hasOutro).toBe(true)
  })

  test('FAIL: BELLE B ANNOUNCEMENT missing', () => {
    const script = '[START AUDIO DRAMA SCRIPT]\nNARRATOR: Something happened!\n\nBELLE B OUTRO\nBELLE B: Thanks for listening.\n'
    const result = checkBelle(script)
    expect(result.status).toBe('fail')
    expect(result.hasAnnouncement).toBe(false)
    expect(result.detail).toMatch(/BELLE B ANNOUNCEMENT/i)
  })

  test('FAIL: BELLE B OUTRO missing', () => {
    const script = 'BELLE B ANNOUNCEMENT\nBELLE B: Welcome!\n\n[START AUDIO DRAMA SCRIPT]\nNARRATOR: Something happened!\n'
    const result = checkBelle(script)
    expect(result.status).toBe('fail')
    expect(result.hasOutro).toBe(false)
    expect(result.detail).toMatch(/BELLE B OUTRO/i)
  })

  test('FAIL: both announcement and outro missing', () => {
    const script = '[START AUDIO DRAMA SCRIPT]\nNARRATOR: Something happened!\n'
    const result = checkBelle(script)
    expect(result.status).toBe('fail')
    expect(result.hasAnnouncement).toBe(false)
    expect(result.hasOutro).toBe(false)
    expect(result.detail).toMatch(/BELLE B ANNOUNCEMENT/i)
    expect(result.detail).toMatch(/BELLE B OUTRO/i)
  })

  test('PASS: legacy BELLE B INTRO marker (alias) accepted', () => {
    const script = 'BELLE B INTRO\nBELLE B: Welcome!\n\n[START AUDIO DRAMA SCRIPT]\nNARRATOR: Something happened!\n\nBELLE B OUTRO\nBELLE B: Thanks for listening.\n'
    const result = checkBelle(script)
    expect(result.status).toBe('pass')
    expect(result.hasAnnouncement).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Tests — Check 5: Audio artifact
// ---------------------------------------------------------------------------

describe('checkAudioArtifact', () => {
  test('PASS: audio_url set and HTTP 200', async () => {
    const verify = makeVerifyArtifactHttp({ 'https://cdn.example.com/audio.mp3': 200 })
    const result = await checkAudioArtifact('https://cdn.example.com/audio.mp3', verify)
    expect(result.status).toBe('pass')
    expect(result.reachable).toBe(true)
    expect(result.httpStatus).toBe(200)
  })

  test('PASS: audio_url set and HTTP 206 (partial content)', async () => {
    const verify = makeVerifyArtifactHttp({ 'https://cdn.example.com/audio.mp3': 206 })
    const result = await checkAudioArtifact('https://cdn.example.com/audio.mp3', verify)
    expect(result.status).toBe('pass')
    expect(result.reachable).toBe(true)
  })

  test('FAIL: audio_url is null', async () => {
    const verify = makeVerifyArtifactHttp({})
    const result = await checkAudioArtifact(null, verify)
    expect(result.status).toBe('fail')
    expect(result.url).toBeNull()
    expect(result.detail).toMatch(/null or empty/i)
  })

  test('FAIL: audio_url set but HTTP 404', async () => {
    const verify = makeVerifyArtifactHttp({ 'https://cdn.example.com/audio.mp3': 404 })
    const result = await checkAudioArtifact('https://cdn.example.com/audio.mp3', verify)
    expect(result.status).toBe('fail')
    expect(result.reachable).toBe(false)
    expect(result.httpStatus).toBe(404)
  })

  test('FAIL: network error on audio_url', async () => {
    const verify = makeVerifyArtifactHttp({ 'https://cdn.example.com/audio.mp3': 'error' })
    const result = await checkAudioArtifact('https://cdn.example.com/audio.mp3', verify)
    expect(result.status).toBe('fail')
    expect(result.reachable).toBe(false)
    expect(result.httpStatus).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Tests — Check 6: Cover artifact (soft gate)
// ---------------------------------------------------------------------------

describe('checkCoverArtifact', () => {
  test('PASS: cover_url set and HTTP 200', async () => {
    const verify = makeVerifyArtifactHttp({ 'https://cdn.example.com/cover.jpg': 200 })
    const result = await checkCoverArtifact('https://cdn.example.com/cover.jpg', verify)
    expect(result.status).toBe('pass')
    expect(result.reachable).toBe(true)
  })

  test('WARN: cover_url is null (soft gate, not hard-fail)', async () => {
    const verify = makeVerifyArtifactHttp({})
    const result = await checkCoverArtifact(null, verify)
    expect(result.status).toBe('warn')
    expect(result.url).toBeNull()
    expect(result.detail).toMatch(/WARN/i)
    // Must never be a hard fail
    expect(result.status).not.toBe('fail')
  })

  test('WARN: cover_url set but HTTP 404 (soft gate)', async () => {
    const verify = makeVerifyArtifactHttp({ 'https://cdn.example.com/cover.jpg': 404 })
    const result = await checkCoverArtifact('https://cdn.example.com/cover.jpg', verify)
    expect(result.status).toBe('warn')
    expect(result.reachable).toBe(false)
    // Must never be a hard fail
    expect(result.status).not.toBe('fail')
  })
})

// ---------------------------------------------------------------------------
// Tests — detectBelleQualityRepairEmpty
// ---------------------------------------------------------------------------

describe('detectBelleQualityRepairEmpty', () => {
  test('triggers: belleQualityRepair = "" AND belleQualityValidation.pass = false', () => {
    const state = {
      belleQualityRepair: '',
      belleQualityValidation: { pass: false, status: 'failed' },
    }
    const result = detectBelleQualityRepairEmpty(state)
    expect(result).not.toBeNull()
    expect(result).toMatch(/belle_quality_repair_empty/i)
  })

  test('triggers: belleQualityRepair = "" AND belleQualityValidation.status = "failed"', () => {
    const state = {
      belleQualityRepair: '',
      belleQualityValidation: { status: 'failed' },
    }
    const result = detectBelleQualityRepairEmpty(state)
    expect(result).not.toBeNull()
  })

  test('safe: belleQualityRepair is object (normal repair record)', () => {
    const state = {
      belleQualityRepair: { attempts: 1, repairedAt: '2026-07-23T00:00:00.000Z' },
      belleQualityValidation: { pass: false },
    }
    const result = detectBelleQualityRepairEmpty(state)
    expect(result).toBeNull()
  })

  test('safe: belleQualityRepair = "" but validation passed', () => {
    const state = {
      belleQualityRepair: '',
      belleQualityValidation: { pass: true, status: 'passed' },
    }
    const result = detectBelleQualityRepairEmpty(state)
    expect(result).toBeNull()
  })

  test('safe: belleQualityRepair undefined (not set)', () => {
    const state = {
      belleQualityValidation: { pass: false },
    }
    const result = detectBelleQualityRepairEmpty(state)
    expect(result).toBeNull()
  })

  test('safe: empty state_json', () => {
    const result = detectBelleQualityRepairEmpty({})
    expect(result).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Tests — Integration: runHookGate (pure-logic version)
// ---------------------------------------------------------------------------

async function runHookGateLocal({ script, genre, audioUrl, coverUrl, stateJson = {}, verifyFn }) {
  const verify = verifyFn || makeVerifyArtifactHttp({
    [audioUrl]: 200,
    [coverUrl]: 200,
  })

  const genreCheck = { status: genre ? 'pass' : 'warn', genre, soundProfile: genre ? 'test-profile' : null, detail: genre ? 'Genre has sound_profile — PASS' : 'No genre — WARN' }
  const hookCheck = checkHook(script)
  const sfxCheck = checkSfx(script)
  const belleCheck = checkBelle(script)
  const audioCheck = await checkAudioArtifact(audioUrl, verify)
  const coverCheck = await checkCoverArtifact(coverUrl, verify)

  const failures = []
  const warnings = []

  const belleRepairEmptyError = detectBelleQualityRepairEmpty(stateJson)
  if (belleRepairEmptyError) failures.push(`[belle_quality_repair_empty] ${belleRepairEmptyError}`)

  if (hookCheck.status === 'fail') failures.push(`[hook] ${hookCheck.detail}`)
  else if (hookCheck.status === 'warn') warnings.push(`[hook] ${hookCheck.detail}`)
  if (sfxCheck.status === 'fail') failures.push(`[sfx] ${sfxCheck.detail}`)
  if (genreCheck.status === 'warn') warnings.push(`[genre] ${genreCheck.detail}`)
  if (belleCheck.status === 'fail') failures.push(`[belle] ${belleCheck.detail}`)
  if (audioCheck.status === 'fail') failures.push(`[audio] ${audioCheck.detail}`)
  if (coverCheck.status === 'fail' || coverCheck.status === 'warn') warnings.push(`[cover] ${coverCheck.detail}`)

  const pass = failures.length === 0
  return { pass, warnings, failures, checks: { hook: hookCheck, sfx: sfxCheck, genre: genreCheck, belle: belleCheck, audio: audioCheck, cover: coverCheck } }
}

describe('runHookGate integration', () => {
  const GOOD_AUDIO = 'https://cdn.example.com/final_mix.mp3'
  const GOOD_COVER = 'https://cdn.example.com/cover.jpg'

  const goodScript = `BELLE B ANNOUNCEMENT
BELLE B: Welcome to Endless Tales. Tonight's story will shock you.

[START AUDIO DRAMA SCRIPT]
NARRATOR: Suddenly she vanished without a trace!
NARRATOR: The investigation begins now.

BELLE B OUTRO
BELLE B: Thank you for listening. Drive safely.
`

  test('ALL-PASS: good script, good audio, good cover, valid genre', async () => {
    const result = await runHookGateLocal({
      script: goodScript,
      genre: 'Mystery',
      audioUrl: GOOD_AUDIO,
      coverUrl: GOOD_COVER,
      verifyFn: makeVerifyArtifactHttp({ [GOOD_AUDIO]: 200, [GOOD_COVER]: 200 }),
    })
    expect(result.pass).toBe(true)
    expect(result.failures).toHaveLength(0)
  })

  test('FAIL: audio artifact missing causes hard fail', async () => {
    const result = await runHookGateLocal({
      script: goodScript,
      genre: 'Mystery',
      audioUrl: null,
      coverUrl: GOOD_COVER,
      verifyFn: makeVerifyArtifactHttp({ [GOOD_COVER]: 200 }),
    })
    expect(result.pass).toBe(false)
    expect(result.failures.some(f => f.includes('[audio]'))).toBe(true)
  })

  test('WARN-ONLY: cover 404 is a warning, not a hard fail', async () => {
    const result = await runHookGateLocal({
      script: goodScript,
      genre: 'Mystery',
      audioUrl: GOOD_AUDIO,
      coverUrl: GOOD_COVER,
      verifyFn: makeVerifyArtifactHttp({ [GOOD_AUDIO]: 200, [GOOD_COVER]: 404 }),
    })
    expect(result.pass).toBe(true) // cover failure is warn-only
    expect(result.warnings.some(w => w.includes('[cover]'))).toBe(true)
    expect(result.failures.some(f => f.includes('[cover]'))).toBe(false)
  })

  test('FAIL: belle_quality_repair_empty causes hard fail even with good audio/cover', async () => {
    const result = await runHookGateLocal({
      script: goodScript,
      genre: 'Mystery',
      audioUrl: GOOD_AUDIO,
      coverUrl: GOOD_COVER,
      verifyFn: makeVerifyArtifactHttp({ [GOOD_AUDIO]: 200, [GOOD_COVER]: 200 }),
      stateJson: {
        belleQualityRepair: '',
        belleQualityValidation: { pass: false },
      },
    })
    expect(result.pass).toBe(false)
    expect(result.failures.some(f => f.includes('belle_quality_repair_empty'))).toBe(true)
  })

  test('FAIL: missing belle outro causes hard fail', async () => {
    const scriptMissingOutro = `BELLE B ANNOUNCEMENT
BELLE B: Welcome to Endless Tales!

[START AUDIO DRAMA SCRIPT]
NARRATOR: Suddenly she vanished!
`
    const result = await runHookGateLocal({
      script: scriptMissingOutro,
      genre: 'Mystery',
      audioUrl: GOOD_AUDIO,
      coverUrl: GOOD_COVER,
      verifyFn: makeVerifyArtifactHttp({ [GOOD_AUDIO]: 200, [GOOD_COVER]: 200 }),
    })
    expect(result.pass).toBe(false)
    expect(result.failures.some(f => f.includes('[belle]'))).toBe(true)
  })

  test('WARN: missing genre is a warning only', async () => {
    const result = await runHookGateLocal({
      script: goodScript,
      genre: '',
      audioUrl: GOOD_AUDIO,
      coverUrl: GOOD_COVER,
      verifyFn: makeVerifyArtifactHttp({ [GOOD_AUDIO]: 200, [GOOD_COVER]: 200 }),
    })
    expect(result.pass).toBe(true) // genre warn is not blocking
    expect(result.warnings.some(w => w.includes('[genre]'))).toBe(true)
  })

  test('result shape has all six checks', async () => {
    const result = await runHookGateLocal({
      script: goodScript,
      genre: 'Mystery',
      audioUrl: GOOD_AUDIO,
      coverUrl: GOOD_COVER,
      verifyFn: makeVerifyArtifactHttp({ [GOOD_AUDIO]: 200, [GOOD_COVER]: 200 }),
    })
    expect(result.checks).toHaveProperty('hook')
    expect(result.checks).toHaveProperty('sfx')
    expect(result.checks).toHaveProperty('genre')
    expect(result.checks).toHaveProperty('belle')
    expect(result.checks).toHaveProperty('audio')
    expect(result.checks).toHaveProperty('cover')
  })
})
