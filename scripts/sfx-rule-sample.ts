/**
 * SFX-NAMED-001 sample (Marc 2026-10-31) — show what the new sound rule does to
 * a real script WITHOUT recording anything: Claude rewrites only the passages
 * that involve sound, and prints each one as before → after for Marc to read.
 * Nothing in the story or its audio changes.
 *
 *   npx tsx scripts/sfx-rule-sample.ts story:<storyId> [--tag v4]
 *
 * Saves audio/asc3/<id>/preview/<tag>/sound-rule-sample.txt
 */
import * as dotenv from 'dotenv'
import * as path from 'path'

dotenv.config({ path: path.join(__dirname, '../.env.local') })

async function main() {
  const target = process.argv[2] || ''
  if (!target.startsWith('story:')) throw new Error('usage: sfx-rule-sample.ts story:<storyId> [--tag v4]')
  const storyId = target.slice(6)
  const tagArg = process.argv.indexOf('--tag')
  const tag = (tagArg > 0 ? process.argv[tagArg + 1] : 'v4').replace(/[^a-z0-9]/gi, '') || 'v4'

  const { createClient } = await import('@supabase/supabase-js')
  const Anthropic = (await import('@anthropic-ai/sdk')).default
  const { SFX_NAMED_RULE_TEXT } = await import('../lib/sfxSoundMap')
  const { SFX_CATALOG_NAMES } = await import('../lib/sfxCatalogNames')
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
  const { data: story, error } = await db.from('stories').select('id,title,script').eq('id', storyId).single()
  if (error || !story) throw new Error(`story not found: ${error?.message || storyId}`)

  const prompt = [
    'You are revising an audio drama script for drive-time listeners. Apply this rule and change NOTHING else:',
    SFX_NAMED_RULE_TEXT,
    '',
    `SOUND CATALOG: ${SFX_CATALOG_NAMES.map((n) => n.name).join('; ')}.`,
    '',
    'Go through the script. For every passage where a sound happens or is described, rewrite just that passage so it follows the rule. Keep the story, the characters, their voices and the length the same. Leave passages with no sound alone.',
    'Output a numbered list. For each change give:',
    'BEFORE: the original lines, exactly',
    'AFTER: the new lines, with [SFX: <catalog name>] on its own line',
    'WHY: one short sentence',
    'If a sound the story needs is not in the catalog, write it under AFTER with no sound and say so in WHY.',
    '',
    `TITLE: ${story.title}`,
    'SCRIPT:',
    String(story.script || ''),
  ].join('\n')
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })
  const msg = await anthropic.messages.create({ model: process.env.SFX_SAMPLE_MODEL || 'claude-sonnet-4-6', max_tokens: 12000, messages: [{ role: 'user', content: prompt }] })
  const text = msg.content.map((b: any) => (b?.type === 'text' ? b.text : '')).join('').trim()
  const out = `SOUND RULE SAMPLE — ${story.title} (nothing recorded or changed)\n\n${text}\n`
  await db.storage.from('audio').upload(`asc3/${storyId}/preview/${tag}/sound-rule-sample.txt`, Buffer.from(out), { contentType: 'text/plain; charset=utf-8', upsert: true })
  console.log(out)
  console.log(`saved audio/asc3/${storyId}/preview/${tag}/sound-rule-sample.txt`)
}

main().catch((err) => { console.error(err instanceof Error ? err.message : String(err)); process.exit(1) })
