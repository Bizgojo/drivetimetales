/**
 * SFX-SOURCEAUDIO-001 (Marc, Nov 11, 2026: "build it")
 *
 * Sound Ideas sounds come in through the SourceAudio API only (CANON-06 rules
 * 2–3). This is the small client the fetch script uses:
 *   - search:   GET https://<host>/api/tracks/search?s=...&show=...&token=...
 *   - download: GET https://<host>/api/tracks/download?track_id=...&format=...&token=...
 *     (docs.sourceaudio.com/api/search.html, /api/download.html)
 *
 * Settings (entered on the server by Marc himself, never printed — CANON-06 rule 6):
 *   SOURCEAUDIO_API_TOKEN   the key Ron sends
 *   SOURCEAUDIO_HOST        Sound Ideas' SourceAudio site, e.g. soundideas.sourceaudio.com
 *
 * Pace (CANON-06 rule 7): one request at a time, at least SOURCEAUDIO_MIN_GAP_MS
 * apart, and a hard cap per session. Never parallel, never bursts.
 */

export const SOURCEAUDIO_MIN_GAP_MS = 4000
export const SOURCEAUDIO_SESSION_MAX_REQUESTS = 300

export type SourceAudioConfig = { host: string; token: string; minGapMs?: number; maxRequests?: number }

export type SourceAudioTrack = {
  id: number
  title: string
  description: string
  durationSec: number
  filename: string
  album: string
}

export function sourceAudioConfigFromEnv(env: Record<string, string | undefined> = process.env): SourceAudioConfig | null {
  const token = String(env.SOURCEAUDIO_API_TOKEN || '').trim()
  const host = String(env.SOURCEAUDIO_HOST || '').trim().replace(/^https?:\/\//, '').replace(/\/+$/, '')
  if (!token || !host) return null
  return { host, token }
}

/** "Door, wood, opens" → "door wood opens" (plain words; SourceAudio does the matching). */
export function catalogSearchText(name: string): string {
  return String(name || '').toLowerCase().replace(/\bor\b/g, ' ').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim()
}

export function parseSearchTracks(json: any): SourceAudioTrack[] {
  const rows: any[] = Array.isArray(json?.tracks) ? json.tracks : []
  return rows.map((r) => ({
    id: Number(r['SourceAudio ID'] ?? r.id ?? 0),
    title: String(r.Title ?? r.title ?? '').trim(),
    description: String(r.Description ?? r.description ?? '').trim(),
    durationSec: Number(r.Duration ?? r.duration ?? 0),
    filename: String(r.Filename ?? r.filename ?? '').trim(),
    album: String(r.Album ?? r.album ?? '').trim(),
  })).filter((t) => t.id > 0)
}

/**
 * Pick up to `count` candidates for one catalog name.
 * spot: 0.3–15 s (shortest plausible first, so a door is a door, not a scene);
 * background: at least 20 s (a place sound must be able to run under a scene).
 * Tracks already tried for this name are skipped (CANON-06 rule 20: next result not tried before).
 */
export function pickCandidates(tracks: SourceAudioTrack[], kind: 'spot' | 'background', count: number, alreadyTried: Set<number> = new Set()): SourceAudioTrack[] {
  const fresh = tracks.filter((t) => !alreadyTried.has(t.id))
  const fits = fresh.filter((t) => kind === 'background'
    ? t.durationSec >= 20
    : t.durationSec >= 0.3 && t.durationSec <= 15)
  // Keep SourceAudio's relevance order; durations of 0 (unknown) go last.
  return fits.slice(0, Math.max(0, count))
}

/** One paced HTTP client: requests never overlap and are spaced out. */
export class SourceAudioClient {
  private last = 0
  private used = 0
  constructor(
    private cfg: SourceAudioConfig,
    private fetchImpl: typeof fetch = fetch,
    private sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
    private now: () => number = () => Date.now(),
  ) {}

  get requestsUsed() { return this.used }

  private async pace() {
    const max = this.cfg.maxRequests ?? SOURCEAUDIO_SESSION_MAX_REQUESTS
    if (this.used >= max) throw new Error(`SFX-SOURCEAUDIO-001: session cap of ${max} requests reached; stop and run again later`)
    const gap = this.cfg.minGapMs ?? SOURCEAUDIO_MIN_GAP_MS
    const wait = this.last + gap - this.now()
    if (this.last > 0 && wait > 0) await this.sleep(wait)
    this.last = this.now()
    this.used += 1
  }

  private url(path: string, params: Record<string, string | number>) {
    const q = new URLSearchParams()
    for (const [k, v] of Object.entries(params)) q.set(k, String(v))
    q.set('token', this.cfg.token)
    return `https://${this.cfg.host}${path}?${q.toString()}`
  }

  async search(text: string, show = 25): Promise<SourceAudioTrack[]> {
    await this.pace()
    const res = await this.fetchImpl(this.url('/api/tracks/search', { s: text, show }))
    if (!res.ok) throw new Error(`SourceAudio search failed: HTTP ${res.status}`)
    return parseSearchTracks(await res.json())
  }

  async download(trackId: number, format = 'wav'): Promise<Buffer> {
    await this.pace()
    const res = await this.fetchImpl(this.url('/api/tracks/download', { track_id: trackId, format }))
    if (!res.ok) throw new Error(`SourceAudio download ${trackId} failed: HTTP ${res.status}`)
    const type = String(res.headers.get('content-type') || '')
    if (/json|html/i.test(type)) throw new Error(`SourceAudio download ${trackId} returned ${type}, not audio`)
    return Buffer.from(await res.arrayBuffer())
  }
}
