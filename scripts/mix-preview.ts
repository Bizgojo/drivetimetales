/**
 * MIX-V3-001 (Marc 2026-11-01) — hear the stage 1 mix next to today's mix on
 * one finished episode. The published episode is not changed.
 *
 *   npx tsx scripts/mix-preview.ts story:<storyId>            (today vs stage 1)
 *   npx tsx scripts/mix-preview.ts story:<storyId> --stage2   (stage 1 vs stage 2)
 *
 * Renders two test copies with the SAME voices and the SAME sound effects
 * (the published effects plan), so only the mix differs:
 *   asc3/<id>/preview/mixnow/final_mix.mp3  — today's mix
 *   asc3/<id>/preview/mix3/final_mix.mp3    — stage 1 (Marc's drawing)
 *   asc3/<id>/preview/mix4/final_mix.mp3    — stage 2 (music follows tension,
 *                                             spot effects don't pause the story)
 * Needs .env.local (never printed). Uses no ElevenLabs credits (stage 2 makes
 * one small Claude call, cached at asc3/<id>/mix-plan-mix4.json).
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
  const stage2 = process.argv.includes('--stage2')
  const variants = stage2
    ? [{ tag: 'mix3', label: 'STAGE 1', mixV3: true, mixV4: false }, { tag: 'mix4', label: 'STAGE 2', mixV3: true, mixV4: true }]
    : [{ tag: 'mixnow', label: 'TODAY  ', mixV3: false, mixV4: false }, { tag: 'mix3', label: 'STAGE 1', mixV3: true, mixV4: false }]
  for (const v of variants) {
    console.log(`\n=== TEST mix ${v.tag} (${v.label.trim()}) — published episode is not changed ===`)
    const res: any = await runRenderFinalMix(storyId, { previewTag: v.tag, mixOnly: true, mixV3: v.mixV3, mixV4: v.mixV4 })
    if (!res?.success || !res?.preview) throw new Error(`test mix ${v.tag} failed: ${res?.error || 'unknown'}`)
    out.push(`${v.label}: ${res.finalAudioUrl}`)
  }
  console.log(`\n${out.join('\n')}`)
}

main().catch((err) => { console.error(err instanceof Error ? err.message : String(err)); process.exit(1) })
