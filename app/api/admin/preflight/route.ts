import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { runPreflightChecks, formatPreflightReport } from '@/lib/preflight/validator'
import { resolveNarratorVoiceCode } from '@/lib/preflight/narrator-check'
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
      characterVoiceCodes?: VoiceCodeAssignment[]
    }

    if (!storyId) {
      return NextResponse.json(
        {
          success: false,
          error: 'storyId required',
        },
        { status: 400 }
      )
    }

    // Fetch story from database (include author_id for narrator resolution)
    const { data: storyRow, error: fetchError } = await supabase
      .from('stories')
      .select('id,title,author,author_id,genre,description,duration_mins,script,series_name,episode_number,series_total_episodes,series_is_finale')
      .eq('id', storyId)
      .single()

    if (fetchError || !storyRow) {
      return NextResponse.json(
        {
          success: false,
          error: `Story not found: ${fetchError?.message || 'Unknown error'}`,
        },
        { status: 404 }
      )
    }

    const script = storyRow.script
    if (!script) {
      return NextResponse.json(
        {
          success: false,
          error: 'Script not found in story record',
        },
        { status: 400 }
      )
    }

    // Parse story components
    const characters = parseCharacterGuide(script)
    const { intro, outro } = extractIntroOutro(script)
    const metadata = parseScriptMetadata(script)

    // --- Narrator voice_code resolution ---
    // Must come from author → narrator registry. Claude/Hal must not invent narrator codes.
    const narratorResult = await resolveNarratorVoiceCode(storyId, supabase)
    if (narratorResult.ok === false) {
      // Hard block: narrator not assigned or narrator has no voice_code
      // Use === false for reliable TS discriminated union narrowing
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

    // Build voiceCodeAssignments: narrator (from registry) + characters (from story/request)
    // Characters receive voice_codes from Claude/Hal — passed as optional request param.
    // If no character assignments provided, only narrator is validated (characters checked later).
    const voiceCodeAssignments: VoiceCodeAssignment[] = [
      narratorResult.assignment,
      ...characterVoiceCodes,
    ]

    // Run preflight checks (voice code check is now always populated with narrator)
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

    // Log preflight report
    console.log(`\n📋 PREFLIGHT: ${storyId}`)
    console.log(`   Status: ${report.passed ? '✅ PASSED' : '❌ FAILED'}`)
    console.log(`   Safe to generate: ${report.safeToGenerateVoices ? 'YES' : 'NO'}`)
    console.log(`   Blockers: ${report.blockers.length}`)
    console.log(`   Warnings: ${report.warnings.length}`)

    // Return detailed report
    return NextResponse.json(
      {
        success: report.safeToGenerateVoices,
        report,
        formattedReport: formatPreflightReport(report),
      },
      { status: report.safeToGenerateVoices ? 200 : 422 }
    )
  } catch (e) {
    const error = e instanceof Error ? e : new Error(String(e))
    console.error('Preflight error:', error.message)
    return NextResponse.json(
      {
        success: false,
        error: error.message,
      },
      { status: 500 }
    )
  }
}
