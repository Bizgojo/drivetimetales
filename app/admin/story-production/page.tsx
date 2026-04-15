'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

type StoryStatus = 'generating' | 'ready' | 'approved' | 'rejected'
type AIScore = {
  opening_hook: { score: number; feedback: string }
  overall_listenability: { score: number; feedback: string }
  dialogue_quality: { score: number; feedback: string }
  story_clarity: { score: number; feedback: string }
  ending_resolution: { score: number; feedback: string }
  structure_and_pacing: { score: number; feedback: string }
  audio_suitability: { score: number; feedback: string }
  policy_compliance: { pass: boolean; feedback: string }
  composite_score: number
  recommendation: string
  top_fixes: string[]
  evaluator_summary: string
}
type Story = {
  id: string; title: string; author: string; narrator: string
  genre: string; runtime: string; status: StoryStatus
  script: string; ai_score: AIScore | null; created_at: string; notes: string
}
type Author = {
  id: string; name: string; primary_genre: string; secondary_genre: string
  tone: string; narrative_voice: string; narrator_id: string
}
type Narrator = { id: string; name: string; elevenlabs_voice_id: string }
type PremiseOption = {
  id: string; title: string; hook: string; premise: string
  author: string; narrator: string; genre: string; runtime: string
  seriesNote: string; scoringNote: string; queued: boolean
}
type SeriesEpisode = {
  id: string; episodeNumber: number; episodeTitle: string
  hook: string; premise: string; cliffhanger: string
  queued: boolean
}
type SeriesPlan = {
  seriesName: string; seriesLogline: string; author: string; narrator: string
  genre: string; runtime: string; episodes: SeriesEpisode[]
}
type QueuedPremise = {
  id: string; title: string; genre: string; runtime: string
  author: string; narrator: string; premise: string
  requirements: string; status: 'waiting' | 'generating' | 'done'
  isSeries: boolean; seriesName: string; episodeNumber: number
  totalEpisodes: number; isFinale: boolean
}

const GENRES = ['Thriller','Horror','Dark Mystery','Mystery/Crime','Adventure','Drama','Sci-Fi','Western','Historical Drama','Supernatural','Family/Heartwarming','Comedy','Romance']
const RUNTIMES = ['10 min','15 min','20 min','25 min']
const EPISODE_COUNTS = [3,4,5,6,7,8]

function scoreColor(score: number, max: number) {
  const p = score / max
  if (p >= 0.88) return '#2e7d32'
  if (p >= 0.72) return '#e65100'
  return '#c62828'
}

const STATUS_CONFIG: Record<StoryStatus, { bg: string; color: string; label: string }> = {
  generating: { bg: '#e8f5e9', color: '#2e7d32', label: 'Generating...' },
  ready:      { bg: '#e8eaf6', color: '#3949ab', label: 'Ready for Review' },
  approved:   { bg: '#e0f2f1', color: '#00695c', label: 'Approved' },
  rejected:   { bg: '#ffebee', color: '#c62828', label: 'Rejected' },
}

const AUTHOR_PROFILES: Record<string, string> = {
  // THRILLER
  'Sara Keene': 'Write in the style of Gillian Flynn. First person. Unreliable narrator who reveals the twist through what she chooses not to tell you. Psychological tension built through intimacy, not action. The protagonist is always part of the problem. Every story ends with a revelation that reframes everything. The ending must shock.',
  'Lena Holt': 'Write in the style of John Grisham. Third person limited. Institutional thriller — law firms, hospitals, government. The protagonist uncovers corruption through documents, conversations, and one key witness. Build the case piece by piece. The ending must deliver justice or its deliberate absence.',
  'Jack Malone': 'Write in the style of Lee Child. First person. Lone protagonist walks into trouble, sizes up the situation, and handles it. Short declarative sentences. The hero is always the most competent person in the room. The ending must resolve the threat completely.',
  // MYSTERY
  'Julian Mercer': 'Write in the style of Michael Connelly. Third person limited. Procedural detective fiction. Concrete clues, real police work, a detective who notices what others miss. The case MUST be solved by the final scene. Every clue planted earlier must pay off. The ending must name the killer and explain how.',
  'Caroline Drake': 'Write in the style of Tana French. Third person limited. Atmospheric, literary mystery. The setting is as important as the crime. Female protagonists. The mystery resolves but leaves an emotional wound. The ending must answer WHO and WHY.',
  'Iris Pemberton': 'Write in the style of Agatha Christie. Third person limited. Classic whodunit structure — suspects, clues, red herrings, drawing-room reveal. The detective gathers everyone and explains the solution. The ending must unmask the killer with logical proof.',
  // HORROR
  'Silas Graves': 'Write in the style of Stephen King. First person. Working-class protagonists in extraordinary situations. The horror is real and must be confronted, not escaped. Build dread through specific mundane details that turn wrong. The ending must face the horror directly — no ambiguity about what happened.',
  'Elias Thorn': 'Write in the style of Shirley Jackson. First person. Slow atmospheric dread. Rural settings, folklore, nature as threat. The horror creeps in through what the narrator refuses to acknowledge. The ending must deliver the moment the narrator can no longer deny what is happening.',
  'Vera Moss': 'Write in the style of Paul Tremblay. First person. Claustrophobic urban horror. Apartment buildings, neighbors, mundane settings. Dread builds from small wrong details accumulating. The ending must confront the source of the horror.',
  // SCI-FI
  'Nina Vasquez': 'Write in the style of Ted Chiang. Third person omniscient. Precise, philosophical science fiction. One scientific concept explored through human consequences. The protagonist faces an ethical choice forced by the science. The ending must resolve the ethical dilemma with a clear decision.',
  'Dr. Kai Osei': 'Write in the style of Andy Weir. Third person omniscient. Problem-solving science fiction. The protagonist uses real science to survive or solve a crisis. Technical details that a listener can follow. The ending must solve the problem through ingenuity.',
  'Zara Storm': 'Write in the style of Becky Chambers. Third person omniscient. Character-driven space fiction. Diverse ensemble cast. The real story is about relationships and identity, set against a sci-fi backdrop. The ending must resolve the human conflict, not just the plot.',
  // COMEDY
  'Archie Vale': 'Write in the style of Bill Bryson. Third person omniscient. Warm observational humor. Ordinary situations that escalate with perfect internal logic. The comedy comes from the gap between how seriously the characters take themselves and how absurd their situation actually is. The ending must resolve the absurdity.',
  'Maeve Kelly': "Write in the style of Marian Keyes. Third person omniscient. Warm, chaotic family comedy. Large ensemble, everyone talking at once. The disaster is always the protagonist's fault. The humor is generous, never cruel. The ending must be love and forgiveness.",
  'Rex Bright': 'Write in the style of Carl Hiaasen. Third person omniscient. Dark satirical comedy. A real crisis treated with bureaucratic absurdity. Colorful villains who are too stupid to be scary. The protagonist stumbles into justice. The ending must deliver comeuppance to the villain in an unexpected way.',
  // ROMANCE
  'Claire Ashford': 'Write in the style of Emily Henry. Third person limited. Sharp, witty contemporary romance. Two competent people who are terrible at admitting feelings. Professional settings. Banter that reveals vulnerability. The ending must deliver the declaration — no ambiguity about whether they end up together.',
  'Edmund Worth': 'Write in the style of Jane Austen. Third person limited. Period romance with social commentary. Desire expressed through restraint. Class and propriety as obstacles. Wit as courtship. The ending must deliver the union the reader has been waiting for.',
  'Dani Reeves': 'Write in the style of Sandra Brown. Third person limited. Romantic suspense — the danger and the attraction accelerate together. Female protagonist in genuine physical danger. The love interest is complicated but ultimately trustworthy. The ending must resolve both the threat and the romance.',
  // DRAMA / WESTERN / ADVENTURE
  'Daniel Wren': 'Write in the style of Richard Russo. Third person omniscient. Small-town ensemble drama. Blue-collar characters with big hearts. Humor and heartbreak in equal measure. The ending must deliver a moment of grace or redemption.',
  'Mark Holbrook': 'Write in the style of Dennis Lehane. Third person limited. Cinematic, morally complex. Male protagonists forced to choose between bad options. Urban settings with grit. The ending must force the protagonist to live with the consequences of their choice.',
  'Dale Harmon': 'Write in the style of Craig Johnson. Third person limited. Warm, grounded western with heart. A lawman protagonist who cares about his community. Humor mixed with danger. The ending must restore order and affirm the protagonist\'s values.',
  'Marc Hobelman': 'Write in the style of Larry McMurtry. Third person limited. Spare, weathered frontier fiction. Lone protagonists, vast landscapes, moral gray zones. Sentences are short. The ending must settle the score — quietly, definitively.',
}

const NARRATOR_MAP: Record<string, string> = {
  'Marc Hobelman': 'Ray Dolan', 'Sara Keene': 'Cole Hargrove', 'Elias Thorn': 'Cole Hargrove',
  'Dale Harmon': 'Finn Calloway', 'Julian Mercer': 'Iris Calloway', 'Daniel Wren': 'Elliott Crane',
  'Mark Holbrook': 'Morgan Veil', 'Silas Graves': 'Cole Hargrove', 'Nina Vasquez': 'Marcus Hale',
  'Caroline Drake': 'Iris Calloway',
}

const GENRE_AUTHOR_MAP: Record<string, string[]> = {
  'Thriller': ['Sara Keene','Lena Holt','Jack Malone'],  // Holbrook removed — verbose style causes truncation at 15min
  'Horror': ['Silas Graves','Elias Thorn','Vera Moss'],
  'Dark Mystery': ['Elias Thorn','Julian Mercer','Vera Moss'],
  'Mystery/Crime': ['Julian Mercer','Caroline Drake','Iris Pemberton'],
  'Adventure': ['Dale Harmon','Mark Holbrook','Zara Storm'],
  'Drama': ['Daniel Wren','Mark Holbrook','Maeve Kelly'],
  'Sci-Fi': ['Nina Vasquez','Dr. Kai Osei','Zara Storm'],
  'Western': ['Marc Hobelman'],
  'Historical Drama': ['Caroline Drake','Iris Pemberton','Edmund Worth'],
  'Supernatural': ['Silas Graves','Sara Keene','Vera Moss'],
  'Family/Heartwarming': ['Daniel Wren','Maeve Kelly','Archie Vale'],
  'Comedy': ['Archie Vale','Maeve Kelly','Rex Bright'],
  'Romance': ['Claire Ashford','Edmund Worth','Dani Reeves'],
}

const AUTHOR_STYLE_MAP: Record<string, string> = {
  'Sara Keene':'Gillian Flynn','Lena Holt':'John Grisham','Jack Malone':'Lee Child',
  'Julian Mercer':'Michael Connelly','Caroline Drake':'Tana French','Iris Pemberton':'Agatha Christie',
  'Silas Graves':'Stephen King','Elias Thorn':'Shirley Jackson','Vera Moss':'Paul Tremblay',
  'Nina Vasquez':'Ted Chiang','Dr. Kai Osei':'Andy Weir','Zara Storm':'Becky Chambers',
  'Archie Vale':'Bill Bryson','Maeve Kelly':'Marian Keyes','Rex Bright':'Carl Hiaasen',
  'Claire Ashford':'Emily Henry','Edmund Worth':'Jane Austen','Dani Reeves':'Sandra Brown',
  'Daniel Wren':'Richard Russo','Mark Holbrook':'Dennis Lehane','Dale Harmon':'Craig Johnson',
  'Marc Hobelman':'Larry McMurtry',
}

// THREE-CALL PIPELINE
type PipelineParams = {
  author: string; authorTone: string; authorVoice: string; genre: string
  runtime: string; narrator: string; premise: string; requirements: string
  isSeries: boolean; seriesName: string; episodeNumber: number
  totalEpisodes: number; isFinale: boolean; episodeTitle: string
}

function genrePacingRules(genre: string): string {
  const rules: Record<string, string> = {
    'Thriller': 'Fast cuts. Every scene raises stakes. Threat felt in every exchange. No wasted moments.',
    'Horror': 'Slow dread building to sudden violence. Silence as important as sound. Nature and setting are antagonists.',
    'Mystery/Crime': 'Every detail is a clue or misdirect. Revelation comes from evidence not coincidence.',
    'Dark Mystery': 'Atmosphere is everything. Wrongness builds slowly. The answer is worse than the question.',
    'Western': 'Landscape drives pacing. Violence sudden and final. Dialogue spare — men say half of what they mean.',
    'Adventure': 'Forward momentum always. Physical stakes clear and immediate. Hero competent under pressure.',
    'Drama': 'Character change is the plot. What people say and mean are different. Small moments carry large weight.',
    'Sci-Fi': 'World-building serves the human story. Science is real, consequences emotional.',
    'Supernatural': 'Rational explanation fails first. Supernatural is matter-of-fact, not theatrical. Terror is quiet.',
    'Historical Drama': 'Period detail grounds the story. Social constraints create dramatic tension.',
    'Family/Heartwarming': 'Conflict is internal or relational, never violent. Resolution earns its warmth.',
    'Comedy': 'Comic timing is everything. Escalation through misunderstanding.',
  }
  return rules[genre] || 'Serve the story. Every scene moves something forward.'
}

