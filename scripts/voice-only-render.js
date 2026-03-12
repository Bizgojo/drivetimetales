#!/usr/bin/env node
require('dotenv').config({ path: require('path').join(__dirname, '../.env.local') })
const { spawnSync } = require('child_process')
const fs = require('fs'), path = require('path'), os = require('os')
const { createClient } = require('@supabase/supabase-js')

const FF = '/opt/homebrew/bin/ffmpeg'
const SUPABASE_URL = 'https://vmyhlfeouzslixtkmddy.supabase.co'
const BASE = SUPABASE_URL + '/storage/v1/object/public/audio'
const sb = createClient(SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

// Accept a single story ID as CLI arg, or fall back to the hardcoded list
const CLI_ID = process.argv[2]
const STORIES = CLI_ID
  ? [CLI_ID]
  : [
      '8eb9c3f0-7f8d-495e-aa4d-a10e62633e05',  // Dead Ringer
      '76d68b1e-8630-439e-a8fe-d229e3b11e69',  // The Grave He Dug Himself
    ]

async function dl(url, dest) {
  const r = await fetch(url)
  if (!r.ok) throw new Error('Download failed: ' + url)
  fs.writeFileSync(dest, Buffer.from(await r.arrayBuffer()))
}

function run(args, lbl) {
  if (lbl) process.stdout.write('   ' + lbl + '... ')
  const r = spawnSync(FF, args, { stdio: ['ignore', 'ignore', 'pipe'] })
  if (r.status !== 0) throw new Error('ffmpeg [' + lbl + ']:\n' + (r.stderr || Buffer.alloc(0)).toString().slice(-300))
  if (lbl) console.log('done')
}

function norm(inp, out, lbl) {
  run(['-i', inp, '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11', '-ar', '44100', '-ac', '2', '-b:a', '192k', '-y', out], lbl)
}

function silence(out, secs) {
  run(['-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100',
    '-t', String(secs), '-ar', '44100', '-ac', '2', '-b:a', '192k', '-y', out])
}

function concat(files, out, lbl) {
  const lst = out + '.lst'
  fs.writeFileSync(lst, files.map(f => "file '" + f + "'").join('\n'))
  run(['-f', 'concat', '-safe', '0', '-i', lst, '-map', '0:a', '-ar', '44100', '-ac', '2', '-b:a', '192k', '-y', out], lbl)
  fs.unlinkSync(lst)
}

function getDur(f) {
  const r = spawnSync(FF, ['-i', f, '-f', 'null', '-'])
  const m = (r.stderr || Buffer.alloc(0)).toString().match(/Duration:\s*(\d+):(\d+):([\d.]+)/)
  return m ? parseInt(m[1]) * 3600 + parseInt(m[2]) * 60 + parseFloat(m[3]) : 0
}

async function render(storyId) {
  const { data: s } = await sb.from('stories')
    .select('id, title, intro_audio_url, story_audio_url, outro_audio_url')
    .eq('id', storyId).single()

  const folder = (s.story_audio_url || '').match(/asc3\/([^/]+)\//)?.[1]
  if (!folder) throw new Error('Cannot find storage folder')

  const { data: files } = await sb.storage.from('audio').list('asc3/' + folder, { limit: 300, sortBy: { column: 'name', order: 'asc' } })
  const segs = (files || []).filter(f => f.name.startsWith('segment_') && f.name.endsWith('.mp3')).sort((a, b) => a.name.localeCompare(b.name))

  console.log('\n📖  "' + s.title + '" — ' + segs.length + ' segments')
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'et-vo-'))

  const introP = path.join(tmp, 'intro.mp3')
  const outroP = path.join(tmp, 'outro.mp3')
  const storyRaw = path.join(tmp, 'story_raw.mp3')
  const introN = path.join(tmp, 'intro_n.mp3')
  const outroN = path.join(tmp, 'outro_n.mp3')
  const storyN = path.join(tmp, 'story_n.mp3')
  const sil1 = path.join(tmp, 'sil1.mp3')
  const sil2 = path.join(tmp, 'sil2.mp3')
  const final = path.join(tmp, 'final.mp3')

  console.log('   Downloading...')
  await dl(s.intro_audio_url, introP)
  await dl(s.outro_audio_url, outroP)

  const segPaths = []
  for (let i = 0; i < segs.length; i++) {
    const p = path.join(tmp, 'seg' + String(i).padStart(3, '0') + '.mp3')
    await dl(BASE + '/asc3/' + folder + '/' + segs[i].name, p)
    segPaths.push(p)
    if ((i + 1) % 25 === 0 || i + 1 === segs.length) console.log('   ' + (i + 1) + '/' + segs.length)
  }

  norm(introP, introN, 'normalize intro')
  concat(segPaths, storyRaw, 'concat segments')
  norm(storyRaw, storyN, 'normalize story')
  norm(outroP, outroN, 'normalize outro')
  silence(sil1, 0.5)
  silence(sil2, 0.5)

  // Pure voice: Belle B intro → 0.5s → story → 0.5s → Belle B outro
  concat([introN, sil1, storyN, sil2, outroN], final, 'build voice-only mix')

  const d = getDur(final)
  const sz = (fs.statSync(final).size / 1024 / 1024).toFixed(1)
  console.log('   ' + sz + ' MB | ' + (d / 60).toFixed(2) + ' min')

  const storagePath = 'asc3/' + folder + '/final_mix_' + Date.now() + '.mp3'
  const { error: upErr } = await sb.storage.from('audio').upload(storagePath, fs.readFileSync(final), { contentType: 'audio/mpeg', upsert: false })
  if (upErr) throw new Error('Upload: ' + upErr.message)
  const { data: { publicUrl } } = sb.storage.from('audio').getPublicUrl(storagePath)
  await sb.from('stories').update({ audio_url: publicUrl }).eq('id', storyId)
  console.log('   ✅ Live')
  fs.rmSync(tmp, { recursive: true })
}

async function main() {
  for (const id of STORIES) {
    try { await render(id) } catch (e) { console.error('FAILED ' + id + ':', e.message) }
  }
  console.log('\n✅ Both stories re-rendered — voice only, no music.')
}
main()
