/**
 * SFX-LAYERED-001 — professional-style sound-effect placement for the story body.
 *
 * Current mix (default): every [SFX:] clip is concatenated in its own gap
 * between two voice lines, so a sound stops dead the moment anyone speaks
 * (rain stops when the narrator starts, an engine cuts out mid-chase).
 *
 * Layered mix (this module, behind SFX_LAYERED_MIX=on):
 *   - SPOT effects (door, gunshot, phone, bell…) still land in the gap at
 *     their cue, but the next line comes in OVERLAP_SEC before the effect
 *     ends, so there is no dead stop.
 *   - BED effects (rain, wind, engine, traffic, crowd…) play LEAD_SEC on
 *     their own, then keep running quietly UNDER the narration (looped if
 *     short) until the next scene break or the next effect, capped at
 *     MAX_BED_SEC, with a fade out.
 *
 * Pure planning lives here (unit-tested); the ffmpeg build is
 * buildLayeredStoryBody(). Voices are never moved relative to each other
 * except for the gap each effect occupies, and every voice line stays the
 * loudest thing at its moment.
 */

export type BodyItem =
  | { kind: 'voice'; idx: number; path: string; dur: number; sceneBreak?: boolean }
  | {
      kind: 'sfx'; idx: number; path: string; dur: number; cue: string
      /** SFX-WORD-001: play inside voice line voiceIdx, atSec into it (no gap, the voice keeps going). */
      anchor?: { voiceIdx: number; atSec: number }
    }

export type SfxRole = 'spot' | 'bed'

export type SfxPlacement = {
  idx: number
  path: string
  cue: string
  role: SfxRole
  /** seconds from the start of the body */
  start: number
  /** seconds the effect plays (beds may loop the clip to reach this) */
  length: number
  /** bed only: seconds at full level before the voice comes in */
  lead: number
  /** bed only: level under the voice (0..1) */
  bedGain: number
  loop: boolean
  fadeOut: number
  /** duration of the generated clip itself */
  clipDur: number
}

export type LayeredPlan = {
  /** voice items in order, each with the silence to insert BEFORE it */
  voices: Array<{ idx: number; path: string; start: number; gapBefore: number; dur: number }>
  sfx: SfxPlacement[]
  totalDuration: number
}

export const LAYERED_DEFAULTS = {
  OVERLAP_SEC: 0.5,
  LEAD_SEC: 2.0,
  MAX_BED_SEC: 30,
  /**
   * SFX-BED-SCENE-001 (Marc 2026-10-31, test first): a background lasts its
   * scene — a spot effect no longer stops it. On only with sfxV2Options().
   */
  BED_LASTS_SCENE: false,
  BED_GAIN: 0.35,
  /** SFX-LEVEL-001: target mean volume (dB) for each effect before mixing; voices sit near -20 */
  SPOT_MEAN_DB: -19,
  BED_MEAN_DB: -21,
  PEAK_CEILING_DB: -1,
  BED_FADE_SEC: 3,
  MIN_LOOP_CLIP_SEC: 4,
}

const BED_CUE = /\b(rain|drizzle|downpour|wind|storm|thunder|river|creek|stream|ocean|sea|surf|waves?|crowd|chatter|murmur|ambien(?:t|ce)|traffic|street noise|city|highway|expressway|freeway|engine|motor|tires|road|train|rails|hum|drone|crickets|birdsong|birds|fire crackling|crackling fire|fireplace|static|machinery|generator|air conditioning|fan whirring|ticks?|ticking|melody|rush hour)\b/i
const SPOT_OVERRIDE = /\b(slam|bang|shot|gunshot|blast|explosion|crash|smash|shatter|knock|click|snap|pop|ring(?:ing|s)? once|single|thud|scream|gasp|door|phone buzz|buzzing phone|unfolding)\b/i

/**
 * SFX-V2 (Marc 2026-10-31): sounds on the exact word, a background under each
 * scene. Used by the test copy (previewTag) and, once Marc approves the test,
 * by every mix when SFX_V2=on.
 */
export function sfxV2Enabled(env: Record<string, string | undefined> = process.env): boolean {
  return String(env.SFX_V2 || '').trim().toLowerCase() === 'on'
}
export function sfxV2Options(): Partial<typeof LAYERED_DEFAULTS> {
  return { MAX_BED_SEC: 240, BED_LASTS_SCENE: true }
}

/** Bed = a continuing background sound; everything else is a spot effect. */
export function classifySfxCue(cue: string): SfxRole {
  const text = String(cue || '')
  if (!BED_CUE.test(text)) return 'spot'
  // "two gunshots echoing off concrete" mentions no bed word; "engine accelerating" is a bed;
  // "car door slams over traffic" is a spot — a strong one-shot word wins.
  if (SPOT_OVERRIDE.test(text)) return 'spot'
  return 'bed'
}

