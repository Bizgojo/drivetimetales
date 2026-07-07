/**
 * ATL-COVER-001 Test Set
 * Generates 5 covers across genres using OLD and NEW prompt logic.
 * Run: node scripts/test-cover-brightness.mjs
 */
import { createRequire } from 'module'
import { writeFileSync, mkdirSync, existsSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const require = createRequire(import.meta.url)
const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Load env
const dotenv = require('dotenv')
dotenv.config({ path: path.join(__dirname, '..', '.env.local') })

const OPENAI_API_KEY = process.env.OPENAI_API_KEY
const IMAGE_MODEL = process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1'

// Sharp for luminance
let sharp
try { sharp = require('sharp') } catch { sharp = null }

const OUT_DIR = '/Users/williampostlewaite/.openclaw/workspace-atlas/cover-test-images'
mkdirSync(OUT_DIR, { recursive: true })

// ── Build prompt logic (OLD vs NEW) ─────────────────────────────────────────

const ENDLESS_TALES_COVER_STANDARD = 'Endless Tales Cover Standard: thumbnail-safe at phone size and readable at 100x100 px brighter lighting by default with clear subject or object visibility strong readable silhouette and strong contrast without crushing blacks avoid murky low-light compositions, black-shadow-heavy scenes, and underexposed noir grading avoid faces or important objects disappearing into shadow cinematic lighting is welcome, but it must not be underexposed mystery covers may be moody, but the important visual element must still be clear'

// OLD prompt builder (reproduces original logic without leading brightness directive)
function buildOldPrompt({ title, author, genre, concept, coverFeedback }) {
  const styleRef = 'cinematic, sophisticated, professional audiobook cover quality'
  const sceneInstruction = concept ? `The scene must visually reflect this story: "${concept.slice(0, 300)}". ` : ''
  const feedbackInstruction = coverFeedback ? `Apply these cover fix instructions from the editor: "${coverFeedback.trim().slice(0, 500)}". ` : ''
  return (
    `A thumbnail-first, story-specific background image for an audiobook cover, optimized for small streaming-app thumbnail readability. ` +
    `Hard priority: the cover must remain instantly readable at about 120px height while someone is scrolling. ` +
    `${ENDLESS_TALES_COVER_STANDARD} ` +
    `Genre: ${genre}. Title reference: "${title}" by ${author}. Do not render this text. ` +
    `Visual style: ${styleRef}. ` +
    sceneInstruction +
    feedbackInstruction +
    `Bright cinematic key lighting, strong contrast, readable thumbnail design. ` +
    `IMPORTANT: absolutely no text, no words, no letters, no numbers anywhere in the image. Pure atmospheric visual scene only.`
  )
}

// NEW prompt builder (imports actual lib)
// We inline the key logic to avoid ESM/CJS issues in this test script
const BRIGHTNESS_DIRECTIVE = 'Bright, high-key illustration with a light or daylight background and strong subject contrast.'
const ULTRA_BRIGHT_DIRECTIVE = 'Ultra-bright, high-key, white or pale background — maximum brightness, luminous and airy, strong subject contrast, no dark areas.'
const DARK_STORY_KEYWORDS = ['night','nighttime','dark','darkness','shadow','shadows','midnight','dusk','underground','cave','cavern','dungeon','cellar','noir','haunted','gothic','abyss','tomb','crypt','void','blackout','storm','moonless','eclipse']
const CONFLICTING_PALETTE_WORDS = ['dark','shadow','moody','noir','dim','murky','gloomy','nighttime','shadowy','low-light','low light','underexposed','near-black','blue-black','deep-black']

function isDarkException(params) {
  const haystack = [params.genre, params.tone, params.concept, params.title, params.script].filter(Boolean).join(' ').toLowerCase()
  return DARK_STORY_KEYWORDS.some(kw => haystack.includes(kw))
}

function stripPaletteWords(str) {
  let result = str
  for (const word of CONFLICTING_PALETTE_WORDS) {
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    result = result.replace(new RegExp(escaped, 'gi'), '')
  }
  return result.replace(/  +/g, ' ').trim()
}

function buildNewPrompt(params) {
  const { title, author, genre, concept, coverFeedback } = params
  const darkException = isDarkException(params)
  const brightnessDirective = darkException ? '' : BRIGHTNESS_DIRECTIVE
  const hasRetry = Boolean(coverFeedback?.trim())
  const retryInstruction = hasRetry ? `HARD COVER CONSTRAINT (operator instruction, highest priority): ${coverFeedback.trim().slice(0, 500)}.` : ''
  const rawConceptText = concept ? `The scene must visually reflect this story: "${concept.slice(0, 300)}". Depict the specific setting, mood, and atmosphere described — not a generic landscape. ` : ''
  const sceneInstruction = hasRetry ? stripPaletteWords(rawConceptText) : rawConceptText
  const styleRef = hasRetry ? stripPaletteWords('cinematic, sophisticated, professional audiobook cover quality') : 'cinematic, sophisticated, professional audiobook cover quality'

  const parts = []
  if (retryInstruction) parts.push(retryInstruction)
  if (brightnessDirective) parts.push(brightnessDirective)
  parts.push(
    `A thumbnail-first, story-specific background image for an audiobook cover, optimized for small streaming-app thumbnail readability.`,
    `Hard priority: the cover must remain instantly readable at about 120px height while someone is scrolling.`,
    ENDLESS_TALES_COVER_STANDARD,
    `Genre: ${genre}. Title reference: "${title}" by ${author}. Do not render this text.`,
    `Visual style: ${styleRef}.`,
    sceneInstruction,
    `Bright cinematic key lighting, stronger midtone lift, strong edge/rim lighting, brighter skin tones, professional composition, strong contrast, readable thumbnail design.`,
    `IMPORTANT: absolutely no text, no words, no letters, no numbers anywhere in the image. Pure atmospheric visual scene only.`,
  )
  return parts.filter(Boolean).join(' ')
}

// ── Test cases ───────────────────────────────────────────────────────────────

const TEST_CASES = [
  {
    id: 'mystery',
    label: 'Mystery',
    params: {
      title: 'The Glass Alibi',
      author: 'Daniel Wren',
      genre: 'mystery',
      concept: 'A detective discovers a shattered glass and a missing suspect in a rain-soaked hotel lobby. Fluorescent lights flicker. The key witness has vanished.',
    },
  },
  {
    id: 'thriller',
    label: 'Thriller',
    params: {
      title: 'Final Broadcast',
      author: 'Vera Blackwood',
      genre: 'thriller',
      concept: 'A radio host receives a live confession from a killer on air. The broadcast tower is surrounded by police. She must keep him talking until dawn.',
    },
  },
  {
    id: 'comedy',
    label: 'Comedy',
    params: {
      title: 'The Worst Wedding Ever',
      author: 'Buck Callahan',
      genre: 'comedy',
      concept: 'A best man forgets the rings, loses the groom, and accidentally books a polka band. Chaos erupts at a beach wedding in Florida.',
    },
  },
  {
    id: 'scifi',
    label: 'Sci-Fi',
    params: {
      title: 'Signal from the Void',
      author: 'Dr. Kai Osei',
      genre: 'sci-fi',
      concept: 'A space station crew receives a distress beacon from a ship that was declared lost 40 years ago. The signal is coming from inside an asteroid.',
    },
  },
  {
    id: 'dark-exception',
    label: 'Night/Dark Exception (should be allowed dark)',
    params: {
      title: 'Midnight at the Cave',
      author: 'Silas Graves',
      genre: 'horror',
      concept: 'A spelunker descends into a cave system at midnight with only a dying headlamp. In the underground darkness, something breathes. Shadows close in from every direction.',
    },
  },
]

// ── Image generation ─────────────────────────────────────────────────────────

async function generateImage(prompt, label) {
  const imageRequest = {
    model: IMAGE_MODEL,
    prompt: prompt.slice(0, 4000),
    n: 1,
    size: '1024x1024',
  }
  if (IMAGE_MODEL.startsWith('gpt-image')) {
    imageRequest.quality = 'high'
  } else {
    imageRequest.quality = 'hd'
    imageRequest.response_format = 'url'
  }

  console.log(`  [${label}] Calling ${IMAGE_MODEL}...`)
  const res = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(imageRequest),
  })

  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`API error ${res.status}: ${errText.slice(0, 200)}`)
  }

  const json = await res.json()
  const b64 = json.data?.[0]?.b64_json
  if (b64) return Buffer.from(b64, 'base64')

  const url = json.data?.[0]?.url
  if (!url) throw new Error('No image data returned')
  const imgRes = await fetch(url)
  return Buffer.from(await imgRes.arrayBuffer())
}

