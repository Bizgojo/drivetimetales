/**
 * SFX-CATALOG-001 — fill the sound catalog with candidate takes (up to 3 per
 * name): licensed Soundsnap sounds first (SFX-SOUNDSNAP-001, by folder =
 * catalog ID), then sounds Marc already KEPT in the library review. Names Marc
 * has reviewed are never touched. Writes audio/sfx-library/catalog.json and
 * prints which names have takes and which are still empty.
 *
 *   npx tsx scripts/sfx-catalog-build.ts            # fill and save
 *   npx tsx scripts/sfx-catalog-build.ts --dry-run  # print only
 *   npx tsx scripts/sfx-catalog-build.ts --discard cz75-tail   # SFX-REPLACE-001: drop matching takes first
 */
import * as dotenv from 'dotenv'
import * as path from 'path'

dotenv.config({ path: path.join(__dirname, '../.env.local') })

async function main() {
  const dryRun = process.argv.includes('--dry-run')
  const { createClient } = await import('@supabase/supabase-js')
  const { SFX_LIBRARY_MANIFEST } = await import('../lib/sfxLibrary')
  const { SFX_CATALOG_FILE, loadCatalog, proposeTakesFromKeptLibrary, addLicensedTakes, discardTakes } = await import('../lib/sfxCatalog')
  const { SFX_CATALOG_NAMES } = await import('../lib/sfxCatalogNames')
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })

  const { data: man } = await db.storage.from('audio').download(SFX_LIBRARY_MANIFEST)
  const manifest = man ? JSON.parse(await man.text()) : { entries: [] }
  const kept = (manifest.entries || []).filter((e: any) => e.status === 'approved')
  console.log(`kept library sounds: ${kept.length}`)

  const before = await loadCatalog(db as any)
  // SFX-REPLACE-001: --discard word[,word] drops matching takes first (e.g. --discard cz75-tail)
  const discardArg = process.argv.indexOf('--discard')
  const discardWords = discardArg > 0 ? String(process.argv[discardArg + 1] || '').split(',') : []
  const cleared = discardTakes(before, discardWords)
  if (discardWords.length) console.log(`discarded ${cleared.discarded.length} takes: ${cleared.discarded.join(' | ') || '(none matched)'}`)
  const proposed = proposeTakesFromKeptLibrary(cleared.catalog, kept)
  // SFX-SOUNDSNAP-001: licensed sounds (one folder per catalog name) go in first.
  const licensed = (manifest.entries || []).filter((e: any) => e.source === 'soundsnap')
  const lic = addLicensedTakes(proposed.catalog, licensed)
  console.log(`licensed (Soundsnap) sounds: ${licensed.length}; ${lic.added} added as takes to ${Object.keys(lic.byName).length} names`)
  const catalog = lic.catalog
  const filled = SFX_CATALOG_NAMES.filter((n) => (catalog.entries[n.id]?.takes || []).some((t: any) => t.status !== 'discarded')).length
  const empty = SFX_CATALOG_NAMES.filter((n) => !(catalog.entries[n.id]?.takes || []).some((t: any) => t.status !== 'discarded')).map((n) => n.id)
  for (const n of SFX_CATALOG_NAMES) {
    const takes = catalog.entries[n.id]?.takes || []
    console.log(`${n.id} ${n.name}: ${takes.length ? takes.map((t) => t.name).join(' | ') : '(no takes yet)'}`)
  }
  console.log(`\n${filled} of ${SFX_CATALOG_NAMES.length} names have at least one take; ${empty.length} are empty until a licensed library arrives.`)
  if (dryRun) return
  const { error } = await db.storage.from('audio').upload(SFX_CATALOG_FILE, Buffer.from(JSON.stringify(catalog, null, 2)), { contentType: 'application/json', upsert: true })
  if (error) throw new Error(`catalog save failed: ${error.message}`)
  console.log(`saved audio/${SFX_CATALOG_FILE}`)
}

main().catch((err) => { console.error(err instanceof Error ? err.message : String(err)); process.exit(1) })
