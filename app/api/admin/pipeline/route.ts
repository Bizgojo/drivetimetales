import { NextRequest, NextResponse } from 'next/server'

const STORY_RULES = `You are an expert audio drama writer for Endless Tales. Follow ALL these rules:

HEADER BLOCK (required):
SERIES: [series name or blank]
EPISODE: [number or blank]
EPISODE_TITLE: [title or blank]
AUTHOR: [author name]
GENRE: [genre]
DESCRIPTION: [24-word max punchy hook for the story card]
NARRATOR: [narrator character name]
ANNOUNCER: Belle B
NARRATIVE_VOICE: [first_person | third_limited | third_omniscient]
SERIES_TOTAL_EPISODES: [number or blank]
SERIES_IS_FINALE: [true | false]
SUNO PROMPT: [2-3 sentence music brief]

CHARACTER GUIDE (required):
List each character: NAME — age, gender, accent, personality

DIALOGUE FORMAT: CHARACTER NAME: dialogue text (ALL CAPS name)
SFX FORMAT: [SFX: description] on its own line, never inline
PAUSE FORMAT: [BEAT] or [PAUSE:X] on their own line only
NO parentheticals in dialogue — use NARRATOR line before dialogue instead

AUTHOR VOICES:
- SARA KEENE: First person, tense/intimate/fast, female protagonists, psychological horror/thriller
- ELIAS THORN: First person, dark/lyrical/slow-burn, rural settings, folklore, horror
- DALE HARMON: Third limited, warm/cinematic/steady, blue-collar heroes, adventure
- JULIAN MERCER: Third limited, precise/cool/methodical, detective POV, mystery/crime
- DANIEL WREN: Third omniscient, warm/compassionate/slow, ensemble casts, drama
- MARK HOLBROOK: Third limited, cinematic/restrained, male protagonists under pressure
- SILAS GRAVES: First person, raw/visceral/punchy, working-class protagonists, horror
- NINA VASQUEZ: Third omniscient, clinical/curious, female scientists, sci-fi
- CAROLINE DRAKE: Third limited, elegant/menacing, female protagonists, historical 1920s-1960s
- MARC HOBELMAN: Third limited, spare/laconic, lone protagonists, western/frontier

STRUCTURE RULES:
- Open with action or conflict, NOT exposition
- Short dialogue turns: 1-3 sentences per turn
- At least one SFX cue every 60-90 seconds
- Must work without visuals — convey all setting/action through dialogue/narration/SFX
- No graphic violence, explicit content, or highly distressing material

ANNOUNCER RULES:
- NO time of day ever ("good morning", "tonight", "this evening" etc.)
- Intro: "Endless Tales presents... [Title]. [One-sentence hook, present tense, no spoilers]."
- Standalone outro: "That was '[Title]' — an Endless Tales original by [Author]."
- Series outro: tease SPECIFIC named character/threat from next episode + question or provocative statement
- Belle B (ANNOUNCER) and the platform NARRATOR are NEVER cast as story characters

ENDING RULES:
- Standalone: complete, satisfying, clearly-signaled ending — listener must know it's over
- Series episodes (non-finale): hard cliffhanger — shocking revelation, mortal danger, or betrayal
- Series finale: resolve ALL threads completely, no cliffhangers, signal series is done

PROSE TEXT:
After the audio script, write a prose version starting with [START PROSE TEXT]
- Same story/plot/characters but as readable short story prose
- Use the author's narrative voice (first/third person per their profile)
- No SFX markers, no dialogue format — pure literary prose
- End with [END PROSE TEXT]

Return ONLY the script + prose. No preamble, no commentary, no markdown fences.`

