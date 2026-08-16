/**
 * scripts/seed-welcome-names.ts
 *
 * Pre-populates the Supabase `names` bucket with Belle B welcome Seg 1 audio
 * for the top 300 US first names (SSA data, hardcoded — no runtime fetch).
 *
 * Usage:
 *   npx ts-node -r dotenv/config scripts/seed-welcome-names.ts [--dry-run]
 *
 * Flags:
 *   --dry-run   Print names that would be generated without calling ElevenLabs
 *
 * DO NOT add to package.json scripts, CI, or cron.
 * Run ONLY when Marc gives explicit authorization.
 *
 * Estimated ElevenLabs cost: ~100 credits per clip × 300 names = ~30,000 credits
 * Rate limit: 2-3 renders/second max.
 */

import * as dotenv from 'dotenv'
import * as path from 'path'
dotenv.config({ path: path.resolve(__dirname, '../.env.local') })

import { createClient } from '@supabase/supabase-js'

// ---------------------------------------------------------------------------
// Top 300 US first names (SSA Social Security baby name data — hardcoded)
// Original case preserved for TTS quality; normalized at runtime for filenames.
// ---------------------------------------------------------------------------
const TOP_300_NAMES: string[] = [
  // Top 50 female
  'Emma', 'Olivia', 'Ava', 'Isabella', 'Sophia', 'Charlotte', 'Mia', 'Amelia',
  'Harper', 'Evelyn', 'Abigail', 'Emily', 'Elizabeth', 'Mila', 'Ella', 'Avery',
  'Sofia', 'Camila', 'Aria', 'Scarlett', 'Victoria', 'Madison', 'Luna', 'Grace',
  'Chloe', 'Penelope', 'Layla', 'Riley', 'Zoey', 'Nora', 'Lily', 'Eleanor',
  'Hannah', 'Lillian', 'Addison', 'Aubrey', 'Ellie', 'Stella', 'Natalia',
  'Zoe', 'Leah', 'Hazel', 'Violet', 'Aurora', 'Savannah', 'Audrey', 'Brooklyn',
  'Bella', 'Claire', 'Skylar',

  // Top 50 male
  'Liam', 'Noah', 'William', 'James', 'Oliver', 'Benjamin', 'Elijah', 'Lucas',
  'Mason', 'Logan', 'Alexander', 'Ethan', 'Jacob', 'Michael', 'Daniel', 'Henry',
  'Jackson', 'Sebastian', 'Aiden', 'Matthew', 'Samuel', 'David', 'Joseph',
  'Carter', 'Owen', 'Wyatt', 'John', 'Jack', 'Luke', 'Jayden', 'Dylan', 'Grayson',
  'Levi', 'Isaac', 'Gabriel', 'Julian', 'Mateo', 'Anthony', 'Jaxon', 'Lincoln',
  'Joshua', 'Christopher', 'Andrew', 'Theodore', 'Caleb', 'Ryan', 'Asher',
  'Nathan', 'Thomas', 'Leo',

  // Additional popular names (female)
  'Lucy', 'Paisley', 'Everly', 'Anna', 'Caroline', 'Genesis', 'Aaliyah',
  'Kennedy', 'Kinsley', 'Allison', 'Maya', 'Sarah', 'Autumn', 'Quinn', 'Eva',
  'Piper', 'Ruby', 'Serenity', 'Willow', 'Emilia', 'Ariana', 'Eliana', 'Brianna',
  'Adalyn', 'Jade', 'Katherine', 'Isla', 'Brooke', 'Arianna', 'Sadie', 'Alexa',
  'Elena', 'Vivian', 'Jordyn', 'Aubree', 'Natalie', 'Alyssa', 'Alexandra',
  'Nicole', 'Ashley', 'Rachel', 'Jasmine', 'Morgan', 'Mackenzie', 'Alexis',
  'Makayla', 'Peyton', 'Paige', 'Taylor', 'Jessica',

  // Additional popular names (male)
  'Ezra', 'Hudson', 'Jace', 'Brayden', 'Nolan', 'Colton', 'Cameron', 'Connor',
  'Eli', 'Landon', 'Adrian', 'Aaron', 'Jeremiah', 'Robert', 'Jonathan', 'Easton',
  'Nolan', 'Dominic', 'Evan', 'Austin', 'Jordan', 'Chase', 'Ian', 'Cooper',
  'Xavier', 'Gavin', 'Brody', 'Angel', 'Roman', 'Sawyer', 'Kevin', 'Zachary',
  'Parker', 'Jose', 'Bentley', 'Everett', 'Damian', 'Jason', 'Leonardo',
  'Axel', 'Josiah', 'Brandon', 'Ayden', 'Tyler', 'Maxwell', 'Jaxson', 'Tristan',
  'Carson', 'Micah', 'Miles',

  // Extended female (to reach 300)
  'Lydia', 'Julia', 'Cora', 'Reagan', 'Madeline', 'Brielle', 'Melody', 'Sophie',
  'Valeria', 'Rosalie', 'Molly', 'Gabriella', 'Kylie', 'Lyla', 'Faith', 'Kayla',
  'Amber', 'Londyn', 'Mariah', 'Andrea', 'Christina', 'Diana', 'Maria', 'Valerie',
  'Kayleigh', 'Harmony', 'Adaline', 'Adeline', 'Cecilia', 'Rylee', 'Trinity',
  'Annabelle', 'Ivy', 'Daisy', 'Naomi', 'Ariel', 'Hadley', 'Emery', 'Raelynn',
  'Fatima', 'Isabel', 'Juliana', 'Kelsey', 'Stephanie', 'Amy', 'Patricia',
  'Melissa', 'Rebecca', 'Lisa', 'Laura',

  // Extended male (to reach 300)
  'Antonio', 'Marcus', 'Maddox', 'Lorenzo', 'Enzo', 'Jameson', 'George',
  'Maverick', 'Harrison', 'Jude', 'Wesley', 'Vincent', 'Legend', 'Ryder',
  'Santiago', 'Declan', 'Bryson', 'River', 'Cole', 'Waylon', 'Emmett', 'Ryker',
  'Silas', 'King', 'Knox', 'Jonah', 'Tobias', 'Graham', 'Caden', 'Tucker',
  'Elliot', 'Patrick', 'Victor', 'Elias', 'Kyle', 'Brian', 'Justin', 'Eric',
  'Jesse', 'Bryan', 'Sean', 'Jaden', 'Fernando', 'Jaylen', 'Troy', 'Derek',
  'Hank', 'Joe', 'Brad', 'Josh',
]