function buildScenePrompt(p: PipelineParams, sceneNumber: number, totalScenes: number, previousScenes: string, sceneRole: string): string {
  const profile = AUTHOR_PROFILES[p.author] || `${p.authorVoice} voice. ${p.authorTone}.`
  const narrativeVoice = p.authorVoice || 'third_limited'
  const cliffhanger = p.isSeries && p.premise.includes('CLIFFHANGER:') ? p.premise.split('CLIFFHANGER:')[1].trim() : 'Create a powerful cliffhanger that makes stopping feel impossible'

  const runtimeMins = parseInt(p.runtime) || 15
  const totalTargetWords = runtimeMins * 130
  const openingBudgetLow = Math.round(totalTargetWords * 0.15)
  const openingBudgetHigh = Math.round(totalTargetWords * 0.20)
  const escalationBudgetLow = Math.round(totalTargetWords * 0.18)
  const escalationBudgetHigh = Math.round(totalTargetWords * 0.25)
  const finaleBudgetLow = Math.round(totalTargetWords * 0.22)
  const finaleBudgetHigh = Math.round(totalTargetWords * 0.30)

  const roleInstruction = sceneRole === 'opening'
    ? `OPENING SCENE: Begin mid-action — something already happening. Establish the protagonist with one specific detail. Create a dramatic question the listener MUST have answered. End at a point of tension that pulls forward.

WORD BUDGET: Target ${openingBudgetLow}–${openingBudgetHigh} words for this scene (${p.runtime} episode = ~${totalTargetWords} total spoken words). Hook fast, end sharp — but hit the word count.

OPENING SCENE DIALOGUE RULES — the difference between 7/10 and 9/10:
- The protagonist's FIRST LINE of dialogue must reveal character instantly — not just react to the situation, but show who they ARE under pressure
- Give the protagonist a verbal signature in scene 1 that carries through the story: a phrase, a rhythm, a habit of speech that is uniquely theirs
- The first exchange between any two characters must establish their power dynamic through speech patterns alone — who is in control, who is afraid, who is hiding something
- NEVER open with a character explaining their situation — open with them already in it, already speaking from it
- Example of weak opening dialogue: "What's going on? Something feels wrong." — generic, could be anyone
- Example of strong opening dialogue: "Mile marker 247. That's where I always lose the signal." — specific, reveals character, creates place`
    : sceneRole === 'escalation'
    ? `ESCALATION SCENE ${sceneNumber}/${totalScenes}: Stakes must be higher than previous scene. Something must change — a revelation, complication, or new threat. Listener understanding should shift. End with forward momentum.

WORD BUDGET: Target ${escalationBudgetLow}–${escalationBudgetHigh} words for this scene (${p.runtime} episode = ~${totalTargetWords} total spoken words). When you hit the upper limit, end on the sharpest possible exit line.

ESCALATION ANTI-EXPOSITION RULE: If you need to reveal information (a pattern, a clue, a backstory), reveal it through:
- A character discovering it under pressure, not narrating it calmly
- A confrontation that forces the truth out
- A physical object or event that makes it undeniable
NEVER have the narrator list facts, dates, or patterns. Show the discovery, not the data.
BAD: "NARRATOR: The files showed three missing truckers, all on Route 9, all in October." — this is data, not drama
GOOD: "JAKE: Wait. Miller. Conroy. Basset. They all ran Route 9. They all disappeared in October. NARRATOR: His hands went cold on the wheel." — same information, discovered under pressure`
    : p.isSeries && !p.isFinale
    ? `FINAL SCENE — THIS IS THE LAST SCENE OF THE EPISODE.

WORD BUDGET: Target ${finaleBudgetLow}–${finaleBudgetHigh} words for this scene (${p.runtime} episode = ~${totalTargetWords} total spoken words). Stay tight — every line earns its place.

STRUCTURE THIS SCENE IN THREE PARTS:
Part 1 — CLIMAX (200–350 words): The central conflict of this episode reaches its peak. The protagonist faces the most intense moment yet.
Part 2 — TURN (150–250 words): Something changes irrevocably. A revelation, a decision, an action that cannot be undone.
Part 3 — CLIFFHANGER ENDING (100–200 words): Land on one of these:
  (a) A shocking revelation delivered in the final line of dialogue or narration — reframes everything the listener just heard
  (b) The protagonist in immediate physical or emotional danger with zero resolution — leave them hanging
  (c) A betrayal revealed in the final moment — destroys the listener's assumptions about who to trust

CLIFFHANGER TO HIT: ${cliffhanger}

MANDATORY: Complete all three parts within the word budget. The final sentence must be a complete sentence with a period. The final line must land with impact — it is the last thing the listener hears before silence.`
    : p.isSeries && p.isFinale
    ? `FINAL SCENE — THIS IS THE SERIES FINALE.

WORD BUDGET: Target ${finaleBudgetLow}–${finaleBudgetHigh} words for this scene (${p.runtime} episode = ~${totalTargetWords} total spoken words). Stay tight — every line earns its place.

STRUCTURE THIS SCENE IN THREE PARTS:
Part 1 — FINAL CONFRONTATION (200–350 words): Every story thread converges. The protagonist faces the ultimate version of the central conflict.
Part 2 — RESOLUTION (150–250 words): The conflict is resolved. The protagonist reaches a clear outcome — earned through everything that came before.
Part 3 — LANDING (100–200 words): One final narrator line or moment that makes the listener feel the whole series was worth it. Resonant. Complete. No loose threads.

MANDATORY: Complete all three parts within the word budget. This is the end of the series — give it the weight it deserves. The final sentence must be a complete sentence with a period.`
    : `FINAL SCENE — THIS IS THE LAST SCENE.

WORD BUDGET: Target ${finaleBudgetLow}–${finaleBudgetHigh} words for this scene (${p.runtime} episode = ~${totalTargetWords} total spoken words). Stay tight — every line earns its place.

STRUCTURE THIS SCENE IN THREE PARTS:
Part 1 — CLIMAX (200–350 words): The central conflict reaches its peak. Maximum tension.
Part 2 — RESOLUTION (150–250 words): The conflict resolves. The protagonist reaches a clear outcome.
Part 3 — CLOSING IMAGE (100–200 words): One final line — narrator or dialogue — that feels conclusive. The listener must know the story is over.

MANDATORY: Complete all three parts within the word budget. The final sentence must be a complete sentence with a period. The final line is the most important line in the entire script.`

  const voiceReminder = narrativeVoice === 'first_person'
    ? 'MAINTAIN FIRST PERSON — every narration line uses I, me, my.'
    : narrativeVoice === 'third_omniscient'
    ? 'MAINTAIN THIRD OMNISCIENT — narrator knows all, can move between characters.'
    : 'MAINTAIN THIRD LIMITED — follow protagonist closely, narrator shows their thoughts and feelings.'

  const contextLength = sceneRole === 'finale' ? 2500 : 2000
  const prevContext = previousScenes
    ? `STORY SO FAR — continue seamlessly:
${previousScenes.slice(-contextLength)}`
    : ''

  return `You are ${p.author}, writing a scene of a ${p.runtime} audio drama.

VOICE: ${profile}
GENRE: ${p.genre}
${voiceReminder}
${p.isSeries ? `SERIES: ${p.seriesName} | Episode ${p.episodeNumber}/${p.totalEpisodes} | ${p.episodeTitle}` : ''}

PREMISE: ${p.premise.split('CLIFFHANGER:')[0].trim()}
${p.requirements ? `REQUIREMENTS: ${p.requirements}` : ''}

${prevContext}

WRITE SCENE ${sceneNumber} OF ${totalScenes}:
${roleInstruction}

SETTING: Stories are American stories set in real, specific American locations — metro areas, rural towns, tourist destinations, manufacturing cities, tech hubs, coastal villages, mountain communities, desert highways. Use real place names and landmarks. Characters can travel abroad but the story is American at its core. Vary locations across stories.

READING LEVEL: Write at a 10th grade level. Clear, direct prose. Short sentences. No literary flourishes that a listener would need to re-hear to understand. The story should be immediately graspable by anyone paying partial attention while driving.

THIS IS AN AUDIO DRAMA — listeners cannot see who is speaking. The narrator must make it clear who is talking, where we are, and what is happening at all times. When a new character speaks, the narrator introduces them first. When the setting changes, the narrator describes the new location.

FORMAT:
- NARRATOR: [narration and scene-setting]
- CHARACTER NAME: [dialogue — ALL CAPS names]
- [BEAT] for dramatic pauses between speakers

Keep each character's voice distinct — different speech patterns, different rhythms, different concerns. The listener should be able to tell who is speaking from how they talk, not just what the narrator says.

Write the scene completely. End with a complete sentence.
Output ONLY this one scene. No preamble.`
}

function buildStoryPrompt(p: PipelineParams): string {
  // Legacy fallback — scene-by-scene used in pipeline
  const profile = AUTHOR_PROFILES[p.author] || `${p.authorVoice} voice. ${p.authorTone}.`
  const runtimeMins = parseInt(p.runtime) || 15
  const sceneCount = runtimeMins <= 10 ? 3 : runtimeMins <= 15 ? 4 : runtimeMins <= 20 ? 5 : 6
  return `You are ${p.author}. Write a ${p.runtime} audio drama. VOICE: ${profile}. GENRE: ${p.genre}. PREMISE: ${p.premise}. Write ${sceneCount} scenes labeled [SCENE N — title]. End with [END OF STORY].`
}


function buildAudioPrompt(story: string, p: PipelineParams): string {
  return `You are the audio producer for Endless Tales. Format this story for audio production WITHOUT changing any story content or wording.

FORMAT THE SCRIPT:
1. DIALOGUE FORMAT — ensure all speech uses: NARRATOR: text or CHARACTER NAME: text (ALL CAPS names)
2. Add [BEAT] between speaker changes for natural pauses
3. Remove any parentheticals like (quietly) or (sharply)

RULES:
- Do NOT change any story content, dialogue wording, or structure
- Do NOT add SFX — stories are voice-only with background music
- Do NOT add [MUSIC:] cues — music is handled separately
- Do NOT add or remove scenes or characters

OUTPUT: Complete production script. End with [END OF PRODUCTION SCRIPT].

STORY TO PRODUCE:
${story}`
}

function buildWrapperPrompt(productionScript: string, p: PipelineParams): string {
  const belleRegister: Record<string, string> = {
    'Thriller': 'urgent, leaning forward — this one does not stop',
    'Horror': 'quietly conspiratorial, a hint of relish — this one gets into you',
    'Mystery/Crime': 'intrigued, slightly teasing',
    'Dark Mystery': 'low and deliberate — you wanted something that stays with you',
    'Western': 'understated, spare — wide country. No easy answers.',
    'Adventure': 'energized, forward-moving',
    'Drama': 'warm, careful — this one is going to stay with you',
    'Sci-Fi': 'curious, slightly awed',
    'Supernatural': 'conspiratorial, relishing — this one starts quiet. It will not stay that way.',
    'Historical Drama': 'measured, inviting — this one goes back a ways. Worth the trip.',
    'Family/Heartwarming': 'warm, genuine',
    'Comedy': 'warm, conspiratorial',
  }
  const register = belleRegister[p.genre] || 'warm and direct'
  const outroInstruction = p.isSeries && !p.isFinale
    ? `ONE Belle B outro line — she is a warm friend who just experienced this with the listener. THREE beats in one or two sentences: (1) name ONE specific emotional moment from THIS episode that will stay with the listener — something visceral and real, not generic, (2) STRENGTHEN the cliffhanger — make the listener desperate to hear the next episode by hinting at what hangs unresolved without spoiling it, (3) warm personal sign-off as a friend. Never sound like a radio announcer. Never say "tune in next time." BELLE B: [Specific emotional beat from this episode]. [Cliffhanger strengthener that makes stopping feel impossible]. [Warm friend sign-off].`
    : `ONE Belle B outro line — she is a warm friend who just shared this story with the listener. For a FINALE or STANDALONE: (1) land on the ONE image or moment from this story that captures everything it meant — the most resonant specific detail, not a summary, (2) give the listener a moment of quiet satisfaction — acknowledge what they just felt without explaining it, (3) sign off warmly as a friend, crediting the author. This should feel like a friend saying "wasn't that something" — not a radio sign-off. BELLE B: [The resonant specific moment]. [Quiet satisfaction beat]. That was "[Story Title]" by ${p.author} — an Endless Tales original.`

  return `You are the Endless Tales platform team. Wrap this produced audio drama with platform elements.

Belle B is the warm, personal voice of Endless Tales. She sounds like a trusted friend who loves stories — never a radio announcer, never corporate. She speaks directly to the listener as if they are sitting together.

BELLE B SPEECH RULES — CRITICAL:
- Write in SHORT punchy sentences. Max 2 sentences total. Never one long sentence with multiple clauses.
- Write the way a real person TALKS, not the way someone reads an announcement.
- No formal constructions. No "in [Story Title]" at the end. No dependent clauses chained together.
- Each sentence must have natural breathing room — EL reads long clauses slowly and mechanically.
- GOOD: "This one's been on my mind. A dead husband just wrote something in his logbook — three days from now."
- GOOD: "She catalogs the dead for a living — until her dead husband starts writing back."
- BAD: "Hi! Maren is an archivist who catalogs the dead for a living..."
- TONE RULE: Belle speaks like she and the listener have already shared many stories together. Never a first-meeting greeting. Never "Hi" or "Hello". She picks up mid-friendship — warm, casual, assuming familiarity.
- HARD RULE: Never write [LISTENER_NAME] or any name placeholder anywhere in the script. Belle never addresses the listener by name.
- Belle recommends the story the way a trusted friend would — not an announcer, not a host. She assumes the listener trusts her taste.

ADD IN EXACT ORDER:

1. BELLE B INTRO BLOCK (first):
BELLE B INTRO
---
BELLE B: [one intro line — register: ${register}]
---

Belle B intro rules — this is the most important line in the script:
- Belle B is a warm friend talking directly to the listener — never a radio announcer, never formal
- The listener must understand WHO the story is about, WHAT situation they are in, and WHY it matters — before the title lands
- Give enough context that someone starting cold is not confused when the story begins
- HARD RULE: Never write [LISTENER_NAME] or any placeholder. Belle never uses the listener's name
- Include the story title in quotes at the end of the line
- Reference something SPECIFIC from THIS story — a character name, a place, an object, a tension
- Never time-of-day. Never "welcome back." Never "Endless Tales presents." Never genre labels
- One or two sentences maximum — warm, intimate, conversational
- BAD: "A mystery unfolds in 'The Signal.'" — no context, listener has no idea who or what
- BAD: "Endless Tales presents 'The Signal.'" — cold, formal, not Belle B
- GOOD: "Jake's CB radio has been silent for six years — so when a voice comes through at 2am calling his name, he has no idea what to do, in 'The Signal.'" — listener knows who, what, why

2. HEADER BLOCK:
${p.isSeries ? `SERIES: ${p.seriesName}
EPISODE: ${p.episodeNumber}
EPISODE_TITLE: ${p.episodeTitle}
SERIES_TOTAL_EPISODES: ${p.totalEpisodes}
SERIES_IS_FINALE: ${p.isFinale}` : 'TYPE: standalone'}
AUTHOR: ${p.author}
GENRE: ${p.genre}
DESCRIPTION: [24 words max — punchy present-tense hook, no spoilers, makes a listener press play]
NARRATOR: ${p.narrator}
ANNOUNCER: Belle B
NARRATIVE_VOICE: ${p.authorVoice || 'third_limited'}
NARRATOR_IS_CHARACTER: ${p.authorVoice === 'first_person' ? 'true' : 'false'}
SUNO PROMPT: [2-3 sentences: music genre, instrumentation, tempo, mood — specific to this story]

3. CHARACTER GUIDE:
CHARACTER GUIDE
---
[Every speaking character: NAME — gender, age_range, accent, tone, one-sentence personality]

CRITICAL: Use ONLY these exact values so voices can be matched automatically:
- gender: male | female
- age_range: young (teens-24) | middle_aged (25-54) | old (55+)
- accent: american | british | irish | scottish | australian | us southern | canadian
- tone: calm | warm | intense | deep | confident | professional | casual | raspy | husky | mature | wise | gentle | serious | rough | crisp | upbeat | sassy | whispery | meditative | neutral | pleasant | classy | chill | relaxed

WESTERN STORIES: Characters get us southern or american accent + tone of: rough | wise | calm | deep
SCI-FI/AI CHARACTERS: Non-human AI/robot characters get tone: neutral or serious with accent: american
Example: MAREN — female, middle_aged, american, calm — An archivist who speaks precisely and reveals nothing by accident.

Character naming rules:
- Names must feel specific to the character's cultural background, region, and era
- Never use generic placeholder names: no Marcus, Elena, James, Sara, Kate, John, Mike, David, Lisa, Tom, Anna
- Each character must have a completely unique first name — no two characters share a name
- Names should surprise the listener slightly — real but unexpected
- Match name to accent/origin: Nigerian character gets a Nigerian name, Portuguese gets Portuguese, etc.
- A name should tell you something about who the person is before they speak

4. THE PRODUCTION SCRIPT (copy exactly as provided — do not change anything)

5. BELLE B OUTRO:
${outroInstruction}

Output ONLY the complete wrapped script. Begin with BELLE B INTRO. End with the BELLE B outro line. No preamble. Do NOT include any ANNOUNCER: line.

PRODUCTION SCRIPT TO WRAP:
${productionScript}`
}

