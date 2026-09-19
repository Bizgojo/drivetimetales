// lib/mediaSession.ts — CAR-MEDIA-001 (Phase 1): MediaSession API.
//
// Lets the lock screen, Bluetooth head units, steering-wheel buttons,
// headphones and CarPlay/Android Auto "now playing" (browser-audio bridge)
// show what's playing and control it: play/pause, prev/next, ±seek, scrub.
//
// Ownership model: navigator.mediaSession is a single global, but the app has
// several audio surfaces (story player, Belle intros/welcome, landing
// samples). Each playing surface CLAIMS the session; claims form a stack and
// the most recent claim owns the controls. Releasing a claim (clip ended /
// component unmounted) re-applies the claim underneath — e.g. a Belle clip
// over the story hands control back to the story, instead of leaving the
// lock screen stuck on dead "Belle" controls.
//
// All calls are no-ops where MediaSession is unsupported (SSR, old browsers).

export type MediaAction =
  | 'play' | 'pause' | 'stop'
  | 'previoustrack' | 'nexttrack'
  | 'seekbackward' | 'seekforward' | 'seekto'

export type MediaActionHandlers = Partial<Record<MediaAction, (details: MediaSessionActionDetails) => void>>

export interface MediaTrack {
  title: string
  artist?: string | null
  album?: string | null
  artworkUrl?: string | null
}

export const SEEK_BACKWARD_SECONDS = 15
export const SEEK_FORWARD_SECONDS = 30
export const MEDIA_ALBUM = 'Endless Tales'
const FALLBACK_ARTWORK = '/icons/icon-512x512.png'
const ALL_ACTIONS: MediaAction[] = ['play', 'pause', 'stop', 'previoustrack', 'nexttrack', 'seekbackward', 'seekforward', 'seekto']
// Head units / OS pick the closest size; we only have one image per story,
// so advertise it at every standard size (the OS scales).
const ARTWORK_SIZES = [96, 128, 192, 256, 384, 512]

interface Claim {
  id: number
  track: MediaTrack
  // Resolved at call time, so callers can keep handlers fresh without re-claiming.
  getHandlers: () => MediaActionHandlers
  state: MediaSessionPlaybackState
  position: { duration: number; position: number; playbackRate: number } | null
}

const stack: Claim[] = []
let nextId = 1

export function mediaSessionSupported(): boolean {
  return typeof navigator !== 'undefined' && 'mediaSession' in navigator
}

function artworkType(url: string): string | undefined {
  const ext = url.split('?')[0].split('.').pop()?.toLowerCase()
  if (ext === 'png') return 'image/png'
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg'
  if (ext === 'webp') return 'image/webp'
  return undefined
}

export function buildArtwork(url?: string | null): MediaImage[] {
  let src = url || FALLBACK_ARTWORK
  // MediaSession needs an absolute URL for most OS surfaces.
  if (typeof window !== 'undefined') {
    try { src = new URL(src, window.location.origin).href } catch {}
  }
  const type = artworkType(src)
  return ARTWORK_SIZES.map(s => ({ src, sizes: `${s}x${s}`, ...(type ? { type } : {}) }))
}

function top(): Claim | undefined {
  return stack[stack.length - 1]
}

function setHandler(action: MediaAction, handler: ((d: MediaSessionActionDetails) => void) | null) {
  try {
    navigator.mediaSession.setActionHandler(action as MediaSessionAction, handler)
  } catch {
    // Browser doesn't support this action (e.g. 'seekto' on older Safari) — skip.
  }
}

function applyPosition(claim: Claim) {
  const ms = navigator.mediaSession
  if (!claim.position || typeof ms.setPositionState !== 'function') return
  const { duration, position, playbackRate } = claim.position
  try {
    if (Number.isFinite(duration) && duration > 0) {
      ms.setPositionState({ duration, position: Math.min(Math.max(0, position), duration), playbackRate: playbackRate || 1 })
    }
  } catch (err) {
    console.warn('[mediaSession] setPositionState failed:', err)
  }
}

function apply(claim: Claim | undefined) {
  if (!mediaSessionSupported()) return
  const ms = navigator.mediaSession
  if (!claim) {
    ms.metadata = null
    ALL_ACTIONS.forEach(a => setHandler(a, null))
    ms.playbackState = 'none'
    return
  }
  const { title, artist, album, artworkUrl } = claim.track
  ms.metadata = new MediaMetadata({
    title,
    artist: artist || '',
    album: album || MEDIA_ALBUM,
    artwork: buildArtwork(artworkUrl),
  })
  const handlers = claim.getHandlers()
  const registered: string[] = []
  ALL_ACTIONS.forEach(action => {
    const has = Boolean(handlers[action])
    // Look the handler up at call time so it's never a stale closure.
    setHandler(action, has ? (details) => claim.getHandlers()[action]?.(details) : null)
    if (has) registered.push(action)
  })
  ms.playbackState = claim.state
  applyPosition(claim)
  console.log(`[mediaSession] metadata set: "${title}" — ${artist || ''} (${album || MEDIA_ALBUM}); handlers: ${registered.join(', ')}`)
}

