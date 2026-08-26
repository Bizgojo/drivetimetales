# PLAYER AUDIT — drivetimetales
**Date:** 2026-08-26  
**Prepared by:** Orion (subagent audit pass)  
**Subject:** Systemic investigation into playback stopping abruptly at unpredictable story/time combinations  
**Repo:** `/Users/williampostlewaite/Projects/drivetimetales`  
**Branch:** main

---

## 1. FILE MAP — Exact paths and one-line descriptions

| File | Description |
|---|---|
| `components/player/CanonicalPlayer.tsx` | Primary player component (~2,800 lines). Owns all playback state, event handlers, HTML `<audio>` element management, queue logic, auto-advance, progress saving, analytics, and the stall watchdog. This is the only player used for authenticated subscribers. |
| `components/player/playerTypes.ts` | TypeScript type definitions: `PlayerMode`, `PlayerStory`, `PlayerQueueItem`, `AutoAdvanceCandidate`, `AutoAdvanceDisabledReason`, `PlayerSessionState`. No logic. |
| `hooks/useAudioPlayer.ts` | A generic hook exposing play/pause/seek/volume/rate controls around a plain `new Audio()` element. **Not used by CanonicalPlayer** — CanonicalPlayer manages its own `audioRef = useRef<HTMLAudioElement>` directly. This hook is a library utility only. |
| `hooks/useAudioCache.ts` | A hook wrapping `lib/AudioCache.ts` to check/download audio to the Cache API. **Not used by CanonicalPlayer** — CanonicalPlayer fetches audio URLs directly via `<audio src="...">`. This hook appears to be unused dead code in the main subscription player. |
| `lib/AudioCache.ts` | Cache API wrapper (read/write/check/clear). Uses `caches.open('dtt-audio-cache-v1')`. Used by `useAudioCache.ts` only — not by CanonicalPlayer. |
| `lib/playerProgress.ts` | localStorage read/write/merge for per-user, per-story progress records. Keys: `et_player_progress:{userId\|'guest'}`. Used by CanonicalPlayer for local progress persistence. |
| `lib/player/autoAdvance.ts` | Pure functions for ranking/selecting auto-advance candidates from a pre-fetched pool. **Not the live path** — CanonicalPlayer uses `fetchDirectSeriesAutoAdvanceCandidate()` (inline Supabase query) for actual auto-advance decisions. `autoAdvance.ts` logic is unused in the current player. |
| `app/api/asc3/story-playlist/route.ts` | GET endpoint that decides per-play whether to serve `useFinalMix: true` (→ `finalMixUrl`) or `queue: [...]` (personalized multi-segment). No `maxDuration` set; default Vercel serverless timeout applies (10–60s depending on plan). |
| `app/api/asc3/render-final-mix/route.ts` | POST endpoint that runs the full ffmpeg pipeline. `maxDuration = 800` (also set in `vercel.json`). Not called during playback — production only. |
| `app/api/asc3/render-personalized-final-mix/route.ts` | POST endpoint for personalized mix rendering. `maxDuration = 60`. Not called during playback. |
| `app/api/asc3/render-local/route.ts` | POST endpoint for local (Vercel) rendering of 80+ segment stories. `maxDuration = 600`. Not called during playback. |
| `app/api/user/save-progress/route.ts` | POST endpoint that writes progress to `user_library`. `runtime = 'nodejs'` set; no `maxDuration` export — defaults to Vercel's default. Called on `pagehide` keepalive. |
| `components/GoSamplePlayer.tsx` | Lightweight player for the `/go` landing/campaign pages. No auth, no queue logic, no auto-advance. Uses `<audio>` element directly. Separate from CanonicalPlayer entirely. |

---

## 2. STATE MACHINE MAP — Code paths for each user action / system event

### 2a. Play button pressed

**Handler:** `handlePlayPause()` — `CanonicalPlayer.tsx`, defined around line 1617.

```typescript
const handlePlayPause = () => {
  if (!audioRef.current) return
  if (isPlaying) {
    disableAutoAdvanceForSession('manual_pause')
    audioRef.current.pause(); musicRef.current?.pause()
    endAnalyticsSession('manual_pause')
    saveProgress(getProgressSeconds()); setIsPlaying(false)
  } else {
    if (isAtNaturalEnd()) {
      restartFromBeginning()
      return
    }
    if (REARM_AUTO_ADVANCE_ON_RESUME && autoAdvanceDisabledReason === 'manual_pause') {
      autoAdvanceEnabledRef.current = true
      setAutoAdvanceDisabledReason(null)
    }
    audioRef.current.play().then(() => {
      setIsPlaying(true)
      setAutoplayBlocked(false)
      if (!user && !sessionStartRef.current) { sessionStartRef.current = Date.now() }
      if (user?.id) supabase.from('user_library').upsert({ ... }).then(() => {})
      startAnalyticsSession('gesture')
      // music resume if applicable
      ...
    }).catch((e) => { console.error('[player] play() failed:', e) })
  }
}
```

**State changes on Play:**
- `isPlaying` → `true`
- `autoplayBlocked` → `false`
- `analyticsTrackedRef.current` → `true` (if first play)
- Music audio element (re-)started and faded in
- `user_library.last_played` upserted (authenticated users)

### 2b. Pause button pressed

**Handler:** Same `handlePlayPause()` — enters the `isPlaying` branch.

