import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || ''
const MODEL = 'claude-sonnet-4-20250514'
const TARGET_SCORE = 23
const TARGET_CONSECUTIVE = 50
const MAX_RUNS = 200

type EpisodeResult = {
  episodeNumber: number; episodeTitle: string; score: number
  truncated: boolean; topFixes: string[]; dimensions: Record<string, number>; passed: boolean
}
type RunResult = {
  runNumber: number; seriesName: string; author: string
  episodes: EpisodeResult[]; allPassed: boolean; lowestScore: number
}
type PromptAdjustments = {
  extraOpeningRules: string; extraEscalationRules: string
  extraFinaleRules: string; extraDialogueRules: string; knownWeaknesses: string[]
}

async function callClaude(prompt: string, maxTokens: number): Promise<string> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({ model: MODEL, max_tokens: maxTokens, messages: [{ role: 'user', content: prompt }] }),
  })
  const data = await res.json()
  return data.content?.[0]?.text || ''
}

const AUTHOR_PROFILES: Record<string, string> = {
  'Sara Keene': 'First person. Tense, intimate, psychological. Fast pacing. Female protagonists, unreliable narrators.',
  'Lena Holt': 'Third person limited. Ruthless, institutional, airtight. Female protagonists fighting institutional corruption.',
  'Jack Malone': 'First person. Hard-boiled, sardonic, street-smart. Male protagonists, urban environments. Short declarative sentences.',
}
const NARRATOR_MAP: Record<string, string> = {
  'Sara Keene': 'Cole Hargrove', 'Lena Holt': 'Clara Ashworth', 'Jack Malone': 'Ray Dolan',
}
const THRILLER_AUTHORS = ['Sara Keene', 'Lena Holt', 'Jack Malone']

