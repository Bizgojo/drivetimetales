// CANON-ADMIN-001 — builds lib/admin-center/canon.json from docs/canon/*.md so
// Admin → Documentation → Canon can show every canon document.
// Usage: npx tsx scripts/canon/build-canon-json.ts   (run after any canon edit; commit the JSON)
import { readdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { markdownToHtml } from '../../lib/admin-center/markdown'

const dir = join(process.cwd(), 'docs', 'canon')
const files = readdirSync(dir).filter(f => /^CANON-\d+.*\.md$/.test(f)).sort()
const docs = files.map(f => {
  const md = readFileSync(join(dir, f), 'utf8')
  const title = (md.match(/^#\s+(.+)$/m)?.[1] || f).trim()
  const status = (md.match(/^Status:\s*(.+)$/m)?.[1] || '').trim()
  const covers = (md.match(/^Covers:\s*(.+?)(?:\s+Does not cover:.*)?$/m)?.[1] || '').trim()
  const body = md.replace(/^#\s+.+\n/, '').replace(/^(Status:.*)$/m, '$1\n').replace(/^(Covers:.*)$/m, '\n$1\n')
  return { id: f.replace(/\.md$/, ''), category: 'canon', title, status, summary: covers || status, path: 'docs/canon/' + f, body: markdownToHtml(body) }
})
writeFileSync(join(process.cwd(), 'lib', 'admin-center', 'canon.json'), JSON.stringify(docs, null, 1) + '\n')
console.log(`[canon] ${docs.length} documents → lib/admin-center/canon.json`)
