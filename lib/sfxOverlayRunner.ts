/**
 * SFX-OVERLAY-001 runner: load an episode's overlay plan, or make it once
 * (Claude marks the action moments, ElevenLabs makes each effect) and store
 * it. Never edits the script or any voice clip.
 */
import Anthropic from '@anthropic-ai/sdk'
import type { SupabaseClient } from '@supabase/supabase-js'
import { parseScriptPositions } from '@/lib/scriptLineIndex'
import {
  buildOverlayPrompt,
  overlayBudgetForGenre,
  overlayFileName,
  overlayLinesForPrompt,
  validateOverlayCues,
  type OverlayPlan,
} from '@/lib/sfxOverlay'
import { librarySfxForCue } from '@/lib/sfxLibrary'
import { overlaySettingsForStyle, styleProfileFrom } from '@/lib/seriesStyle'
import { isSceneBackground, sfxV2Enabled } from '@/lib/sfxLayeredMix'

const PLAN_FILE = 'sfx-overlay.json'

/** SFX-PREVIEW-001: a test plan lives beside the real one and never replaces it. */
export function overlayPlanFile(tag?: string | null): string {
  return tag ? `sfx-overlay-${String(tag).replace(/[^a-z0-9]/gi, '')}.json` : PLAN_FILE
}

export async function loadOverlayPlan(db: SupabaseClient, storyId: string, tag?: string | null): Promise<OverlayPlan | null> {
  const { data, error } = await db.storage.from('audio').download(`asc3/${storyId}/${overlayPlanFile(tag)}`)
  if (error || !data) return null
  try { return JSON.parse(await data.text()) as OverlayPlan } catch { return null }
}

async function soundEffect(text: string, durationSec: number, key: string): Promise<Buffer | null> {
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const res = await fetch('https://api.elevenlabs.io/v1/sound-generation', {
      method: 'POST',
      headers: { 'xi-api-key': key, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
      body: JSON.stringify({ text, duration_seconds: durationSec, prompt_influence: 0.4 }),
    })
    if (res.ok) {
      const buf = Buffer.from(await res.arrayBuffer())
      if (buf.length > 1024) return buf
    }
  }
  return null
}

export async function ensureOverlayPlan(params: {
  db: SupabaseClient
  storyId: string
  script: string
  genre: string
  /** SERIES-STYLE-ACTION-001: brief_json.style_profile */
  style?: string | null
  force?: boolean
  dryRun?: boolean
  model?: string
  /** SFX-PREVIEW-001: write a separate test plan + files; the published plan is untouched. */
  tag?: string | null
  log?: (line: string) => void
}): Promise<OverlayPlan | null> {
  const { db, storyId, script, genre } = params
  const log = params.log || (() => {})
  const style = styleProfileFrom(params.style)
  const { budget, minGap } = overlaySettingsForStyle(style, overlayBudgetForGenre(genre))
  if (budget <= 0) return null
  if (!params.force) {
    const existing = await loadOverlayPlan(db, storyId, params.tag)
    if (existing) return existing
  }
  const anthropicKey = process.env.ANTHROPIC_API_KEY
  const elevenKey = process.env.ELEVENLABS_API_KEY
  if (!anthropicKey || (!elevenKey && !params.dryRun)) throw new Error('ANTHROPIC_API_KEY / ELEVENLABS_API_KEY missing')

  const positions = parseScriptPositions(script)
  const lines = overlayLinesForPrompt(positions)
  const existingSfx = positions.filter((p) => p.kind === 'sfx')
  const model = params.model || process.env.SFX_OVERLAY_MODEL || 'claude-sonnet-4-6'
  const anthropic = new Anthropic({ apiKey: anthropicKey })
  const msg = await anthropic.messages.create({
    model,
    max_tokens: 4000,
    messages: [{ role: 'user', content: buildOverlayPrompt(lines, budget, genre, existingSfx.map((p) => String(p.text || '')), { everyAudibleMoment: style === 'action', minGap, v2: !!params.tag || sfxV2Enabled() }) }],
  })
  const raw = msg.content.map((b: any) => (b?.type === 'text' ? b.text : '')).join('')
  const json = raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1)
  let parsed: unknown = null
  try { parsed = JSON.parse(json) } catch { parsed = null }
  const { cues, rejected } = validateOverlayCues(parsed, lines, budget, existingSfx.map((p) => p.index), minGap)
  const plan: OverlayPlan = { storyId, genre, createdAt: new Date().toISOString(), model, cues, rejected }
  cues.forEach((c) => log(`  SFX-OVERLAY-001 ${c.afterWords ? `in line ${c.beforeIndex} after "${c.afterWords}"` : `before line ${c.beforeIndex}`} (${c.durationSec}s): ${c.cue}`))
  rejected.forEach((r) => log(`  SFX-OVERLAY-001 rejected (${r.reason}): ${JSON.stringify(r.cue)}`))
  if (params.dryRun) return plan

  const libraryBase = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/audio`
  for (const cue of cues) {
    // SFX-LIBRARY-001: a real recorded effect from our library first; ElevenLabs only if none fits.
    const bed = isSceneBackground(cue.cue)
    const lib = await librarySfxForCue(cue.cue, libraryBase, log, `${storyId}:overlay:${cue.beforeIndex}${bed ? ':bed' : ''}`)
    const buf = lib ? lib.audio : await soundEffect(cue.cue, cue.durationSec, elevenKey!)
    cue.source = lib ? { kind: 'library', libraryId: lib.match.entry.id, libraryName: lib.match.entry.name } : { kind: 'ai' }
    if (!buf) { log(`  SFX-OVERLAY-001 generation failed, skipped: ${cue.cue}`); continue }
    const name = overlayFileName(cue.beforeIndex, { tag: params.tag || undefined, bed })
    const { error } = await db.storage.from('audio').upload(`asc3/${storyId}/${name}`, buf, { contentType: 'audio/mpeg', upsert: true })
    if (error) { log(`  SFX-OVERLAY-001 upload failed, skipped: ${name}: ${error.message}`); continue }
    cue.file = name
  }
  plan.cues = plan.cues.filter((c) => c.file)
  const { error } = await db.storage.from('audio').upload(`asc3/${storyId}/${overlayPlanFile(params.tag)}`, Buffer.from(JSON.stringify(plan, null, 2)), { contentType: 'application/json', upsert: true })
  if (error) throw new Error(`overlay plan save failed: ${error.message}`)
  log(`  SFX-OVERLAY-001 saved ${plan.cues.length} overlay effects`)
  return plan
}
