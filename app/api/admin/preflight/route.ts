import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { runPreflightChecks, formatPreflightReport } from '@/lib/preflight/validator'
import { resolveNarratorVoiceId } from '@/lib/preflight/narrator-check'
import type { VoiceCodeAssignment } from '@/lib/preflight/voice-code-check'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

interface ParsedCharacter {
  name: string
  gender?: string
  description?: string
}

function parseCharacterGuide(script: string): ParsedCharacter[] {
  const characterGuideMatch = script.match(/CHARACTER GUIDE\s*-{3,}([\s\S]*?)(?:\n---|\[START|$)/)
  if (!characterGuideMatch) return []

  const guideText = characterGuideMatch[1]
  const characters: ParsedCharacter[] = []

  // Match lines like "Name — age, gender, accent, tone"
  const namePattern = /^([A-Z][A-Za-z\s']+?)\s*(?:—|--|\|)(.*?)$/gm
  let match

  while ((match = namePattern.exec(guideText)) !== null) {
    const name = match[1].trim()
    const description = match[2].trim()
    characters.push({ name, description })
  }

  return characters
}

function extractIntroOutro(script: string): { intro?: string; outro?: string } {
  const introMatch = script.match(/BELLE B INTRO[\s\S]*?BELLE B:\s*(.+?)(?:\n---|\n\n)/i)
  const outroMatch = script.match(/BELLE B(?:\s+OUTRO)?[\s\S]*?BELLE B:\s*(.+?)(?:\n[A-Z]:|$)/i)

  return {
    intro: introMatch ? introMatch[1].trim() : undefined,
    outro: outroMatch ? outroMatch[1].trim() : undefined,
  }
}

function parseScriptMetadata(script: string): Record<string, any> {
  const metadata: Record<string, any> = {}

  const fields = ['AUTHOR', 'GENRE', 'TITLE', 'SERIES', 'EPISODE', 'EPISODE_TITLE', 'NARRATOR']
  fields.forEach((field) => {
    const regex = new RegExp(`^${field}:\\s*(.+?)$`, 'im')
    const match = script.match(regex)
    if (match) {
      metadata[field.toLowerCase()] = match[1].trim()
    }
  })

  return metadata
}

export async function POST(req: NextRequest) {
  try {
    // Read all params in one pass — req.json() stream can only be consumed once
    const body = await req.json()
    const { storyId, characterVoiceCodes = [] } = body as {
      storyId: string
      /** Character voice_codes from Claude/Hal — validated against voice_code_registry.
       *  Narrators are NOT included here; they bypass the registry (Option B). */
      characterVoiceCodes?: VoiceCodeAssignment[]
    }

    if (!storyId) {
      return NextResponse.json({ success: false, error: 'storyId required' }, { status: 400 })
    }

    // Fetch story — include author_id and narrator fields for narrator resolution
    // Single literal string required for Supabase TS type inference
    const { data: storyRow, error: fetchError } = await supabase
      .from('stories')
      .select('id,title,author,author_id,genre,description,duration_mins,script,narrator_voice_id,narrator_voice_name,series_name,episode_number,series_total_episodes,series_is_finale')
      .eq('id', storyId)
      .single()

    if (fetchError || !storyRow) {
      return NextResponse.json(
        { success: false, error: `Story not found: ${fetchError?.message ?? 'Unknown error'}` },
        { status: 404 }
      )
    }

    const script = storyRow.script
    if (!script) {
      return NextResponse.json(
        { success: false, error: 'Script not found in story record' },
        { status: 400 }
      )
    }

    // ── Narrator resolution (Option B — bypasses voice_code_registry) ────────────────
    // Chain: story.narrator_voice_id → author_id → authors.narrator_id →
    //        narrator_voices.elevenlabs_voice_id
    // Narrator is NOT included in voiceCodeAssignments. Characters only.
    const narratorResult = await resolveNarratorVoiceId(storyId, supabase, storyRow as any)
    if (narratorResult.ok === false) {
      return NextResponse.json(
        {
          success: false,
          error: narratorResult.message,
          code: narratorResult.code,
          blockers: [narratorResult.message],
          safeToGenerateVoices: false,
        },
        { status: 422 }
      )
    }

    // ── Character voice_code assignments (Option B — characters only) ─────────────────
    // voiceCodeAssignments contains ONLY characters. Narrator already validated above.
    const voiceCodeAssignments: VoiceCodeAssignment[] = [...characterVoiceCodes]

    // ── Preflight checks ──────────────────────────────────────────────────────────────
    const characters = parseCharacterGuide(script)
    const { intro, outro } = extractIntroOutro(script)
    const metadata = parseScriptMetadata(script)

    const report = await runPreflightChecks({
      storyId,
      script,
      characters: characters.map((c) => c.name),
      intro,
      outro,
      seriesMetadata: {
        seriesName: storyRow.series_name || metadata.series,
        episodeTitle: metadata.episode_title,
        episodeNumber: storyRow.episode_number || parseInt(metadata.episode),
        author: storyRow.author || metadata.author,
        narrator: metadata.narrator,
        genre: storyRow.genre || metadata.genre,
        durationMins: storyRow.duration_mins,
      },
      isSeriesFinal: storyRow.series_is_finale ?? false,
      voiceCodeAssignments,
    })

    console.log(`\n📋 PREFLIGHT: ${storyId}`)
    console.log(`   Narrator: ${narratorResult.narratorVoiceName} (${narratorResult.source})`)
    console.log(`   Status: ${report.passed ? '✅ PASSED' : '❌ FAILED'}`)
    console.log(`   Safe to generate: ${report.safeToGenerateVoices ? 'YES' : 'NO'}`)
    console.log(`   Blockers: ${report.blockers.length}`)
    console.log(`   Warnings: ${report.warnings.length}`)

    return NextResponse.json(
      {
        success: report.safeToGenerateVoices,
        narrator: { name: narratorResult.narratorVoiceName, source: narratorResult.source },
        report,
        formattedReport: formatPreflightReport(report),
      },
      { status: report.safeToGenerateVoices ? 200 : 422 }
    )
  } catch (e) {
    const error = e instanceof Error ? e : new Error(String(e))
    console.error('Preflight error:', error.message)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