```typescript
disableAutoAdvanceForSession('manual_pause')
audioRef.current.pause(); musicRef.current?.pause()
endAnalyticsSession('manual_pause')
saveProgress(getProgressSeconds()); setIsPlaying(false)
```

**State changes on Pause:**
- `isPlaying` → `false`
- `autoAdvanceEnabledRef.current` → `false`
- `autoAdvanceDisabledReason` → `'manual_pause'`
- `autoAdvanceCandidate` → `null` (cleared by `disableAutoAdvanceForSession`)
- `analyticsTrackedRef.current` → `false`
- Progress saved to localStorage + Supabase `user_library`

**IMPORTANT:** `REARM_AUTO_ADVANCE_ON_RESUME = true` (line ~44) means a subsequent Play re-arms auto-advance — this is intentional (Marc ruling 2026-07-15).

### 2c. Seek / scrub bar dragged

**Handlers:** `handleSeek` (click), `handleSeekPointerDown`, `handleSeekPointerMove`, `handleSeekPointerUp` / `handleSeekPointerCancel` — lines ~1734–1758.

All four delegate to `seekToClientX(clientX)`:

```typescript
const seekToClientX = (clientX: number) => {
  const audio = audioRef.current
  const bar = progressBarRef.current
  if (!audio || !bar) return

  const actualDuration = isASC3
    ? getQueueTotalSeconds()
    : (Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : duration)
  if (!actualDuration || !Number.isFinite(actualDuration)) return

  const rect = bar.getBoundingClientRect()
  if (!rect.width) return

  const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
  let nextTime = ratio * actualDuration
  // Lapsed users: clamped to 60s
  ...
  if (isASC3) {
    seekASC3ToGlobalTime(nextTime, isPlaying)
  } else {
    audio.currentTime = nextTime
    // ... saveProgress, setCumTime, setCurrentTime
  }
}
```

For **single-file (final mix) mode** (`isASC3 = false`): seek sets `audio.currentTime` directly. This is a native HTML5 range seek — it fires a `seeking` event on the audio element, then `seeked` when the browser has buffered enough. The browser must be able to make an HTTP range request (`Accept: bytes=N-`) to the Supabase storage URL.

For **ASC3 queue mode** (`isASC3 = true`): `seekASC3ToGlobalTime(globalTime, shouldPlay)` is called, which:
1. Calls `findQueuePositionForTime(globalTime)` to map the global time to a segment index + offset
2. If the seek is into a **different segment** from the currently playing one: sets `audio.src = targetSegment.url; audio.load()` and stores the target offset in `pendingQueueSeekRef`
3. If seek is within the **same segment**: `audio.currentTime = target.offset` directly
4. `completedRef.current`, `activeQueueIndexRef.current`, `cumTime` all updated

**Stall risk on seek:** After `audio.load()` in step 2, the stall watchdog is running but `stallSampleRef` is reset on `loadedmetadata`. If `loadedmetadata` never fires (Supabase segment fetch fails), the player hangs silently until the watchdog's 8-second threshold triggers recovery.

### 2d. Episode ends naturally

**Handler:** `onEnded` event listener on `<audio>` element — inline JSX, lines ~2016–2111 (roughly).

The `onEnded` handler has **three guard layers** before accepting a "true" end:

**Guard 1 — Unknown duration:**
```typescript
const elDuration = el && Number.isFinite(el.duration) && el.duration > 0 ? el.duration : null
if (el && elDuration === null) {
  console.error('[player] ended with unknown element duration — treating as stall', { ... })
  recoverFromStall()
  void trackSpuriousEndedRecovered({ ... kind: 'unknown_duration' })
  return
}
```

**Guard 2 — Early ended (position < duration - 2.5s):**
```typescript
if (el && elDuration !== null && el.currentTime < elDuration - 2.5) {
  console.error('[player] spurious early ended — treating as stall', { ... })
  recoverFromStall()
  void trackSpuriousEndedRecovered({ ... kind: 'early_ended' })
  return
}
```

**Guard 3 — Duration shortfall (Firefox truncated stream):**
```typescript
const expectedSec = isASC3
  ? (segDursRef.current[queueIndex] || 0)
  : (Number((story as any)?.duration_mins) > 0 ? Number((story as any).duration_mins) * 60 : 0)
const shortfallTolerance = isASC3 ? 5 : 120
if (expectedSec > 0 && elDuration < expectedSec - shortfallTolerance) {
  console.error('[player] ended on truncated stream (duration shortfall) — treating as stall', { ... })
  recoverFromStall()
  void trackSpuriousEndedRecovered({ ... kind: 'duration_shortfall' })
  return
}
```

**If all guards pass (trusted natural end):**
- For `isASC3 = false` (single file): `setIsPlaying(false); saveProgress(duration, true); maybeAutoAdvanceFromNaturalEnd('natural_ended')`
- For `isASC3 = true` (queue): calls `advanceQueue()` to move to the next segment

### 2e. App backgrounded / foregrounded (mobile)

**Handlers:** `visibilitychange` and `pagehide` listeners — `CanonicalPlayer.tsx` lines ~870–930.