const SCENE_BACKGROUND_WORD = /\b(steady|constant|continuous|ambien(?:t|ce)|room tone|background|low hum|murmur|chatter)\b/i

/**
 * SFX-BED-SCENE-001: a scene background is a bed described as a steady
 * texture ("steady rain on a car roof", "bar crowd murmur"). Event beds
 * ("tires screeching", "engine roaring away") are not backgrounds.
 */
export function isSceneBackground(cue: string): boolean {
  return classifySfxCue(cue) === 'bed' && SCENE_BACKGROUND_WORD.test(String(cue || '')) && bedCueLoopable(cue)
}

const NOT_LOOPABLE = /\b(then|burst|followed by|before|after|begins?|beginning|starts?|stops?|fading|fades?|approach(?:es|ing)?|pull(?:s|ing)? (?:up|away)|accelerat\w*|screech\w*|once)\b/i

/** A steady texture (rain, crowd murmur, ticking) can loop under the voice. */
export function bedCueLoopable(cue: string): boolean {
  return !NOT_LOOPABLE.test(String(cue || ''))
}

export function planLayeredBody(items: BodyItem[], opts: Partial<typeof LAYERED_DEFAULTS> = {}): LayeredPlan {
  const o = { ...LAYERED_DEFAULTS, ...opts }
  // SFX-WORD-001: word-anchored effects sit on top of their voice line and take
  // no time of their own; everything else is laid out in script order as before.
  const anchored = items.filter((i): i is Extract<BodyItem, { kind: 'sfx' }> => i.kind === 'sfx' && !!i.anchor)
  const ordered = items.filter((i) => !(i.kind === 'sfx' && i.anchor)).sort((a, b) => a.idx - b.idx)
  const voices: LayeredPlan['voices'] = []
  const sfx: SfxPlacement[] = []
  const sceneBreakStarts: number[] = []

  let cursor = 0
  let pendingGap = 0
  for (const item of ordered) {
    if (item.kind === 'sfx') {
      // An effect starts where the timeline is now (after any earlier pending gap).
      const start = cursor + pendingGap
      const role = classifySfxCue(item.cue)
      if (role === 'spot') {
        const overlap = Math.min(o.OVERLAP_SEC, item.dur * 0.3)
        sfx.push({ idx: item.idx, path: item.path, cue: item.cue, role, start, length: item.dur, lead: 0, bedGain: 1, loop: false, fadeOut: 0, clipDur: item.dur })
        pendingGap += Math.max(0, item.dur - overlap)
      } else {
        const lead = Math.min(o.LEAD_SEC, item.dur)
        sfx.push({ idx: item.idx, path: item.path, cue: item.cue, role, start, length: item.dur, lead, bedGain: o.BED_GAIN, loop: true, fadeOut: o.BED_FADE_SEC, clipDur: item.dur })
        pendingGap += lead
      }
      continue
    }
    const start = cursor + pendingGap
    voices.push({ idx: item.idx, path: item.path, start, gapBefore: pendingGap, dur: item.dur })
    if (item.sceneBreak) sceneBreakStarts.push(start)
    cursor = start + item.dur
    pendingGap = 0
  }
  const totalDuration = cursor + pendingGap

  for (const item of anchored) {
    const voice = voices.find((v) => v.idx === item.anchor!.voiceIdx)
    if (!voice) continue
    const start = voice.start + Math.max(0, Math.min(item.anchor!.atSec, voice.dur))
    const length = Math.min(item.dur, Math.max(0.05, totalDuration - start))
    sfx.push({ idx: item.idx, path: item.path, cue: item.cue, role: 'spot', start, length, lead: 0, bedGain: 1, loop: false, fadeOut: 0, clipDur: item.dur })
  }
  sfx.sort((a, b) => a.start - b.start)

  // Second pass: each bed runs until the next scene break or the next
  // BACKGROUND (SFX-BED-SCENE-001: a gunshot no longer stops the rain),
  // capped at lead + MAX_BED_SEC, never past the end of the body.
  for (const placement of sfx) {
    if (placement.role !== 'bed') continue
    const after = placement.start + placement.lead
    const nextSfx = sfx.find((other) => (!o.BED_LASTS_SCENE || other.role === 'bed') && other.start > placement.start)?.start ?? Infinity
    const nextBreak = sceneBreakStarts.find((t) => t > after) ?? Infinity
    const end = Math.min(nextSfx, nextBreak, after + o.MAX_BED_SEC, totalDuration)
    let length = Math.max(placement.lead, end - placement.start)
    // Only a steady texture may loop. A clip with a sequence or an attack in it
    // ("radio burst, then tires…") would repeat its burst every few seconds, so
    // it plays once and its own tail runs under the voice. Very short clips
    // don't loop either (the repeat would be obvious).
    if (!bedCueLoopable(placement.cue) || placement.clipDur < o.MIN_LOOP_CLIP_SEC) length = Math.min(length, placement.clipDur)
    placement.length = length
    placement.loop = length > placement.clipDur + 0.05
    placement.fadeOut = Math.min(o.BED_FADE_SEC, Math.max(0, placement.length - placement.lead))
  }

  return { voices, sfx, totalDuration }
}

