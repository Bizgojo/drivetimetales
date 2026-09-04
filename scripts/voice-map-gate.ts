import { runVoiceMapGate } from '../lib/voiceMapGate'
import { readFileSync } from 'node:fs'

// Spawnable VOICE-001 gate. Exit 0 = pass/empty, 1 = stale/wrong voice, 2 = fatal. Read-only.
async function main() {
  const storyId = process.argv[2]
  const segsPath = process.argv[3]
  if (!storyId || !segsPath) { console.error('usage: tsx voice-map-gate.ts <storyId> <segmentsJsonPath>'); process.exit(2) }
  let segmentNames: string[]
  try { segmentNames = JSON.parse(readFileSync(segsPath, 'utf8')) }
  catch (e: any) { console.error(`voice-map-gate: cannot read segments file: ${e.message}`); process.exit(2) }
  if (!Array.isArray(segmentNames) || segmentNames.length === 0) { console.log('voice-map-gate: no segments — pass'); process.exit(0) }
  const outcome = await runVoiceMapGate(storyId, segmentNames)
  if (!outcome.passed) {
    console.error(`VOICE-001 FAIL: ${outcome.failures.length} segment(s) stale/wrong voice:`)
    for (const f of outcome.failures) console.error(`  ${f.segName} (${f.character ?? 'unknown'}: expected ${f.expectedVoiceName ?? f.expectedVoiceId}, got ${f.actualVoiceId})`)
    process.exit(1)
  }
  console.log(`VOICE-001 PASS: all ${segmentNames.length} segments use the current assigned voice`)
  process.exit(0)
}
main().catch(e => { console.error(`voice-map-gate FATAL: ${e?.message || e}`); process.exit(2) })