```typescript
const handleVisibility = () => {
  if (document.visibilityState === 'hidden') {
    saveGuestMinutes()
    if (analyticsTrackedRef.current && audioRef.current?.paused) {
      endAnalyticsSession('tab_hidden', true)
    }
  }
  if (document.visibilityState === 'visible' && !user) sessionStartRef.current = Date.now()
}
document.addEventListener('visibilitychange', handleVisibility)
window.addEventListener('beforeunload', saveGuestMinutes)
window.addEventListener('pagehide', flushListeningEvent)
window.addEventListener('pagehide', flushProgressEvent)
```

**Key behavior:**
- **Background (hidden):** If audio is **paused** when hidden (e.g. OS/lock screen paused it), the analytics session ends with `tab_hidden`. If audio is **playing** (background audio), the session is left open. No automatic pause/resume logic — the OS controls the audio element directly.
- **Foreground (visible):** Only resets `sessionStartRef` for guests. No media resumption logic.
- **`pagehide`:** Calls `flushProgressEvent()` (keepalive POST to `/api/user/save-progress`) and `flushListeningEvent()` (keepalive analytics end call). Both use `fetch(..., { keepalive: true })`.

**No `play()`/`pause()` calls on visibilitychange.** If the OS suspends the audio stream on tab hide (common on iOS Safari with some browser policies), there is no code to call `audio.play()` on tab restore. The user would need to tap Play again.

### 2f. Network connection drops mid-playback

**No explicit `offline`/`online` event handler anywhere in CanonicalPlayer or related hooks.**

The player relies entirely on the HTML5 audio element's behavior and the stall watchdog:

1. If network drops, the audio element will eventually enter a `stalled` or `waiting` state, which fires `onStalled` / `onWaiting` → `setIsBuffering(true)`.
2. If currentTime freezes for ≥ 4 seconds, the stall watchdog sets `isBuffering: true` (button shows "⏳ Buffering…").
3. If frozen for ≥ 8 seconds, `recoverFromStall()` is called (cache-busts the URL, calls `audio.load()` + `audio.play()`). Max 2 attempts.
4. After 2 failed recovery attempts: `audio.pause()`, `setIsPlaying(false)`, `setIsBuffering(false)`, `setAudioErrorMessage('Audio stalled — check your connection and try again.')`.

### 2g. Network connection resumes

No `online` event handler. If the stall watchdog has already issued an error card, the user must tap "Try again" (which calls `window.location.reload()`). If the watchdog is still in its 8-second window when network resumes and the browser successfully re-buffers, the watchdog will see currentTime advancing again and reset normally.

---

## 3. ERROR AND STALL HANDLING — Critical section

### 3a. HTML5 audio `error` event handler

Located in the JSX `onError` prop of the `<audio ref={audioRef}>` element in CanonicalPlayer. Two branches depending on mode:

**Branch 1: Single-file (final mix) mode — `isASC3 = false`:**

```typescript
onError={(e) => {
  if (!isASC3 && audioSrc && audioRef.current) {
    const audio = audioRef.current
    const retryAt = Math.max(0, Number.isFinite(audio.currentTime) ? audio.currentTime : currentTime)
    const shouldAutoplay = isPlaying || !audio.paused
    if (finalMixRetryCountRef.current < 2) {
      finalMixRetryCountRef.current += 1
      finalMixRetryResumeRef.current = retryAt
      finalMixRetryAutoplayRef.current = shouldAutoplay
      console.warn('[player] Final mix playback error; retrying source', {
        storyId,
        retry: finalMixRetryCountRef.current,
        retryAt,
        code: audio.error?.code,
        message: audio.error?.message,
      })
      audio.src = bustAudioUrl(audioSrc)
      audio.load()
    } else {
      console.error('[player] Final mix playback failed after retries:', {
        storyId,
        audioSrc,
        code: audio.error?.code,
        message: audio.error?.message,
      })
      setIsPlaying(false)
      setAudioErrorMessage('Couldn't load audio. Try again.')
      endAnalyticsSession('playback_error')
    }
    return
  }
```

- 2 retry attempts with cache-busted URL (`?et_retry={timestamp}`)
- Position (`retryAt`) and autoplay flag are preserved across retries in refs
- Position is restored in `onCanPlay` via `finalMixRetryResumeRef.current`
- After 2 failures: user-visible error card + analytics session closed

**Branch 2: ASC3 segment queue mode — `isASC3 = true`:**

```typescript
  // If a segment fails to load, skip to next segment instead of dying
  if (isASC3 && queue.length > 0) {
    const failedUrl = queue[queueIndex]?.url || ''
    console.error('[player] Segment failed:', failedUrl, e)
    // For intro segments (sting/Belle), retry once before skipping
    const isIntro = queue[queueIndex]?.type === 'intro'
    if (isIntro && audioRef.current && !audioRef.current.dataset.retried) {
      console.warn('[player] Retrying intro segment:', failedUrl)
      audioRef.current.dataset.retried = '1'
      audioRef.current.src = failedUrl
      audioRef.current.load()
      audioRef.current.play().catch(() => advanceQueue('error_skip'))
    } else {
      if (audioRef.current) delete audioRef.current.dataset.retried
      const ni = queueIndex + 1
      if (ni < queue.length) {
        console.warn('[player] Skipping failed segment to next:', failedUrl)
        advanceQueue('error_skip')
      }
    }
  }
}}
```

- Intro segments: 1 retry, then skip to next
- Story/outro segments: **immediately skip to next segment with no retry**
- If the **last segment** fails (`ni >= queue.length`): **nothing happens** — no error message, no recovery, no advance. The player silently stops.

