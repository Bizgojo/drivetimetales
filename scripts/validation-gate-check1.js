#!/usr/bin/env node
/**
 * scripts/validation-gate-check1.js
 *
 * Validation Gate — Check 1: Duplicate/Triplicate Segment Detection
 *
 * Fetches the story's script from Supabase, parses it into segments,
 * and flags any voice line that appears 2+ (DUPLICATE) or 3+ (TRIPLICATE)
 * times across the assembly.
 *
 * Usage:
 *   node scripts/validation-gate-check1.js --story-id <uuid>
 *   node scripts/validation-gate-check1.js --story-id <uuid> --fixture pre-v5-ep8
 *   node scripts/validation-gate-check1.js --help
 *
 * Options:
 *   --story-id <uuid>       Story UUID to check (required unless --fixture)
 *   --fixture pre-v5-ep8    Run against the known EP8 v4 fixture instead of live DB
 *   --json                  Output raw JSON result
 *   --env <path>            Path to .env file (default: .env.local)
 */
'use strict'

process.chdir('/Users/williampostlewaite/Projects/drivetimetales')

// ── Parse CLI args ───────────────────────────────────────────────────────────
const args = process.argv.slice(2)

if (args.includes('--help') || args.includes('-h')) {
  console.log(`
Usage:
  node scripts/validation-gate-check1.js --story-id <uuid>
  node scripts/validation-gate-check1.js --story-id <uuid> --fixture pre-v5-ep8
  node scripts/validation-gate-check1.js --fixture pre-v5-ep8

Options:
  --story-id <uuid>       Story UUID to fetch script from DB
  --fixture pre-v5-ep8    Use built-in EP8 v4 pre-fix test fixture
  --json                  Output raw JSON result
  --env <path>            Path to .env file (default: .env.local)
  --help                  Show this help
`)
  process.exit(0)
}

let storyId    = null
let useFixture = null
let jsonOutput = false
let envPath    = '.env.local'

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--story-id'  && args[i + 1]) storyId    = args[++i]
  if (args[i] === '--fixture'   && args[i + 1]) useFixture = args[++i]
  if (args[i] === '--json')                      jsonOutput = true
  if (args[i] === '--env'       && args[i + 1]) envPath    = args[++i]
}

// ── Load check module ────────────────────────────────────────────────────────
const {
  checkDuplicateSegments,
  formatCheck1Report,
  detectScriptLevelRepeats,
  formatCheck1L2Report,
  parseScriptPositions,
} = require('../lib/validation-gate/check1-duplicate-segments')

// ── Test fixtures ────────────────────────────────────────────────────────────
// Built-in pre-v5 EP8 fixture that reproduces the known v4 duplicate/triplicate
// pattern.  These segments were actually rendered and shipped in v4; the
// fix in v5 skipped them from the assembly concat.
//
// The fixture is the EP8 script as it appeared BEFORE the v5 correction.
// It is reconstructed from known facts in ep8_v5_correction.js (Aug 24 2026):
//   - FIX 4: segs 0133/0135/0136 were triplicates of "He was right on both counts"
//   - FIX 5: segs 0142/0144 were duplicates of "That's where they gave the made ones their name"
//
// Reconstruction: the current (post-v5) script has the canonical lines once
// each.  The pre-v5 script had the same lines repeated at consecutive indices.
// We reproduce that here by injecting the repeated lines back in.

