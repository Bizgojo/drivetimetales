/**
 * MIX-V3-001 (Marc 2026-11-01, stage 1) — the music follows Marc's drawing.
 *
 *   1. After Belle's intro the music swells, then FADES down to the bed over
 *      about 3 seconds, finishing under the first line (today: an instant drop).
 *   2. One continuous piece of music under the story (today the bed restarts
 *      the track at 0:00 and the end swell restarts it again).
 *   3. A simple crescendo: the bed builds through the last stretch of the story,
 *      still under the voices, then swells after the last line.
 *   4. Under Belle's outro the music comes down to the bed level (today: 0,
 *      silence) and holds, then fades to 0 over 3 seconds after she finishes.
 *      The outro music continues from where the story music stopped.
 *
 * Behind MIX_V3=on (or runRenderFinalMix opts.mixV3). Off = today's mix.
 * Stage 2 (after launch): level follows each scene's tension.
 *
 * Levels are on the same mix-bus scale as MUSIC-002 (Belle fixed gain 1.5).
 * The envelope is a list of segments; the same list drives the ffmpeg
 * volume expression and musicLevelAt() so the shape is unit-tested.
 */

export const MIX_V3 = {
  /** music alone before the first line (same as MUSIC-002) */
  PRE_ROLL_SEC: 2.5,
  SWELL: 1.3,
  BED: 0.13,
  /** top of the crescendo, at the last line — still under the voices */
  CRESCENDO_PEAK: 0.22,
  /** crescendo length: this share of the story, capped */
  CRESCENDO_SHARE: 0.25,
  CRESCENDO_MAX_SEC: 45,
  FADE_IN_SEC: 1.0,
  /** the fade from the swell to the bed starts this far into the pre-roll… */
  FADE_DOWN_START_SEC: 1.2,
  /** …and finishes this far into the first line */
  FADE_DOWN_INTO_STORY_SEC: 1.5,
  END_SWELL_RAMP_SEC: 1.0,
  END_SWELL_HOLD_SEC: 1.0,
  /** outro: swell → bed level before Belle speaks */
  OUTRO_DUCK_SEC: 1.0,
  OUTRO_BED: 0.13,
  OUTRO_TAIL_FADE_SEC: 3.0,
}

export type EnvSegment = { t0: number; t1: number; from: number; to: number; curve: 'lin' | 'db' }

export function mixV3Enabled(flag?: boolean, env: Record<string, string | undefined> = process.env): boolean {
  if (typeof flag === 'boolean') return flag
  return String(env.MIX_V3 || '').trim().toLowerCase() === 'on'
}

const db = (g: number) => 20 * Math.log10(g)

function segValue(s: EnvSegment, t: number): number {
  const p = s.t1 > s.t0 ? Math.min(1, Math.max(0, (t - s.t0) / (s.t1 - s.t0))) : 1
  if (s.curve === 'db' && s.from > 0 && s.to > 0) return Math.pow(10, (db(s.from) + (db(s.to) - db(s.from)) * p) / 20)
  return s.from + (s.to - s.from) * p
}

/** Level at time t (seconds) for an envelope. Past the end: the last level. */
export function musicLevelAt(segs: EnvSegment[], t: number): number {
  for (const s of segs) if (t < s.t1) return segValue(s, Math.max(t, s.t0))
  return segs.length ? segs[segs.length - 1].to : 0
}

const n = (x: number) => x.toFixed(4)

function segExpr(s: EnvSegment): string {
  const p = s.t1 > s.t0 ? `(t-${n(s.t0)})/${n(s.t1 - s.t0)}` : '1'
  if (s.from === s.to) return n(s.from)
  if (s.curve === 'db' && s.from > 0 && s.to > 0) {
    return `pow(10,(${n(db(s.from))}+(${n(db(s.to) - db(s.from))})*${p})/20)`
  }
  return `(${n(s.from)}+(${n(s.to - s.from)})*${p})`
}

/** ffmpeg volume expression (use with eval=frame). */
export function envelopeExpr(segs: EnvSegment[]): string {
  const last = segs.length ? n(segs[segs.length - 1].to) : '0'
  return segs.reduceRight((acc, s) => `if(lt(t,${n(s.t1)}),${segExpr(s)},${acc})`, last)
}