### 3b. `stalled` and `waiting` events — is there a timeout?

**Immediate feedback (JSX event props):**
```typescript
onWaiting={() => setIsBuffering(true)}
onStalled={() => setIsBuffering(true)}
onPlaying={() => setIsBuffering(false)}
onPause={() => setIsPlaying(false)}
```

These only change the UI label (button shows "⏳ Buffering…"). They do **not** start a timer or initiate recovery.

**Stall watchdog (ORION-PLAYER-STALL-001) — the real recovery path:**

```typescript
useEffect(() => {
  if (!isPlaying) {
    stallSampleRef.current = null
    setIsBuffering(false)
    return
  }
  const id = window.setInterval(() => {
    const audio = audioRef.current
    if (!audio || audio.paused || stallRecoveringRef.current) return
    const now = Date.now()
    const t = audio.currentTime
    const sample = stallSampleRef.current
    if (!sample || Math.abs(t - sample.t) > 0.25) {
      stallSampleRef.current = { t, at: now }
      if (stallRecoveryCountRef.current) stallRecoveryCountRef.current = 0
      setIsBuffering(false)
      return
    }
    const frozenMs = now - sample.at
    if (frozenMs >= 4000) setIsBuffering(true)
    if (frozenMs >= 8000) {
      if (stallRecoveryCountRef.current < 2) {
        stallSampleRef.current = { t, at: now }
        recoverFromStall()
      } else {
        console.error('[player] stall watchdog: unrecovered after retries', {
          storyId,
          pos: t,
          readyState: audio.readyState,
          networkState: audio.networkState,
        })
        audio.pause()
        setIsPlaying(false)
        setIsBuffering(false)
        setAudioErrorMessage('Audio stalled — check your connection and try again.')
        endAnalyticsSession('playback_error')
        stallSampleRef.current = null
        stallRecoveryCountRef.current = 0
      }
    }
  }, 2000)
  return () => window.clearInterval(id)
}, [isPlaying])
```

**Timeline:**
- `t=0`: playing, watchdog interval starts (2s poll)
- `t≈0–4s`: frozen but no buffering indicator
- `t≥4s`: "⏳ Buffering…" shown
- `t≥8s`: `recoverFromStall()` called (attempt 1)
- `t≥16s` (worst case): `recoverFromStall()` called again (attempt 2)
- `t≥24s` (worst case): **"Audio stalled — check your connection and try again."** error card shown; playback stops

**`recoverFromStall()` function:**
```typescript
const recoverFromStall = () => {
  const audio = audioRef.current
  if (!audio || stallRecoveringRef.current) return
  stallRecoveringRef.current = true
  stallRecoveryCountRef.current += 1
  const src = audio.currentSrc || audio.src || ''
  const pos = Number.isFinite(audio.currentTime) ? audio.currentTime : 0
  console.warn('[player] stall watchdog: recovering', {
    storyId,
    attempt: stallRecoveryCountRef.current,
    pos,
    src: src.slice(-80),
    readyState: audio.readyState,
    networkState: audio.networkState,
  })
  const onMeta = () => {
    audio.removeEventListener('loadedmetadata', onMeta)
    try { audio.currentTime = pos } catch (_) {}
    audio.play().then(() => {
      stallRecoveringRef.current = false
      stallSampleRef.current = null
    }).catch((err) => {
      stallRecoveringRef.current = false
      console.error('[player] stall recovery play() failed:', err)
    })
  }
  audio.addEventListener('loadedmetadata', onMeta)
  audio.src = bustAudioUrl(src.replace(/[?&]et_retry=\d+/, ''))
  audio.load()
}
```

**CRITICAL RISK in `recoverFromStall()`:** It waits for `loadedmetadata` before seeking and playing. If `loadedmetadata` **never fires** (because the Supabase URL itself is broken, the file doesn't exist at the storage path, or there's a CDN error), `stallRecoveringRef.current` stays `true` forever. The watchdog interval checks `stallRecoveringRef.current` first and skips the iteration — **the watchdog is permanently blinded until the component unmounts.** There is no timeout on the `loadedmetadata` wait.

### 3c. Retry logic, user-facing errors, and silent failures

**Summary table:**

| Failure Mode | Retry? | User-facing message? | Silent? |
|---|---|---|---|
| Final mix `error` event (first 2 times) | Yes — cache-busted URL, position preserved | No (silent retry) | ✓ Silent |
| Final mix `error` event (3rd time) | No | "Couldn't load audio. Try again." | ✗ Visible |
| Intro segment fails to load (ASC3) | Yes — 1 retry, then skip | No | ✓ Silent |
| Story/outro segment fails to load (ASC3) | No — immediately skips | No | ✓ Silent |
| **Last segment fails (ASC3)** | No | **None** | **✓ Completely silent** |
| Stall frozen ≥ 4s | N/A | "⏳ Buffering…" | N/A |
| Stall frozen ≥ 8s | Yes — 2 attempts | "⏳ Buffering…" during | Partially |
| Stall unrecovered after 2 retries | No | "Audio stalled — check your connection…" | ✗ Visible |
| Stall recovery (`loadedmetadata` never fires) | No (stuck) | None — watchdog blinded | ✓ **Completely silent** |
| story-playlist API returns 5xx | No | "Audio is not available for this story yet." | ✗ Visible |
| No audio URL resolved at all | No | "Audio is not available for this story yet." | ✗ Visible |

