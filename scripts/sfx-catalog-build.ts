/**
 * SFX-CATALOG-001 — fill the sound catalog with candidate takes (up to 3 per
 * name) from the sounds Marc already KEPT in the library review. Names Marc
 * has reviewed are never touched. Writes audio/sfx-library/catalog.json and
 * prints which names have takes and which are still empty.
 *
 *   npx tsx scripts/sfx-catalog-build.ts            # fill and save
 *   npx tsx scripts/sfx-catalog-build.ts --dry-run  # print only
 */
import * as dotenv from 'dotenv'
import * as path from 'path'

dotenv.config({ path: path.join(__dirname, '../.env.local') })

async function main() {
  const dryRun = process.argv.includes('--dry-run')
  const { createClient } = await import('@supabase/supabase-js')
  const { SFX_LIBRARY_MANIFEST } = await import('../lib/sfxLibrary')
  const { SFX_CATALOG_FILE, loadCatalog, proposeTakesFromKeptLibrary } = await import('../lib/sfxCatalog')
  const { SFX_CATALOG_NAMES } = await import('../lib/sfxCatalogNames')
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })

  const { data: man } = await db.storage.from('audio').download(SFX_LIBRARY_MANIFEST)
  const manifest = man ? JSON.parse(await man.text()) : { entries: [] }
  const kept = (manifest.entries || []).filter((e: any) => e.status === 'approved')
  console.log(`kept library sounds: ${kept.length}`)

  const before = await loadCatalog(db as any)
  const { catalog, filled, empty } = proposeTakesFromKeptLibrary(before, kept)
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