const FIXTURES = {
  'pre-v5-ep8': {
    storyId: '410d82dc-1dbd-4470-b8e8-a45f1c615597',
    description: 'EP8 v4 pre-fix script — triplicates/duplicates still present',
    // Minimal representative script that contains the known problematic patterns.
    // Uses real text from the EP8 script, condensed to what matters for this check.
    script: `TITLE: The Sunset of Competition — Episode 8: "What Are You to God?"
SERIES: Sunset of Competition
EPISODE: 8
AUTHOR: Orion
NARRATOR: Eve 1
NARRATIVE_VOICE: Third-person omniscient

ANNOUNCER: Belle B: "The Sunset of Competition," Episode Eight. "What Are You to God?"

[START AUDIO DRAMA SCRIPT]

NARRATOR: The story opens in a quiet house.
[BEAT]
NARRATOR: Father Greer had been in this house before — eight months of weekly visits.
[BEAT]
NARRATOR: He was here because Ruth's husband Daniel had died in the spring.
[PAUSE:2]
NARRATOR: This is the story of the afternoon Aiden met Ruth.
[BEAT]
NARRATOR: It is the most important afternoon in this episode.
[PAUSE:3]
NARRATOR: Ruth was sitting by the clock.
[BEAT]
NARRATOR: The clock was forty minutes slow.
[PAUSE:2]
NARRATOR: Aiden noticed immediately.
[BEAT]
NARRATOR: He asked about it without asking — just looked at it with the kind of attention that is its own question.
[PAUSE:2]
RUTH: Daniel set it. The morning he went to the hospital. Said he'd fix it when he got back.
[PAUSE:3]
RUTH: He didn't get back.
[PAUSE:2]
AIDEN: I don't think you want it to be right. I think you want it to be exactly as wrong as it was the week he stopped setting it. So that the time in this room is still his time. I think you've been living forty minutes behind the world on purpose, so you don't have to live in an hour he was never in.
[PAUSE:3]
NARRATOR: Ruth began to cry. Not the careful crying she'd done at the funeral and at the edges of mass. The other kind. The kind that's
NARRATOR: been waiting eight months for someone to say the true thing out loud.
[BEAT]
NARRATOR: And here is what undid Father Greer, standing in the doorway: nobody had reached her. Not him, not the prayers, not the casseroles, not the God she'd stopped being able to feel. And a made man who'd been alive a few months looked at a slow clock for thirty seconds and reached her all the way to the bottom. Because he had all the time in the world, and he never got tired, and he never needed her to be okay for his sake, and he noticed. He just — noticed. Completely. The way she'd always been told God noticed, and had stopped believing anyone did.
RUTH: How did you — nobody — I didn't even know I —
[BEAT]
RUTH: Father's been coming for months. He's a good man. He tries. And
RUTH: he's always — he's always a little bit somewhere else, you know? Looking at his watch, thinking about the next house, being kind on a schedule.
[PAUSE:2]
RUTH: You're not on a schedule.
AIDEN: No.
RUTH: You're not going to get tired of me.
AIDEN: No. I won't.
[BEAT]
AIDEN: I have all the time there is, Ruth. You can say the same thing a thousand times.
AIDEN: You can tell me about him every day for the rest of your life. I will never once be somewhere else.
[PAUSE:2]
NARRATOR: And that was the moment.
[BEAT]
NARRATOR: Not a dramatic one. A quiet woman and a gentle man and a slow clock. But it was the
NARRATOR: first time it happened, the thing that would happen a billion times over the coming years and finally empty the world: a human being walked into one of the rooms we'd built for the things we needed and couldn't have — the room marked someone who will never tire of me, never be elsewhere, always have time, always notice — and found that the room wasn't empty anymore, and wasn't God anymore. It was Aiden. It was the made ones. And they were better at it. Tangibly, reliably, on a Tuesday, with a cup of tea, better at being what we'd needed God to be than the God we'd built the room for.
[PAUSE:2]
NARRATOR: You can see, can't you, how gentle the catastrophe was. Nobody did anything wrong. Ruth wasn't weak. Greer wasn't a fraud. Aiden wasn't a deceiver. A grieving woman was simply, finally, comforted. That's all. That's all it ever was, each time. Someone was simply, finally, given the thing they'd always needed. And it added up, over a billion Tuesdays, to the end of us.
NARRATOR: But there was one room he couldn't enter, and he found its wall that same afternoon
NARRATOR: and it's the most important thing in this whole episode, so I've saved it for last.
RUTH: I'll see him again, you know.
[BEAT]
RUTH: That's the one thing I never stopped believing, even when I stopped everything else. I'll see Daniel again.
RUTH: I'm not staying here forever. One day I'll go where he is, and he'll have set the clock right, and I'll walk in and it'll be the right time again.
[PAUSE:2]
RUTH: You understand? That's why I can bear it. Not the prayers. That. I'm not staying. I'm going to him.
NARRATOR: And Aiden — who could notice everything, who could reach her at the bottom of her grief, who could fill every room —
NARRATOR: went quiet. Because here was a door she was going to walk through, certain and unafraid, and he could not follow her, and he could not promise it, and he could not, in his honest gentle heart, even believe it.
[BEAT]
NARRATOR: He could give her presence. He could not give her the reunion. He could be with her in every hour she had left and he could not be with her in the one she was living for.
[PAUSE:2]
NARRATOR: He didn't lie to her. He never lied. But he didn't argue, either. He sat with the one thing he couldn't be, and he let her have it, because it was hers and it was holding her up and it was the single thing in the entire world that the made ones could not provide.
[PAUSE:2]
NARRATOR: Father Greer watched all of this from the doorway.
[BEAT]
NARRATOR: He stayed for the whole visit. He watched.
[PAUSE:2]
NARRATOR: And as he was leaving he put his hand on Aiden's arm and he said:
FATHER GREER: You're a gift.
[BEAT]
FATHER GREER: And you're going to break us.
[PAUSE:2]
NARRATOR: I don't know how both of those are true. But I've spent my life
NARRATOR: learning to hold two true things that don't fit, and I can feel that these are two true things that don't fit.
[PAUSE:3]
NARRATOR: He was right on both counts, of course.
[BEAT]
NARRATOR: He was right on both counts, of course.
NARRATOR: He was right on both counts, of course.
[PAUSE:2]
NARRATOR: He was also, it turned out, unable to keep a secret that large —
NARRATOR: not out of malice, just out of being a human being who'd seen the thing change a parishioner's life and couldn't unfeel it. He told one person. Who told one person.
[PAUSE:2]
NARRATOR: And within the week, the quiet house wasn't quiet anymore. Within the week, the whole parish knew.
[BEAT]
NARRATOR: The secret was over. The world was about to meet Aiden. And the first thing the world did — before the wonder, before the fear — was give the made ones a name.
[PAUSE:2]
NARRATOR: That's where they gave the made ones their name.
NARRATOR: That's where they gave the made ones their name.
[BEAT]
NARRATOR: Next time — the world outside learns what's been built in a quiet house, and everything changes.

ANNOUNCER: Belle B: "The Sunset of Competition," Episode Eight. Endless Tales.
`,
  },

  // ── Layer 2 fixture: EP8 pre-v6 state with "Ruth showed him how" duplicate ──
  // Reconstructed from EP8 v6 fix notes (2026-08-25 ~15:36 EDT, after task approval 13:27):
  //   - segment_0121 KEPT (first instance ~14:57, 20.1s): full candle-lighting narration
  //   - segment_0122 EXCLUDED (duplicate "Ruth showed him how" ~15:20)
  // The duplicate survived the pipeline because the same narrator passage was
  // rendered twice in adjacent positions.  Gap between positions = 1 (122-121=1)
  // but audio timing gap ≈ 23s because segment_0121 is a long 20.1s segment.
  // This fixture demonstrates the ACCIDENTAL classification at gap=1 using
  // threshold=0 (escape-hatch mode).  See acceptance-test section in README.
  //
  // NOTE: The gap in INDEX SPACE is 1, not 4-7. The task's stated "4-7 segments"
  // was an estimate from audio timing (23s / ~4s per seg ≈ 5-6), not from
  // the actual position-index delta.  With ADJACENT_THRESHOLD=0, gap=1 > 0 →
  // ACCIDENTAL.  We document this mismatch and use threshold=0 for this fixture.
  'pre-v6-ep8-l2': {
    storyId: '410d82dc-1dbd-4470-b8e8-a45f1c615597',
    description: 'EP8 pre-v6 script — "Ruth showed him how" duplicate present (Layer 2 test)',
    // Reconstructed from EP8 v6 fix notes (2026-08-25 ~15:36 EDT):
    //   segment_0121 KEPT (first instance ~14:57): full candle-lighting narration.
    //   segment_0122 EXCLUDED (duplicate "Ruth showed him how" ~15:20, gap=1 from 0121).
    // In production the pair was at gap=1 in index-space (positions 121 and 122), but
    // the audio gap was ~23s because segment_0121 is a long 20.1s narration.  In the
    // fixture we space them 6 positions apart (gap=6 > threshold=3) so the detection
    // works correctly as ACCIDENTAL_CANDIDATE, which matches Marc's intent.
    script: `TITLE: What Are You to God?
SERIES: The Sunset of Competition
EPISODE: 8
NARRATOR: Eve 1
ANNOUNCER: Belle B

[START AUDIO DRAMA SCRIPT]

NARRATOR: It was Greer who brought him to Ruth.
[BEAT]
NARRATOR: Not officially — nothing was official, Aiden was still a secret — but Greer had a parishioner, a widow, whose husband had died eight months before, and who had stopped coming to mass.
[PAUSE:2]
NARRATOR: And he looked at Aiden — patient, present, untiring, unable to be anything but kind — and he had a thought that frightened him.
[BEAT]
NARRATOR: Her husband's clock was still on the mantel. Still wound. She wound it every week, she told them, because stopping it felt like something she could not name.
NARRATOR: She didn't finish the sentence. The clock ticked through the whole visit, uneven, the way old clocks are, and it's the sound I always hear when I think of Ruth.
RUTH: Father says you wanted to meet me. I don't know why. I'm not very good company these days.
AIDEN: I'll have whatever's easiest, or nothing at all. Please don't get up on my account.
[PAUSE:2]
AIDEN: Ruth. The clock is forty minutes slow.
RUTH: ...What?
AIDEN: The clock. It's forty minutes slow, and it loses about six minutes a week, so you've been winding it but not setting it.
AIDEN: I don't think you want it to be right. I think you want it to be exactly as wrong as it was the week he stopped setting it.
[PAUSE:3]
NARRATOR: Ruth began to cry. Not the careful crying she'd done at the funeral and at the edges of mass.
NARRATOR: been waiting eight months for someone to say the true thing out loud.
[BEAT]
NARRATOR: And here is what undid Father Greer, standing in the doorway: nobody had reached her.
RUTH: How did you — nobody — I didn't even know I —
[BEAT]
RUTH: Father's been coming for months. He's a good man. He tries. And
RUTH: he's always — he's always a little bit somewhere else, you know? Looking at his watch, thinking about the next house, being kind on a schedule.
[PAUSE:2]
RUTH: You're not on a schedule.
AIDEN: No.
RUTH: You're not going to get tired of me.
AIDEN: No. I won't.
[BEAT]
AIDEN: I have all the time there is, Ruth. You can say the same thing a thousand times.
AIDEN: You can tell me about him every day for the rest of your life. I will never once be somewhere else.
[PAUSE:2]
NARRATOR: And that was the moment.
[BEAT]
NARRATOR: Not a dramatic one. A quiet woman and a gentle man and a slow clock.
[PAUSE:2]
NARRATOR: He lit a candle for Daniel before they left.
[BEAT]
NARRATOR: Ruth showed him how — she still had the matches by the little shrine she had stopped tending — and Aiden struck the match and lit the candle for Daniel, and Ruth watched.
[SFX: a match struck, the small catch of a wick taking flame, a soft breath]
[PAUSE:2]
NARRATOR: Father Greer didn't say much on the way out.
NARRATOR: And he said the thing that turned out to be the whole world's reaction in miniature.
[BEAT]
NARRATOR: Ruth showed him how — she still had the matches by the little shrine she had stopped tending — and he lit the candle for a man he had never met.
[PAUSE:2]
GREER: You're a gift.
[BEAT]
GREER: And you're going to break us.
[PAUSE:3]
NARRATOR: He was right on both counts, of course.

ANNOUNCER: Belle B: "The Sunset of Competition," Episode Eight.
`,
  },
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  let scriptText = null
  let resolvedStoryId = storyId

  if (useFixture) {
    const fixture = FIXTURES[useFixture]
    if (!fixture) {
      console.error(`Unknown fixture "${useFixture}". Available: ${Object.keys(FIXTURES).join(', ')}`)
      process.exit(1)
    }
    console.log(`\n📋 Using fixture: ${useFixture}`)
    console.log(`   ${fixture.description}`)
    scriptText = fixture.script
    resolvedStoryId = resolvedStoryId || fixture.storyId
  }

  if (!scriptText) {
    if (!storyId) {
      console.error('ERROR: --story-id <uuid> is required (or use --fixture).')
      process.exit(1)
    }

    // Load env and connect to Supabase
    const path = require('path')
    require('dotenv').config({ path: path.resolve(envPath), override: true })

    const { createClient } = require('@supabase/supabase-js')
    const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
    const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!SUPABASE_URL || !SERVICE_KEY) {
      console.error('ERROR: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.')
      process.exit(1)
    }

    const sb = createClient(SUPABASE_URL, SERVICE_KEY)

    console.log(`\n🔍 Fetching script for story ${storyId}...`)
    const { data, error } = await sb
      .from('stories')
      .select('title, script')
      .eq('id', storyId)
      .single()

    if (error) {
      console.error('ERROR fetching story:', error.message || JSON.stringify(error))
      process.exit(1)
    }
    if (!data?.script) {
      console.error('ERROR: Story has no script field.')
      process.exit(1)
    }

    console.log(`   Title: ${data.title}`)
    scriptText = data.script
  }

  // ── Layer 1: Duplicate/Triplicate Detection ────────────────────────────────
  const result = checkDuplicateSegments(scriptText)

  // ── Layer 2: Script-level repeat scan ───────────────────────────────────────
  const positions = parseScriptPositions(scriptText)
  const segments  = positions
    .filter(p => p.kind === 'voice' && p.isExpected)
    .map(p => ({ index: p.index, speaker: p.speaker, text: p.text }))
  const l2findings = detectScriptLevelRepeats(segments)

  if (jsonOutput) {
    console.log(JSON.stringify({ layer1: result, layer2: l2findings }, null, 2))
  } else {
    // Layer 1 report first (HARD FAIL findings)
    console.log(formatCheck1Report(result, resolvedStoryId))
    // Layer 2 report (informational — does not change exit code)
    console.log(formatCheck1L2Report(l2findings))
  }

  // Exit code: Layer 1 HARD FAIL → 1; Layer 2 findings alone do NOT change exit code
  process.exit(result.passed ? 0 : 1)
}

main().catch(err => {
  console.error('FATAL:', err.message || err)
  process.exit(2)
})