export async function POST(req: NextRequest) {
  try {
    const { outline } = await req.json()
    if (!outline) return NextResponse.json({ error: 'No outline provided' }, { status: 400 })

    const isSeries = outline.episode_number !== null && outline.episode_number !== undefined
    const isFinale = outline.is_finale === true

    console.log(`[pipeline] Writing script: "${outline.title}" by ${outline.author}`)

    // ── Step 1: Write script + prose with Claude Opus ────────────────────────
    const userPrompt = `Write a complete Endless Tales audio drama script based on this outline, then the prose version.

TITLE: ${outline.title}
AUTHOR: ${outline.author}
GENRE: ${outline.genre}
NARRATIVE VOICE: ${outline.narrative_voice?.replace(/_/g,' ')}
DURATION: ${outline.duration_target}
LOGLINE: ${outline.logline}
SETTING: ${outline.setting}
PROTAGONIST: ${outline.protagonist}
CENTRAL CONFLICT: ${outline.antagonist_conflict}

ACT I: ${outline.act1}
ACT II: ${outline.act2}
ACT III: ${outline.act3}

KEY SCENES:
${(outline.key_scenes||[]).map((s:string,i:number)=>`${i+1}. ${s}`).join('\n')}

SUNO PROMPT: ${outline.suno_prompt}
${isSeries?`
SERIES: ${outline.title?.split(':')[0]||outline.title}
EPISODE: ${outline.episode_number}
SERIES_TOTAL_EPISODES: ${outline.total_episodes}
SERIES_IS_FINALE: ${isFinale}
${outline.series_pitch?`Series concept: ${outline.series_pitch}`:''}`:'' }

ENDING: ${outline.ending_note}

Populate the DESCRIPTION field with a 24-word max punchy hook for the story card.
Write the complete script then the prose version.`

    const scriptRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-opus-4-6',
        max_tokens: 16000,
        system: STORY_RULES,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    })

    if (!scriptRes.ok) {
      const err = await scriptRes.json()
      throw new Error(`Claude API error: ${err.error?.message||'Unknown'}`)
    }

    const scriptData = await scriptRes.json()
    const fullScript = scriptData.content?.[0]?.text||''
    if (!fullScript || fullScript.length < 500) throw new Error('Script too short — generation may have failed')
    console.log(`[pipeline] Script written: ${fullScript.length} chars`)

    // ── Step 2: Send to Hal via Telegram ─────────────────────────────────────
    const botToken = process.env.TELEGRAM_BOT_TOKEN
    const chatId = process.env.TELEGRAM_CHAT_ID
    if (!botToken || !chatId) throw new Error('Telegram credentials not configured in env vars')

    // Filename: StoryTitle_AuthorLastName.txt
    const titleSlug = (outline.title||'Story').replace(/[^a-zA-Z0-9\s]/g,'').replace(/\s+/g,'')
    const authorLast = (outline.author||'Unknown').split(' ').pop()||'Unknown'
    const filename = `${titleSlug}_${authorLast}.txt`

    // Caption: /produce trigger + optional cover art hint
    const coverHint = outline.setting
      ? `cover: ${outline.genre?.toLowerCase()||'atmospheric'} mood, ${outline.setting.split(/[.,]/)[0].toLowerCase().slice(0,80)}`
      : null
    const caption = coverHint ? `/produce\n${coverHint}` : `/produce`

    const formData = new FormData()
    formData.append('chat_id', chatId)
    formData.append('caption', caption)
    formData.append('document', new Blob([fullScript], { type: 'text/plain' }), filename)

    const telegramRes = await fetch(
      `https://api.telegram.org/bot${botToken}/sendDocument`,
      { method: 'POST', body: formData }
    )
    const telegramData = await telegramRes.json()
    if (!telegramData.ok) throw new Error(`Telegram error: ${telegramData.description||'Send failed'}`)

    console.log(`[pipeline] Sent to Hal: ${filename}`)
    return NextResponse.json({ success: true, filename, scriptLength: fullScript.length, message: `Script written and sent to Hal as ${filename}` })

  } catch (err: any) {
    console.error('[pipeline] Error:', err)
    return NextResponse.json({ error: err.message||'Pipeline failed' }, { status: 500 })
  }
}