/** ffmpeg filter for one effect, input label [n:a] → output label [sfxN]. */
export function sfxFilterChain(placement: SfxPlacement, inputIndex: number, outLabel: string, totalDuration: number): string {
  const ms = Math.max(0, Math.round(placement.start * 1000))
  const len = Math.max(0.05, placement.length).toFixed(3)
  const parts = [`[${inputIndex}:a]aresample=44100,aformat=sample_rates=44100:channel_layouts=stereo`, `atrim=duration=${len}`, 'asetpts=PTS-STARTPTS']
  if (placement.role === 'bed') {
    const lead = placement.lead.toFixed(3)
    const g = placement.bedGain.toFixed(3)
    const ramp = '0.8'
    parts.push(`volume='if(lt(t,${lead}),1,if(lt(t,${lead}+${ramp}),1-(1-${g})*(t-${lead})/${ramp},${g}))':eval=frame`)
    if (placement.fadeOut > 0) {
      parts.push(`afade=t=out:st=${Math.max(0, placement.length - placement.fadeOut).toFixed(3)}:d=${placement.fadeOut.toFixed(3)}`)
    }
  }
  parts.push(`adelay=${ms}|${ms}`, 'apad', `atrim=duration=${totalDuration.toFixed(3)}`)
  return `${parts.join(',')}[${outLabel}]`
}

type ExecFile = (cmd: string, args: string[]) => Promise<unknown>

/**
 * Static gain (dB) that moves a clip's mean volume to target. A limiter after
 * the gain catches peaks, so the gain may exceed the clean headroom by up to
 * LIMITER_ALLOWANCE_DB (enough to lift a peaky phone buzz without crushing it).
 */
export const LIMITER_ALLOWANCE_DB = 8
export function levelingGainDb(meanDb: number, maxDb: number, targetMeanDb: number, peakCeilingDb: number): number {
  if (!Number.isFinite(meanDb) || !Number.isFinite(maxDb)) return 0
  const wanted = targetMeanDb - meanDb
  const headroom = peakCeilingDb - maxDb + LIMITER_ALLOWANCE_DB
  return Math.max(-24, Math.min(wanted, headroom, 24))
}

async function levelGainDb(file: string, targetMeanDb: number, peakCeilingDb: number, ffmpeg: string, exec: ExecFile): Promise<number> {
  const out: any = await exec(ffmpeg, ['-hide_banner', '-i', file, '-af', 'volumedetect', '-f', 'null', '-']).catch((e: any) => e)
  const text = String(out?.stderr || '') + String(out?.stdout || '')
  const mean = Number(text.match(/mean_volume:\s*(-?[\d.]+) dB/)?.[1])
  const max = Number(text.match(/max_volume:\s*(-?[\d.]+) dB/)?.[1])
  if (!Number.isFinite(mean) || !Number.isFinite(max)) throw new Error('could not measure volume')
  return levelingGainDb(mean, max, targetMeanDb, peakCeilingDb)
}

/**
 * Builds the normalized voice+SFX body (same loudnorm as the default path) at
 * outPath. Returns the plan used, for logging.
 */
