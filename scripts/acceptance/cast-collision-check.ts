/**
 * CAST-COLLISION-001 — offline/CLI casting-manifest checker.
 *
 * Runs the SAME shared module (lib/castCollision.ts, backed by the REAL
 * isBelleBVoiceId predicate in lib/voiceConstants.ts) that the production
 * casting gate (generate-voices voiceMap assembly) enforces. For Hal
 * package validation before submission.
 *
 * Usage:
 *   tsx scripts/acceptance/cast-collision-check.ts <manifest.json> [--allow-belle-wrapper]
 *
 * Manifest JSON: either a bare map or wrapped:
 *   { "SARAH": "EXAVITQu4vr4xnSDxMaL", "Matilda": "XrExE9yKIg1WjnnlVkGX" }
 *   { "cast": { ... } }
 *
 * Exit codes: 0 = pass (no collisions), 1 = collision (blocked),
 *             2 = fatal (unreadable manifest / bad shape).
 */
import { readFileSync } from 'node:fs'
import { checkCastCollisions, formatCastCollisions, type CastManifest } from '../../lib/castCollision'

function usage(): never {
  console.error('usage: tsx scripts/acceptance/cast-collision-check.ts <manifest.json> [--allow-belle-wrapper]')
  process.exit(2)
}

async function main() {
  const args = process.argv.slice(2)
  const manifestPath = args.find((a) => !a.startsWith('--'))
  const allowBelleWrapper = args.includes('--allow-belle-wrapper')
  if (!manifestPath) usage()

  let raw: unknown
  try {
    raw = JSON.parse(readFileSync(manifestPath, 'utf8'))
  } catch (e: any) {
    console.error(`cast-collision-check FATAL: cannot read/parse manifest: ${e?.message || e}`)
    process.exit(2)
  }

  const manifest: CastManifest =
    raw && typeof raw === 'object' && !Array.isArray(raw) && 'cast' in (raw as Record<string, unknown>) &&
    (raw as Record<string, unknown>).cast !== null && typeof (raw as Record<string, unknown>).cast === 'object'
      ? ((raw as Record<string, unknown>).cast as CastManifest)
      : (raw as CastManifest)

  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    console.error('cast-collision-check FATAL: manifest must be a JSON object (character → voice_id)')
    process.exit(2)
  }

  const result = checkCastCollisions(manifest, { allowBelleWrapper })
  console.log(formatCastCollisions(result))
  for (const c of result.collisions) {
    console.error(`  BLOCKED: character "${c.character}" → reserved Belle B voice ${c.voiceId}`)
  }
  process.exit(result.passed ? 0 : 1)
}

main().catch((e) => {
  console.error(`cast-collision-check FATAL: ${e?.message || e}`)
  process.exit(2)
})