function buildScenePrompt(
  p: { author: string; genre: string; runtime: string; premise: string; isSeries: boolean; seriesName: string; episodeNumber: number; totalEpisodes: number; isFinale: boolean; episodeTitle: string; narrativeVoice: string },
  sceneNumber: number, totalScenes: number, previousScenes: string, sceneRole: string, adj: PromptAdjustments
): string {
  const profile = AUTHOR_PROFILES[p.author] || 'First person. Tense, fast pacing.'
  const cliffhanger = p.premise.includes('CLIFFHANGER:') ? p.premise.split('CLIFFHANGER:')[1].trim() : 'Create a powerful cliffhanger that makes stopping feel impossible'
  const weaknessWarning = adj.knownWeaknesses.length > 0 ? `\nKNOWN WEAKNESSES TO AVOID:\n${adj.knownWeaknesses.map(w => `- ${w}`).join('\n')}` : ''
  const voiceReminder = p.narrativeVoice === 'first_person' ? 'MAINTAIN FIRST PERSON — every narration line uses I, me, my.' : 'MAINTAIN THIRD LIMITED — follow protagonist closely.'
  const contextLength = sceneRole === 'finale' ? 2500 : 2000
  const prevContext = previousScenes ? `STORY SO FAR — continue seamlessly:\n${previousScenes.slice(-contextLength)}` : ''

  const roleInstruction = sceneRole === 'opening'
    ? `OPENING SCENE: Begin mid-action. Establish protagonist with one specific detail. Create a dramatic question the listener MUST have answered. End at tension that pulls forward.\n\nWORD BUDGET: Target 350–500 words. Do NOT exceed 500 words. Hook fast, end sharp.\n\nOPENING DIALOGUE RULES:\n- Protagonist's FIRST LINE reveals character instantly — shows who they ARE under pressure\n- Give protagonist a verbal signature: phrase, rhythm, habit of speech uniquely theirs\n- Establish power dynamic through speech patterns in first exchange\n- NEVER open with character explaining situation — open with them already in it\n${adj.extraOpeningRules}`
    : sceneRole === 'escalation'
    ? `ESCALATION SCENE ${sceneNumber}/${totalScenes}: Stakes higher than previous. Something must change. End with forward momentum.\n\nWORD BUDGET: Target 400–600 words. Do NOT exceed 600 words. When you hit 600 words, end the scene — cut to sharpest possible exit line.\n\nANTI-EXPOSITION: Reveal information through action and pressure, never narration.\nBAD: "NARRATOR: The files showed three missing truckers, all on Route 9."\nGOOD: "JAKE: Wait. They all ran Route 9. NARRATOR: His hands went cold on the wheel."\n${adj.extraEscalationRules}`
    : p.isSeries && !p.isFinale
    ? `FINAL SCENE — LAST SCENE OF THIS EPISODE.\n\nWORD BUDGET: Target 600–900 words. Do NOT exceed 900 words.\n\nSTRUCTURE IN THREE PARTS:\nPart 1 — CLIMAX (200–350 words): Episode conflict at its peak.\nPart 2 — TURN (150–250 words): Something changes irrevocably.\nPart 3 — CLIFFHANGER (100–200 words): Shocking revelation, immediate danger, or betrayal.\n\nCLIFFHANGER TO HIT: ${cliffhanger}\n\nMANDATORY: Complete all three parts. Final sentence ends with a period.\n${adj.extraFinaleRules}`
    : `FINAL SCENE — LAST SCENE.\n\nWORD BUDGET: Target 600–900 words. Do NOT exceed 900 words.\n\nSTRUCTURE IN THREE PARTS:\nPart 1 — CLIMAX (200–350 words): Central conflict at peak.\nPart 2 — RESOLUTION (150–250 words): Conflict resolves.\nPart 3 — CLOSING IMAGE (100–200 words): Final conclusive line.\n\nMANDATORY: Complete all three parts. Final sentence ends with a period.\n${adj.extraFinaleRules}`

  return `You are ${p.author}, writing one scene of a ${p.runtime} audio drama for Endless Tales.

VOICE: ${profile}
GENRE: ${p.genre} — Fast cuts. Every scene raises stakes. Threat felt in every exchange.
${voiceReminder}
${p.isSeries ? `SERIES: ${p.seriesName} | Episode ${p.episodeNumber}/${p.totalEpisodes} | ${p.episodeTitle}` : ''}

PREMISE: ${p.premise.split('CLIFFHANGER:')[0].trim()}

${prevContext}

WRITE SCENE ${sceneNumber} ONLY:
${roleInstruction}

RULES:
- No parentheticals in dialogue
- Every character sounds distinct under pressure
- Dialogue turns: 1-3 sentences maximum
- ${sceneNumber === 1 ? 'Open mid-action — NEVER "It was a quiet morning"' : 'Open with one narrator line re-anchoring: who, where, what changed'}
- Introduce NEW characters immediately with one specific detail

DIALOGUE ANTI-MECHANICAL:
- Characters NEVER explain the plot — they speak from self-interest, fear, or agenda
- Protagonist speaks in fragments under pressure — full sentences only when in control
- Antagonist speaks in complete sentences — control is their weapon
${adj.extraDialogueRules}
${weaknessWarning}

OUTPUT FORMAT:
[SCENE ${sceneNumber} — evocative title]
[complete scene content]

CRITICAL: Write every sentence completely. Never stop mid-sentence. Final line must be a complete sentence with a period.

Output ONLY this one scene. No preamble. No other scenes.`
}