export async function buildLayeredStoryBody(params: {
  items: BodyItem[]
  tmpDir: string
  outPath: string
  ffmpeg: string
  exec: ExecFile
  opts?: Partial<typeof LAYERED_DEFAULTS>
  log?: (line: string) => void
}): Promise<LayeredPlan> {
  const { items, tmpDir, outPath, ffmpeg, exec } = params
  const log = params.log || (() => {})
  const path = await import('path')
  const fs = await import('fs/promises')
  // SFX-LEVEL-001: ElevenLabs effects arrive at random levels (a phone buzz at
  // -31 dB mean next to voices at -20). Level each effect with a static gain
  // to its target before planning, never pushing its peak above the ceiling.
  const o = { ...LAYERED_DEFAULTS, ...(params.opts || {}) }
  const leveledItems: BodyItem[] = []
  for (const item of items) {
    if (item.kind !== 'sfx') { leveledItems.push(item); continue }
    const role = classifySfxCue(item.cue)
    const leveledPath = path.join(tmpDir, `leveled_${path.basename(item.path)}`)
    try {
      const gain = await levelGainDb(item.path, role === 'bed' ? o.BED_MEAN_DB : o.SPOT_MEAN_DB, o.PEAK_CEILING_DB, ffmpeg, exec)
      await exec(ffmpeg, ['-i', item.path, '-af', `volume=${gain.toFixed(2)}dB,alimiter=limit=0.89:level=false`, '-ar', '44100', '-ac', '2', '-b:a', '192k', '-y', leveledPath])
      log(`  SFX-LEVEL-001 ${path.basename(item.path)} ${role} gain ${gain >= 0 ? '+' : ''}${gain.toFixed(1)} dB`)
      leveledItems.push({ ...item, path: leveledPath })
    } catch (err) {
      log(`  SFX-LEVEL-001 ${path.basename(item.path)} leveling skipped: ${err instanceof Error ? err.message : String(err)}`)
      leveledItems.push(item)
    }
  }
  const plan = planLayeredBody(leveledItems, params.opts)

  // 1. Voice track: voices in order with the effect gaps as silence.
  const lines: string[] = []
  let silenceCount = 0
  for (const voice of plan.voices) {
    if (voice.gapBefore > 0.01) {
      const silPath = path.join(tmpDir, `layered_gap_${silenceCount++}.mp3`)
      await exec(ffmpeg, ['-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo', '-t', voice.gapBefore.toFixed(3), '-ar', '44100', '-ac', '2', '-b:a', '192k', '-y', silPath])
      lines.push(`file '${silPath}'`)
    }
    lines.push(`file '${voice.path}'`)
  }
  const trailing = plan.totalDuration - (plan.voices.length ? plan.voices[plan.voices.length - 1].start + plan.voices[plan.voices.length - 1].dur : 0)
  if (trailing > 0.01) {
    const silPath = path.join(tmpDir, `layered_gap_${silenceCount++}.mp3`)
    await exec(ffmpeg, ['-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo', '-t', trailing.toFixed(3), '-ar', '44100', '-ac', '2', '-b:a', '192k', '-y', silPath])
    lines.push(`file '${silPath}'`)
  }
  const listPath = path.join(tmpDir, 'layered_voice_concat.txt')
  await fs.writeFile(listPath, lines.join('\n'))
  const voiceTrack = path.join(tmpDir, 'layered_voice_track.wav')
  await exec(ffmpeg, ['-f', 'concat', '-safe', '0', '-i', listPath, '-ar', '44100', '-ac', '2', '-y', voiceTrack])

  if (!plan.sfx.length) {
    await exec(ffmpeg, ['-i', voiceTrack, '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11', '-ar', '44100', '-ac', '2', '-b:a', '192k', '-y', outPath])
    return plan
  }

  // 2. Effects + voice in one filter graph. Every input is padded to the full
  //    body length so amix never re-scales when one ends; volume=N undoes
  //    amix's 1/N so levels are as recorded.
  const args: string[] = ['-i', voiceTrack]
  plan.sfx.forEach((placement) => {
    if (placement.loop) args.push('-stream_loop', '-1')
    args.push('-i', placement.path)
  })
  const total = plan.totalDuration
  const chains = [`[0:a]aformat=sample_rates=44100:channel_layouts=stereo,apad,atrim=duration=${total.toFixed(3)}[voice]`]
  plan.sfx.forEach((placement, i) => chains.push(sfxFilterChain(placement, i + 1, `sfx${i}`, total)))
  const inputs = 1 + plan.sfx.length
  const labels = ['[voice]', ...plan.sfx.map((_, i) => `[sfx${i}]`)].join('')
  chains.push(`${labels}amix=inputs=${inputs}:duration=first:dropout_transition=0,volume=${inputs},loudnorm=I=-16:TP=-1.5:LRA=11[out]`)
  args.push('-filter_complex', chains.join(';'), '-map', '[out]', '-ar', '44100', '-ac', '2', '-b:a', '192k', '-y', outPath)
  plan.sfx.forEach((p) => log(`  SFX-LAYERED-001 ${p.role} sfx_${String(p.idx).padStart(4, '0')} at ${p.start.toFixed(1)}s for ${p.length.toFixed(1)}s: ${p.cue}`))
  await exec(ffmpeg, args)
  return plan
}

export function layeredMixEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return String(env.SFX_LAYERED_MIX || '').trim().toLowerCase() === 'on'
}
