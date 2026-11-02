/**
 * VOICE-LEVEL-001 (Marc 2026-11-02: "some sound a little low in volume…
 * make sure that all the voices have a volume loud enough to hear").
 *
 * ElevenLabs voices come out at different loudness (a soft voice like
 * "Pov - Fine Voice" can sit several dB under the others). The final mix
 * levels the whole body in one loudnorm pass, which keeps those differences.
 *
 * This matches the CHARACTERS to each other: one fixed gain per speaker,
 * from the loudness of all that speaker's lines together, applied to every
 * line of theirs. It is not per-line loudnorm (short lines get pumped),
 * so each actor's own ups and downs stay as performed.
 *
 *   - target = the story's typical speaker level (duration-weighted median)
 *   - only speakers more than LEVEL_TOLERANCE_DB off are changed
 *   - gain capped at +MAX_BOOST_DB / -MAX_CUT_DB
 *   - a boosted speaker gets a peak compressor when the boost would push peaks past -1 dBTP
 *
 * On by default; VOICE_LEVEL=off turns it off.
 */

export const VOICE_LEVEL = {
  LEVEL_TOLERANCE_DB: 1.5,
  MAX_BOOST_DB: 9,
  MAX_CUT_DB: 6,
  /** lines shorter than this don't count toward a speaker's level (too short to measure well) */
  MIN_MEASURE_SEC: 1.0,
  PEAK_CEILING_DBTP: -1.0,
}

export function voiceLevelEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return String(env.VOICE_LEVEL || '').trim().toLowerCase() !== 'off'
}

export type MeasuredLine = { idx: number; speaker: string; lufs: number; truePeak: number; dur: number }
export type SpeakerGain = { speaker: string; levelLufs: number; gainDb: number; limiter: boolean; lines: number }

/** Loudness of several lines together (energy average, weighted by length). */
export function combinedLufs(lines: Array<{ lufs: number; dur: number }>): number {
  const ok = lines.filter((l) => Number.isFinite(l.lufs) && l.dur > 0)
  const total = ok.reduce((s, l) => s + l.dur, 0)
  if (!total) return NaN
  const energy = ok.reduce((s, l) => s + l.dur * Math.pow(10, l.lufs / 10), 0) / total
  return 10 * Math.log10(energy)
}

function weightedMedian(values: Array<{ v: number; w: number }>): number {
  const s = [...values].sort((a, b) => a.v - b.v)
  const half = s.reduce((t, x) => t + x.w, 0) / 2
  let acc = 0
  for (const x of s) { acc += x.w; if (acc >= half) return x.v }
  return s.length ? s[s.length - 1].v : NaN
}

const normSpeaker = (s: string) => String(s || '').trim().toUpperCase()

/** One gain per speaker. Speakers that need no change are left out. */
export function planSpeakerGains(lines: MeasuredLine[], o = VOICE_LEVEL): { targetLufs: number; gains: SpeakerGain[] } {
  const by = new Map<string, MeasuredLine[]>()
  for (const l of lines) {
    const k = normSpeaker(l.speaker)
    if (!k) continue
    if (!by.has(k)) by.set(k, [])
    by.get(k)!.push(l)
  }
  const speakers: Array<{ speaker: string; level: number; dur: number; maxTp: number; all: MeasuredLine[] }> = []
  for (const [speaker, all] of by) {
    const measured = all.filter((l) => l.dur >= o.MIN_MEASURE_SEC && Number.isFinite(l.lufs))
    const level = combinedLufs(measured.length ? measured : all)
    if (!Number.isFinite(level)) continue
    const tps = all.map((l) => l.truePeak).filter(Number.isFinite)
    speakers.push({ speaker, level, dur: all.reduce((s, l) => s + l.dur, 0), maxTp: tps.length ? Math.max(...tps) : -20, all })
  }
  if (speakers.length < 2) return { targetLufs: speakers[0]?.level ?? NaN, gains: [] }
  const targetLufs = weightedMedian(speakers.map((s) => ({ v: s.level, w: s.dur })))
  const gains: SpeakerGain[] = []
  for (const s of speakers) {
    const diff = targetLufs - s.level
    if (Math.abs(diff) <= o.LEVEL_TOLERANCE_DB) continue
    const gainDb = Math.max(-o.MAX_CUT_DB, Math.min(o.MAX_BOOST_DB, diff))
    const limiter = gainDb > 0 && s.maxTp + gainDb > o.PEAK_CEILING_DBTP
    gains.push({ speaker: s.speaker, levelLufs: Number(s.level.toFixed(2)), gainDb: Number(gainDb.toFixed(2)), limiter, lines: s.all.length })
  }
  return { targetLufs: Number(targetLufs.toFixed(2)), gains }
}

/**
 * ffmpeg -af chain for one speaker's lines. When the boost would push peaks
 * past the ceiling, a fast compressor first holds the peaks under
 * (ceiling - boost), so the boosted line never clips. (acompressor, not
 * alimiter: newer alimiter auto-levels its output, the server's ffmpeg doesn't.)
 * The body loudnorm pass afterwards sets the final true peak.
 */
export function speakerGainFilter(g: SpeakerGain, o = VOICE_LEVEL): string {
  const vol = `volume=${g.gainDb.toFixed(2)}dB`
  if (!g.limiter) return vol
  const threshold = Math.pow(10, (o.PEAK_CEILING_DBTP - 2 - g.gainDb) / 20)
  return `acompressor=threshold=${threshold.toFixed(5)}:ratio=20:attack=1:release=60:makeup=1,${vol}`
}