async function generateSeriesPremise(episodeCount: number): Promise<{ seriesName: string; author: string; narrator: string; episodes: Array<{ episodeNumber: number; episodeTitle: string; hook: string; premise: string; cliffhanger: string }> } | null> {
  const eligible = THRILLER_AUTHORS.join(', ')
  const arcGuide = episodeCount === 3 ? 'Ep1: setup+hook, Ep2: escalation+midpoint turn, Ep3: cliffhanger finale' : 'Ep1: setup+hook, Ep2: escalation, Ep3: midpoint reversal, Ep4: darkest moment, Ep5: penultimate, Ep6: cliffhanger finale'
  const prompt = `Generate a complete ${episodeCount}-episode Thriller audio drama series for commuters and truckers.

Eligible authors: ${eligible}
Narrator pairings: Sara Keene→Cole Hargrove | Lena Holt→Clara Ashworth | Jack Malone→Ray Dolan
Series arc: ${arcGuide}

Requirements:
- Pick ONE author for the entire series
- Every non-finale episode ends on a hard cliffhanger
- Setting must resonate with truckers/commuters (highways, dispatch, CB radio, cargo, roadside America)
- Hook must grab in 10 seconds — specific, sensory, mid-action

Return ONLY valid JSON:
{"seriesName":"title","author":"author name","narrator":"narrator name","episodes":[{"episodeNumber":1,"episodeTitle":"title","hook":"first-sentence hook","premise":"3-4 sentences","cliffhanger":"one sentence (blank for finale)"}]}`

  const raw = await callClaude(prompt, 3000)
  try {
    const clean = raw.replace(/```json|```/g, '').trim()
    const start = clean.indexOf('{'); const end = clean.lastIndexOf('}')
    return JSON.parse(clean.slice(start, end + 1))
  } catch { return null }
}

async function generateEpisode(
  ep: { episodeNumber: number; episodeTitle: string; premise: string; cliffhanger: string },
  series: { seriesName: string; author: string; narrator: string; totalEpisodes: number },
  adj: PromptAdjustments
): Promise<string> {
  const isFinale = ep.episodeNumber === series.totalEpisodes
  const narrativeVoice = series.author === 'Sara Keene' || series.author === 'Jack Malone' ? 'first_person' : 'third_limited'
  const p = { author: series.author, genre: 'Thriller', runtime: '15 min', premise: ep.cliffhanger ? `${ep.premise}\n\nCLIFFHANGER: ${ep.cliffhanger}` : ep.premise, isSeries: true, seriesName: series.seriesName, episodeNumber: ep.episodeNumber, totalEpisodes: series.totalEpisodes, isFinale, episodeTitle: ep.episodeTitle, narrativeVoice }

  const sceneCount = 4
  const scenes: string[] = []
  for (let sceneNum = 1; sceneNum <= sceneCount; sceneNum++) {
    const sceneRole = sceneNum === 1 ? 'opening' : sceneNum === sceneCount ? 'finale' : 'escalation'
    const sceneTokens = sceneRole === 'finale' ? 12000 : sceneRole === 'escalation' ? 6000 : 4000
    const scenePrompt = buildScenePrompt(p, sceneNum, sceneCount, scenes.join('\n\n'), sceneRole, adj)
    const sceneText = await callClaude(scenePrompt, sceneTokens)
    scenes.push(sceneText)
  }
  const story = scenes.join('\n\n') + '\n\n[END OF STORY]'

  const audioPrompt = `You are the audio producer for Endless Tales. Add professional audio production elements WITHOUT changing any story content.

ADD: [SFX: specific description] minimum 10 throughout. DIALOGUE FORMAT: NARRATOR: text or CHARACTER NAME: text (ALL CAPS). [BEAT] at revelations. [MUSIC: description] at scene openings.
RULES: Do NOT change story content. Every scene opens with SFX. Never inline SFX with dialogue. Remove parentheticals.
GENRE: Thriller. OUTPUT: Complete production script. End with [END OF PRODUCTION SCRIPT].

STORY:
${story}`

  const production = await callClaude(audioPrompt, 16000)

  const outroInstruction = isFinale
    ? `BELLE B: [What the series meant in one sentence]. That was "${series.seriesName}" — an Endless Tales original series by ${series.author}.`
    : `Series episode outro — ONE Belle B line: (1) land episode emotional punch, (2) re-hook series premise, (3) name something SPECIFIC from next episode that makes stopping impossible.`

  const wrapPrompt = `You are the Endless Tales platform team. Wrap this produced audio drama.

ADD IN ORDER:
1. BELLE B INTRO\n---\nBELLE B: [one intro line — urgent, leaning forward — include [LISTENER_NAME] mid-sentence, story title in quotes, SPECIFIC VISCERAL detail, IMMEDIATE STAKES before title, never time-of-day]\n---
2. HEADER:\nSERIES: ${series.seriesName}\nEPISODE: ${ep.episodeNumber}\nEPISODE_TITLE: ${ep.episodeTitle}\nSERIES_TOTAL_EPISODES: ${series.totalEpisodes}\nSERIES_IS_FINALE: ${isFinale}\nAUTHOR: ${series.author}\nGENRE: Thriller\nDESCRIPTION: [24 words max]\nNARRATOR: ${series.narrator}\nANNOUNCER: Belle B\nNARRATIVE_VOICE: ${narrativeVoice}\nNARRATOR_IS_CHARACTER: false\nSUNO PROMPT: [2-3 sentences]
3. CHARACTER GUIDE\n---\n[NAME — age, gender, accent, personality]
4. ANNOUNCER: Endless Tales presents... ${series.seriesName}. Episode ${ep.episodeNumber}: ${ep.episodeTitle}. [hook sentence]
5. THE PRODUCTION SCRIPT (copy exactly)
6. ${outroInstruction}

Output ONLY the complete wrapped script. No preamble.

PRODUCTION SCRIPT:
${production}`

  return await callClaude(wrapPrompt, 8000)
}

