/**
 * SFX-PREFILTER-001 — remove obvious mismatches before Marc reviews by ear.
 *
 *   npx tsx scripts/sfx-library-prefilter.ts            # dry run: counts + samples, no writes
 *   npx tsx scripts/sfx-library-prefilter.ts --apply    # writes status='rejected' to the manifest
 *
 * Only touches sounds Marc has NOT reviewed yet. Removed sounds stay in the
 * library and show under "Removed" on /admin/sfx-library, where Marc can
 * restore any of them. Needs NEXT_PUBLIC_SUPABASE_URL and
 * SUPABASE_SERVICE_ROLE_KEY (never printed).
 */
import { createClient } from '@supabase/supabase-js'
import { SFX_LIBRARY_MANIFEST, type SfxLibraryManifest } from '../lib/sfxLibrary'
import { prefilterCurated, prefilterFirstBatch } from '../lib/sfxPrefilter'

async function main() {
  const apply = process.argv.includes('--apply')
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
  const { data, error } = await db.storage.from('audio').download(SFX_LIBRARY_MANIFEST)
  if (error || !data) throw new Error(`manifest download failed: ${error?.message}`)
  const manifest = JSON.parse(await data.text()) as SfxLibraryManifest
  const now = new Date().toISOString()
  const removed: string[] = []
  const kept: string[] = []
  let skippedReviewed = 0
  for (const e of manifest.entries) {
    if (e.status) { skippedReviewed += 1; continue }
    const stem = e.id.split('/').slice(1).join('/')
    const verdict = e.source === 'sonniss' ? prefilterFirstBatch(stem) : prefilterCurated(stem)
    if (verdict.decision === 'reject') {
      removed.push(`${e.id}  — ${verdict.reason}`)
      if (apply) Object.assign(e, { status: 'rejected', reviewedAt: now, reviewedBy: 'auto-prefilter', reviewNote: verdict.reason })
    } else kept.push(e.id)
  }
  console.log(`total ${manifest.entries.length}; already reviewed ${skippedReviewed}; auto-remove ${removed.length}; left for Marc ${kept.length}`)
  console.log('--- sample removals ---'); removed.slice(0, 30).forEach((l) => console.log(l))
  console.log('--- sample left for Marc ---'); kept.slice(0, 30).forEach((l) => console.log(l))
  if (!apply) { console.log('dry run — nothing written (add --apply)'); return }
  manifest.updatedAt = now
  const { error: upErr } = await db.storage.from('audio').upload(SFX_LIBRARY_MANIFEST, Buffer.from(JSON.stringify(manifest, null, 1)), { contentType: 'application/json', upsert: true })
  if (upErr) throw new Error(`manifest save failed: ${upErr.message}`)
  console.log(`applied: ${removed.length} marked removed (auto-prefilter)`)
}

main().catch((err) => { console.error(err instanceof Error ? err.message : String(err)); process.exit(1) })
