/**
 * MIX-V3-001 (Marc 2026-11-01) — hear the stage 1 mix next to today's mix on
 * one finished episode. The published episode is not changed.
 *
 *   npx tsx scripts/mix-preview.ts story:<storyId>
 *
 * Renders two test copies with the SAME voices and the SAME sound effects
 * (the published effects plan), so only the mix differs:
 *   asc3/<id>/preview/mixnow/final_mix.mp3  — today's mix
 *   asc3/<id>/preview/mix3/final_mix.mp3    — stage 1 (Marc's drawing)
 * Needs .env.local (never printed). Uses no ElevenLabs credits.
 */
import * as dotenv from 'dotenv'
import * as path from 'path'

dotenv.config({ path: path.join(__dirname, '../.env.local') })

async function main() {
  const target = process.argv[2] || ''
  if (!target.startsWith('story:')) throw new Error('usage: mix-preview.ts story:<storyId>')
  const storyId = target.slice(6)
  const { runRenderFinalMix } = await import('../app/api/asc3/render-final-mix/core')
  const out: string[] = []
  for (const [tag, mixV3] of [['mixnow', false], ['mix3', true]] as const) {
    console.log(`\n=== TEST mix ${tag} (${mixV3 ? 'stage 1' : 'today'}) — published episode is not changed ===`)
    const res: any = await runRenderFinalMix(storyId, { previewTag: tag, mixOnly: true, mixV3 })
    if (!res?.success || !res?.preview) throw new Error(`test mix ${tag} failed: ${res?.error || 'unknown'}`)
    out.push(`${tag === 'mix3' ? 'STAGE 1' : 'TODAY  '}: ${res.finalAudioUrl}`)
  }
  console.log(`\n${out.join('\n')}`)
}

main().catch((err) => { console.error(err instanceof Error ? err.message : String(err)); process.exit(1) })