/**
 * Story-body music: t=0 is the start of story_body.mp3; the first line starts
 * at PRE_ROLL_SEC; the last line ends at PRE_ROLL_SEC + storySec.
 *
 * MIX-V4-001: sceneLevels (seconds from the first line → bed level) make the
 * bed follow the story's tension, with a TENSION_RAMP_SEC ramp at each change.
 * Without them the bed is flat at BED (stage 1).
 */
export const TENSION_RAMP_SEC = 5

export function storyMusicEnvelope(storySec: number, o = MIX_V3, sceneLevels: Array<{ atSec: number; level: number }> = []): { segs: EnvSegment[]; totalSec: number } {
  const start = o.PRE_ROLL_SEC
  const end = start + Math.max(0, storySec)
  const fadeDownEnd = Math.min(start + o.FADE_DOWN_INTO_STORY_SEC, end)
  const crescSec = Math.min(o.CRESCENDO_MAX_SEC, Math.max(0, storySec) * o.CRESCENDO_SHARE)
  const crescStart = Math.max(fadeDownEnd, end - crescSec)
  const swellEnd = end + o.END_SWELL_RAMP_SEC
  const totalSec = swellEnd + o.END_SWELL_HOLD_SEC
  const marks = [...sceneLevels].filter((m) => Number.isFinite(m.atSec) && m.level > 0).sort((a, b) => a.atSec - b.atSec)
  const firstLevel = marks.length ? marks[0].level : o.BED
  const segs: EnvSegment[] = [
    { t0: 0, t1: o.FADE_IN_SEC, from: 0, to: o.SWELL, curve: 'lin' },
    { t0: o.FADE_IN_SEC, t1: o.FADE_DOWN_START_SEC, from: o.SWELL, to: o.SWELL, curve: 'lin' },
    { t0: o.FADE_DOWN_START_SEC, t1: fadeDownEnd, from: o.SWELL, to: firstLevel, curve: 'db' },
  ]
  let cursor = fadeDownEnd
  let level = firstLevel
  const changes = marks.slice(1).map((m) => ({ at: start + m.atSec, level: m.level }))
  changes.forEach((c, i) => {
    const at = Math.max(c.at, cursor)
    if (at >= crescStart || c.level === level) return
    const nextAt = i + 1 < changes.length ? Math.max(changes[i + 1].at, at) : Infinity
    const rampEnd = Math.min(at + TENSION_RAMP_SEC, nextAt, crescStart)
    if (rampEnd <= at) return
    segs.push({ t0: cursor, t1: at, from: level, to: level, curve: 'lin' })
    segs.push({ t0: at, t1: rampEnd, from: level, to: c.level, curve: 'db' })
    cursor = rampEnd
    level = c.level
  })
  const peak = Math.max(o.CRESCENDO_PEAK, level)
  segs.push(
    { t0: cursor, t1: crescStart, from: level, to: level, curve: 'lin' },
    { t0: crescStart, t1: end, from: level, to: peak, curve: 'db' },
    { t0: end, t1: swellEnd, from: peak, to: o.SWELL, curve: 'db' },
    { t0: swellEnd, t1: totalSec, from: o.SWELL, to: o.SWELL, curve: 'lin' },
  )
  return { segs: segs.filter((s) => s.t1 > s.t0), totalSec }
}

/**
 * Outro music: t=0 is the start of the outro clip (Belle starts at
 * OUTRO_DUCK_SEC). Ends OUTRO_TAIL_FADE_SEC after Belle finishes, at 0.
 */
export function outroMusicEnvelope(belleSec: number, o = MIX_V3): { segs: EnvSegment[]; totalSec: number; belleDelaySec: number } {
  const belleEnd = o.OUTRO_DUCK_SEC + Math.max(0, belleSec)
  const totalSec = belleEnd + o.OUTRO_TAIL_FADE_SEC
  const segs: EnvSegment[] = [
    { t0: 0, t1: o.OUTRO_DUCK_SEC, from: o.SWELL, to: o.OUTRO_BED, curve: 'db' },
    { t0: o.OUTRO_DUCK_SEC, t1: belleEnd, from: o.OUTRO_BED, to: o.OUTRO_BED, curve: 'lin' },
    { t0: belleEnd, t1: totalSec, from: o.OUTRO_BED, to: 0, curve: 'lin' },
  ].filter((s) => s.t1 > s.t0)
  return { segs, totalSec, belleDelaySec: o.OUTRO_DUCK_SEC }
}