### 3d. Does a playback failure silently advance?

- **ASC3 segment skip on error:** A failed segment (other than the last) is **silently skipped** — the player advances to the next segment without telling the user. From the user's perspective, playback appears to continue but a chunk of audio is missing.
- **Final mix mode:** On `error`, retries silently. On terminal failure, shows error card — does **not** advance.
- **`onEnded` early-ended / spurious guard:** Calls `recoverFromStall()` — does **not** advance. No auto-advance firing.
- **Auto-advance:** Only fires from a **trusted** natural end (all three guards passed). A failed play does NOT trigger auto-advance.

---

## 4. LOGGED EVIDENCE

### 4a. Sentry / equivalent client-side error reporting

**There is NO Sentry installation in this codebase.**

Searched for: `Sentry`, `captureException`, `@sentry`, across all `.ts`, `.tsx`, and `.json` files. Zero results. There is no `sentry.client.config.ts`, no `sentry.server.config.ts`, no `@sentry/nextjs` package, and no `SENTRY_DSN` environment variable referenced anywhere.

**This is a major observability gap.** Player errors are logged to the browser's developer console only. In a production incident, Marc has no server-side record of what failed.

### 4b. `console.error` / `console.warn` calls in player files

The following errors are emitted to the **browser console only** (visible in DevTools — NOT in Vercel logs):

**CanonicalPlayer.tsx:**
- `console.error('[player] load story-row failed:', { storyId, error })` — Supabase story fetch failure
- `console.error('[player] story-playlist failed; falling back to story audio_url:', ...)` — playlist API failure
- `console.error('[player] no playable audio source resolved for story:', ...)` — no URL at all
- `console.error('[player] review final-episode lookup failed:', ...)` — review query failure
- `console.error('[player] review lookup failed:', ...)` — duplicate review check failure
- `console.error('[player] direct series next lookup failed:', ...)` — auto-advance query failure
- `console.error('[player] ended with unknown element duration — treating as stall', ...)` — spurious ended (unknown duration)
- `console.error('[player] spurious early ended — treating as stall', ...)` — early ended guard
- `console.error('[player] ended on truncated stream (duration shortfall) — treating as stall', ...)` — Firefox truncated stream
- `console.error('[player] Segment failed:', failedUrl, e)` — segment load failure (ASC3)
- `console.error('[player] stall watchdog: unrecovered after retries', ...)` — terminal stall
- `console.error('[player] stall recovery play() failed:', err)` — recovery play() failure
- `console.error('[player] play() failed:', e)` — play() rejection
- `console.error('[player] play-again play() failed:', e)` — restart play() failure
- `console.error('[player] Final mix playback failed after retries:', ...)` — terminal error event
- `console.error('[player] user_library progress write failed', ...)` — DB write failure
- `console.warn('[player] Final mix playback error; retrying source', ...)` — error event (retry 1/2)
- `console.warn('[player] stall watchdog: recovering', ...)` — stall recovery attempt
- `console.warn('[player] Retrying intro segment:', failedUrl)` — intro segment retry (ASC3)
- `console.warn('[player] Skipping failed segment to next:', failedUrl)` — segment skip (ASC3)
- `console.error('[player] final mix retry play failed:', err)` — canPlay handler play() failure after retry

**story-playlist/route.ts:**
- `console.warn('[story-playlist] auth user resolution failed:', ...)` — server-side, appears in Vercel logs
- `console.warn('[story-playlist] user playback profile lookup failed:', ...)` — server-side, appears in Vercel logs
- `console.warn('[story-playlist] genre tone lookup failed:', ...)` — server-side, appears in Vercel logs
- `console.warn('[story-playlist] personalized queue failed; falling back to baked final_mix:', ...)` — server-side, appears in Vercel logs

**render-final-mix/core.ts:**
- All `console.log`, `console.warn`, `console.error` — server-side, appears in Vercel function logs

### 4c. Vercel function logs for audio serving path

- **`/api/asc3/story-playlist`** — Called once per page load to resolve the audio mode (final mix URL vs. queue). Has `console.warn` entries for auth failure and personalization fallback. **Logs appear in Vercel.** No `maxDuration` export in the route file itself — relies on Vercel's default (60s on Pro plan).
- **`/api/user/save-progress`** — Called on `pagehide`. `runtime = 'nodejs'`, no custom `maxDuration` — uses Vercel default.
- **Audio storage URLs** — Audio is served directly from Supabase Storage (public CDN URL), **not proxied through any Vercel function.** The player's `<audio src="...">` element points directly to `${NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/audio/...`. No Vercel function is in the audio byte-serving path.

---

## 5. STRUCTURAL RISK FACTORS

### 5a. Does the player behave differently for very long files / large file sizes?

**No explicit file-size or duration limit in the player code.** However, there are structural differences:

**Single-file (final mix) mode:**
- One HTTP request to Supabase Storage for the entire file
- Browser must buffer enough to play; for a 90-minute story at 192kbps that's ~130MB
- The duration shortfall guard uses `story.duration_mins * 60` (from DB). This is compared against the actual `el.duration` (from HTTP response headers). A tolerance of **120 seconds** (`shortfallTolerance = 120`) for non-ASC3 files.
- If a file is very large and the browser only partially downloads before network degrades, the `stalled` → watchdog path activates