async function computeLuminance(buffer) {
  if (!sharp) return null
  try {
    const { data, info } = await sharp(buffer).resize(64, 64).raw().toBuffer({ resolveWithObject: true })
    const channels = info.channels
    let total = 0, count = 0
    for (let i = 0; i < data.length; i += channels) {
      total += 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]
      count++
    }
    return count > 0 ? total / count : null
  } catch { return null }
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n🎨 ATL-COVER-001 Test Set — Model: ${IMAGE_MODEL}\n`)
  const LUMINANCE_THRESHOLD = 100
  const results = []

  for (const tc of TEST_CASES) {
    console.log(`\n━━━ ${tc.label} ━━━`)

    const oldPrompt = buildOldPrompt(tc.params)
    const newPrompt = buildNewPrompt(tc.params)
    const darkException = isDarkException(tc.params)

    let oldResult = { url: null, luminance: null, error: null, localPath: null }
    let newResult = { url: null, luminance: null, error: null, localPath: null }

    // OLD
    try {
      const buf = await generateImage(oldPrompt, 'OLD')
      const lum = await computeLuminance(buf)
      const localPath = path.join(OUT_DIR, `${tc.id}_OLD.jpg`)
      writeFileSync(localPath, buf)
      oldResult = { url: null, luminance: lum, error: null, localPath }
      console.log(`  ✅ OLD saved: ${localPath} | lum: ${lum !== null ? lum.toFixed(1) : 'n/a'}`)
    } catch (e) {
      oldResult.error = e.message
      console.error(`  ❌ OLD failed: ${e.message}`)
    }

    // Small delay to avoid rate limits
    await new Promise(r => setTimeout(r, 3000))

    // NEW
    try {
      const buf = await generateImage(newPrompt, 'NEW')
      const lum = await computeLuminance(buf)
      const localPath = path.join(OUT_DIR, `${tc.id}_NEW.jpg`)
      writeFileSync(localPath, buf)
      newResult = { url: null, luminance: lum, error: null, localPath }
      console.log(`  ✅ NEW saved: ${localPath} | lum: ${lum !== null ? lum.toFixed(1) : 'n/a'}`)
    } catch (e) {
      newResult.error = e.message
      console.error(`  ❌ NEW failed: ${e.message}`)
    }

    await new Promise(r => setTimeout(r, 3000))

    const oldPass = oldResult.luminance !== null ? oldResult.luminance >= LUMINANCE_THRESHOLD : null
    const newPass = newResult.luminance !== null ? newResult.luminance >= LUMINANCE_THRESHOLD : null
    const darkExceptionPass = darkException ? 'N/A (dark exception — darkness is expected)' : null

    results.push({
      id: tc.id,
      label: tc.label,
      darkException,
      old: { luminance: oldResult.luminance, pass: oldPass, localPath: oldResult.localPath, error: oldResult.error },
      new: { luminance: newResult.luminance, pass: newPass, localPath: newResult.localPath, error: newResult.error },
      verdict: darkExceptionPass || (newPass === null ? 'UNKNOWN' : newPass ? 'PASS' : 'WARN'),
    })
  }

  // Write JSON results
  const jsonPath = path.join(OUT_DIR, 'results.json')
  writeFileSync(jsonPath, JSON.stringify(results, null, 2))
  console.log(`\n📄 Results JSON: ${jsonPath}`)
  return results
}

main().then(results => {
  console.log('\n═══════════════════════════════════════')
  console.log('  TEST RESULTS SUMMARY')
  console.log('═══════════════════════════════════════')
  for (const r of results) {
    const oldLum = r.old.luminance !== null ? r.old.luminance.toFixed(1) : 'ERR'
    const newLum = r.new.luminance !== null ? r.new.luminance.toFixed(1) : 'ERR'
    console.log(`  ${r.label}: OLD=${oldLum} | NEW=${newLum} | ${r.verdict}`)
  }
  console.log('═══════════════════════════════════════\n')
}).catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
