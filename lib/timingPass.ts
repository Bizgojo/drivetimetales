/**
 * ARTIFACT-TIMING-001 — the re-record pass that runs once after voicing,
 * before Belle/music/render. One line is re-recorded per worker tick (workers
 * die after ~16 minutes), so the pass is a small state machine kept in
 * production_jobs.state_json.timingCheck.
 *
 * It never blocks a story: a line that is still off after one re-record is
 * listed in timingCheck.stillFlagged for Marc to hear at review.
 */
import { parseScriptPositions } from './scriptLineIndex'
import { findTimingOutliers, type TimedLine, type TimingFlag } from './speechTiming'

export const SEGMENT_BYTES_PER_SECOND = 24000
/** Safety cap: more than this per episode means something bigger is wrong — record, don't loop. */
export const MAX_RERECORDS_PER_EPISODE = 15

export type TimingQueueItem = { storyId: string; index: number; speaker: string; kind: TimingFlag['kind']; text: string }
export type TimingCheckState = {
  done: boolean
  startedAt: string
  queue: TimingQueueItem[]
  flagged: TimingQueueItem[]
  rerecorded: Array<TimingQueueItem & { ok: boolean; error?: string }>
  stillFlagged: TimingQueueItem[]
  overCap: Array<{ storyId: string; flagged: number }>
  finishedAt?: string
}

/** Spoken lines of one episode with seconds from segment file sizes. */
export function timedLinesFromSizes(script: string, sizes: Map<number, number>): TimedLine[] {
  return parseScriptPositions(String(script || ''))
    .filter((p) => p.kind === 'voice' && p.isExpected && (sizes.get(p.index) || 0) > 0)
    .map((p) => ({ index: p.index, speaker: String(p.speaker), text: String(p.text || ''), seconds: sizes.get(p.index)! / SEGMENT_BYTES_PER_SECOND }))
}

/** Segment sizes from a storage listing (segment_NNNN.mp3 → bytes). */
export function sizesFromListing(files: Array<{ name: string; metadata?: any }>): Map<number, number> {
  const sizes = new Map<number, number>()
  for (const f of files || []) {
    const m = String(f.name).match(/^segment_(\d{4})\.mp3$/)
    if (m) sizes.set(Number(m[1]), Number(f.metadata?.size || 0))
  }
  return sizes
}

export function toQueueItems(storyId: string, flags: TimingFlag[]): TimingQueueItem[] {
  return flags.map((f) => ({ storyId, index: f.index, speaker: f.speaker, kind: f.kind, text: f.text.slice(0, 160) }))
}

/** First pass: what to re-record, with the per-episode cap applied. */
export function planTimingPass(episodes: Array<{ storyId: string; lines: TimedLine[] }>, now: string): TimingCheckState {
  const flagged: TimingQueueItem[] = []
  const queue: TimingQueueItem[] = []
  const overCap: TimingCheckState['overCap'] = []
  for (const ep of episodes) {
    const items = toQueueItems(ep.storyId, findTimingOutliers(ep.lines))
    flagged.push(...items)
    if (items.length > MAX_RERECORDS_PER_EPISODE) overCap.push({ storyId: ep.storyId, flagged: items.length })
    queue.push(...items.slice(0, MAX_RERECORDS_PER_EPISODE))
  }
  return { done: queue.length === 0, startedAt: now, queue, flagged, rerecorded: [], stillFlagged: [], overCap, ...(queue.length === 0 ? { finishedAt: now } : {}) }
}

/** Last pass: re-recorded lines that are still off go to Marc's review list. */
export function finishTimingPass(state: TimingCheckState, episodes: Array<{ storyId: string; lines: TimedLine[] }>, now: string): TimingCheckState {
  const rerecordedKeys = new Set(state.rerecorded.map((r) => `${r.storyId}:${r.index}`))
  const stillFlagged: TimingQueueItem[] = []
  for (const ep of episodes) {
    for (const item of toQueueItems(ep.storyId, findTimingOutliers(ep.lines))) {
      if (rerecordedKeys.has(`${item.storyId}:${item.index}`)) stillFlagged.push(item)
    }
  }
  return { ...state, queue: [], stillFlagged, done: true, finishedAt: now }
}