**Queue mode (ASC3 / personalized):**
- Multiple smaller segment files downloaded serially
- Each segment is a separate HTTP request; a mid-queue failure triggers a skip (silent)
- `segDursRef.current[queueIndex]` is used as the expected duration for Guard 3; tolerance is **5 seconds**

**Key difference:** In queue mode, a failed segment causes a **silent skip** of that story chunk. In single-file mode, a failure triggers retries then a user-visible error. Long stories are more likely to use queue mode (personalized subscribers get the 4-item queue), so they're more exposed to silent segment skips.

### 5b. File size limits, duration limits, range-request handling

**In the serving path (Supabase Storage CDN):**
- Supabase Storage supports HTTP Range requests natively — the browser can seek by sending `Range: bytes=N-M`.
- No explicit file size limit is set by the player code. Storage URL is a direct CDN link.
- The player's `bustAudioUrl()` appends `?et_retry={timestamp}` as a cache-buster, but does **not** request specific byte ranges — range requests are managed entirely by the browser.

**Cache-control header:** The `audio_url` stored in the DB (set by `render-final-mix`) has `cacheControl: 'no-cache'` in the Supabase upload call. However, the `finalMixUrl` returned by `story-playlist` has a `?v={updated_at_timestamp}` query parameter applied by `cacheBustAudioUrl()` in the route. This means each updated story file gets a fresh CDN path.

**Risk:** `no-cache` on the storage object means every range request (seek) goes to origin validation. For mobile users on spotty connections, this is a seek-latency and stall risk.

### 5c. Vercel function timeouts on audio-related routes

| Route | `maxDuration` | Source | Risk |
|---|---|---|---|
| `/api/asc3/story-playlist` | **Not set** (Vercel default: 60s Pro / 10s Hobby) | Code | Low — fast DB query, no ffmpeg |
| `/api/user/save-progress` | **Not set** | Code | Low — small DB write |
| `/api/analytics/play-event` | **Not set** | Code | Low |
| `/api/asc3/render-final-mix` | 800s | `vercel.json` + route export | Production only |
| `/api/asc3/render-local` | 600s | Route export | Production only |
| `/api/asc3/render-personalized-final-mix` | 60s | Route export | Production only — very tight |

**Audio is NOT proxied through Vercel.** The audio byte stream goes directly from Supabase Storage CDN → browser. No Vercel function timeout can interrupt active playback.

**BUT:** If `/api/asc3/story-playlist` times out (unlikely but possible under high DB load), the player falls back to `data?.audio_url` from the story row. If `audio_url` is null or empty, the player sets `audioErrorMessage('Audio is not available for this story yet.')`.

### 5d. Local mix for 80+ segment episodes — does the player know or care?

**The player does NOT know or care about the "local mix" distinction.** Here is the full decision tree:

1. `story-playlist` API is called with `storyId` + optional `firstName`
2. If the user has a valid pronunciation key and personalized assets exist: returns `queue: [...]` with 3–4 segment URLs
3. If not: returns `useFinalMix: true` + `finalMixUrl` pointing to `audio_url` from the DB

The `audio_url` column in the `stories` table is set by `render-final-mix/core.ts` (for cloud renders) and by `render-local/route.ts` (for local renders of 80+ segment stories). **Both write to the same column.** The player receives a single Supabase Storage URL and doesn't know or care whether it was rendered locally or in a Vercel function.

**Risk for 80+ segment stories:** If `render-local` is used because the story has 80+ segments, the resulting `final_mix.mp3` may be very large (90+ minutes of audio at 192kbps = 125+ MB). This single file must be downloaded by the browser as one HTTP resource. On mobile with a spotty connection, this increases the probability of stalls — and the stall watchdog's two recovery attempts both reload from the beginning of the file with a new URL. **Recovery does NOT resume from the byte position** — it reloads the entire audio element and then seeks `audio.currentTime = pos`. This means a 2-retry recovery on a 125MB file requires downloading up to the seek position again.

---

## 6. VERCEL / SERVING TIMEOUT RISK

### 6a. Audio serving architecture

**Audio is NOT proxied through Vercel.** All audio files are served directly from Supabase Storage:

```
Browser → Supabase Storage CDN (public URL)
         e.g. https://{project}.supabase.co/storage/v1/object/public/audio/asc3/{storyId}/final_mix.mp3
```

No Vercel function is in the byte-serving path during playback. Vercel functions are only involved in:
1. `/api/asc3/story-playlist` — resolving the audio URL (one-time per page load)
2. `/api/user/save-progress` — progress writes (not on the playback path)

### 6b. `maxDuration` configuration

From `vercel.json`:
```json
"functions": {
  "app/api/asc3/render-final-mix/route.ts": { "maxDuration": 800 },
  "app/api/asc3/generate-music/route.ts": { "maxDuration": 800 },
  "app/api/admin/generate-voices/route.ts": { "maxDuration": 800 },
  "app/api/admin/production-jobs/run-next/route.ts": { "maxDuration": 800 },
  "app/api/cron/production-runner/route.ts": { "maxDuration": 800 },
  "app/api/asc3/generate-story-complete/route.ts": { "maxDuration": 800 }
}
```

`/api/asc3/story-playlist` is **not listed** in `vercel.json` and has no `maxDuration` export in `route.ts`. It runs under the Vercel default (60s on Pro plan). A slow DB query (e.g., `name_pools` table lookup under load) could theoretically time out, but this is low probability.