/** Take ownership of the lock-screen / car controls. Returns a claim id. */
export function claimMediaSession(track: MediaTrack, getHandlers: () => MediaActionHandlers): number {
  const claim: Claim = { id: nextId++, track, getHandlers, state: 'none', position: null }
  if (!mediaSessionSupported()) return claim.id
  stack.push(claim)
  apply(claim)
  return claim.id
}

/** Update the metadata of an existing claim (e.g. story loaded after claim). */
export function updateMediaTrack(id: number, track: MediaTrack) {
  const claim = stack.find(c => c.id === id)
  if (!claim) return
  claim.track = track
  if (claim === top()) apply(claim)
}

/** Re-read handlers (e.g. next episode became available/unavailable). */
export function refreshMediaHandlers(id: number) {
  const claim = top()
  if (claim?.id === id) apply(claim)
}

export function setMediaPlaybackState(id: number, state: MediaSessionPlaybackState) {
  const claim = stack.find(c => c.id === id)
  if (!claim) return
  claim.state = state
  if (claim === top() && mediaSessionSupported()) navigator.mediaSession.playbackState = state
}

export function setMediaPosition(id: number, duration: number, position: number, playbackRate = 1) {
  const claim = stack.find(c => c.id === id)
  if (!claim) return
  claim.position = { duration, position, playbackRate }
  if (claim === top() && mediaSessionSupported()) applyPosition(claim)
}

/** Give up ownership; the previous claim (if any) takes the controls back. */
export function releaseMediaSession(id: number) {
  const index = stack.findIndex(c => c.id === id)
  if (index < 0) return
  const wasTop = index === stack.length - 1
  stack.splice(index, 1)
  if (wasTop) apply(top())
}

/**
 * Wire a plain <audio> element (samples, Belle clips): claims the session on
 * 'play', keeps playbackState + position in sync from element events, maps
 * the car/lock-screen actions to the element, and releases on 'ended' (and
 * on the returned cleanup). Optional extra handlers (e.g. nexttrack) override
 * the element defaults. Returns a detach function.
 */
export function attachMediaSession(
  el: HTMLAudioElement | null | undefined,
  track: MediaTrack | (() => MediaTrack),
  extraHandlers: () => MediaActionHandlers = () => ({})
): () => void {
  if (!el || !mediaSessionSupported()) return () => {}
  let claimId: number | null = null
  const resolveTrack = () => (typeof track === 'function' ? track() : track)

  const seekBy = (delta: number) => {
    const d = Number.isFinite(el.duration) ? el.duration : Infinity
    el.currentTime = Math.min(Math.max(0, el.currentTime + delta), d)
    sync()
  }
  const handlers = (): MediaActionHandlers => ({
    play: () => { el.play().catch(() => {}) },
    pause: () => { el.pause() },
    seekbackward: (d) => seekBy(-(d.seekOffset || SEEK_BACKWARD_SECONDS)),
    seekforward: (d) => seekBy(d.seekOffset || SEEK_FORWARD_SECONDS),
    seekto: (d) => { if (typeof d.seekTime === 'number') { el.currentTime = d.seekTime; sync() } },
    previoustrack: () => seekBy(-SEEK_BACKWARD_SECONDS),
    nexttrack: () => seekBy(SEEK_FORWARD_SECONDS),
    ...extraHandlers(),
  })
  const sync = () => {
    if (claimId === null) return
    setMediaPlaybackState(claimId, el.paused ? 'paused' : 'playing')
    if (Number.isFinite(el.duration) && el.duration > 0) {
      setMediaPosition(claimId, el.duration, el.currentTime, el.playbackRate)
    }
  }
  const onPlay = () => {
    if (claimId === null) claimId = claimMediaSession(resolveTrack(), handlers)
    sync()
  }
  const onEnded = () => {
    if (claimId !== null) { releaseMediaSession(claimId); claimId = null }
  }
  const events: Array<[string, () => void]> = [
    ['play', onPlay], ['playing', sync], ['pause', sync], ['seeked', sync],
    ['durationchange', sync], ['ratechange', sync], ['ended', onEnded],
  ]
  events.forEach(([e, fn]) => el.addEventListener(e, fn))
  if (!el.paused) onPlay()

  return () => {
    events.forEach(([e, fn]) => el.removeEventListener(e, fn))
    onEnded()
  }
}