function buildScriptPrompt(p: PipelineParams): string {
  const profile = AUTHOR_PROFILES[p.author] || `${p.authorVoice} voice. ${p.authorTone}.`
  const endingRule = p.isSeries && !p.isFinale
    ? 'End on hard cliffhanger. Final line = burning question — a specific moment of danger, revelation, or impossible choice.'
    : p.isSeries && p.isFinale
    ? 'FINALE: Resolve ALL threads. Every question answered. Listener must feel complete satisfaction.'
    : 'ENDING — NON-NEGOTIABLE: The central conflict MUST be fully resolved. The listener MUST know the story is over and feel satisfied. The last 2 minutes MUST contain: (1) the climax or final revelation, (2) the resolution showing what happened as a result, (3) a closing image or moment that lands emotionally. NO ambiguous endings. NO trailing off. NO life-goes-on non-endings. Test: could a listener summarize how the story ended in one sentence? If not, the ending is not done.'
  const narrativeVoice = p.authorVoice || 'third_limited'
  const voiceRule = narrativeVoice === 'first_person'
    ? 'NARRATIVE VOICE: first_person. NARRATOR IS THE PROTAGONIST — every narration line uses I/me/my. The narrator voice and the protagonist character voice are THE SAME PERSON. Do NOT write the protagonist as a separate character with their own dialogue lines — their voice IS the narrator. Other characters speak in dialogue. This must be consistent in EVERY episode of this series.'
    : narrativeVoice === 'third_omniscient'
    ? 'NARRATIVE VOICE: third_omniscient. Narrator knows all, can enter any character\'s mind. Use he/she/they. Consistent across all episodes.'
    : 'NARRATIVE VOICE: third_limited. Follow protagonist closely. Show their thoughts and feelings but use he/she/they. Consistent across all episodes.'
  const seriesVoiceRule = p.isSeries && p.episodeNumber > 1
    ? `SERIES CONSISTENCY: This is Episode ${p.episodeNumber} of ${p.totalEpisodes}. The narrative voice (${narrativeVoice}) is LOCKED for the entire series. Do not switch to a different POV from previous episodes.`
    : ''
  return `You are the Endless Tales script writer. Write a complete professional audio drama script.
AUDIENCE: General listeners — commuting, working, exercising, or anything hands-busy. Cannot rewind. 90 seconds to hook them.
OPENING CLARITY RULE — CRITICAL: The first 60 seconds must establish THREE things clearly: (1) WHO is the main character — name and one defining detail, (2) WHERE and WHEN are we — ground the listener in a specific place, (3) WHAT is the situation — what is happening or about to happen. The listener must never be confused about what is going on. No starting mid-action without context. No withholding the premise for dramatic effect. No literary misdirection. A commuter who tunes in must immediately understand the story they are entering. The hook comes FROM clarity, not from confusion.
AUTHOR: ${p.author} | VOICE: ${profile} | GENRE: ${p.genre} | RUNTIME: ${p.runtime} | NARRATOR: ${p.narrator}
${p.isSeries ? `SERIES: ${p.seriesName} | EP: ${p.episodeNumber}/${p.totalEpisodes} | TITLE: ${p.episodeTitle}` : ''}
PREMISE: ${p.premise}
${p.requirements ? `REQUIREMENTS: ${p.requirements}` : ''}
${voiceRule}
${seriesVoiceRule}
FORMAT: Begin BELLE B INTRO block, then header (SERIES/EPISODE/AUTHOR/GENRE/DESCRIPTION/NARRATOR/ANNOUNCER: Belle B/NARRATIVE_VOICE/NARRATOR_IS_CHARACTER/SUNO PROMPT), then CHARACTER GUIDE, then [START AUDIO DRAMA SCRIPT].
RULES: ALL CAPS character names. No parentheticals. [SFX:] own line. [BEAT] own line. Open mid-action. ${endingRule}
YOU MUST COMPLETE THE ENDING — script not done until BELLE B speaks final outro line.
Output ONLY the script. No preamble. No markdown.`
}


function buildSeriesPrompt(p: { genre: string; runtime: string; episodeCount: number; notes: string }): string {
  const eligible = (GENRE_AUTHOR_MAP[p.genre] || [p.genre]).join(', ')
  const arcGuide = p.episodeCount === 3 ? 'Ep1: setup+hook, Ep2: escalation+midpoint turn, Ep3: finale resolution'
    : p.episodeCount === 4 ? 'Ep1: setup+hook, Ep2: escalation, Ep3: darkest moment+betrayal, Ep4: finale'
    : p.episodeCount === 5 ? 'Ep1: setup+hook, Ep2: escalation, Ep3: midpoint reversal, Ep4: darkest moment, Ep5: finale'
    : p.episodeCount === 6 ? 'Ep1: setup+hook, Ep2: escalation, Ep3: midpoint turn, Ep4: darkest moment, Ep5: penultimate confrontation, Ep6: finale'
    : p.episodeCount === 7 ? 'Ep1: setup, Ep2: escalation, Ep3: complication, Ep4: midpoint reversal, Ep5: darkest hour, Ep6: penultimate, Ep7: finale'
    : 'Ep1: setup, Ep2-3: escalation, Ep4: midpoint reversal, Ep5: darkest moment, Ep6-7: confrontation building, Ep8: finale'

  return `You are the Endless Tales series developer. Create a complete ${p.episodeCount}-episode audio drama series for Endless Tales general audience listeners.\n\nSETTING DIVERSITY RULE: Do NOT default to road, highway, trucking, or commuter settings unless the genre specifically calls for it. Stories should span all walks of life — urban professionals, small towns, historical periods, workplaces, families, institutions. Driving and trucking contexts should appear in no more than 1 in 3 stories across the catalog.\n
Genre: ${p.genre} | Runtime per episode: ${p.runtime} | Episodes: ${p.episodeCount}
Eligible authors: ${eligible}
${p.notes ? `Notes from Marc: ${p.notes}` : ''}

Narrator pairings (use exactly):
Marc Hobelman→Ray Dolan | Sara Keene→Cole Hargrove | Elias Thorn→Cole Hargrove
Dale Harmon→Finn Calloway | Julian Mercer→Iris Calloway | Daniel Wren→Elliott Crane
Mark Holbrook→Morgan Veil | Silas Graves→Cole Hargrove | Nina Vasquez→Marcus Hale | Caroline Drake→Iris Calloway

SERIES ARC GUIDE: ${arcGuide}

REQUIREMENTS:
- Pick ONE author for the entire series (must stay consistent)
- Every non-finale episode ends on a hard cliffhanger
- Each episode premise must be specific enough to write a full script from
- Episode titles should be evocative, not generic ("The Reckoning" is weak — "The Name on the Bullet" is strong)
- The series name should be distinctive and memorable
- Listener hook: listeners decide in 90 seconds — first sentence must grab immediately

Return ONLY valid JSON, no markdown:
{
  "seriesName": "The series title",
  "seriesLogline": "One sentence: the whole series in a single hook",
  "author": "Author name from eligible list",
  "narrator": "Narrator from pairings",
  "episodes": [
    {
      "episodeNumber": 1,
      "episodeTitle": "Episode title",
      "hook": "Exact first-sentence hook — specific, sensory, mid-action, grabs a listener in 10 seconds",
      "premise": "3-4 sentences: who, what they want, what stands in their way, what is at stake. Specific enough to write a complete script.",
      "cliffhanger": "One sentence describing the specific cliffhanger that ends this episode (leave blank for finale)"
    }
  ]
}`
}

function buildPickerPrompt(p: { genre: string; runtime: string; isSeries: boolean; seriesName: string; totalEpisodes: number; episodeNumber: number; extraNotes: string; existingTitles?: string[] }): string {
  const eligible = (GENRE_AUTHOR_MAP[p.genre] || [p.genre]).join(', ')
  const avoidList = p.existingTitles && p.existingTitles.length > 0 ? `\n\nALREADY PRODUCED — do NOT repeat or resemble these:\n${p.existingTitles.map(t => '- ' + t).join('\n')}\nEvery premise must differ in protagonist, setting, conflict, and tone.` : ''
  return `Generate exactly 3 distinct high-scoring premise options for an Endless Tales audio drama for a general audience.

Genre: ${p.genre} | Runtime: ${p.runtime} | Type: ${p.isSeries ? `Series "${p.seriesName}" Episode ${p.episodeNumber} of ${p.totalEpisodes}` : 'Standalone'}
${p.extraNotes ? `Notes: ${p.extraNotes}` : ''}
Eligible authors: ${eligible}${avoidList}\n\nDIVERSITY RULES — all 3 options must differ from each other AND the avoid list:\n- Different protagonist gender, age, or profession\n- Different setting (no two in the same location type)\n- Different conflict type\n- Vary time period, geography, and social world freely\n\nSETTING RULE: All stories set in specific real American locations. Use real city names, landmarks, geography. Vary locations across all 3 options.

Narrator pairings: Marc Hobelman→Ray Dolan | Sara Keene→Cole Hargrove | Elias Thorn→Cole Hargrove | Dale Harmon→Finn Calloway | Julian Mercer→Iris Calloway | Daniel Wren→Elliott Crane | Mark Holbrook→Morgan Veil | Silas Graves→Cole Hargrove | Nina Vasquez→Marcus Hale | Caroline Drake→Iris Calloway

Return ONLY valid JSON:
{"options":[{"title":"","author":"","narrator":"","hook":"Exact first-sentence hook — specific, sensory, mid-action","premise":"3-4 sentences: protagonist, want, obstacle, stakes","seriesNote":"${p.isSeries ? 'How this fits the series arc' : ''}","scoringNote":"What drives this to 20+/25"}]}`
}