// Deduplicate (SSA list has some natural duplicates)
const NAMES = [...new Set(TOP_300_NAMES)]

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const VOICE_ID = 'GMhgX8fCR9GUtd3kmlKC' // Belle B
const VOICE_SETTINGS = {
  stability: 0.49,
  similarity_boost: 0.51,
  style: 0.0,
  use_speaker_boost: true,
  speed: 1.0,
}
const MODEL_ID = 'eleven_multilingual_v2'
const BUCKET = 'names'
// Rate limit: 350ms between renders ≈ 2.8/sec (ElevenLabs free tier ~3/sec)
const RATE_LIMIT_MS = 350
// EL credits are charged per character roughly (exact formula varies by plan)
// Estimate ~100 credits per "Welcome, Name. I'm glad you decided to join us." clip
const CREDITS_PER_CLIP = 100

const DRY_RUN = process.argv.includes('--dry-run')

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const elKey = process.env.ELEVENLABS_API_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local')
  process.exit(1)
}
if (!elKey && !DRY_RUN) {
  console.error('❌ Missing ELEVENLABS_API_KEY in .env.local')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z-]/g, '')
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function toTitleCase(name: string): string {
  return name.charAt(0).toUpperCase() + name.slice(1).toLowerCase()
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log(`\n🎙️  Belle B Welcome Seg 1 — Name Seed Script`)
  console.log(`   Names to process: ${NAMES.length}`)
  console.log(`   Voice: ${VOICE_ID} (Belle B)`)
  console.log(`   Bucket: ${BUCKET}`)
  if (DRY_RUN) console.log('   ⚠️  DRY RUN — no ElevenLabs calls will be made\n')
  else console.log(`   Estimated cost: ~${NAMES.length * CREDITS_PER_CLIP} EL credits\n`)

  const stats = { cached: 0, generated: 0, failed: 0, skipped_dry: 0 }
  let creditEstimate = 0

  for (let i = 0; i < NAMES.length; i++) {
    const originalName = NAMES[i]
    const normalizedName = normalizeName(originalName)
    const fileName = `welcome-seg1-${normalizedName}.mp3`
    const seg1Text = `Welcome, ${toTitleCase(originalName)}. I'm glad you decided to join us.`
    const prefix = `[${String(i + 1).padStart(3, ' ')}/${NAMES.length}] ${originalName.padEnd(15)}`

    // --- Check cache ---
    try {
      const { data: listed } = await supabase.storage.from(BUCKET).list('', { search: fileName })
      const hit = listed?.find((f) => f.name === fileName && (f.metadata?.size ?? 0) > 0)
      if (hit) {
        console.log(`${prefix} ✅ cached  (${hit.metadata?.size ?? '?'} bytes)`)
        stats.cached++
        continue
      }
    } catch (err: any) {
      console.warn(`${prefix} ⚠️  cache lookup error: ${err?.message}`)
      // Fall through to generate
    }

    if (DRY_RUN) {
      console.log(`${prefix} 🔵 would generate  "${seg1Text}"`)
      stats.skipped_dry++
      continue
    }

    // --- Generate via ElevenLabs ---
    try {
      const elRes = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`, {
        method: 'POST',
        headers: { 'xi-api-key': elKey!, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: seg1Text,
          model_id: MODEL_ID,
          voice_settings: VOICE_SETTINGS,
        }),
      })

      if (!elRes.ok) {
        const errBody = await elRes.text().catch(() => '')
        console.error(`${prefix} ❌ EL ${elRes.status}: ${errBody.slice(0, 120)}`)
        stats.failed++
        await sleep(RATE_LIMIT_MS)
        continue
      }

      const audioBuf = Buffer.from(await elRes.arrayBuffer())

      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(fileName, audioBuf, { contentType: 'audio/mpeg', upsert: true })

      if (uploadError) {
        console.error(`${prefix} ❌ upload: ${uploadError.message}`)
        stats.failed++
        await sleep(RATE_LIMIT_MS)
        continue
      }

      creditEstimate += CREDITS_PER_CLIP
      console.log(`${prefix} 🎙️  generated  (${audioBuf.length} bytes, ~${CREDITS_PER_CLIP} credits, total ~${creditEstimate})`)
      stats.generated++
    } catch (err: any) {
      console.error(`${prefix} ❌ error: ${err?.message}`)
      stats.failed++
    }

    // Rate limit between renders
    await sleep(RATE_LIMIT_MS)
  }

  // ---------------------------------------------------------------------------
  // Summary
  // ---------------------------------------------------------------------------
  console.log('\n─────────────────────────────────────────')
  console.log('✅ Done.')
  console.log(`   Cached (skipped): ${stats.cached}`)
  if (DRY_RUN) {
    console.log(`   Would generate:   ${stats.skipped_dry}`)
  } else {
    console.log(`   Generated:        ${stats.generated}`)
    console.log(`   Failed:           ${stats.failed}`)
    console.log(`   Est. credits used: ~${creditEstimate}`)
  }
  console.log('─────────────────────────────────────────\n')

  if (stats.failed > 0) process.exit(1)
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
