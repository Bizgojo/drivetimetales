/**
 * Regression test for ATL-P3: render skip-existing false positive.
 *
 * Bug: runStandaloneRenderFinalMix checked story.audio_url and story.story_audio_url
 * DB columns to decide whether to skip rendering without verifying final_mix.mp3
 * actually existed in Supabase storage. Stale DB URLs from prior failed runs caused
 * render to skip even though no audio file existed — silent fake completions.
 *
 * Fix: before returning skippedExisting: true, list storage and confirm final_mix.mp3
 * is present. If absent, clear the stale DB URL columns and fall through to render.
 */

'use strict'

// ── Extracted decision logic from runStandaloneRenderFinalMix ─────────────────
// This mirrors the exact conditional block introduced in the ATL-P3 fix.
// We test this in isolation so no Supabase / ElevenLabs calls are made.

/**
 * Simulates the skip-existing decision:
 *
 * @param {object} story         - Partial stories row (audio_url, story_audio_url)
 * @param {string[]} storageFiles - Names of files present in asc3/<storyId>/ storage folder
 * @returns {{ shouldSkip: boolean, shouldClearDb: boolean }}
 */
function decideSkipExisting(story, storageFiles) {
  const existingFinalAudioUrl = String(story.audio_url || '').trim()
  const existingStoryBodyUrl = String(story.story_audio_url || '').trim()

  if (
    existingFinalAudioUrl &&
    existingStoryBodyUrl &&
    !existingFinalAudioUrl.startsWith('pending:') &&
    !existingStoryBodyUrl.startsWith('pending:')
  ) {
    // ATL-P3 storage check
    const finalMixExists = storageFiles.some(name => name === 'final_mix.mp3')
    if (finalMixExists) {
      return { shouldSkip: true, shouldClearDb: false }
    }
    // Stale DB URL — clear and re-render
    return { shouldSkip: false, shouldClearDb: true }
  }

  return { shouldSkip: false, shouldClearDb: false }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

let passed = 0
let failed = 0

function assert(condition, label) {
  if (condition) {
    console.log(`  ✅ ${label}`)
    passed++
  } else {
    console.error(`  ❌ ${label}`)
    failed++
  }
}

console.log('\nrender-skip-existing: ATL-P3 regression tests\n')

// Test 1: audio_url set, storage has final_mix.mp3 → should skip (legitimate reuse)
{
  const story = { audio_url: 'https://cdn.example.com/asc3/story1/final_mix.mp3', story_audio_url: 'https://cdn.example.com/asc3/story1/story_body.mp3' }
  const files = ['final_mix.mp3', 'story_body.mp3', 'intro.mp3']
  const result = decideSkipExisting(story, files)
  assert(result.shouldSkip === true, 'CASE 1: DB url set + file exists → shouldSkip=true')
  assert(result.shouldClearDb === false, 'CASE 1: DB url set + file exists → shouldClearDb=false')
}

// Test 2 (THE BUG CASE): audio_url set, storage does NOT have final_mix.mp3 → must NOT skip, must clear DB
{
  const story = { audio_url: 'https://cdn.example.com/asc3/story2/final_mix.mp3', story_audio_url: 'https://cdn.example.com/asc3/story2/story_body.mp3' }
  const files = ['intro.mp3', 'outro.mp3', 'segment_0001.mp3']  // no final_mix.mp3
  const result = decideSkipExisting(story, files)
  assert(result.shouldSkip === false, 'CASE 2 (BUG): DB url set + file missing → shouldSkip=false (must not fake-complete)')
  assert(result.shouldClearDb === true, 'CASE 2 (BUG): DB url set + file missing → shouldClearDb=true (stale url cleared)')
}

// Test 3: audio_url missing → no skip, no clear (first render)
{
  const story = { audio_url: null, story_audio_url: null }
  const files = ['segment_0001.mp3', 'background_music.mp3']
  const result = decideSkipExisting(story, files)
  assert(result.shouldSkip === false, 'CASE 3: no DB url → shouldSkip=false')
  assert(result.shouldClearDb === false, 'CASE 3: no DB url → shouldClearDb=false')
}

// Test 4: pending: URL should not skip even if file exists
{
  const story = { audio_url: 'pending:render-queued', story_audio_url: 'pending:render-queued' }
  const files = ['final_mix.mp3']
  const result = decideSkipExisting(story, files)
  assert(result.shouldSkip === false, 'CASE 4: pending: url → shouldSkip=false')
  assert(result.shouldClearDb === false, 'CASE 4: pending: url → shouldClearDb=false')
}

// Test 5: only audio_url set (story_audio_url missing) → no skip
{
  const story = { audio_url: 'https://cdn.example.com/asc3/story5/final_mix.mp3', story_audio_url: '' }
  const files = ['final_mix.mp3']
  const result = decideSkipExisting(story, files)
  assert(result.shouldSkip === false, 'CASE 5: only audio_url set (no story_audio_url) → shouldSkip=false')
}

// Test 6: empty storage folder (no files at all) + both DB urls set → must not skip
{
  const story = { audio_url: 'https://cdn.example.com/asc3/story6/final_mix.mp3', story_audio_url: 'https://cdn.example.com/asc3/story6/story_body.mp3' }
  const files = []
  const result = decideSkipExisting(story, files)
  assert(result.shouldSkip === false, 'CASE 6: empty storage + DB urls set → shouldSkip=false')
  assert(result.shouldClearDb === true, 'CASE 6: empty storage + DB urls set → shouldClearDb=true')
}

// ── Summary ───────────────────────────────────────────────────────────────────
console.log(`\n${passed + failed} assertions: ${passed} passed, ${failed} failed\n`)
if (failed > 0) process.exit(1)