export default function StoryProductionPage() {
  const [tab, setTab] = useState<'pick'|'write'|'queue'>('pick')
  const [pickerMode, setPickerMode] = useState<'single'|'series'>('single')
  const [stories, setStories] = useState<Story[]>([])
  const [selected, setSelected] = useState<Story|null>(null)
  const [producing, setProducing] = useState<string|null>(null)
  const [producedIds, setProducedIds] = useState<Set<string>>(()=>{ try { const stored=sessionStorage.getItem('et_produced_ids'); return stored ? new Set(JSON.parse(stored)) : new Set() } catch { return new Set() } })
  const [produceSteps, setProduceSteps] = useState<Record<string,{status:string,message?:string}>>({}) 
  const [authors, setAuthors] = useState<Author[]>([])
  const [narrators, setNarrators] = useState<Narrator[]>([])
  const [generating, setGenerating] = useState(false)
  const [status, setStatus] = useState('')

  // Single picker
  const [pickerGenre, setPickerGenre] = useState('')
  const [pickerAuthor, setPickerAuthor] = useState('')
  const [pickerRuntime, setPickerRuntime] = useState('20 min')
  const [pickerIsSeries, setPickerIsSeries] = useState(false)
  const [pickerSeriesName, setPickerSeriesName] = useState('')
  const [pickerEpisodeNum, setPickerEpisodeNum] = useState(1)
  const [pickerTotalEps, setPickerTotalEps] = useState(6)
  const [pickerNotes, setPickerNotes] = useState('')
  const [pickerLoading, setPickerLoading] = useState(false)
  const [premiseOptions, setPremiseOptions] = useState<PremiseOption[]>([])

  // Series generator
  const [seriesGenre, setSeriesGenre] = useState('')
  const [seriesRuntime, setSeriesRuntime] = useState('20 min')
  const [seriesEpisodeCount, setSeriesEpisodeCount] = useState(6)
  const [seriesNotes, setSeriesNotes] = useState('')
  const [seriesLoading, setSeriesLoading] = useState(false)
  const [seriesPlan, setSeriesPlan] = useState<SeriesPlan|null>(null)

  // Queue
  const [premiseQueue, setPremiseQueue] = useState<QueuedPremise[]>([])
  const [queueRunning, setQueueRunning] = useState(false)
  const processingRef = useRef(false)

  // Audio generation
  const [audioProgress, setAudioProgress] = useState<Record<string, AudioState>>({})
  const [supabaseIds, setSupabaseIds] = useState<Record<string, string>>(() => {
    try { const stored = sessionStorage.getItem('et_supabase_ids'); return stored ? JSON.parse(stored) : {} } catch { return {} }
  }) // localId → supabase UUID
  // charVoiceModal removed — EL auto-assigns voices

  // Manual write
  const [genre, setGenre] = useState('')
  const [premise, setPremise] = useState('')
  const [runtime, setRuntime] = useState('20 min')
  const [requirements, setRequirements] = useState('')
  const [pickedAuthor, setPickedAuthor] = useState<Author|null>(null)
  const [pickedNarrator, setPickedNarrator] = useState<Narrator|null>(null)
  const [showAuthorList, setShowAuthorList] = useState(false)
  const [matchingAuthors, setMatchingAuthors] = useState<Author[]>([])

  useEffect(()=>{ loadData() },[])
  useEffect(()=>{ if(genre && authors.length>0) autoPickAuthor(genre); else { setPickedAuthor(null); setPickedNarrator(null) } },[genre,authors])
  useEffect(()=>{
    if(!queueRunning||processingRef.current) return
    const next = premiseQueue.find(q=>q.status==='waiting')
    if(!next){ setQueueRunning(false); return }
    processingRef.current=true
    runQueuedPremise(next).then(()=>{ processingRef.current=false })
  },[queueRunning,premiseQueue])

  async function loadData() {
    const {data:aData} = await supabase.from('authors').select('id,name,primary_genre,secondary_genre,tone,narrative_voice,narrator_id').order('name')
    if(aData) setAuthors(aData as Author[])
    const {data:nData} = await supabase.from('narrator_voices').select('id,name,elevenlabs_voice_id')
    if(nData) setNarrators(nData as Narrator[])
    const stored = localStorage.getItem('et_stories_v2')
    if(stored){ try{ setStories(JSON.parse(stored)); return }catch{} }
    // localStorage empty — recover from Supabase story_drafts
    const {data:drafts} = await supabase.from('story_drafts')
      .select('id,title,author,genre,runtime,narrator,script,ai_score,status,notes,series_name,episode_number,is_series')
      .in('status',['ready','approved','generating'])
      .order('created_at',{ascending:false})
      .limit(20)
    if(drafts && drafts.length > 0) {
      const recovered = drafts.map((d:any) => ({
        id: d.id,
        title: d.title || 'Untitled',
        author: d.author || '',
        genre: d.genre || '',
        runtime: d.runtime || '20 min',
        narrator: d.narrator || '',
        script: d.script || '',
        ai_score: d.ai_score || null,
        status: d.status === 'approved' ? 'approved' : 'ready',
        notes: d.notes || '',
        isSeries: d.is_series || false,
        seriesName: d.series_name || '',
        episodeNumber: d.episode_number || 1,
      }))
      setStories(recovered)
      localStorage.setItem('et_stories_v2', JSON.stringify(recovered))
      // Restore supabaseIds so Generate Audio button appears
      const idMap: Record<string,string> = {}
      drafts.forEach((d:any) => { idMap[d.id] = d.id })
      setSupabaseIds(idMap)
    }
  }

  function saveStories(updated: Story[]) { setStories(updated); localStorage.setItem('et_stories_v2',JSON.stringify(updated)) }

  function autoPickAuthor(g: string) {
    const gl=g.toLowerCase()
    const map: Record<string,string[]> = { 'thriller':['thriller','espionage'],'horror':['horror','supernatural'],'dark mystery':['mystery','dark','noir'],'mystery/crime':['mystery','crime','noir'],'adventure':['adventure','action'],'drama':['drama','family'],'sci-fi':['sci-fi','speculative'],'western':['western','frontier'],'historical drama':['historical'],'supernatural':['supernatural','horror'],'family/heartwarming':['family'],'comedy':['comedy'] }
    const terms=map[gl]||[gl]
    const matches=authors.filter(a=>{ const p=(a.primary_genre||'').toLowerCase(); const s=(a.secondary_genre||'').toLowerCase(); return terms.some(t=>p.includes(t)||s.includes(t)) })
    setMatchingAuthors(matches)
    if(!matches.length) return
    const author=matches[Math.floor(Math.random()*matches.length)]
    setPickedAuthor(author); setShowAuthorList(false)
    if(author.narrator_id) setPickedNarrator(narrators.find(n=>n.id===author.narrator_id)||null)
  }

  function pickSpecificAuthor(author: Author) {
    setPickedAuthor(author); setShowAuthorList(false)
    if(author.narrator_id) setPickedNarrator(narrators.find(n=>n.id===author.narrator_id)||null)
  }

  async function generatePremises() {
    if(!pickerGenre){ alert('Select a genre first.'); return }
    setPickerLoading(true); setPremiseOptions([])
    try {
      const resp = await fetch('/api/claude-proxy',{ method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ model:'claude-opus-4-6', max_tokens:2000, messages:[{role:'user',content:buildPickerPrompt({genre:pickerGenre,runtime:pickerRuntime,isSeries:pickerIsSeries,seriesName:pickerSeriesName,totalEpisodes:pickerTotalEps,episodeNumber:pickerEpisodeNum,extraNotes:(pickerAuthor ? 'Use ' + pickerAuthor + ' as author. ' : '') + pickerNotes,existingTitles:stories.filter(s=>s.title&&s.title!=='Generating...').map(s=>s.title)})}] }) })
      const data=await resp.json()
      let raw=data.content?.[0]?.text||''
      raw = raw.replace(/```json|```/g,'').trim()
      const jsonStart2 = raw.indexOf('{')
      const jsonEnd2 = raw.lastIndexOf('}')
      if(jsonStart2 >= 0 && jsonEnd2 > jsonStart2) raw = raw.slice(jsonStart2, jsonEnd2+1)
      let parsed
      try { parsed = JSON.parse(raw) }
      catch { parsed = JSON.parse(raw.replace(/,\s*}/g,'}').replace(/,\s*]/g,']')) }
      setPremiseOptions(parsed.options.map((o: Record<string,string>,i: number)=>({ id:`opt_${Date.now()}_${i}`, title:o.title||`Option ${i+1}`, hook:o.hook||'', premise:o.premise||'', author:o.author||'', narrator:o.narrator||'', genre:pickerGenre, runtime:pickerRuntime, seriesNote:o.seriesNote||'', scoringNote:o.scoringNote||'', queued:false })))
    } catch(err){ alert(`Failed: ${err}`) }
    finally{ setPickerLoading(false) }
  }

  async function generateSeries() {
    if(!seriesGenre){ alert('Select a genre first.'); return }
    setSeriesLoading(true); setSeriesPlan(null)
    try {
      const resp = await fetch('/api/claude-proxy',{ method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ model:'claude-opus-4-6', max_tokens:4000, messages:[{role:'user',content:buildSeriesPrompt({genre:seriesGenre,runtime:seriesRuntime,episodeCount:seriesEpisodeCount,notes:seriesNotes})}] }) })
      const data=await resp.json()
      let raw=data.content?.[0]?.text||''
      // Strip markdown fences and find the JSON object
      raw = raw.replace(/```json|```/g,'').trim()
      // Extract just the JSON object if there's extra text
      const jsonStart = raw.indexOf('{')
      const jsonEnd = raw.lastIndexOf('}')
      if(jsonStart >= 0 && jsonEnd > jsonStart) raw = raw.slice(jsonStart, jsonEnd+1)
      let parsed
      try {
        parsed = JSON.parse(raw)
      } catch(e) {
        // Try to fix common JSON issues — trailing commas, smart quotes
        const cleaned = raw
          .replace(/,\s*}/g, '}')
          .replace(/,\s*]/g, ']')
          .replace(/[‘’]/g, "'")
          .replace(/[“”]/g, '"')
        parsed = JSON.parse(cleaned)
      }
      setSeriesPlan({ ...parsed, genre:seriesGenre, runtime:seriesRuntime, episodes:parsed.episodes.map((e: Record<string,unknown>,i: number)=>({ ...e, id:`ep_${Date.now()}_${i}`, queued:false })) })
    } catch(err){ alert(`Failed to generate series: ${err}`) }
    finally{ setSeriesLoading(false) }
  }

  function queueEpisode(ep: SeriesEpisode, plan: SeriesPlan, extraReqs: string) {
    const isFinale = ep.episodeNumber === plan.episodes.length
    const q: QueuedPremise = {
      id: ep.id, title: `${plan.seriesName} E${ep.episodeNumber}: ${ep.episodeTitle}`,
      genre: plan.genre, runtime: plan.runtime, author: plan.author, narrator: plan.narrator,
      premise: `${ep.hook}\n\n${ep.premise}${ep.cliffhanger ? `\n\nCLIFFHANGER: ${ep.cliffhanger}` : ''}`,
      requirements: extraReqs, status: 'waiting',
      isSeries: true, seriesName: plan.seriesName,
      episodeNumber: ep.episodeNumber, totalEpisodes: plan.episodes.length, isFinale,
    }
    setPremiseQueue(prev=>[...prev,q])
    setSeriesPlan(prev=>prev?{...prev,episodes:prev.episodes.map(e=>e.id===ep.id?{...e,queued:true}:e)}:prev)
  }

  function queueAllEpisodes(plan: SeriesPlan) {
    const newItems: QueuedPremise[] = plan.episodes.filter(e=>!e.queued).map(ep=>({
      id: ep.id, title: `${plan.seriesName} E${ep.episodeNumber}: ${ep.episodeTitle}`,
      genre: plan.genre, runtime: plan.runtime, author: plan.author, narrator: plan.narrator,
      premise: `${ep.hook}\n\n${ep.premise}${ep.cliffhanger ? `\n\nCLIFFHANGER: ${ep.cliffhanger}` : ''}`,
      requirements: '', status: 'waiting' as const,
      isSeries: true, seriesName: plan.seriesName,
      episodeNumber: ep.episodeNumber, totalEpisodes: plan.episodes.length,
      isFinale: ep.episodeNumber === plan.episodes.length,
    }))
    setPremiseQueue(prev=>[...prev,...newItems])
    setSeriesPlan(prev=>prev?{...prev,episodes:prev.episodes.map(e=>({...e,queued:true}))}:prev)
  }

  function queueOption(opt: PremiseOption, extraReqs: string) {
    const q: QueuedPremise = { id:opt.id, title:opt.title, genre:opt.genre, runtime:opt.runtime, author:opt.author, narrator:opt.narrator, premise:`${opt.hook}\n\n${opt.premise}`, requirements:extraReqs, status:'waiting', isSeries:pickerIsSeries, seriesName:pickerSeriesName, episodeNumber:pickerEpisodeNum, totalEpisodes:pickerTotalEps, isFinale:pickerIsSeries&&pickerEpisodeNum===pickerTotalEps }
    setPremiseQueue(prev=>[...prev,q])
    setPremiseOptions(prev=>prev.map(o=>o.id===opt.id?{...o,queued:true}:o))
  }

  function startQueue() { setQueueRunning(true); setTab('queue') }

  async function runQueuedPremise(q: QueuedPremise) {
    setPremiseQueue(prev=>prev.map(p=>p.id===q.id?{...p,status:'generating'}:p))
    const authorObj=authors.find(a=>a.name===q.author)
    const storyId=`story_${Date.now()}`
    const newStory: Story = { id:storyId, title:'Generating...', author:q.author, narrator:q.narrator, genre:q.genre, runtime:q.runtime, status:'generating', script:'', ai_score:null, created_at:new Date().toISOString(), notes:'' }
    setStories(prev => {
      const updated = [newStory, ...prev.filter(s => s.id !== storyId)]
      localStorage.setItem('et_stories_v2', JSON.stringify(updated))
      supabase.from('story_drafts').upsert({ id:newStory.id, title:newStory.title, author:newStory.author, narrator:newStory.narrator, genre:newStory.genre, runtime:newStory.runtime, status:newStory.status, script:'', ai_score:null, notes:'', updated_at:new Date().toISOString() })
      return updated
    })
    let bestScript = ''
    let bestScore: AIScore | null = null
    try {
      const pp: PipelineParams = { author:q.author, authorTone:authorObj?.tone||'', authorVoice:authorObj?.narrative_voice||'third_limited', genre:q.genre, runtime:q.runtime, narrator:q.narrator, premise:q.premise, requirements:q.requirements, isSeries:q.isSeries, seriesName:q.seriesName, episodeNumber:q.episodeNumber, totalEpisodes:q.totalEpisodes, isFinale:q.isFinale, episodeTitle:q.title }

      // Call 1: Story Engine — scene by scene, guaranteed complete ending
      const runtimeMins = parseInt(pp.runtime) || 15
      const sceneCount = runtimeMins <= 10 ? 3 : runtimeMins <= 15 ? 4 : runtimeMins <= 20 ? 5 : 6
      const scenes: string[] = []

      for(let sceneNum = 1; sceneNum <= sceneCount; sceneNum++) {
        const sceneRole = sceneNum === 1 ? 'opening' : sceneNum === sceneCount ? 'finale' : 'escalation'
        setStatus(`Writing scene ${sceneNum}/${sceneCount} — "${pp.episodeTitle || pp.seriesName || pp.genre}"...`)
        const previousScenes = scenes.join('\n\n')
        const scenePrompt = buildScenePrompt(pp, sceneNum, sceneCount, previousScenes, sceneRole)
        const sceneTokens = sceneRole === 'finale' ? 12000 : sceneRole === 'escalation' ? 6000 : 4000
        const sr = await fetch('/api/claude-proxy',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model:'claude-opus-4-6',max_tokens:sceneTokens,messages:[{role:'user',content:scenePrompt}]})})
        const sceneText = (await sr.json()).content?.[0]?.text || ''
        scenes.push(sceneText)
      }

      const story = scenes.join('\n\n') + '\n\n[END OF STORY]'

      // Call 2: Audio Layer — SFX, BEAT, music cues
      setStatus(`Adding audio production "${q.title}"... (2/3)`)
      const r2=await fetch('/api/claude-proxy',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model:'claude-sonnet-4-6',max_tokens:16000,messages:[{role:'user',content:buildAudioPrompt(story,pp)}]})})
      const production=(await r2.json()).content?.[0]?.text||story

      // Call 3: Platform Wrapper — Belle B, headers, announcer
      setStatus(`Wrapping platform elements "${q.title}"... (3/3)`)
      const r3=await fetch('/api/claude-proxy',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model:'claude-sonnet-4-6',max_tokens:8000,messages:[{role:'user',content:buildWrapperPrompt(production,pp)}]})})
      let script=(await r3.json()).content?.[0]?.text||production
      // Truncation check — script must end with BELLE B outro
      const isTruncated = (s: string) => {
        const last200 = s.slice(-200).toUpperCase()
        return !last200.includes('BELLE B:') && !last200.includes('ENDLESS TALES ORIGINAL')
      }

      setStatus(`Grading "${q.title}"... (attempt 1/3)`)
      let aiScore=await gradeScript(script,q.author,q.genre)
      let bestScript=script; let bestScore=aiScore; let attempt=1
      const attemptHistory: string[] = [bestScore ? `1: ${scoreOf25(bestScore)}/25` : '1: grading failed']

      // If truncated, force revision regardless of score
      if(isTruncated(script)) {
        setStatus(`Script truncated — requesting completion (attempt 2/3)`)
        attempt++
        const completionPrompt = `This audio drama script was cut off before the ending. Complete it from where it stops.

CRITICAL: Output the COMPLETE script from the beginning. The script MUST end with:
BELLE B: That was "[Title]" — an Endless Tales original. Written by [Author].
OR for series:
BELLE B: [emotional beat]. [next episode tease].

Keep all existing content. Only add the missing ending. Do not truncate.

TRUNCATED SCRIPT:
${script}`
        const compResp = await fetch('/api/claude-proxy', {
          method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ model:'claude-opus-4-6', max_tokens:16000, messages:[{role:'user',content:completionPrompt}] })
        })
        const compData = await compResp.json()
        const completed = compData.content?.[0]?.text || script
        if(!isTruncated(completed)) {
          script = completed
          bestScript = completed
          const completedScore = await gradeScript(completed, q.author, q.genre)
          if(completedScore) { aiScore = completedScore; bestScore = completedScore }
          setStatus(`Grading completed script...`)
        }
      }
      while(attempt < 3 && (!bestScore || scoreOf25(bestScore) < 20)) {
        attempt++
        setStatus(`Revising "${q.title}"... (attempt ${attempt}/3 — score was ${scoreOf25(aiScore)}/25)`)
        const revised=await reviseScript(script,aiScore,q.author,q.genre,attempt)
        const revisedScore=await gradeScript(revised,q.author,q.genre)
        if(revisedScore && scoreOf25(revisedScore) > scoreOf25(bestScore)) { bestScript=revised; bestScore=revisedScore }
        script=revised; aiScore=revisedScore
      }
      const finalNote = attempt > 1 ? `Auto-revised ${attempt-1}x. Best: ${scoreOf25(bestScore)}/25.` : ''
      const extractedTitle = bestScript.match(/^EPISODE_TITLE:\s*(.+)$/m)?.[1]?.trim() || q.title
      const finished: Story = {...newStory, title:extractedTitle, status:'ready', script:bestScript, ai_score:bestScore, notes:finalNote}
      setStories(prev => {
        const updated = prev.map((s: Story) => s.id===storyId ? finished : s)
        localStorage.setItem('et_stories_v2', JSON.stringify(updated))
        updated.forEach(async (s) => { await supabase.from('story_drafts').upsert({ id:s.id, title:s.title, author:s.author, narrator:s.narrator, genre:s.genre, runtime:s.runtime, status:s.status, script:s.script, ai_score:s.ai_score, notes:s.notes, updated_at:new Date().toISOString() }) })
        return updated
      })
      setSelected(finished)
    } catch(err) {
      setStories(prev => {
        const updated = prev.map((s: Story) => s.id===storyId ? {...s, status:'rejected' as StoryStatus, notes:`Error: ${err}`, ai_score: bestScore || s.ai_score, script: bestScript || s.script} : s)
        localStorage.setItem('et_stories_v2', JSON.stringify(updated))
        return updated
      })
    }
    setPremiseQueue(prev=>{ const updated=prev.map(p=>p.id===q.id?{...p,status:'done' as const}:p); const stillWaiting=updated.filter(p=>p.status==='waiting').length; if(stillWaiting>0) setTimeout(()=>setQueueRunning(true),200); else setQueueRunning(false); return updated })
    setStatus('')
  }

  async function generate() {
    if(!genre||!premise||!runtime){ alert('Fill in Genre, Premise, and Runtime.'); return }
    if(!pickedAuthor){ alert('No author for this genre.'); return }
    setGenerating(true); setStatus('Writing your story...')
    const storyId=`story_${Date.now()}`
    const newStory: Story = { id:storyId, title:'Generating...', author:pickedAuthor.name, narrator:pickedNarrator?.name||'TBD', genre, runtime, status:'generating', script:'', ai_score:null, created_at:new Date().toISOString(), notes:'' }
    const updated=[newStory,...stories]; saveStories(updated)
    try {
      const prompt=buildScriptPrompt({ author:pickedAuthor.name, authorTone:pickedAuthor.tone, authorVoice:pickedAuthor.narrative_voice, genre, runtime, narrator:pickedNarrator?.name||'Assigned narrator', premise, requirements, isSeries:false, seriesName:'', episodeNumber:1, totalEpisodes:1, isFinale:false, episodeTitle:'' })
      const resp=await fetch('/api/claude-proxy',{ method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ model:'claude-opus-4-6', max_tokens:16000, messages:[{role:'user',content:prompt}] }) })
      const data=await resp.json(); let script=data.content?.[0]?.text||''
      const title=script.match(/"([^"]{5,60})"/)?.[1]||`${genre} Story`
      setStatus('Grading... (attempt 1/3)')
      let aiScore=await gradeScript(script,pickedAuthor.name,genre)
      let bestScript=script; let bestScore=aiScore; let attempt=1
      while(attempt < 3 && (!bestScore || scoreOf25(bestScore) < 20)) {
        attempt++
        setStatus(`Revising... (attempt ${attempt}/3 — score was ${scoreOf25(aiScore)}/25)`)
        const revised=await reviseScript(script,aiScore,pickedAuthor.name,genre,attempt)
        const revisedScore=await gradeScript(revised,pickedAuthor.name,genre)
        if(revisedScore && scoreOf25(revisedScore) > scoreOf25(bestScore)) { bestScript=revised; bestScore=revisedScore }
        script=revised; aiScore=revisedScore
      }
      const finalNote = attempt > 1 ? `Auto-revised ${attempt-1}x. Best: ${scoreOf25(bestScore)}/25.` : ''
      const finished: Story={...newStory,title,status:'ready',script:bestScript,ai_score:bestScore,notes:finalNote}
      saveStories(updated.map(s=>s.id===storyId?finished:s))
      setSelected(finished); setTab('queue')
    } catch(err) {
      saveStories(updated.map(s=>s.id===storyId?{...s,status:'rejected' as StoryStatus,notes:`Error: ${err}`}:s))
      setStatus(`Failed: ${err}`)
    } finally{ setGenerating(false); setStatus('') }
  }

  function scoreOf25(aiScore: AIScore|null): number {
    if(!aiScore) return 0
    return Math.round(aiScore.composite_score * 2.5 * 10) / 10
  }

  async function reviseScript(script: string, aiScore: AIScore, author: string, genre: string, attempt: number): Promise<string> {
    const score = scoreOf25(aiScore)
    const fixes = aiScore.top_fixes?.join('\n') || ''
    const dimFeedback = [
      `Hook (${aiScore.opening_hook.score}/10): ${aiScore.opening_hook.feedback}`,
      `Listenability (${aiScore.overall_listenability.score}/10): ${aiScore.overall_listenability.feedback}`,
      `Dialogue (${aiScore.dialogue_quality.score}/10): ${aiScore.dialogue_quality.feedback}`,
      `Clarity (${aiScore.story_clarity?.score || 0}/10): ${aiScore.story_clarity?.feedback || "N/A"}`,
      `Ending (${aiScore.ending_resolution?.score || 0}/10): ${aiScore.ending_resolution?.feedback || "N/A"}`,
      `Pacing (${aiScore.structure_and_pacing.score}/10): ${aiScore.structure_and_pacing.feedback}`,
      `Audio (${aiScore.audio_suitability.score}/10): ${aiScore.audio_suitability.feedback}`,
    ].join('\n')
    const revisePrompt = `You are the Endless Tales script editor. This script scored ${score}/25 — below the 23/25 target. Revision attempt ${attempt} of 3.

SCORE BREAKDOWN:
${dimFeedback}

TOP FIXES REQUIRED:
${fixes}

REVISION RULES:
- Fix every issue listed above specifically and completely
- Do NOT change the story concept, characters, or setting
- Do NOT truncate — the script MUST end with the complete BELLE B outro line
- Maintain the author voice (${author}) and genre (${genre}) throughout
- If dialogue scored below 8: make each character speech pattern more distinct
- If listenability scored below 8: add more narrator re-anchoring after scene changes
- If hook scored below 8: rewrite the first 3 exchanges to open with more immediate action
- If pacing scored below 8: add a harder act break at the 40% mark
- If clarity scored below 8: add narrator lines before each speaker change identifying who is talking and where we are
- If ending scored below 8: rewrite the final scene to fully resolve the central conflict with a clear climax, resolution, and closing image
- Return ONLY the complete revised script — no commentary, no preamble, no markdown

ORIGINAL SCRIPT TO REVISE:
${script}`
    const resp = await fetch('/api/claude-proxy', {
      method: 'POST', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ model: 'claude-opus-4-6', max_tokens: 16000, messages: [{role:'user', content: revisePrompt}] })
    })
    const data = await resp.json()
    return data.content?.[0]?.text || script
  }

  async function gradeScript(script: string, author: string, g: string): Promise<AIScore|null> {
    try {
      const resp=await fetch('/api/claude-proxy',{ method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ model:'claude-sonnet-4-6', max_tokens:2500, messages:[{role:'user',content:`Grade this Endless Tales audio drama for a general audience listener who cannot look at a screen. Brutally honest. Scores 1-10.

Weights: opening_hook 15%, overall_listenability 15%, dialogue_quality 15%, story_clarity 20%, ending_resolution 20%, structure_and_pacing 10%, audio_suitability 5%.
composite_score = weighted average max 10, displayed as x2.5=/25. Policy fail = auto Rejected.

STORY CLARITY (20%): Can a listener who is driving follow the story without confusion? At every moment, is it clear WHO is speaking, WHERE we are, and WHAT is happening? Does the narrator identify speakers before or after dialogue? Score 9-10 only if a distracted driver could follow every scene change and speaker switch.

ENDING RESOLUTION (20%): Does the story have a clear, satisfying ending? Is the central conflict fully resolved? Could the listener summarize how the story ended in one sentence? Score below 5 if the story trails off, ends ambiguously, or leaves the main question unanswered. Score 9-10 only if the ending delivers a climax, resolution, and emotional landing.

VOICE CALIBRATION: Author ${author} | Genre: ${g}
- First person narrators (Sara Keene, Elias Thorn, Silas Graves): intimate voice IS the style — do not penalize for "cinematic distance". Judge listenability on whether the internal voice grips a distracted listener.
- Third limited (Holbrook, Mercer, Harmon, Hobelman): judge on clarity of external action and scene-setting.
- Score dialogue_quality on distinctiveness between characters and how well speech reveals character under pressure — not on volume of dialogue.

Return ONLY valid JSON, no markdown:
{"opening_hook":{"score":0,"feedback":""},"overall_listenability":{"score":0,"feedback":""},"dialogue_quality":{"score":0,"feedback":""},"story_clarity":{"score":0,"feedback":""},"ending_resolution":{"score":0,"feedback":""},"structure_and_pacing":{"score":0,"feedback":""},"audio_suitability":{"score":0,"feedback":""},"policy_compliance":{"pass":true,"feedback":""},"composite_score":0,"recommendation":"Proceed","top_fixes":[],"evaluator_summary":""}

recommendation = "Proceed"|"Revise and Resubmit"|"Rejected"
top_fixes = up to 3 specific actionable fixes if any score < 9

SCRIPT:
${script.length > 18000 ? script.slice(0,12000) + '\n\n[...middle omitted...]\n\n' + script.slice(-4000) : script}`}] }) })
      const data=await resp.json()
      const raw=data.content?.[0]?.text?.replace(/```json|```/g,'').trim()
      return raw?JSON.parse(raw):null
    } catch{ return null }
  }

  async function produceStory(s: Story) {
    if (!s.script || !s.title || !s.author) { alert('Story needs script, title, and author'); return }
    setAudioProgress(prev => { const n={...prev}; delete n[s.id]; return n })
    setProducing(s.id)
    setProduceSteps({description:{status:'pending'},prose:{status:'pending'},cover:{status:'pending'},author:{status:'pending'},narrator:{status:'pending'},save:{status:'pending'}})
    try {
      // First save script to stories table so we have a storyId to work with
      // Check if we already have a UUID for this story (from a previous Produce)
      let storyId = supabaseIds[s.id] || s.id
      if (!supabaseIds[s.id]) {
        try {
          const { data: inserted } = await supabase.from('stories').insert({
            title: s.title, author: s.author, genre: s.genre,
            duration_mins: parseInt(s.runtime) || 15, is_hidden: true,
            published_on: new Date().toISOString().split('T')[0]
          }).select('id').single()
          if (inserted?.id) storyId = inserted.id
        } catch(e) { console.warn('Story insert skipped:', e) }
      }
      const resp = await fetch('/api/admin/produce-story', {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ storyId, script: s.script, title: s.title, author: s.author, narrator: NARRATOR_MAP[s.author] || s.narrator, genre: s.genre, seriesName: s.seriesName || '', episodeNumber: s.episodeNumber || 1, seriesTotal: s.totalEpisodes || 1, isSeries: s.isSeries || false })
      })
      const result = await resp.json()
      setProduceSteps(result.steps || {})
      // Always store the UUID if we got one back — even partial success
      if (result.storyId) {
        setSupabaseIds(prev => {
          const updated = { ...prev, [s.id]: result.storyId }
          try { sessionStorage.setItem('et_supabase_ids', JSON.stringify(updated)) } catch {}
          return updated
        })
      }
      if (result.success) {
        setStatus('✅ Produced! — click 🔊 Generate Audio')
      } else {
        if (result.storyId) {
          setStatus('✅ Produced! (minor errors) — click 🔊 Generate Audio')
        } else {
          setStatus(`⚠️ Production failed — check console`)
        }
      }
    } catch(err) {
      alert(`Production failed: ${err}`)
    } finally {
      setProducedIds(prev => { const n=new Set(prev); n.add(s.id); try { sessionStorage.setItem('et_produced_ids', JSON.stringify([...n])) } catch {} return n })
      setProducing(null)
    }
  }

  // Extract character names from script (non-NARRATOR, non-ANNOUNCER/BELLE B speakers)
  function extractCharacters(script: string): string[] {
    const chars = new Set<string>()
    // Only parse lines after [START AUDIO DRAMA SCRIPT] or CHARACTER GUIDE
    const scriptStart = script.indexOf('[START AUDIO DRAMA SCRIPT]')
    const guideStart = script.indexOf('CHARACTER GUIDE')
    const bodyStart = Math.min(
      scriptStart > -1 ? scriptStart : Infinity,
      guideStart > -1 ? guideStart : Infinity
    )
    const body = bodyStart < Infinity ? script.slice(bodyStart) : script
    const SKIP = ['NARRATOR','ANNOUNCER','BELLE B','SFX','BEAT','PAUSE',
      'SERIES','EPISODE','AUTHOR','GENRE','DESCRIPTION','SUNO PROMPT',
      'NARRATIVE VOICE','NARRATOR IS CHARACTER','CHARACTER GUIDE',
      'EPISODE TITLE','SERIES TOTAL','SERIES IS FINALE']
    for (const line of body.split('\n')) {
      const m = line.trim().match(/^([A-Z][A-ZÀ-Ú\s'().]+?):\s*.+$/)
      if (!m) continue
      const spk = m[1].trim()
      if (SKIP.includes(spk)) continue
      if (spk.startsWith('[')) continue
      if (spk.length > 40) continue // header fields tend to be long
      chars.add(spk)
    }
    return [...chars]
  }

  async function startGenerateAudio(s: Story, charAssignments?: Record<string,string>) {
    const supabaseId = supabaseIds[s.id] || s.id
    if (!supabaseId) { alert('Run 🎬 Produce first to create the story in Supabase.'); return }
    // Find narrator voice ID from narrators list — fall back to Cole Hargrove if not found
    const narratorName = NARRATOR_MAP[s.author] || s.narrator
    const narratorRec = narrators.find(n => n.name === narratorName)
    const fallbackVoice = narrators.find(n => n.name === 'Cole Hargrove')
    const narratorVoiceId = narratorRec?.elevenlabs_voice_id || fallbackVoice?.elevenlabs_voice_id
    if (!narratorVoiceId) { alert(`Could not find any narrator voice. Check narrator_voices table.`); return }

    // Extract SUNO PROMPT from script header
    const sunoPromptMatch = s.script?.match(/^SUNO PROMPT:\s*(.+)$/m)
    const sunoPrompt = sunoPromptMatch?.[1]?.trim() || ''

    setAudioProgress(prev => ({ ...prev, [s.id]: { step: 'voices' } }))

    try {
      // Stage 1: Generate all voice lines
      const voiceResp = await fetch('/api/admin/generate-voices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storyId: supabaseId,
          script: s.script,
          narratorVoiceId,
          characterVoices: charAssignments || {}
        })
      })
      const voiceResult = await voiceResp.json()
      if (!voiceResult.success) throw new Error(voiceResult.error || 'Voice generation failed')
      setAudioProgress(prev => ({ ...prev, [s.id]: { step: 'music', voiceStats: voiceResult.stats } }))

      // Stage 2: Generate background music
      if (sunoPrompt) {
        const musicResp = await fetch('/api/asc3/generate-music', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ storyId: supabaseId, prompt: sunoPrompt })
        })
        if (musicResp.ok === false) {
          console.warn('Music generation failed (continuing):', musicResp.status)
        } else {
          const musicResult = await musicResp.json()
          if (musicResult.success === false) console.warn('Music generation failed (continuing):', musicResult.error)
        }
      }
      setAudioProgress(prev => ({ ...prev, [s.id]: { step: 'mixing', voiceStats: voiceResult.stats } }))

      // Stage 3: Render final mix
      const mixResp = await fetch('/api/asc3/render-final-mix', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storyId: supabaseId })
      })
      if (mixResp.ok === false) {
        const text = await mixResp.text()
        throw new Error('Mix failed (' + mixResp.status + '): ' + text.slice(0, 200))
      }
      const mixResult = await mixResp.json()
      if (!mixResult.success) throw new Error(mixResult.error || 'Mix failed')

      setAudioProgress(prev => ({ ...prev, [s.id]: { step: 'done', voiceStats: voiceResult.stats, finalUrl: mixResult.finalAudioUrl } }))
      // Publish story now that audio is ready
      await supabase.from('stories').update({ is_hidden: false }).eq('id', supabaseId)
    } catch(err) {
      setAudioProgress(prev => ({ ...prev, [s.id]: { ...prev[s.id], step: 'error', error: String(err) } }))
    }
  }

  async function handleGenerateAudio(s: Story) {
    const chars = extractCharacters(s.script)
    if (chars.length === 0) { startGenerateAudio(s); return }

    const guideMatch = s.script?.match(/CHARACTER GUIDE\s*\n---\s*\n([\s\S]*?)(?:\n---|\[START AUDIO DRAMA SCRIPT\])/i)
    const charMeta: Record<string,{gender:string;age:string;accent:string}> = {}
    if (guideMatch) {
      for (const line of guideMatch[1].split('\n')) {
        const nm = line.match(/^([A-Z][A-Z\s\'.()]+?)\s*[\u2014\u2013-]/)
        if (!nm) continue
        const lower = line.toLowerCase()
        const gender = lower.includes(' female') ? 'female' : lower.includes(' male') ? 'male' : ''
        const age = lower.includes('young') || lower.includes('teen') || lower.includes('20s') ? 'young'
          : lower.includes('60s') || lower.includes('70s') || lower.includes('elder') || lower.includes('old') ? 'old'
          : lower.includes('30s') || lower.includes('40s') || lower.includes('50s') ? 'middle_aged' : ''
        const accent = lower.includes('british') || lower.includes('english') ? 'british'
          : lower.includes('irish') ? 'irish'
          : lower.includes('scottish') ? 'scottish'
          : lower.includes('australian') ? 'australian'
          : lower.includes('american') || lower.includes('southern') || lower.includes('midwest') ? 'american' : ''
        charMeta[nm[1].trim().toUpperCase()] = { gender, age, accent }
      }
    }

    const assignments: Record<string,string> = {}
    const usedVoiceIds = new Set<string>()
    for (const char of chars) {
      const meta = charMeta[char.toUpperCase()] || { gender: '', age: '', accent: '' }
      try {
        const resp = await fetch('/api/admin/el-voice-search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(meta)
        })
        const data = await resp.json()
        const voices = (data.voices || []).filter((v: any) => !usedVoiceIds.has(v.voice_id))
        if (voices.length > 0) {
          assignments[char] = voices[0].voice_id
          usedVoiceIds.add(voices[0].voice_id)
        }
      } catch(e) {
        console.warn('EL voice search failed for ' + char, e)
      }
    }
    startGenerateAudio(s, assignments)
  }

  function approve() {
    if(!selected) return
    const updated=stories.map(s=>s.id===selected.id?{...s,status:'approved' as StoryStatus}:s)
    saveStories(updated)
    setSelected({...selected,status:'approved'})
    // Record score to author tracking table
    const score = selected.ai_score ? scoreOf25(selected.ai_score) : 0
    recordAuthorScore(selected, score)
  }
  function reject(reason: string) { if(!selected) return; const updated=stories.map(s=>s.id===selected.id?{...s,status:'rejected' as StoryStatus,notes:reason}:s); saveStories(updated); setSelected({...selected,status:'rejected',notes:reason}) }

  function clearPipeline() {
    if(!confirm('Clear the generation pipeline? Stories already completed will be kept.')) return
    setPremiseQueue([])
    setQueueRunning(false)
    supabase.from('story_drafts').delete().eq('status','generating')
  }

  function clearAllStories() {
    if(!confirm('Clear ALL stories from the queue including completed ones? This cannot be undone.')) return
    setStories([])
    setSelected(null)
    setPremiseQueue([])
    setQueueRunning(false)
    localStorage.removeItem('et_stories_v2')
    supabase.from('story_drafts').delete().neq('id','none')
  }

  function deleteStory(id: string) {
    const updated = stories.filter(s => s.id !== id)
    saveStories(updated)
    if(selected?.id === id) setSelected(null)
    supabase.from('story_drafts').delete().eq('id', id)
  }

  // Record author score to tracking table
  async function recordAuthorScore(story: Story, score: number) {
    if(!story.author || !story.genre || score === 0) return
    await supabase.from('author_score_history').insert({
      author: story.author,
      genre: story.genre,
      story_type: story.notes?.includes('E1/')||story.notes?.includes('Ep ')? 'series' : 'standalone',
      score: score,
      title: story.title,
      runtime: story.runtime,
      recorded_at: new Date().toISOString(),
    })
  }

  const approvedStories=stories.filter(s=>s.status==='approved')
  const pendingStories=stories.filter(s=>s.status==='ready'||s.status==='generating')
  const waitingCount=premiseQueue.filter(q=>q.status==='waiting').length

  // charModalEl removed — EL auto-assigns voices

  return (
    <div style={{fontFamily:'Georgia, serif',color:'#111',background:'#FAF9F6',minHeight:'100vh',position:'relative',zIndex:1}}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      {status&&<div style={{background:'#e8f5e9',borderBottom:'1px solid #c8e6c9',padding:'12px 32px',color:'#2e7d32',fontSize:15}}>● {status}</div>}
      {/* EL auto-assigns voices */}

      <div style={{borderBottom:'2px solid #e0e0e0',padding:'0 32px',display:'flex',gap:0,background:'#fff'}}>
        {([{key:'pick' as const,label:'Premise Picker'},{key:'write' as const,label:'Write Manually'},{key:'queue' as const,label:`Queue (${approvedStories.length} approved${waitingCount>0?` · ${waitingCount} pending`:''})`}]).map(t=>(
          <button key={t.key} onClick={()=>setTab(t.key)} style={{background:'none',border:'none',borderBottom:tab===t.key?'2px solid #111':'2px solid transparent',marginBottom:-2,padding:'16px 24px',cursor:'pointer',fontFamily:'inherit',fontSize:15,fontWeight:tab===t.key?700:400,color:tab===t.key?'#111':'#888',textTransform:'uppercase',letterSpacing:1}}>{t.label}</button>
        ))}
      </div>

      {tab==='pick'&&(
        <div style={{padding:'36px 40px',maxWidth:900}}>
          <h1 style={{margin:'0 0 6px',fontSize:28,fontWeight:'bold',color:'#111'}}>Premise Picker</h1>
          <p style={{margin:'0 0 28px',fontSize:16,color:'#666'}}>Pick a premise for one episode, or plan an entire series arc.</p>

          {/* Mode toggle */}
          <div style={{display:'flex',gap:0,marginBottom:36,border:'2px solid #111',borderRadius:10,overflow:'hidden',width:'fit-content'}}>
            {([{v:'single' as const,label:'Single Episode'},{v:'series' as const,label:'Plan Full Series'}]).map(({v,label})=>(
              <button key={v} onClick={()=>setPickerMode(v)} style={{padding:'12px 32px',border:'none',background:pickerMode===v?'#111':'#fff',color:pickerMode===v?'#fff':'#111',cursor:'pointer',fontFamily:'inherit',fontSize:15,fontWeight:700,letterSpacing:0.5}}>{label}</button>
            ))}
          </div>

          {pickerMode==='single'&&(
            <>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:24,marginBottom:28}}>
                <div><label style={labelStyle}>Genre <span style={{color:'#c62828'}}>*</span></label>
                  <select value={pickerGenre} onChange={e=>{setPickerGenre(e.target.value);setPickerAuthor('')}} style={inputStyle}><option value="">Select a genre...</option>{GENRES.map(g=><option key={g} value={g}>{g}</option>)}</select>
                </div>
                {pickerGenre && (GENRE_AUTHOR_MAP[pickerGenre]||[]).length > 0 && (
                <div><label style={labelStyle}>Author Style</label>
                  <select value={pickerAuthor} onChange={e=>setPickerAuthor(e.target.value)} style={inputStyle}>
                    <option value="">Random</option>
                    {(GENRE_AUTHOR_MAP[pickerGenre]||[]).map(a=><option key={a} value={a}>{a} ({AUTHOR_STYLE_MAP[a]||'original'} style)</option>)}
                  </select>
                </div>
                )}
                <div><label style={labelStyle}>Runtime</label>
                  <div style={{display:'flex',gap:8}}>{RUNTIMES.map(r=><button key={r} onClick={()=>setPickerRuntime(r)} style={{flex:1,padding:'11px 0',border:`2px solid ${pickerRuntime===r?'#111':'#e0e0e0'}`,background:pickerRuntime===r?'#111':'#fff',color:pickerRuntime===r?'#fff':'#444',borderRadius:8,cursor:'pointer',fontFamily:'inherit',fontSize:14,fontWeight:pickerRuntime===r?700:400}}>{r}</button>)}</div>
                </div>
              </div>
              <div style={{marginBottom:28}}>
                <label style={labelStyle}>Is this part of an existing series?</label>
                <div style={{display:'flex',gap:12}}>
                  {[{v:false,label:'New Standalone'},{v:true,label:'Episode of Existing Series'}].map(({v,label})=>(
                    <button key={String(v)} onClick={()=>setPickerIsSeries(v)} style={{padding:'12px 28px',border:`2px solid ${pickerIsSeries===v?'#111':'#e0e0e0'}`,background:pickerIsSeries===v?'#111':'#fff',color:pickerIsSeries===v?'#fff':'#444',borderRadius:8,cursor:'pointer',fontFamily:'inherit',fontSize:15,fontWeight:pickerIsSeries===v?700:400}}>{label}</button>
                  ))}
                </div>
              </div>
              {pickerIsSeries&&(
                <div style={{marginBottom:28,padding:'20px 24px',background:'#f8f8f8',border:'1px solid #e0e0e0',borderRadius:8}}>
                  <div style={{display:'grid',gridTemplateColumns:'2fr 1fr 1fr',gap:20}}>
                    <div><label style={{...labelStyle,fontSize:14}}>Series Name</label><input value={pickerSeriesName} onChange={e=>setPickerSeriesName(e.target.value)} placeholder="e.g. Deadwater Canyon" style={{...inputStyle,fontSize:14}}/></div>
                    <div><label style={{...labelStyle,fontSize:14}}>Episode #</label><input type="number" min={1} value={pickerEpisodeNum} onChange={e=>setPickerEpisodeNum(Number(e.target.value))} style={{...inputStyle,fontSize:14}}/></div>
                    <div><label style={{...labelStyle,fontSize:14}}>Total Episodes</label><input type="number" min={2} value={pickerTotalEps} onChange={e=>setPickerTotalEps(Number(e.target.value))} style={{...inputStyle,fontSize:14}}/></div>
                  </div>
                </div>
              )}
              <div style={{marginBottom:28}}><label style={labelStyle}>Additional Notes <span style={{color:'#888',fontSize:14,fontWeight:'normal',marginLeft:8}}>— Optional</span></label><textarea value={pickerNotes} onChange={e=>setPickerNotes(e.target.value)} rows={2} placeholder="Themes, settings, constraints..." style={{...inputStyle,resize:'vertical',lineHeight:1.6}}/></div>
              <button onClick={generatePremises} disabled={pickerLoading||!pickerGenre} style={{background:pickerLoading||!pickerGenre?'#ccc':'#111',color:pickerLoading||!pickerGenre?'#888':'#fff',border:'none',borderRadius:8,padding:'16px 40px',cursor:pickerLoading||!pickerGenre?'not-allowed':'pointer',fontFamily:'inherit',fontSize:16,fontWeight:700,letterSpacing:1,textTransform:'uppercase'}}>
                {pickerLoading?'Generating Options...':'Get 3 Premise Options'}
              </button>
              {premiseOptions.length>0&&(
                <div style={{marginTop:40}}>
                  <div style={{fontSize:13,color:'#888',textTransform:'uppercase',letterSpacing:1,fontWeight:700,marginBottom:20}}>3 Options — expand any, add requirements, queue it</div>
                  {premiseOptions.map((opt,idx)=><PremiseCard key={opt.id} opt={opt} idx={idx} onQueue={queueOption}/>)}
                  {premiseOptions.some(o=>o.queued)&&<QueueBar waitingCount={waitingCount} premiseQueue={premiseQueue} queueRunning={queueRunning} onStart={startQueue}/>}
                </div>
              )}
            </>
          )}

          {pickerMode==='series'&&(
            <>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:24,marginBottom:28}}>
                <div><label style={labelStyle}>Genre <span style={{color:'#c62828'}}>*</span></label>
                  <select value={seriesGenre} onChange={e=>setSeriesGenre(e.target.value)} style={inputStyle}><option value="">Select a genre...</option>{GENRES.map(g=><option key={g} value={g}>{g}</option>)}</select>
                </div>
                <div><label style={labelStyle}>Runtime / Episode</label>
                  <div style={{display:'flex',gap:6}}>{RUNTIMES.map(r=><button key={r} onClick={()=>setSeriesRuntime(r)} style={{flex:1,padding:'11px 0',border:`2px solid ${seriesRuntime===r?'#111':'#e0e0e0'}`,background:seriesRuntime===r?'#111':'#fff',color:seriesRuntime===r?'#fff':'#444',borderRadius:8,cursor:'pointer',fontFamily:'inherit',fontSize:13,fontWeight:seriesRuntime===r?700:400}}>{r}</button>)}</div>
                </div>
                <div><label style={labelStyle}>Episodes</label>
                  <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>{EPISODE_COUNTS.map(n=><button key={n} onClick={()=>setSeriesEpisodeCount(n)} style={{flex:1,minWidth:40,padding:'11px 0',border:`2px solid ${seriesEpisodeCount===n?'#111':'#e0e0e0'}`,background:seriesEpisodeCount===n?'#111':'#fff',color:seriesEpisodeCount===n?'#fff':'#444',borderRadius:8,cursor:'pointer',fontFamily:'inherit',fontSize:14,fontWeight:seriesEpisodeCount===n?700:400}}>{n}</button>)}</div>
                </div>
              </div>
              <div style={{marginBottom:16}}>{seriesGenre && (GENRE_AUTHOR_MAP[seriesGenre]||[]).length > 0 && (<div style={{marginBottom:16}}><label style={labelStyle}>Author Style</label><select value={pickerAuthor} onChange={e=>setPickerAuthor(e.target.value)} style={inputStyle}><option value="">Random</option>{(GENRE_AUTHOR_MAP[seriesGenre]||[]).map(a=><option key={a} value={a}>{a} ({AUTHOR_STYLE_MAP[a]||'original'} style)</option>)}</select></div>)}</div><div style={{marginBottom:28}}><label style={labelStyle}>Notes <span style={{color:'#888',fontSize:14,fontWeight:'normal',marginLeft:8}}>— Optional. Setting, themes, protagonist type, anything specific.</span></label><textarea value={seriesNotes} onChange={e=>setSeriesNotes(e.target.value)} rows={2} placeholder="e.g. Small-town sheriff in 1970s Appalachia. Dark mystery with folklore elements. Female protagonist." style={{...inputStyle,resize:'vertical',lineHeight:1.6}}/></div>
              <button onClick={generateSeries} disabled={seriesLoading||!seriesGenre} style={{background:seriesLoading||!seriesGenre?'#ccc':'#111',color:seriesLoading||!seriesGenre?'#888':'#fff',border:'none',borderRadius:8,padding:'16px 40px',cursor:seriesLoading||!seriesGenre?'not-allowed':'pointer',fontFamily:'inherit',fontSize:16,fontWeight:700,letterSpacing:1,textTransform:'uppercase'}}>
                {seriesLoading?'Building Series...':'Generate Full Series'}
              </button>

              {seriesPlan&&(
                <div style={{marginTop:40}}>
                  {/* Series header */}
                  <div style={{padding:'24px 28px',background:'#111',borderRadius:12,marginBottom:24,color:'#fff'}}>
                    <div style={{fontSize:11,textTransform:'uppercase',letterSpacing:2,color:'#aaa',marginBottom:8}}>{seriesEpisodeCount}-Episode Series · {seriesGenre} · {seriesRuntime}/ep</div>
                    <div style={{fontSize:26,fontWeight:700,marginBottom:8}}>{seriesPlan.seriesName}</div>
                    <div style={{fontSize:15,color:'#ccc',fontStyle:'italic',marginBottom:12}}>{seriesPlan.seriesLogline}</div>
                    <div style={{fontSize:13,color:'#aaa'}}>{seriesPlan.author} · {seriesPlan.narrator}</div>
                  </div>

                  {/* Episode cards */}
                  <div style={{fontSize:13,color:'#888',textTransform:'uppercase',letterSpacing:1,fontWeight:700,marginBottom:16}}>
                    {seriesEpisodeCount} Episodes — review each, then queue all or individually
                  </div>
                  {seriesPlan.episodes.map(ep=>(
                    <SeriesEpisodeCard key={ep.id} ep={ep} plan={seriesPlan} onQueue={(ep,reqs)=>queueEpisode(ep,seriesPlan,reqs)}/>
                  ))}

                  {/* Queue all button */}
                  <div style={{marginTop:24,padding:'20px 28px',background:'#111',borderRadius:10,display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                    <div>
                      <div style={{color:'#fff',fontSize:16,fontWeight:700}}>{seriesPlan.episodes.filter(e=>!e.queued).length} episodes not yet queued</div>
                      <div style={{color:'#aaa',fontSize:13,marginTop:4}}>Queue all and generate sequentially — takes ~{seriesEpisodeCount*2} minutes unattended</div>
                    </div>
                    <div style={{display:'flex',gap:12}}>
                      {seriesPlan.episodes.some(e=>!e.queued)&&(
                        <button onClick={()=>queueAllEpisodes(seriesPlan)} style={{background:'#fff',color:'#111',border:'none',borderRadius:8,padding:'14px 24px',cursor:'pointer',fontFamily:'inherit',fontSize:15,fontWeight:700}}>
                          Queue All Episodes
                        </button>
                      )}
                      {waitingCount>0&&(
                        <button onClick={startQueue} disabled={queueRunning} style={{background:queueRunning?'#555':'#f97316',color:'#fff',border:'none',borderRadius:8,padding:'14px 28px',cursor:queueRunning?'not-allowed':'pointer',fontFamily:'inherit',fontSize:15,fontWeight:700}}>
                          {queueRunning?'● Generating...':'▶ Generate All'}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {tab==='write'&&(
        <div style={{padding:'36px 40px',maxWidth:800}}>
          <h1 style={{margin:'0 0 8px',fontSize:28,fontWeight:'bold',color:'#111'}}>Write Manually</h1>
          <p style={{margin:'0 0 36px',fontSize:16,color:'#666'}}>Fill in the fields directly. Use Premise Picker for AI-assisted premise generation.</p>
          <div style={{marginBottom:28}}><label style={labelStyle}>Genre <span style={{color:'#c62828'}}>*</span></label><select value={genre} onChange={e=>setGenre(e.target.value)} style={inputStyle}><option value="">Select a genre...</option>{GENRES.map(g=><option key={g} value={g}>{g}</option>)}</select></div>
          {pickedAuthor&&(
            <div style={{marginBottom:28,padding:'16px 20px',background:'#f8f8f8',border:'1px solid #e0e0e0',borderLeft:'4px solid #111',borderRadius:8}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}>
                <div>
                  <div style={{fontSize:12,color:'#888',textTransform:'uppercase',letterSpacing:1,marginBottom:6}}>Auto-selected for {genre}</div>
                  <div style={{fontSize:20,fontWeight:700,color:'#111',marginBottom:4}}>{pickedAuthor.name}</div>
                  <div style={{fontSize:14,color:'#555',marginBottom:2}}>{pickedAuthor.primary_genre}{pickedAuthor.secondary_genre?` · ${pickedAuthor.secondary_genre}`:''} · {(pickedAuthor.narrative_voice||'').replace(/_/g,' ')}</div>
                  <div style={{fontSize:13,color:'#888',fontStyle:'italic'}}>{pickedAuthor.tone}</div>
                  {pickedNarrator&&<div style={{marginTop:8,fontSize:13,color:'#555'}}>🎙 {pickedNarrator.name}</div>}
                </div>
                <div style={{display:'flex',flexDirection:'column',gap:8}}>
                  <button onClick={()=>setShowAuthorList(!showAuthorList)} style={smallBtn}>{showAuthorList?'▲ Hide':'↻ Change'}</button>
                  <button onClick={()=>autoPickAuthor(genre)} style={smallBtn}>🎲 Random</button>
                </div>
              </div>
            </div>
          )}
          {showAuthorList&&matchingAuthors.length>0&&(
            <div style={{marginBottom:28,border:'1px solid #e0e0e0',borderRadius:8,overflow:'hidden'}}>
              {matchingAuthors.map(a=>{ const n=narrators.find(nr=>nr.id===a.narrator_id); const isSel=pickedAuthor?.id===a.id; return(<div key={a.id} onClick={()=>pickSpecificAuthor(a)} style={{padding:'14px 20px',borderBottom:'1px solid #f0f0f0',cursor:'pointer',background:isSel?'#f0f4ff':'#fff',borderLeft:isSel?'4px solid #111':'4px solid transparent'}}><div style={{fontSize:15,fontWeight:700,color:'#111'}}>{a.name} {isSel&&'✓'}</div><div style={{fontSize:13,color:'#555'}}>{a.primary_genre} · {(a.narrative_voice||'').replace(/_/g,' ')}</div>{n&&<div style={{fontSize:12,color:'#888'}}>🎙 {n.name}</div>}</div>) })}
            </div>
          )}
          <div style={{marginBottom:28}}><label style={labelStyle}>Premise <span style={{color:'#c62828'}}>*</span></label><textarea value={premise} onChange={e=>setPremise(e.target.value)} rows={5} placeholder="Who is the protagonist? What do they want? What's standing in their way? What's at stake?" style={{...inputStyle,resize:'vertical',lineHeight:1.6}}/></div>
          <div style={{marginBottom:28}}><label style={labelStyle}>Runtime</label><div style={{display:'flex',gap:12}}>{RUNTIMES.map(r=><button key={r} onClick={()=>setRuntime(r)} style={{flex:1,padding:'14px 0',border:`2px solid ${runtime===r?'#111':'#e0e0e0'}`,background:runtime===r?'#111':'#fff',color:runtime===r?'#fff':'#444',borderRadius:8,cursor:'pointer',fontFamily:'inherit',fontSize:16,fontWeight:runtime===r?700:400}}>{r}</button>)}</div></div>
          <div style={{marginBottom:36}}><label style={labelStyle}>Special Requirements <span style={{color:'#888',fontSize:14,fontWeight:'normal',marginLeft:8}}>— Optional</span></label><textarea value={requirements} onChange={e=>setRequirements(e.target.value)} rows={3} placeholder="Resolved ending. No supernatural elements..." style={{...inputStyle,resize:'vertical',lineHeight:1.6}}/></div>
          <button onClick={generate} disabled={generating||!genre||!premise} style={{background:generating||!genre||!premise?'#ccc':'#111',color:generating||!genre||!premise?'#888':'#fff',border:'none',borderRadius:8,padding:'18px 48px',cursor:generating||!genre||!premise?'not-allowed':'pointer',fontFamily:'inherit',fontSize:18,fontWeight:700,letterSpacing:1,textTransform:'uppercase'}}>{generating?'Writing Story...':'Generate Story'}</button>
          {generating&&<p style={{marginTop:16,fontSize:15,color:'#666'}}>60–90 seconds. Claude is writing and grading your story.</p>}
          {pendingStories.length>0&&<div style={{marginTop:32,padding:'16px 20px',background:'#e8eaf6',borderRadius:8}}><span style={{fontSize:15,color:'#3949ab'}}>{pendingStories.length} {pendingStories.length===1?'story':'stories'} ready → </span><button onClick={()=>setTab('queue')} style={{background:'none',border:'none',color:'#3949ab',fontWeight:700,cursor:'pointer',fontSize:15,fontFamily:'inherit',textDecoration:'underline'}}>Go to Queue</button></div>}
        </div>
      )}

      {tab==='queue'&&(
        <div style={{padding:'36px 40px'}}>
          <h1 style={{margin:'0 0 8px',fontSize:28,fontWeight:'bold',color:'#111'}}>Story Queue</h1>
          <p style={{margin:'0 0 32px',fontSize:16,color:'#666'}}>{approvedStories.length} approved and ready for Hal.{pendingStories.length>0&&` ${pendingStories.length} waiting for review.`}{waitingCount>0&&` ${waitingCount} still generating.`}</p>
          {/* Action bar */}
          <div style={{display:'flex',gap:12,marginBottom:28,alignItems:'flex-start'}}>
            {approvedStories.length>0&&(
              <div style={{flex:1,padding:'16px 20px',background:'#e0f2f1',border:'1px solid #b2dfdb',borderRadius:8,display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                <div><div style={{fontSize:16,fontWeight:700,color:'#00695c'}}>{approvedStories.length} {approvedStories.length===1?'story':'stories'} approved</div><div style={{fontSize:14,color:'#00695c',marginTop:4}}>Send to Hal via Telegram when ready</div></div>
                <button onClick={()=>{ const scripts=approvedStories.map(s=>`\n\n${'='.repeat(60)}\n${s.title} — ${s.author} — ${s.runtime}\n${'='.repeat(60)}\n${s.script}`).join(''); navigator.clipboard.writeText(`HAL — Please produce these ${approvedStories.length} stories. Run full ASC pipeline on each. Set is_hidden = true. Send UUIDs when done.\n${scripts}`); alert('Copied — paste into Telegram') }} style={{background:'#00695c',color:'#fff',border:'none',borderRadius:6,padding:'12px 20px',cursor:'pointer',fontFamily:'inherit',fontSize:15,fontWeight:700}}>Copy Scripts for Hal</button>
              </div>
            )}
            <div style={{display:'flex',gap:8,alignSelf:'center'}}>
              {(stories.length>0||premiseQueue.length>0)&&(
                <button onClick={clearAllStories} style={{padding:'12px 16px',background:'#fff',border:'2px solid #e0e0e0',borderRadius:8,cursor:'pointer',fontFamily:'inherit',fontSize:13,fontWeight:700,color:'#c62828',whiteSpace:'nowrap'}}>
                  🗑 Clear All
                </button>
              )}
              {premiseQueue.some(p=>p.status==='waiting')&&!queueRunning&&(
                <button onClick={()=>setQueueRunning(true)} style={{padding:'12px 16px',background:'#f97316',color:'#fff',border:'none',borderRadius:8,cursor:'pointer',fontFamily:'inherit',fontSize:13,fontWeight:700,whiteSpace:'nowrap'}}>
                  ▶ Resume Queue
                </button>
              )}
              {stories.filter(s=>{ const score = s.ai_score ? s.ai_score.composite_score * 2.5 : 0; return score > 0 && score < 20 }).length>0&&(
                <button onClick={()=>{
                  const failures = stories.filter(s=>{ const score = s.ai_score ? s.ai_score.composite_score * 2.5 : 0; return score > 0 && score < 20 })
                  if (!confirm(`Delete ${failures.length} stories scoring below 20/25?`)) return
                  failures.forEach(s => deleteStory(s.id))
                }} style={{padding:'12px 16px',background:'#fff',border:'2px solid #ffcdd2',borderRadius:8,cursor:'pointer',fontFamily:'inherit',fontSize:13,fontWeight:700,color:'#c62828',whiteSpace:'nowrap'}}>
                  🗑 Delete Below 20
                </button>
              )}
            </div>
          </div>

          {/* Generating pipeline */}
          {premiseQueue.filter(q=>q.status==='waiting'||q.status==='generating').length>0&&(
            <div style={{marginBottom:28}}>
              <div style={{fontSize:12,color:'#888',textTransform:'uppercase',letterSpacing:1,fontWeight:700,marginBottom:12}}>Generating Pipeline</div>
              <div style={{display:'flex',flexDirection:'column',gap:8}}>
                {premiseQueue.filter(q=>q.status!=='done').map(q=>{
                  const isActive=q.status==='generating'
                  return(
                    <div key={q.id} style={{display:'flex',alignItems:'center',gap:16,padding:'14px 20px',background:isActive?'#f0f7ff':'#fafafa',border:`1px solid ${isActive?'#90caf9':'#e0e0e0'}`,borderRadius:8,borderLeft:`4px solid ${isActive?'#1976d2':'#bdbdbd'}`}}>
                      <div style={{width:20,height:20,flexShrink:0,display:'flex',alignItems:'center',justifyContent:'center'}}>
                        {isActive
                          ?<div style={{width:18,height:18,border:'2px solid #1976d2',borderTopColor:'transparent',borderRadius:'50%',animation:'spin 0.8s linear infinite'}}/>
                          :<div style={{width:10,height:10,borderRadius:'50%',background:'#bdbdbd'}}/>
                        }
                      </div>
                      <div style={{flex:1}}>
                        <div style={{fontSize:15,fontWeight:700,color:'#111'}}>{q.title}</div>
                        <div style={{fontSize:12,color:'#888',marginTop:2}}>{q.author} · {q.genre} · {q.runtime}{q.isSeries?` · Ep ${q.episodeNumber}/${q.totalEpisodes}`:''}</div>
                      </div>
                      <div style={{fontSize:13,fontWeight:700,color:isActive?'#1976d2':'#aaa'}}>{isActive?'Writing...':'In queue'}</div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
          {stories.length===0?(<div style={{textAlign:'center',padding:'60px 0',color:'#aaa'}}><div style={{fontSize:48,marginBottom:16}}>📖</div><p style={{fontSize:16}}>No stories yet. Use the Premise Picker to get started.</p></div>):(
            <div style={{display:'flex',flexDirection:'column',gap:16}}>
              {stories.map(s=>{ const st=STATUS_CONFIG[s.status]; const ai=s.ai_score?.composite_score; const aiOf25=ai?(ai<=10?(ai*2.5).toFixed(1):ai.toFixed(1)):null; const isSel=selected?.id===s.id; return(
                <div key={s.id} onClick={()=>setSelected(isSel?null:s)} style={{background:'#fff',border:`2px solid ${isSel?'#111':'#e0e0e0'}`,borderRadius:10,overflow:'hidden',cursor:'pointer'}}>
                  <div style={{padding:'18px 24px',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                    <div><div style={{fontSize:18,fontWeight:700,color:'#111',marginBottom:4}}>{s.title}</div><div style={{fontSize:14,color:'#666'}}>{s.author} · {s.genre} · {s.runtime}{s.narrator?` · ${s.narrator}`:''}{s.script.match(/^SERIES:\s*(.+)$/m)?.[1]?` · Series: ${s.script.match(/^SERIES:\s*(.+)$/m)?.[1]?.trim()}`:''}</div></div>
                    <div style={{display:'flex',alignItems:'center',gap:16}}>
                      {aiOf25&&<div style={{textAlign:'center'}}><div style={{fontSize:22,fontWeight:700,color:scoreColor(parseFloat(aiOf25),25)}}>{aiOf25}</div><div style={{fontSize:11,color:'#888',textTransform:'uppercase',letterSpacing:1}}>/25</div></div>}
                      <span style={{background:st.bg,color:st.color,padding:'4px 14px',borderRadius:20,fontSize:13,fontWeight:700}}>{st.label}</span>
                      <span style={{color:'#aaa',fontSize:20}}>{isSel?'▲':'▼'}</span>
                    </div>
                  </div>
                  {isSel&&(
                    <div style={{borderTop:'1px solid #e0e0e0'}}>
                      {(()=>{
                        const sid=s.id
                        const isProducing=producing===sid
                        const isProduced=producedIds.has(sid)
                        const ap=audioProgress[sid]
                        const isGenerating=ap?.step==='voices'||ap?.step==='music'||ap?.step==='mixing'
                        const isAudioDone=ap?.step==='done'
                        const hasError=ap?.step==='error'
                        return(
                        <div style={{padding:'16px 24px',background:'#f8f8f8',borderBottom:'1px solid #e0e0e0'}}>
                          <div style={{display:'flex',gap:12,alignItems:'center',flexWrap:'wrap'}}>
                            <button onClick={e=>{e.stopPropagation();if(!isProducing&&!isProduced)produceStory(s)}} disabled={isProducing||isProduced} style={{background:isProducing?'#bbdefb':isProduced?'#e8f5e9':'#1565c0',color:isProduced?'#2e7d32':'#fff',border:isProduced?'2px solid #2e7d32':'none',borderRadius:6,padding:'12px 24px',cursor:isProducing||isProduced?'default':'pointer',fontFamily:'inherit',fontSize:15,fontWeight:700,display:'flex',alignItems:'center',gap:8}}>
                              {isProducing&&<div style={{width:14,height:14,border:'2px solid #1565c0',borderTopColor:'transparent',borderRadius:'50%',animation:'spin 0.8s linear infinite',flexShrink:0}}/>}
                              {isProducing?'Producing...':(isProduced?'✓ Produced':'🎬 Produce')}
                            </button>
                            <button onClick={e=>{e.stopPropagation();if(isProduced&&!isGenerating&&!isAudioDone)handleGenerateAudio(s)}} disabled={!isProduced||isGenerating||isAudioDone} style={{background:isAudioDone?'#2e7d32':isGenerating?'#bbdefb':isProduced?'#f97316':'#e0e0e0',color:isProduced||isAudioDone||isGenerating?'#fff':'#aaa',border:'none',borderRadius:6,padding:'12px 24px',cursor:isProduced&&!isGenerating&&!isAudioDone?'pointer':'default',fontFamily:'inherit',fontSize:15,fontWeight:700,display:'flex',alignItems:'center',gap:8}}>
                              {isGenerating&&<div style={{width:14,height:14,border:'2px solid #fff',borderTopColor:'transparent',borderRadius:'50%',animation:'spin 0.8s linear infinite',flexShrink:0}}/>}
                              {isAudioDone?'✓ Audio Complete':isGenerating?(ap?.step==='voices'?'Generating Voices...':ap?.step==='music'?'Generating Music...':'Mixing Audio...'):(hasError?'🔄 Retry Audio':'🔊 Generate Audio')}
                            </button>
                            <button onClick={e=>{e.stopPropagation();if(isAudioDone)approve()}} disabled={!isAudioDone} style={{background:isAudioDone?'#2e7d32':'#e0e0e0',color:isAudioDone?'#fff':'#aaa',border:'none',borderRadius:6,padding:'12px 24px',cursor:isAudioDone?'pointer':'default',fontFamily:'inherit',fontSize:15,fontWeight:700}}>✓ Approve</button>
                            <button onClick={e=>{e.stopPropagation();if(!isProducing&&!isGenerating){const r=prompt('Reason?');if(r!==null)reject(r)}}} disabled={isProducing||isGenerating} style={{background:'#fff',color:isProducing||isGenerating?'#ccc':'#c62828',border:`1px solid ${isProducing||isGenerating?'#e0e0e0':'#c62828'}`,borderRadius:6,padding:'12px 24px',cursor:isProducing||isGenerating?'default':'pointer',fontFamily:'inherit',fontSize:15,fontWeight:700}}>Reject</button>
                            <button onClick={e=>{e.stopPropagation();if(confirm('Delete?'))deleteStory(sid)}} style={{marginLeft:'auto',background:'none',color:'#aaa',border:'1px solid #e0e0e0',borderRadius:6,padding:'12px 16px',cursor:'pointer',fontFamily:'inherit',fontSize:13}}>🗑</button>
                          </div>
                          {ap&&ap.step!=='idle'&&<AudioProgressBar ap={ap}/>}
                        </div>)
                      })()}
                      <div style={{display:'grid',gridTemplateColumns:'1fr 340px'}}>
                        <div style={{borderRight:'1px solid #e0e0e0'}}>
                          <div style={{padding:'12px 20px',borderBottom:'1px solid #e0e0e0',fontSize:12,color:'#888',letterSpacing:1,textTransform:'uppercase',fontWeight:700,display:'flex',justifyContent:'space-between',alignItems:'center'}}><span>Script</span><button onClick={()=>{navigator.clipboard.writeText(s.script);alert('Script copied to clipboard')}} style={{fontSize:11,padding:'4px 10px',background:'#f0f0f0',border:'1px solid #ccc',borderRadius:4,cursor:'pointer',fontWeight:600,textTransform:'none',letterSpacing:0}}>Copy Script</button></div>
                          <pre style={{margin:0,padding:20,fontSize:13,lineHeight:1.7,color:'#333',whiteSpace:'pre-wrap',wordBreak:'break-word',maxHeight:500,overflowY:'auto',fontFamily:'Courier New, monospace'}}>
                            {s.script.split('\n').map((line,i)=>{ if(line.match(/^\[SFX:|^\[MUSIC:|^\[BEAT\]|^\[PAUSE/)) return <span key={i} style={{color:'#3949ab'}}>{line}{'\n'}</span>; if(line.match(/^[A-Z][A-Z\s]+:/)) return <span key={i} style={{color:'#e65100',fontWeight:700}}>{line}{'\n'}</span>; return <span key={i}>{line}{'\n'}</span> })}
                          </pre>
                        </div>
                        <div style={{padding:20}}>
                          <div style={{fontSize:12,color:'#888',letterSpacing:1,textTransform:'uppercase',fontWeight:700,marginBottom:16}}>AI Script Grade</div>
                          {s.ai_score?(<>
                            <div style={{background:s.ai_score.recommendation==='Proceed'?'#e8f5e9':s.ai_score.recommendation==='Revise and Resubmit'?'#fff3e0':'#ffebee',color:s.ai_score.recommendation==='Proceed'?'#2e7d32':s.ai_score.recommendation==='Revise and Resubmit'?'#e65100':'#c62828',padding:'8px 14px',borderRadius:6,fontSize:14,fontWeight:700,textAlign:'center',marginBottom:16}}>{s.ai_score.recommendation}</div>
                            {([{key:'opening_hook',label:'Hook',weight:'15%'},{key:'overall_listenability',label:'Listenability',weight:'15%'},{key:'dialogue_quality',label:'Dialogue',weight:'15%'},{key:'story_clarity',label:'Clarity',weight:'20%'},{key:'ending_resolution',label:'Ending',weight:'20%'},{key:'structure_and_pacing',label:'Pacing',weight:'10%'},{key:'audio_suitability',label:'Audio',weight:'5%'}] as const).map(({key,label,weight})=>{ const dim=s.ai_score![key] as {score:number;feedback:string}; if(!dim) return null; return(<div key={key} style={{marginBottom:12}}><div style={{display:'flex',justifyContent:'space-between',marginBottom:4}}><span style={{fontSize:13,color:'#555'}}>{label} <span style={{color:'#aaa',fontSize:11}}>({weight})</span></span><span style={{fontSize:14,fontWeight:700,color:scoreColor(dim.score,10)}}>{dim.score}/10</span></div><div style={{height:4,background:'#eee',borderRadius:2}}><div style={{height:'100%',width:`${dim.score*10}%`,background:scoreColor(dim.score,10),borderRadius:2}}/></div><div style={{marginTop:3,fontSize:12,color:'#888',lineHeight:1.4}}>{dim.feedback}</div></div>) })}
                            <div style={{background:s.ai_score.policy_compliance.pass?'#e8f5e9':'#ffebee',borderRadius:6,padding:'8px 12px',marginTop:8}}><span style={{fontSize:13,fontWeight:700,color:s.ai_score.policy_compliance.pass?'#2e7d32':'#c62828'}}>{s.ai_score.policy_compliance.pass?'✓ Policy Pass':'✗ Policy FAIL'}</span></div>
                            {s.ai_score.top_fixes?.length>0&&<div style={{marginTop:12}}><div style={{fontSize:12,color:'#888',fontWeight:700,marginBottom:6,textTransform:'uppercase',letterSpacing:1}}>Top Fixes</div>{s.ai_score.top_fixes.map((fix,i)=><div key={i} style={{fontSize:13,color:'#e65100',marginBottom:4}}>{i+1}. {fix}</div>)}</div>}
                            <div style={{marginTop:12,fontSize:13,color:'#666',fontStyle:'italic',lineHeight:1.5,borderTop:'1px solid #eee',paddingTop:12}}>{s.ai_score.evaluator_summary}</div>
                          </>):<div style={{color:'#aaa',fontSize:14}}>No grade available.</div>}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )})}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

type AudioStep = 'idle'|'voices'|'music'|'mixing'|'done'|'error'
type AudioState = { step: AudioStep; voiceStats?: {succeeded:number;total:number;failed:number}; finalUrl?: string; error?: string }

function AudioGenButton({ap,onGenerate}:{ap:AudioState|undefined;onGenerate:(e:React.MouseEvent<HTMLButtonElement>)=>void}) {
  const busy = ap?.step==='voices'||ap?.step==='music'||ap?.step==='mixing'
  const label = busy ? (ap?.step==='voices' ? '🎙 Generating voices...' : ap?.step==='music' ? '🎵 Generating music...' : '🎛 Mixing audio...') : ap?.step==='done' ? '✅ Audio Done' : ap?.step==='error' ? '🔄 Retry Audio' : '🔊 Generate Audio'
  const bg = busy ? '#ccc' : ap?.step==='done' ? '#2e7d32' : '#f97316'
  return <button onClick={onGenerate} disabled={busy} style={{background:bg,color:'#fff',border:'none',borderRadius:6,padding:'12px 24px',cursor:busy?'not-allowed':'pointer',fontFamily:'inherit',fontSize:15,fontWeight:700}}>{label}</button>
}

function AudioProgressBar({ap}:{ap:AudioState}) {
  const voiceDone = ap.step==='mixing'||ap.step==='done'||ap.step==='error'
  const mixDone = ap.step==='done'
  return(
    <div style={{marginTop:12,padding:'12px 16px',background:'#fff',border:'1px solid #e0e0e0',borderRadius:8}}>
      <div style={{display:'flex',gap:16,alignItems:'center',flexWrap:'wrap'}}>
        <div style={{display:'flex',gap:8,alignItems:'center'}}>
          {ap.step==='voices'?<div style={{width:14,height:14,border:'2px solid #1976d2',borderTopColor:'transparent',borderRadius:'50%',animation:'spin 0.8s linear infinite'}}/>:<div style={{width:10,height:10,borderRadius:'50%',background:voiceDone?'#2e7d32':'#e0e0e0'}}/>}
          <span style={{fontSize:13,fontWeight:ap.step==='voices'?700:400,color:ap.step==='voices'?'#1976d2':voiceDone?'#2e7d32':'#999'}}>Voice gen{ap.voiceStats?` ${ap.voiceStats.succeeded}/${ap.voiceStats.total} lines`:''}</span>
        </div>
        <span style={{color:'#ddd',fontSize:12}}>→</span>
        <div style={{display:'flex',gap:8,alignItems:'center'}}>
          {ap.step==='mixing'?<div style={{width:14,height:14,border:'2px solid #1976d2',borderTopColor:'transparent',borderRadius:'50%',animation:'spin 0.8s linear infinite'}}/>:<div style={{width:10,height:10,borderRadius:'50%',background:mixDone?'#2e7d32':'#e0e0e0'}}/>}
          <span style={{fontSize:13,fontWeight:ap.step==='mixing'?700:400,color:ap.step==='mixing'?'#1976d2':mixDone?'#2e7d32':'#999'}}>ffmpeg mix</span>
        </div>
        {mixDone&&ap.finalUrl&&<a href={ap.finalUrl} target="_blank" rel="noreferrer" style={{marginLeft:'auto',fontSize:13,color:'#1565c0',fontWeight:700,textDecoration:'none'}}>▶ Listen to final mix →</a>}
      </div>
      {ap.step==='error'&&<div style={{marginTop:8,fontSize:13,color:'#c62828'}}>❌ {ap.error}</div>}
    </div>
  )
}

function QueueBar({waitingCount,premiseQueue,queueRunning,onStart}:{waitingCount:number;premiseQueue:QueuedPremise[];queueRunning:boolean;onStart:()=>void}) {
  return(
    <div style={{marginTop:24,padding:'20px 24px',background:'#111',borderRadius:10,display:'flex',alignItems:'center',justifyContent:'space-between'}}>
      <div>
        <div style={{color:'#fff',fontSize:16,fontWeight:700}}>{waitingCount} {waitingCount===1?'story':'stories'} queued</div>
        <div style={{color:'#aaa',fontSize:13,marginTop:4}}>{premiseQueue.filter(q=>q.status==='waiting').map(q=>q.title).join(' → ')}</div>
      </div>
      <button onClick={onStart} disabled={queueRunning} style={{background:queueRunning?'#555':'#f97316',color:'#fff',border:'none',borderRadius:8,padding:'14px 28px',cursor:queueRunning?'not-allowed':'pointer',fontFamily:'inherit',fontSize:15,fontWeight:700}}>{queueRunning?'● Generating...':'▶ Generate All'}</button>
    </div>
  )
}

function SeriesEpisodeCard({ep,plan,onQueue}:{ep:SeriesEpisode;plan:SeriesPlan;onQueue:(ep:SeriesEpisode,reqs:string)=>void}) {
  const [expanded,setExpanded]=useState(false)
  const [extraReqs,setExtraReqs]=useState('')
  const isFinale=ep.episodeNumber===plan.episodes.length
  return(
    <div style={{marginBottom:12,border:`2px solid ${ep.queued?'#2e7d32':'#e0e0e0'}`,borderRadius:10,overflow:'hidden',background:ep.queued?'#f1f8f1':'#fff'}}>
      <div onClick={()=>setExpanded(!expanded)} style={{padding:'16px 24px',display:'flex',alignItems:'center',gap:16,cursor:'pointer'}}>
        <div style={{background:isFinale?'#f97316':'#111',color:'#fff',borderRadius:20,padding:'3px 12px',fontSize:12,fontWeight:700,whiteSpace:'nowrap'}}>EP {ep.episodeNumber}{isFinale?' · FINALE':''}</div>
        <div style={{flex:1}}>
          <div style={{fontSize:17,fontWeight:700,color:'#111'}}>{ep.episodeTitle}</div>
          <div style={{fontSize:13,color:'#888',marginTop:2,fontStyle:'italic'}}>"{ep.hook.slice(0,80)}{ep.hook.length>80?'...':''}"</div>
        </div>
        {ep.queued&&<span style={{background:'#2e7d32',color:'#fff',borderRadius:20,padding:'2px 10px',fontSize:12,fontWeight:700}}>✓ QUEUED</span>}
        <span style={{color:'#aaa',fontSize:18}}>{expanded?'▲':'▼'}</span>
      </div>
      {expanded&&(
        <div style={{borderTop:'1px solid #e0e0e0',padding:'20px 24px'}}>
          <div style={{marginBottom:12}}><div style={{fontSize:12,color:'#888',textTransform:'uppercase',letterSpacing:1,fontWeight:700,marginBottom:6}}>Hook</div><div style={{fontSize:15,color:'#333',fontStyle:'italic'}}>"{ep.hook}"</div></div>
          <div style={{marginBottom:12}}><div style={{fontSize:12,color:'#888',textTransform:'uppercase',letterSpacing:1,fontWeight:700,marginBottom:6}}>Premise</div><div style={{fontSize:14,color:'#333',lineHeight:1.7}}>{ep.premise}</div></div>
          {ep.cliffhanger&&<div style={{marginBottom:16,padding:'10px 14px',background:'#fff3e0',borderRadius:6,borderLeft:'3px solid #f97316'}}><div style={{fontSize:11,color:'#e65100',textTransform:'uppercase',letterSpacing:1,fontWeight:700,marginBottom:4}}>Cliffhanger</div><div style={{fontSize:13,color:'#333'}}>{ep.cliffhanger}</div></div>}
          <div style={{marginBottom:16}}><label style={{display:'block',fontSize:12,color:'#888',textTransform:'uppercase',letterSpacing:1,fontWeight:700,marginBottom:6}}>Additional Requirements (optional)</label><textarea value={extraReqs} onChange={e=>setExtraReqs(e.target.value)} rows={2} onClick={e=>e.stopPropagation()} placeholder="Anything specific for this episode..." style={{width:'100%',background:'#fff',border:'1px solid #ccc',borderRadius:6,padding:'10px 14px',color:'#111',fontSize:14,fontFamily:'Georgia, serif',outline:'none',boxSizing:'border-box',resize:'vertical'}}/></div>
          {!ep.queued?<button onClick={e=>{e.stopPropagation();onQueue(ep,extraReqs)}} style={{background:'#111',color:'#fff',border:'none',borderRadius:8,padding:'10px 24px',cursor:'pointer',fontFamily:'Georgia, serif',fontSize:14,fontWeight:700}}>+ Queue This Episode</button>:<div style={{fontSize:14,color:'#2e7d32',fontWeight:700}}>✓ Added to queue</div>}
        </div>
      )}
    </div>
  )
}

function PremiseCard({opt,idx,onQueue}:{opt:PremiseOption;idx:number;onQueue:(opt:PremiseOption,reqs:string)=>void}) {
  const [extraReqs,setExtraReqs]=useState('')
  const [expanded,setExpanded]=useState(true)
  return(
    <div style={{marginBottom:20,border:`2px solid ${opt.queued?'#2e7d32':'#e0e0e0'}`,borderRadius:10,overflow:'hidden',background:opt.queued?'#f1f8f1':'#fff'}}>
      <div onClick={()=>setExpanded(!expanded)} style={{padding:'18px 24px',display:'flex',justifyContent:'space-between',alignItems:'flex-start',cursor:'pointer'}}>
        <div style={{flex:1}}>
          <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:8}}>
            <span style={{background:'#111',color:'#fff',borderRadius:20,padding:'2px 12px',fontSize:12,fontWeight:700,letterSpacing:1}}>OPTION {idx+1}</span>
            {opt.queued&&<span style={{background:'#2e7d32',color:'#fff',borderRadius:20,padding:'2px 10px',fontSize:12,fontWeight:700}}>✓ QUEUED</span>}
          </div>
          <div style={{fontSize:20,fontWeight:700,color:'#111',marginBottom:6}}>{opt.title}</div>
          <div style={{fontSize:13,color:'#888',marginBottom:8}}>{opt.author} · {opt.narrator} · {opt.runtime}</div>
          <div style={{fontSize:15,color:'#444',fontStyle:'italic',lineHeight:1.5}}>"{opt.hook}"</div>
        </div>
        <span style={{color:'#aaa',fontSize:20,marginLeft:16,flexShrink:0}}>{expanded?'▲':'▼'}</span>
      </div>
      {expanded&&(
        <div style={{borderTop:'1px solid #e0e0e0',padding:'20px 24px'}}>
          <div style={{marginBottom:16}}><div style={{fontSize:12,color:'#888',textTransform:'uppercase',letterSpacing:1,fontWeight:700,marginBottom:8}}>Premise</div><div style={{fontSize:15,color:'#333',lineHeight:1.7}}>{opt.premise}</div></div>
          {opt.scoringNote&&<div style={{marginBottom:16,padding:'10px 14px',background:'#e8f5e9',borderRadius:6}}><span style={{fontSize:13,color:'#2e7d32'}}>🎯 {opt.scoringNote}</span></div>}
          {opt.seriesNote&&<div style={{marginBottom:16,padding:'10px 14px',background:'#e8eaf6',borderRadius:6}}><span style={{fontSize:13,color:'#3949ab'}}>📺 {opt.seriesNote}</span></div>}
          <div style={{marginBottom:16}}><label style={{display:'block',fontSize:13,fontWeight:700,color:'#555',marginBottom:8,textTransform:'uppercase',letterSpacing:1}}>Your Additional Requirements (optional)</label><textarea value={extraReqs} onChange={e=>setExtraReqs(e.target.value)} rows={2} placeholder="Anything specific you want added, changed, or avoided..." onClick={e=>e.stopPropagation()} style={{width:'100%',background:'#fff',border:'1px solid #ccc',borderRadius:6,padding:'10px 14px',color:'#111',fontSize:14,fontFamily:'Georgia, serif',outline:'none',boxSizing:'border-box',resize:'vertical'}}/></div>
          {!opt.queued?<button onClick={e=>{e.stopPropagation();onQueue(opt,extraReqs)}} style={{background:'#111',color:'#fff',border:'none',borderRadius:8,padding:'12px 28px',cursor:'pointer',fontFamily:'Georgia, serif',fontSize:15,fontWeight:700}}>+ Queue This Story</button>:<div style={{fontSize:14,color:'#2e7d32',fontWeight:700}}>✓ Added to generation queue</div>}
        </div>
      )}
    </div>
  )
}

const labelStyle: React.CSSProperties={display:'block',fontSize:17,fontWeight:700,color:'#111',marginBottom:10}
const inputStyle: React.CSSProperties={width:'100%',background:'#fff',border:'1px solid #ccc',borderRadius:8,padding:'12px 16px',color:'#111',fontSize:16,fontFamily:'Georgia, serif',outline:'none',boxSizing:'border-box'}
const smallBtn: React.CSSProperties={background:'none',border:'1px solid #ccc',borderRadius:6,padding:'8px 14px',cursor:'pointer',fontSize:13,color:'#555',fontFamily:'Georgia, serif',whiteSpace:'nowrap'}