### 6c. Is audio served via redirect (302) or proxied?

Audio is served via **direct Supabase Storage URL** — neither a Vercel 302 redirect nor a proxy. The URL is returned as a string in the JSON response from `/api/asc3/story-playlist`, and the browser's `<audio>` element fetches it directly. Vercel is not involved in the audio byte transfer.

---

## 7. ROOT CAUSE HYPOTHESES FOR MARC'S ABRUPT STOPS

Based on the full audit, the following are the most likely causes of "playback stopping abruptly at different points on different stories":

### Hypothesis A — Stall watchdog recovery `loadedmetadata` deadlock (HIGH PROBABILITY)

**Mechanism:** `recoverFromStall()` sets `stallRecoveringRef.current = true`, swaps the `audio.src`, calls `audio.load()`, and waits for `loadedmetadata`. If `loadedmetadata` never fires (Supabase CDN timeout, 5xx on the audio file, CORS issue mid-stream), `stallRecoveringRef.current` stays `true` forever. The 2-second watchdog interval checks this flag first and no-ops on every tick. The player is frozen in `isPlaying = true` with `stallRecoveringRef = true` and nothing recovers.

**User experience:** Playback stops. Button shows either "⏸ Pause" or "⏳ Buffering…" — the player looks alive but is actually dead.

**Evidence:** The gap exists in the code. No timeout is set on the `loadedmetadata` listener.

**Fix:** Add a 10–15 second timeout on the `loadedmetadata` listener in `recoverFromStall()`. If `loadedmetadata` doesn't fire within the window, clear `stallRecoveringRef.current` and either try again or surface the error card.

### Hypothesis B — ASC3 last-segment silent failure (HIGH PROBABILITY for personalized subscribers)

**Mechanism:** In queue mode, if the final segment (the `outro_with_music` or `outro_audio_url` segment) fails to load, the `onError` handler checks `ni = queueIndex + 1`. If `ni >= queue.length`, **no recovery and no error message fires.** The player stops at the end of the second-to-last segment without advancing or reporting an error.

**User experience:** Story appears to end early. No "Story complete" card, no auto-advance, no error — just silence.

**Evidence (exact code from `onError` handler):**
```typescript
} else {
  if (audioRef.current) delete audioRef.current.dataset.retried
  const ni = queueIndex + 1
  if (ni < queue.length) {
    console.warn('[player] Skipping failed segment to next:', failedUrl)
    advanceQueue('error_skip')
  }
  // ← NOTHING ELSE. If ni >= queue.length, the player just stops.
}
```

**Fix:** Add an `else` branch: if `ni >= queue.length`, call `saveProgress(cumTime, true)` and `maybeAutoAdvanceFromNaturalEnd('natural_ended')` to treat it as a completed episode, or surface an error card.

### Hypothesis C — Duration shortfall guard false positive on long stories (MEDIUM PROBABILITY)

**Mechanism:** Guard 3 in `onEnded` compares `el.duration` (actual audio element duration from HTTP headers) against `story.duration_mins * 60` (DB value). Tolerance is **120 seconds**. If the DB `duration_mins` is set incorrectly (e.g., rounded up aggressively during `render-final-mix` which uses `Math.ceil(durationSecs / 60)`), the actual audio could be more than 120s shorter than the DB value. This would cause a true natural end to be treated as a stall and trigger `recoverFromStall()` — which then might deadlock per Hypothesis A.

**User experience:** Episode ends normally, guard incorrectly treats it as a stall, attempts recovery, player may deadlock.

**Evidence:** `Math.ceil(durationSecs / 60)` in `render-final-mix/core.ts`. A 45-minute story could have `duration_mins = 45` even if the actual render is 44m30s (2,670s). `45 * 60 = 2,700`. `2,700 - 2,670 = 30s` — within tolerance. But if the story's audio element reports `el.duration` differently from what `ffprobe` reported during render (e.g., because of VBR encoding headers), the gap could exceed 120s in edge cases.

**Fix:** Lower reliance on the DB `duration_mins` field for Guard 3. Use the probed segment duration (`segDursRef`) for ASC3. For final-mix, store the **exact** `durationSecs` (not `Math.ceil`) in the DB and use that.

### Hypothesis D — Supabase Storage CDN intermittent failures on range requests after seek (MEDIUM PROBABILITY)