async function gradeScript(script: string, author: string): Promise<{ score: number; truncated: boolean; topFixes: string[]; dimensions: Record<string, number> } | null> {
  const scriptSample = script.length > 6000 ? script.slice(0, 4000) + '\n\n[...middle omitted...]\n\n' + script.slice(-2000) : script
  const prompt = `Grade this Endless Tales audio drama for commuters/truckers. Brutally honest. Scores 1-10.

Weights: opening_hook 25%, overall_listenability 25%, dialogue_quality 20%, structure_and_pacing 15%, audio_suitability 15%.
composite_score = weighted average max 10. x2.5=/25.

VOICE CALIBRATION: Author ${author}
- First person (Sara Keene, Jack Malone): intimate voice IS the style. Judge listenability on whether it grips a distracted driver.
- Third limited (Lena Holt): judge on clarity of external action.

TRUNCATION: If script ends mid-sentence, mid-word, or without complete Belle B outro, set truncated=true and give structure_and_pacing 5 or below.

Return ONLY valid JSON:
{"opening_hook":{"score":0,"feedback":""},"overall_listenability":{"score":0,"feedback":""},"dialogue_quality":{"score":0,"feedback":""},"structure_and_pacing":{"score":0,"feedback":""},"audio_suitability":{"score":0,"feedback":""},"policy_compliance":{"pass":true,"feedback":""},"composite_score":0,"recommendation":"Proceed","top_fixes":[],"evaluator_summary":"","truncated":false}

SCRIPT:
${scriptSample}`

  try {
    const raw = await callClaude(prompt, 1500)
    const clean = raw.replace(/```json|```/g, '').trim()
    const parsed = JSON.parse(clean)
    return {
      score: Math.round(parsed.composite_score * 2.5 * 10) / 10,
      truncated: parsed.truncated || false,
      topFixes: parsed.top_fixes || [],
      dimensions: { hook: parsed.opening_hook?.score || 0, listenability: parsed.overall_listenability?.score || 0, dialogue: parsed.dialogue_quality?.score || 0, pacing: parsed.structure_and_pacing?.score || 0, audio: parsed.audio_suitability?.score || 0 },
    }
  } catch { return null }
}

