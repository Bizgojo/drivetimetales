/**
 * STYLE-001 / AUTHOR-STYLE-SHEET-001: put every Bible/style-sheets/*.json onto
 * its author record (authors.style_sheet), and replace the old one-line
 * style_description with the sheet's summary. Needs the
 * 20261102030000_author_style_sheet migration first.
 *   npx tsx scripts/load-style-sheets.ts            # write
 *   npx tsx scripts/load-style-sheets.ts --check    # change nothing, report
 */
import * as dotenv from 'dotenv'
import * as fs from 'fs'
import * as path from 'path'

dotenv.config({ path: path.join(__dirname, '../.env.local') })

async function main() {
  const check = process.argv.includes('--check')
  const { createClient } = await import('@supabase/supabase-js')
  const { styleSheetProblems } = await import('../lib/authorStyleSheet')
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
  const dir = path.join(__dirname, '../Bible/style-sheets')
  const sheets = fs.readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')))
  let ok = 0
  for (const sheet of sheets) {
    const problems = styleSheetProblems(sheet)
    if (problems.length) { console.log(`SKIP ${sheet.author}: incomplete (${problems.join(', ')})`); continue }
    const { data: rows, error } = await db.from('authors').select('id,name').ilike('name', sheet.author)
    if (error) throw new Error(`${sheet.author}: ${error.message}`)
    if (!rows || rows.length !== 1) { console.log(`SKIP ${sheet.author}: ${rows?.length || 0} matching author rows`); continue }
    if (!check) {
      const { error: upErr } = await db.from('authors').update({ style_sheet: sheet, style_description: sheet.summary }).eq('id', rows[0].id)
      if (upErr) throw new Error(`${sheet.author}: ${upErr.message} (is the style_sheet column there? run the migration first)`)
    }
    ok += 1
  }
  const { data: active } = await db.from('authors').select('name,style_sheet').eq('is_active', true)
  const missing = (active || []).filter((a: any) => check ? !sheets.some((s) => s.author.toLowerCase() === String(a.name).toLowerCase()) : styleSheetProblems(a.style_sheet).length > 0).map((a: any) => a.name)
  console.log(`${check ? 'would load' : 'loaded'} ${ok}/${sheets.length} sheets; active authors without a sheet: ${missing.length ? missing.join(', ') : 'none'}`)
}

main().catch((err) => { console.error(err instanceof Error ? err.message : String(err)); process.exit(1) })