**Mechanism:** When the user seeks (or `recoverFromStall()` seeks after reload), the browser sends an HTTP Range request to Supabase Storage. If the CDN returns a non-206 response (e.g., a 5xx, a 403, or a response that doesn't honor Range), the audio element fires an `error` event. For single-file mode, this is handled by the 2-retry path. For ASC3 mode, this triggers a segment skip.

**The `no-cache` storage header is relevant here:** With `no-cache`, every range request during scrubbing or recovery requires an origin revalidation. Under CDN load or Supabase edge issues, this can fail. 

**User experience:** Seek causes the player to jump to the next segment (ASC3) or show "Couldn't load audio. Try again." (final mix).

### Hypothesis E — `story-playlist` returning a stale or invalid final mix URL (LOW-MEDIUM PROBABILITY)

**Mechanism:** `cacheBustAudioUrl()` in `story-playlist/route.ts` appends `?v={updated_at_timestamp}`. If `story.updated_at` is null or very old, the URL may resolve to a file that has been moved or deleted from Supabase Storage (e.g., after a re-render that wrote a new file without cleaning up the old reference). The old URL 404s, the player's `onError` handler retries twice with `bustAudioUrl()` (different cache-buster), both fail, and the error card appears.

**Evidence:** `audio_url` is set with `cacheControl: 'no-cache'` and `upsert: true`. But the URL itself is the same path (`asc3/{storyId}/final_mix.mp3`) — the file is overwritten in-place. The risk is a race between a render completing and the player fetching mid-render.

---

## 8. WHAT IS NOT LOGGED AND SHOULD BE

The following failure modes produce **zero server-side evidence** (only browser console):

1. **All `onError` events on the audio element** — the browser sees a MediaError (code 1–4) but nothing is sent to any server-side log or error tracker.
2. **Stall watchdog triggers** — `console.warn('[player] stall watchdog: recovering', ...)` is browser-only.
3. **Spurious `ended` events (all three guard types)** — `trackSpuriousEndedRecovered()` is called but only writes to the analytics `play_events` table. It is not surfaced in Vercel logs or any alerting system.
4. **The `loadedmetadata` deadlock in `recoverFromStall()`** — completely invisible once `stallRecoveringRef.current = true`.
5. **Silent ASC3 segment skips** — `console.warn` only.
6. **ASC3 last-segment failure** — absolutely nothing logged anywhere.

---

## 9. IMMEDIATE RECOMMENDED ACTIONS (priority order)

### P0 — Fix the `recoverFromStall()` loadedmetadata deadlock

Add a timeout to the `loadedmetadata` listener. If it doesn't fire within 12 seconds:
```typescript
const metaTimeout = setTimeout(() => {
  audio.removeEventListener('loadedmetadata', onMeta)
  stallRecoveringRef.current = false
  if (stallRecoveryCountRef.current < 2) {
    recoverFromStall() // try again
  } else {
    setAudioErrorMessage('Audio stalled — check your connection and try again.')
    endAnalyticsSession('playback_error')
  }
}, 12000)
const onMeta = () => {
  clearTimeout(metaTimeout)
  audio.removeEventListener('loadedmetadata', onMeta)
  // ... existing seek + play logic
}
```

### P0 — Fix the ASC3 last-segment silent failure

In the `onError` handler's `else` branch:
```typescript
const ni = queueIndex + 1
if (ni < queue.length) {
  advanceQueue('error_skip')
} else {
  // Last segment failed — treat as end-of-episode
  console.error('[player] Last segment failed, treating as episode end:', failedUrl)
  setIsPlaying(false)
  saveProgress(cumTime, true)
  maybeAutoAdvanceFromNaturalEnd('natural_ended')
}
```

### P1 — Add Sentry (or equivalent) to the player

Install `@sentry/nextjs`. Capture at minimum:
- `onError` events with `audio.error.code` + `audio.error.message`
- Stall watchdog terminal failure
- Spurious ended events (supplement `trackSpuriousEndedRecovered`)
- `recoverFromStall()` failures

### P1 — Log segment failures server-side

When a segment fetch fails in the browser, send a server-side event (new `/api/analytics/player-error` endpoint or reuse `play-event`). Current situation: a user who hits Hypothesis B sees nothing, Marc sees nothing, and the error disappears.

### P2 — Store exact `durationSecs` (not `Math.ceil`) in DB

Change `render-final-mix/core.ts`:
```typescript
duration_mins: Math.ceil(durationSecs / 60)  // ← current
// →
duration_secs: Math.round(durationSecs),       // new column
duration_mins: Math.ceil(durationSecs / 60),   // keep for display
```
Use `duration_secs` as the expected duration for Guard 3 instead of `duration_mins * 60`.

### P2 — Remove `no-cache` from audio uploads, use versioned URLs instead

The `?v={timestamp}` cache-busting in `story-playlist` already handles cache invalidation. `no-cache` on the storage object means every range request (seek) hits Supabase origin for revalidation, adding latency and failure surface.

---

## 10. SUMMARY FOR MARC

**Marc, here is the direct answer:** There are **two silent failure modes** that can stop playback with no user-visible error and no server-side log:

1. **The stall recovery watchdog can permanently blind itself.** When `recoverFromStall()` fires, it waits for a `loadedmetadata` event on the reloaded audio element. If that event never comes (Supabase CDN hiccup, file not found, network error during reload), `stallRecoveringRef.current` stays `true` and the watchdog skips every subsequent check. The player shows "⏸ Pause" or "⏳ Buffering…" forever. You have to close and reopen the app to recover.

2. **If the final audio segment in queue mode fails to load, nothing happens.** For personalized subscribers playing in ASC3 queue mode (opener clip → announcement → story body → outro), if the outro fails to fetch, the player silently stops with no error card, no auto-advance, no "Story complete." It just goes silent. You wouldn't know it failed — you'd just think it ended.

Both of these are silent because there is no Sentry or equivalent client-side error reporting installed. All player errors are browser-console-only. Marc would only see them if a user opened DevTools at the exact moment of failure.

The `story-playlist` API has no `maxDuration` override, but it's not in the audio byte path — audio is served directly from Supabase Storage, not through Vercel. No Vercel function timeout can cut off playback mid-stream.

The 80+ segment "local mix" stories are indistinguishable from regular stories from the player's perspective — they resolve to the same `audio_url` column.