async function analyzePatterns(recentFailures: RunResult[], adj: PromptAdjustments): Promise<PromptAdjustments> {
  if (recentFailures.length < 5) return adj
  const fixCounts: Record<string, number> = {}
  for (const run of recentFailures) {
    for (const ep of run.episodes) {
      if (!ep.passed) {
        for (const fix of ep.topFixes) {
          const key = fix.toLowerCase().slice(0, 60)
          fixCounts[key] = (fixCounts[key] || 0) + 1
        }
      }
    }
  }
  const threshold = recentFailures.length * 0.4
  const dominantFixes = Object.entries(fixCounts).filter(([, c]) => c >= threshold).sort(([, a], [, b]) => b - a).map(([f]) => f)
  if (dominantFixes.length === 0) return adj

  const prompt = `You are improving AI story generation prompts. These fixes appear in ${Math.round(threshold)}+ of ${recentFailures.length} recent failing Thriller episodes:
${dominantFixes.map((f, i) => `${i + 1}. "${f}"`).join('\n')}

Generate targeted prompt additions to fix these patterns. Return ONLY valid JSON:
{"extraOpeningRules":"additional opening rules (empty string if none)","extraEscalationRules":"additional escalation rules (empty string if none)","extraFinaleRules":"additional finale rules (empty string if none)","extraDialogueRules":"additional dialogue rules (empty string if none)","newWeaknesses":["specific weakness to warn about"]}`

  try {
    const raw = await callClaude(prompt, 800)
    const clean = raw.replace(/```json|```/g, '').trim()
    const parsed = JSON.parse(clean)
    return {
      extraOpeningRules: parsed.extraOpeningRules || adj.extraOpeningRules,
      extraEscalationRules: parsed.extraEscalationRules || adj.extraEscalationRules,
      extraFinaleRules: parsed.extraFinaleRules || adj.extraFinaleRules,
      extraDialogueRules: parsed.extraDialogueRules || adj.extraDialogueRules,
      knownWeaknesses: [...adj.knownWeaknesses, ...(parsed.newWeaknesses || [])].slice(-10),
    }
  } catch { return adj }
}

async function log(data: Record<string, unknown>) {
  await supabase.from('qa_loop_runs').insert({ ...data, created_at: new Date().toISOString() }).catch(() => {})
}

