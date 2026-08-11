/**
 * PV3 Beat 1 SFX diagnostic
 * Checks sfx_0010.mp3, sfx_0002.mp3, and all sfx-locked/ entries
 */
import { readFileSync, writeFileSync, unlinkSync } from 'fs'
import crypto from 'crypto'

const env = readFileSync('.env.local', 'utf8')
const getE = k => { const m = env.match(new RegExp(k + '="([^"]+)"')); return m ? m[1] : null }
const SB   = getE('NEXT_PUBLIC_SUPABASE_URL')
const KEY  = ***'SUPABASE_SERVICE_ROLE_KEY')
const B1   = 'a37fdc46-24d0-49a7-b749-320076978c3b'
const PV2  = 'a88084ab-62e3-47f4-9b7a-5cbc32943349'
const BASE = `${SB}/storage/v1/object/public/audio`
const CAND = '/Users/williampostlewaite/.openclaw/workspace-orion/drafts/pv3-sfx-candidates'

const sha256 = buf => crypto.createHash('sha256').update(buf).digest('hex')

async function dl(url) {
  const r = await fetch(url)
  if (!r.ok) return null
  return Buffer.from(await r.arrayBuffer())
}

// Known hashes (from locking step)
const KNOWN = {
  'token-a':    '049245ffea20c1532aa84af6144c50286747bb515f795e5ef1f2fd88c1bf1807',
  'cassette-a': 'cb1b489caaf7491bd2ab23ba2e57d7e770ed5aafed47fb7492c4cb270c10edd1',
}

// Load PV2 locked cues to get their hashes
console.log('Loading PV2 locked cues for reference hashes...')
const pv2Cues = {
  'river-roar-r4':        await dl(`${BASE}/asc3/${PV2}/sfx-locked/river-roar-r4.mp3`),
  'door-latch-r4':        await dl(`${BASE}/asc3/${PV2}/sfx-locked/door-latch-r4.mp3`),
  'gunshot-v3-approved':  await dl(`${BASE}/asc3/${PV2}/sfx-locked/gunshot-v3-approved.mp3`),
  'footsteps-v2-approved':await dl(`${BASE}/asc3/${PV2}/sfx-locked/footsteps-v2-approved.mp3`),
}
for (const [name, buf] of Object.entries(pv2Cues)) {
  if (buf) KNOWN[name] = sha256(buf)
  console.log(`  PV2 ${name}: ${buf ? buf.length + 'B' : 'MISSING'} sha256=${KNOWN[name]?.slice(0,16)}...`)
}

// Load local candidate files
const localToken   = readFileSync(`${CAND}/token-a.mp3`)
const localCassette = readFileSync(`${CAND}/cassette-a.mp3`)
console.log(`\nLocal candidates:`)
console.log(`  token-a.mp3:    ${localToken.length}B sha256=${sha256(localToken).slice(0,16)}... (full: ${sha256(localToken)})`)
console.log(`  cassette-a.mp3: ${localCassette.length}B sha256=${sha256(localCassette).slice(0,16)}... (full: ${sha256(localCassette)})`)

// ── ITEM 1: sfx_0010.mp3 ─────────────────────────────────────────────────────
console.log('\n══ ITEM 1: sfx_0010.mp3 ══')
const sfx10 = await dl(`${BASE}/asc3/${B1}/sfx_0010.mp3`)
if (!sfx10) {
  console.log('  sfx_0010.mp3: NOT FOUND in storage')
} else {
  const h10 = sha256(sfx10)
  console.log(`  sfx_0010.mp3: ${sfx10.length}B`)
  console.log(`  sha256: ${h10}`)
  console.log(`  vs token-a:    ${h10 === KNOWN['token-a']    ? '✅ MATCH' : '❌ NO MATCH'}`)
  console.log(`  vs cassette-a: ${h10 === KNOWN['cassette-a'] ? '✅ MATCH' : '❌ NO MATCH'}`)
  for (const [name, hash] of Object.entries(KNOWN)) {
    if (h10 === hash) console.log(`  IDENTIFIED AS: ${name}`)
  }
}

// ── ITEM 2: sfx_0002.mp3 (river slot) ────────────────────────────────────────
console.log('\n══ ITEM 3: sfx_0002.mp3 (river slot) ══')
const sfx02 = await dl(`${BASE}/asc3/${B1}/sfx_0002.mp3`)
if (!sfx02) {
  console.log('  sfx_0002.mp3: NOT FOUND')
} else {
  const h02 = sha256(sfx02)
  console.log(`  sfx_0002.mp3: ${sfx02.length}B`)
  console.log(`  sha256: ${h02}`)
  console.log(`  vs river-roar-r4 (locked PV2): ${h02 === KNOWN['river-roar-r4'] ? '✅ BYTE-FOR-BYTE MATCH — locked cue' : '❌ NO MATCH — DIFFERENT FILE (new generation or different source)'}`)
  for (const [name, hash] of Object.entries(KNOWN)) {
    if (h02 === hash) console.log(`  IDENTIFIED AS: ${name}`)
  }
}

// ── ITEM 2: All SFX files in Beat 1 storage ──────────────────────────────────
console.log('\n══ ITEM 2: All SFX files in Beat 1 storage ══')
// List storage contents
const listR = await fetch(`${SB}/storage/v1/object/list/audio`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ prefix: `asc3/${B1}/`, limit: 200 })
})
const listBody = await listR.json()
const sfxFiles = (listBody || []).filter(f => f.name && f.name.match(/sfx_\d+\.mp3$/))

console.log(`  Found ${sfxFiles.length} sfx_XXXX.mp3 files in Beat 1 storage:`)
for (const f of sfxFiles.sort((a,b) => a.name.localeCompare(b.name))) {
  const url = `${BASE}/asc3/${B1}/${f.name}`
  const buf = await dl(url)
  if (!buf) { console.log(`  ${f.name}: DOWNLOAD FAILED`); continue }
  const h = sha256(buf)
  let id = 'UNKNOWN'
  for (const [name, hash] of Object.entries(KNOWN)) {
    if (h === hash) { id = name; break }
  }
  console.log(`  ${f.name}: ${buf.length}B sha256=${h.slice(0,16)}... → ${id}`)
}

// Also check sfx-locked/ in Beat 1
console.log('\n  sfx-locked/ in Beat 1:')
const lockedFiles = (listBody || []).filter(f => f.name && f.name.includes('sfx-locked/'))
for (const f of lockedFiles) {
  const url = `${BASE}/asc3/${B1}/${f.name}`
  const buf = await dl(url)
  if (!buf) { console.log(`  ${f.name}: DOWNLOAD FAILED`); continue }
  const h = sha256(buf)
  let id = 'UNKNOWN'
  for (const [name, hash] of Object.entries(KNOWN)) {
    if (h === hash) { id = name; break }
  }
  console.log(`  ${f.name}: ${buf.length}B sha256=${h.slice(0,16)}... → ${id}`)
}
