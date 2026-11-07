/**
 * ARTIFACT-TIMING-001 (Marc 2026-11-07, Sunset Ep 8 — Ruth "aaaaaa").
 *
 * Root cause: the audio checks could not see a non-word glitch. The artifact
 * gate checks size/loudness/silence; the transcript check uses Whisper, which
 * drops sounds that are not words ("aaaaaa", a held vowel, a hum). The only
 * duration check (TRUNCATION-DURATION-001) catches audio that is too SHORT.
 * Nothing caught audio that is too LONG for its words.
 *
 * This compares every spoken line with how long that same voice normally
 * takes in the same episode. A line that runs well past its words (an extra
 * sound inside it) or far short of them (cut off) is flagged. Pure functions;
 * plain arithmetic, no AI.
 */
import { spokenWordCount } from './speechDuration'

export type TimedLine = { index: number; speaker: string; text: string; seconds: number }
export type TimingFlag = TimedLine & {
  kind: 'too_long' | 'too_short'
  expectedSeconds: number
  extraSeconds: number
  ratio: number
}

/** Seconds a voice spends on each pause mark (. ? ! ; : and dashes/ellipses). */
export const SECONDS_PER_BREAK = 0.35
/** A line is flagged when it runs this many seconds past what its words need... */
export const MIN_EXTRA_SECONDS = 1.5
/** ...and is at least this much longer than expected. */
export const MIN_LONG_RATIO = 1.25
/** Cut-off: a line of 8+ words shorter than half its expected time. */
export const MAX_SHORT_RATIO = 0.5
export const MIN_WORDS_FOR_SHORT = 8

/** Pause marks in a line. A dash or ellipsis is a longer pause than a period. */
export function breakCount(text: string): number {
  const t = String(text || '')
  const stops = (t.match(/[.?!;:](?=\s|$|["')*])/g) || []).length
  const dashes = (t.match(/[—–]|--/g) || []).length
  const ellipses = (t.match(/\.\.\.|…/g) || []).length
  return stops + dashes * 1.5 + ellipses * 1.5
}

function median(values: number[]): number {
  if (!values.length) return NaN
  const s = [...values].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

/** Each speaker's own pace in this episode: seconds per word, pauses removed. */
export function speakerPace(lines: TimedLine[]): Map<string, number> {
  const bySpeaker = new Map<string, number[]>()
  for (const l of lines) {
    const words = spokenWordCount(l.text)
    if (words < 5 || !(l.seconds > 0)) continue
    const perWord = (l.seconds - breakCount(l.text) * SECONDS_PER_BREAK) / words
    if (perWord <= 0) continue
    bySpeaker.set(l.speaker, [...(bySpeaker.get(l.speaker) || []), perWord])
  }
  const all = [...bySpeaker.values()].flat()
  const overall = median(all)
  const pace = new Map<string, number>()
  for (const [speaker, values] of bySpeaker) {
    // Few lines → lean on the episode's overall pace.
    pace.set(speaker, values.length >= 4 ? median(values) : median([...values, overall, overall]))
  }
  pace.set('__overall__', overall)
  return pace
}

export function expectedSeconds(line: TimedLine, pace: Map<string, number>): number {
  const perWord = pace.get(line.speaker) ?? pace.get('__overall__') ?? 0.4
  return spokenWordCount(line.text) * perWord + breakCount(line.text) * SECONDS_PER_BREAK
}

/** Lines whose audio does not fit their words. */
export function findTimingOutliers(lines: TimedLine[]): TimingFlag[] {
  const spoken = lines.filter((l) => l.seconds > 0 && spokenWordCount(l.text) > 0)
  const pace = speakerPace(spoken)
  const flags: TimingFlag[] = []
  for (const l of spoken) {
    const words = spokenWordCount(l.text)
    // A one- or two-word line ("No.", "...What?") is mostly breath and pause.
    if (words < 3) continue
    const expected = expectedSeconds(l, pace)
    if (!(expected > 0)) continue
    const extra = l.seconds - expected
    const ratio = l.seconds / expected
    if (extra >= MIN_EXTRA_SECONDS && ratio >= MIN_LONG_RATIO) {
      flags.push({ ...l, kind: 'too_long', expectedSeconds: round(expected), extraSeconds: round(extra), ratio: round(ratio) })
    } else if (words >= MIN_WORDS_FOR_SHORT && ratio <= MAX_SHORT_RATIO) {
      flags.push({ ...l, kind: 'too_short', expectedSeconds: round(expected), extraSeconds: round(extra), ratio: round(ratio) })
    }
  }
  return flags.sort((a, b) => b.ratio - a.ratio)
}

const round = (n: number) => Math.round(n * 100) / 100