async function runQALoop() {
  let consecutivePasses = 0
  let runNumber = 0
  const allResults: RunResult[] = []
  let adj: PromptAdjustments = { extraOpeningRules: '', extraEscalationRules: '', extraFinaleRules: '', extraDialogueRules: '', knownWeaknesses: [] }

  await log({ run_number: 0, status: 'started', message: `QA loop started. Target: ${TARGET_CONSECUTIVE} consecutive at ${TARGET_SCORE}+. Max: ${MAX_RUNS} runs.` })

  while (runNumber < MAX_RUNS && consecutivePasses < TARGET_CONSECUTIVE) {
    runNumber++
    await log({ run_number: runNumber, status: 'generating', consecutive_passes: consecutivePasses, message: `Run ${runNumber}/${MAX_RUNS} — ${consecutivePasses}/${TARGET_CONSECUTIVE} consecutive passes` })

    const series = await generateSeriesPremise(3)
    if (!series) { await log({ run_number: runNumber, status: 'error', message: 'Failed to generate series premise' }); continue }

    const episodeResults: EpisodeResult[] = []
    let runPassed = true

    for (const ep of series.episodes) {
      await log({ run_number: runNumber, status: 'writing', consecutive_passes: consecutivePasses, series_name: series.seriesName, author: series.author, episode_number: ep.episodeNumber, message: `Run ${runNumber}: writing "${series.seriesName}" E${ep.episodeNumber} — ${series.author}` })

      const script = await generateEpisode(ep, series, adj)
      const grade = await gradeScript(script, series.author)

      if (!grade) {
        episodeResults.push({ episodeNumber: ep.episodeNumber, episodeTitle: ep.episodeTitle, score: 0, truncated: true, topFixes: ['Grading failed'], dimensions: {}, passed: false })
        runPassed = false
        continue
      }

      const passed = grade.score >= TARGET_SCORE && !grade.truncated
      if (!passed) runPassed = false
      episodeResults.push({ episodeNumber: ep.episodeNumber, episodeTitle: ep.episodeTitle, score: grade.score, truncated: grade.truncated, topFixes: grade.topFixes, dimensions: grade.dimensions, passed })

      await log({ run_number: runNumber, status: passed ? 'pass' : 'fail', consecutive_passes: consecutivePasses, series_name: series.seriesName, author: series.author, episode_number: ep.episodeNumber, episode_title: ep.episodeTitle, score: grade.score, truncated: grade.truncated, top_fixes: grade.topFixes, dimensions: grade.dimensions, message: `E${ep.episodeNumber}: ${grade.score}/25 ${passed ? '✓' : '✗'}${grade.truncated ? ' TRUNCATED' : ''}` })
    }

    const runResult: RunResult = { runNumber, seriesName: series.seriesName, author: series.author, episodes: episodeResults, allPassed: runPassed, lowestScore: Math.min(...episodeResults.map(e => e.score)) }
    allResults.push(runResult)

    if (runPassed) {
      consecutivePasses++
      await log({ run_number: runNumber, status: 'run_passed', consecutive_passes: consecutivePasses, series_name: series.seriesName, author: series.author, message: `✓ Run ${runNumber} PASSED — ${consecutivePasses}/${TARGET_CONSECUTIVE} consecutive. Lowest: ${runResult.lowestScore}/25` })
    } else {
      consecutivePasses = 0
      await log({ run_number: runNumber, status: 'run_failed', consecutive_passes: 0, series_name: series.seriesName, author: series.author, message: `✗ Run ${runNumber} FAILED — streak reset. Lowest: ${runResult.lowestScore}/25` })
    }

    // Phase 2: After 10 failures, apply pattern-based fixes every 5 runs
    const recentFailures = allResults.filter(r => !r.allPassed).slice(-15)
    if (recentFailures.length >= 10 && runNumber % 5 === 0) {
      await log({ run_number: runNumber, status: 'analyzing', message: `Analyzing ${recentFailures.length} recent failures for patterns...` })
      adj = await analyzePatterns(recentFailures, adj)
      await log({ run_number: runNumber, status: 'adjusted', message: `Prompt adjustments applied. Known weaknesses: ${adj.knownWeaknesses.length}` })
    }
  }

  const success = consecutivePasses >= TARGET_CONSECUTIVE
  await log({ run_number: runNumber, status: success ? 'SUCCESS' : 'MAX_RUNS_REACHED', consecutive_passes: consecutivePasses, adjustments_applied: JSON.stringify(adj), message: success ? `🎉 SUCCESS after ${runNumber} runs! ${TARGET_CONSECUTIVE} consecutive episodes all ${TARGET_SCORE}+` : `Stopped after ${MAX_RUNS} runs. Best streak: ${consecutivePasses}/${TARGET_CONSECUTIVE}` })
}

export async function POST(request: NextRequest) {
  runQALoop().catch(console.error)
  return NextResponse.json({ status: 'started', message: `QA loop started. Target: ${TARGET_CONSECUTIVE} consecutive at ${TARGET_SCORE}+/25. Max: ${MAX_RUNS} runs. Monitor in Supabase qa_loop_runs table.` })
}

export async function GET() {
  const { data: recent } = await supabase.from('qa_loop_runs').select('*').order('created_at', { ascending: false }).limit(20)
  const latest = recent?.[0]
  return NextResponse.json({ status: latest?.status || 'not_started', consecutivePasses: latest?.consecutive_passes || 0, runNumber: latest?.run_number || 0, message: latest?.message || 'No runs yet', recentRuns: recent || [] })
}
