#!/usr/bin/env node
/**
 * BELL-ONBOARD-001 backfill: re-render welcome audio for 5 existing post-fix users
 * with the new self-contained welcome line (Marc, 2026-08-23).
 *
 * Old text: "Welcome, [Name]. I'm glad you decided to join us."
 * New text: "Hi [Name]. Glad you decided to join us. I'm Belle, your personal
 *            assistant — now let's continue with Episode 2 of The Bell Beneath Falls Park."
 *
 * Overwrites existing names bucket files (upsert=true, cache-control=0) so the
 * home page HEAD check finds the updated content at the same URL.
 * user_metadata.welcome_seg1_url URLs stay valid — same path, new content.
 */
process.chdir('/Users/williampostlewaite/Projects/drivetimetales')
require('dotenv').config({ path: '.env.local', override: true })

const EL_KEY  = process.env.ELEVENLABS_API_KEY
const SB_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL
const SB_KEY  = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').replace(/\s/g, '')
const BELLE_B = 'GMhgX8fCR9GUtd3kmlKC'

if (!EL_KEY)  { console.error('Missing ELEVENLABS_API_KEY'); process.exit(1) }
if (!SB_URL)  { console.error('Missing NEXT_PUBLIC_SUPABASE_URL'); process.exit(1) }
if (!SB_KEY)  { console.error('Missing SUPABASE_SERVICE_ROLE_KEY'); process.exit(1) }

console.log('EL key:', EL_KEY.slice(0, 12) + '...')
console.log('SB URL:', SB_URL)

// The 5 existing post-fix users and their display/normalized names
const USERS = [
  { first: 'Jennifer', norm: 'jennifer' },
  { first: 'Tamara',   norm: 'tamara'   },
  { first: 'Celina',   norm: 'celina'   },
  { first: 'Tracey',   norm: 'tracey'   },
  { first: 'Cari Ann', norm: 'cariann'  },
]

function makeText(firstName) {
  return (
    'Hi ' + firstName + '. ' +
    "Glad you decided to join us. " +
    "I'm Belle, your personal assistant \u2014 " +
    "now let's continue with Episode 2 of The Bell Beneath Falls Park."
  )
}

async function renderAndUpload(firstName, norm) {
  const text = makeText(firstName)
  console.log('\n[' + firstName + '] Text: ' + text)

  // Render via ElevenLabs
  const elRes = await fetch('https://api.elevenlabs.io/v1/text-to-speech/' + BELLE_B, {
    method: 'POST',
    headers: {
      'xi-api-key':   EL_KEY,
      'Content-Type': 'application/json',
      'Accept':       'audio/mpeg',
    },
    body: JSON.stringify({
      text,
      model_id: 'eleven_multilingual_v2',
      voice_settings: {
        stability:        0.49,
        similarity_boost: 0.51,
        style:            0.0,
        use_speaker_boost: true,
      },
    }),
  })

  if (!elRes.ok) {
    const errText = await elRes.text().catch(() => '')
    throw new Error('ElevenLabs ' + elRes.status + ': ' + errText.slice(0, 200))
  }

  const buf = Buffer.from(await elRes.arrayBuffer())
  console.log('[' + firstName + '] Rendered: ' + buf.length + ' bytes')

  // Upload to names bucket — overwrite existing file (upsert=true)
  const storagePath = 'welcome-seg1-' + norm + '.mp3'
  const upRes = await fetch(SB_URL + '/storage/v1/object/names/' + storagePath, {
    method: 'POST',
    headers: {
      'apikey':        SB_KEY,
      'Authorization': 'Bearer ' + SB_KEY,
      'Content-Type':  'audio/mpeg',
      'x-upsert':      'true',
      'cache-control': '0',
    },
    body: buf,
  })

  const upBody = await upRes.text().catch(() => '')
  if (!upRes.ok) throw new Error('Upload ' + upRes.status + ': ' + upBody.slice(0, 200))

  const publicUrl = SB_URL + '/storage/v1/object/public/names/' + storagePath
  console.log('[' + firstName + '] Uploaded OK -> ' + publicUrl)
  return publicUrl
}

async function main() {
  console.log('\n=== BELL-ONBOARD-001 Welcome Backfill ===\n')
  const results = []
  for (const { first, norm } of USERS) {
    try {
      const url = await renderAndUpload(first, norm)
      results.push({ name: first, status: 'OK', url })
    } catch (e) {
      console.error('[' + first + '] FAILED:', e.message)
      results.push({ name: first, status: 'FAILED', error: e.message })
    }
  }

  console.log('\n=== SUMMARY ===')
  for (const r of results) {
    if (r.status === 'OK') {
      console.log('OK   ' + r.name + ' -> ' + r.url)
    } else {
      console.log('FAIL ' + r.name + ' -> ' + r.error)
    }
  }

  const failed = results.filter(r => r.status !== 'OK')
  if (failed.length) {
    console.error('\n' + failed.length + ' failures')
    process.exit(1)
  }
  console.log('\nAll ' + results.length + ' files updated. New welcome audio live for existing users.')
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1) })
