/**
 * SFX-SOURCEAUDIO-001 — fetch Sound Ideas candidate takes for the sound catalog.
 *
 *   npx tsx scripts/sfx-sourceaudio-fetch.ts --out /tmp/soundideas [--ids ALL-01,ALL-02] [--all] [--per 3] [--format wav] [--dry-run]
 *
 * For each catalog name (default: names with no active take yet; --ids for a
 * list; --all for every name) it searches SourceAudio with the name's plain
 * words, picks up to --per candidates (spot 0.3–15 s, background >= 20 s),
 * and downloads each into <out>/<CATALOG-ID>/si-<trackId>-<title>.<format>
 * (CANON-06 rule 15: the folder decides the name). --dry-run searches only
 * and downloads nothing. Writes <out>/fetch-report.json.
 *
 * Then, as before:
 *   npx tsx scripts/sfx-gemini-check.ts candidates <out>   (Gemini screens each folder first, rule 18)
 *   npx tsx scripts/sfx-library-ingest.ts <out> --source soundideas
 *   npx tsx scripts/sfx-catalog-build.ts                  (adds them as licensed candidate takes)
 * Marc approves takes by ear on /admin/sfx-library; nothing goes live before that.
 *
 * Needs SOURCEAUDIO_API_TOKEN and SOURCEAUDIO_HOST (entered by Marc on the server;
 * never printed), plus Supabase env to read the current catalog.
 * Pace: one request at a time, 4 s apart, at most 300 requests per run (rule 7).
 */
import * as dotenv from 'dotenv'
import * as path from 'path'
import { mkdirSync, writeFileSync } from 'node:fs'

dotenv.config({ path: path.join(__dirname, '../.env.local') })

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`)
  return i > 0 ? process.argv[i + 1] : undefined
}

function slug(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60)
}

async function main() {
  const { SourceAudioClient, sourceAudioConfigFromEnv, catalogSearchText, pickCandidates } = await import('../lib/sourceAudio')
  const { SFX_CATALOG_NAMES } = await import('../lib/sfxCatalogNames')
  const out = arg('out')
  if (!out) throw new Error('usage: sfx-sourceaudio-fetch.ts --out <folder> [--ids A,B] [--all] [--per 3] [--format wav] [--dry-run]')
  const cfg = sourceAudioConfigFromEnv()
  if (!cfg) throw new Error('SOURCEAUDIO_API_TOKEN and SOURCEAUDIO_HOST must be set in .env.local (Marc enters them; never printed)')
  const per = Math.max(1, Math.min(5, Number(arg('per') || 3)))
  const format = arg('format') || 'wav'
  const dryRun = process.argv.includes('--dry-run')

  let names = SFX_CATALOG_NAMES
  const ids = (arg('ids') || '').split(',').map((s) => s.trim().toUpperCase()).filter(Boolean)
  if (ids.length) names = names.filter((n) => ids.includes(n.id))
  else if (!process.argv.includes('--all')) {
    const { createClient } = await import('@supabase/supabase-js')
    const { loadCatalog } = await import('../lib/sfxCatalog')
    const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
    const catalog = await loadCatalog(db as any)
    names = names.filter((n) => !(catalog.entries[n.id]?.takes || []).some((t: any) => t.status !== 'discarded'))
  }
  console.log(`[sourceaudio] ${names.length} catalog names, ${per} candidates each${dryRun ? ' (dry run: search only)' : ''}`)

  const client = new SourceAudioClient(cfg)
  const report: any[] = []
  mkdirSync(out, { recursive: true })
  for (const n of names) {
    const text = catalogSearchText(n.name)
    const row: any = { id: n.id, name: n.name, kind: n.kind, search: text, picked: [], errors: [] }
    try {
      const tracks = await client.search(text, 25)
      row.found = tracks.length
      const picks = pickCandidates(tracks, n.kind, per)
      for (const t of picks) {
        const file = path.join(out, n.id, `si-${t.id}-${slug(t.title || t.filename || 'sound')}.${format}`)
        row.picked.push({ trackId: t.id, title: t.title, durationSec: t.durationSec, file: dryRun ? null : file })
        if (dryRun) continue
        try {
          const buf = await client.download(t.id, format)
          mkdirSync(path.dirname(file), { recursive: true })
          writeFileSync(file, buf)
        } catch (e) {
          row.errors.push(e instanceof Error ? e.message : String(e))
        }
      }
    } catch (e) {
      row.errors.push(e instanceof Error ? e.message : String(e))
      if (/session cap/.test(row.errors[row.errors.length - 1])) { report.push(row); break }
    }
    console.log(`${n.id} ${n.name}: ${row.picked.length ? row.picked.map((p: any) => `${p.title} (${p.durationSec}s)`).join(' | ') : 'NO MATCH'}${row.errors.length ? `  [${row.errors.length} error(s)]` : ''}`)
    report.push(row)
  }
  writeFileSync(path.join(out, 'fetch-report.json'), JSON.stringify({ at: new Date().toISOString(), dryRun, requests: client.requestsUsed, names: report }, null, 2))
  const empty = report.filter((r) => !r.picked.length).map((r) => r.id)
  console.log(`\ndone: ${report.length} names, ${client.requestsUsed} requests; no match: ${empty.join(', ') || 'none'}`)
  if (!dryRun) console.log(`next: npx tsx scripts/sfx-gemini-check.ts candidates ${out}  then  npx tsx scripts/sfx-library-ingest.ts ${out} --source soundideas`)
}

main().catch((err) => { console.error(err instanceof Error ? err.message : String(err)); process.exit(1) })
