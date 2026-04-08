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

const GENRES = ['Thriller','Horror','Dark Mystery','Mystery/Crime','Adventure','Drama','Sci-Fi','Western','Historical Drama','Supernatural','Family/Heartwarming','Comedy']
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
  'Sara Keene': 'First person. Tense, intimate, psychological. Fast pacing. Female protagonists, unreliable narrators. Example: "I knew before I opened the door. I always know."',
  'Elias Thorn': 'First person. Dark, lyrical, dread-soaked. Slow-burn. Rural settings, folklore, nature as threat.',
  'Dale Harmon': 'Third person limited. Warm, grounded, cinematic. Blue-collar male heroes, moral clarity.',
  'Julian Mercer': 'Third person limited. Precise, cool, procedural. Detective POV, urban, twist endings.',
  'Daniel Wren': 'Third person omniscient. Warm, observational. Ensemble casts, small-town, redemption arcs.',
  'Mark Holbrook': 'Third person limited. Cinematic, restrained. Male protagonists under pressure, moral ambiguity.',
  'Silas Graves': 'First person. Raw, visceral, confessional. Working-class protagonists, isolated settings.',
  'Nina Vasquez': 'Third person omniscient. Clinical, curious. Female scientists, near-future, ethical dilemmas.',
  'Caroline Drake': 'Third person limited. Elegant, quietly menacing. Female protagonists, historical 1920s-1960s.',
  'Marc Hobelman': 'Third person limited. Spare, weathered, laconic. Lone protagonists, frontier justice, moral gray zones. Sentences 8-12 words.',
}

const NARRATOR_MAP: Record<string, string> = {
  'Marc Hobelman': 'Ray Dolan', 'Sara Keene': 'Cole Hargrove', 'Elias Thorn': 'Cole Hargrove',
  'Dale Harmon': 'Finn Calloway', 'Julian Mercer': 'Iris Calloway', 'Daniel Wren': 'Elliott Crane',
  'Mark Holbrook': 'Morgan Veil', 'Silas Graves': 'Cole Hargrove', 'Nina Vasquez': 'Marcus Hale',
  'Caroline Drake': 'Iris Calloway',
}

const GENRE_AUTHOR_MAP: Record<string, string[]> = {
  'Thriller': ['Sara Keene','Mark Holbrook'], 'Horror': ['Silas Graves','Elias Thorn'],
  'Dark Mystery': ['Elias Thorn','Julian Mercer'], 'Mystery/Crime': ['Julian Mercer','Caroline Drake'],
  'Adventure': ['Dale Harmon','Mark Holbrook'], 'Drama': ['Daniel Wren','Mark Holbrook'],
  'Sci-Fi': ['Nina Vasquez'], 'Western': ['Marc Hobelman'],
  'Historical Drama': ['Caroline Drake','Daniel Wren'], 'Supernatural': ['Silas Graves','Sara Keene'],
  'Family/Heartwarming': ['Daniel Wren'], 'Comedy': ['Daniel Wren'],
}

function buildScriptPrompt(p: {
  author: string; authorTone: string; authorVoice: string; genre: string
  runtime: string; narrator: string; premise: string; requirements: string
  isSeries: boolean; seriesName: string; episodeNumber: number
  totalEpisodes: number; isFinale: boolean; episodeTitle: string
}): string {
  const wordCount = p.runtime === '10 min' ? '1,200-1,400' : p.runtime === '15 min' ? '1,800-2,100' : p.runtime === '20 min' ? '2,400-2,800' : '3,000-3,500'
  const profile = AUTHOR_PROFILES[p.author] || `${p.authorVoice} voice. ${p.authorTone}.`
  const endingRule = p.isSeries && !p.isFinale ? 'SERIES EPISODE: End on hard cliffhanger. No resolution. Final line = burning question.' : p.isSeries && p.isFinale ? 'FINALE: Resolve ALL threads. Clear earned outcome. No cliffhanger.' : 'STANDALONE: Resolve completely. Final NARRATOR line conclusive.'
  const seriesBlock = p.isSeries ? `\nSERIES: ${p.seriesName}\nEPISODE: ${p.episodeNumber} of ${p.totalEpisodes}\nEPISODE_TITLE: ${p.episodeTitle}\nSERIES_IS_FINALE: ${p.isFinale}\n${p.isFinale ? '\nFINALE RULE: Resolve ALL story threads. Clear earned outcome. Close the series formally.' : '\nSERIES RULE: End on HARD CLIFFHANGER — shocking revelation, immediate danger, or betrayal. Final line = burning question. "To be continued" FORBIDDEN. ANNOUNCER outro teases something SPECIFIC from next episode.'}` : ''
  return `You are the Endless Tales script writer. Write a complete professional audio drama script.

AUDIENCE: Commuters and truckers. Listening while driving. Cannot rewind. 90 seconds to hook them.

AUTHOR: ${p.author}
VOICE PROFILE: ${profile}
GENRE: ${p.genre}
RUNTIME: ${p.runtime} — TARGET: ${wordCount} words dialogue+narration at 130 wpm
NARRATOR: ${p.narrator}${seriesBlock}

PREMISE:
${p.premise}
${p.requirements ? `\nREQUIREMENTS:\n${p.requirements}` : ''}

FORMAT — Begin with:
BELLE B INTRO
---
BELLE B: [one line — [LISTENER_NAME] placed naturally, story title in quotes, specific sensory detail, never time-of-day]
---

Header (all fields):
SERIES: ${p.isSeries ? p.seriesName : ''}
EPISODE: ${p.isSeries ? p.episodeNumber : ''}
EPISODE_TITLE: ${p.isSeries ? p.episodeTitle : ''}
SERIES_TOTAL_EPISODES: ${p.isSeries ? p.totalEpisodes : ''}
SERIES_IS_FINALE: ${p.isSeries ? p.isFinale : ''}
AUTHOR: ${p.author}
GENRE: ${p.genre}
DESCRIPTION: [24 words max, punchy present-tense hook]
NARRATOR: ${p.narrator}
ANNOUNCER: Belle B
NARRATIVE_VOICE: [match author profile]
NARRATOR_IS_CHARACTER: false
SUNO PROMPT: [2-3 sentences: genre, instrumentation, tempo, mood]

CHARACTER GUIDE
---
[NAME — age, gender, accent, personality]

[START AUDIO DRAMA SCRIPT]

RULES:
- DIALOGUE: CHARACTER NAME: text — ALL CAPS, no parentheticals ever
- [SFX: description] own line. [BEAT] own line. [PAUSE:X] own line.
- SFX every 60-90 seconds
- Open mid-action. Never "It was a quiet..."
- Introduce every character on first appearance
- Re-anchor listener after every scene change

DIALOGUE DIFFERENTIATION — every character must sound distinct:
- Protagonist: clipped, controlled, thinks before speaking — pressure shows in what he DOESN'T say
- Antagonist/threat: smoother, more words, false confidence
- Supporting characters: different rhythms — nervous = short bursts, authority = declarative
- Never two characters with the same sentence length pattern

INTERNAL VOICE (third limited):
- Use NARRATOR lines to carry the protagonist's thoughts and feelings — not just action
- At least one NARRATOR line per scene that goes inside the protagonist's head
- Example: NARRATOR: He knew the answer before she finished the sentence. He wished he didn't.

ENDING — CRITICAL:
- ${endingRule}
- ⚠️ YOU MUST COMPLETE THE ENDING. If running long, compress middle scenes — NEVER cut off before the final BELLE B outro line.
- The script is not complete until BELLE B speaks the final outro. Budget your words to get there.
- A truncated script scores below 18/25 automatically. A complete script with a strong ending scores 23+.

- ANNOUNCER INTRO: "Endless Tales presents... [title]. [episode if series]. [one-sentence hook]."
- ANNOUNCER OUTRO: ${p.isSeries && !p.isFinale ? 'Two beats: land emotional moment + tease SPECIFIC thing from next episode. Format as BELLE B: line.' : 'BELLE B: That was "[Title]" — an Endless Tales original. Written by [Author].'}

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

  return `You are the Endless Tales series developer. Create a complete ${p.episodeCount}-episode audio drama series for commuters and truckers.

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
- Listener hook: commuters decide in 90 seconds — first sentence must grab immediately

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
      "hook": "Exact first-sentence hook — specific, sensory, mid-action, grabs a trucker in 10 seconds",
      "premise": "3-4 sentences: who, what they want, what stands in their way, what is at stake. Specific enough to write a complete script.",
      "cliffhanger": "One sentence describing the specific cliffhanger that ends this episode (leave blank for finale)"
    }
  ]
}`
}

function buildPickerPrompt(p: { genre: string; runtime: string; isSeries: boolean; seriesName: string; totalEpisodes: number; episodeNumber: number; extraNotes: string }): string {
  const eligible = (GENRE_AUTHOR_MAP[p.genre] || [p.genre]).join(', ')
  return `Generate exactly 3 distinct high-scoring premise options for an Endless Tales audio drama for commuters and truckers.

Genre: ${p.genre} | Runtime: ${p.runtime} | Type: ${p.isSeries ? `Series "${p.seriesName}" Episode ${p.episodeNumber} of ${p.totalEpisodes}` : 'Standalone'}
${p.extraNotes ? `Notes: ${p.extraNotes}` : ''}
Eligible authors: ${eligible}

Narrator pairings: Marc Hobelman→Ray Dolan | Sara Keene→Cole Hargrove | Elias Thorn→Cole Hargrove | Dale Harmon→Finn Calloway | Julian Mercer→Iris Calloway | Daniel Wren→Elliott Crane | Mark Holbrook→Morgan Veil | Silas Graves→Cole Hargrove | Nina Vasquez→Marcus Hale | Caroline Drake→Iris Calloway

Return ONLY valid JSON:
{"options":[{"title":"","author":"","narrator":"","hook":"Exact first-sentence hook — specific, sensory, mid-action","premise":"3-4 sentences: protagonist, want, obstacle, stakes","seriesNote":"${p.isSeries ? 'How this fits the series arc' : ''}","scoringNote":"What drives this to 23+/25"}]}`
}

export default function StoryProductionPage() {
  const [tab, setTab] = useState<'pick'|'write'|'queue'>('pick')
  const [pickerMode, setPickerMode] = useState<'single'|'series'>('single')
  const [stories, setStories] = useState<Story[]>([])
  const [selected, setSelected] = useState<Story|null>(null)
  const [authors, setAuthors] = useState<Author[]>([])
  const [narrators, setNarrators] = useState<Narrator[]>([])
  const [generating, setGenerating] = useState(false)
  const [status, setStatus] = useState('')

  // Single picker
  const [pickerGenre, setPickerGenre] = useState('')
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
    if(stored){ try{ setStories(JSON.parse(stored)) }catch{} }
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
      const resp = await fetch('/api/claude-proxy',{ method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ model:'claude-sonnet-4-20250514', max_tokens:2000, messages:[{role:'user',content:buildPickerPrompt({genre:pickerGenre,runtime:pickerRuntime,isSeries:pickerIsSeries,seriesName:pickerSeriesName,totalEpisodes:pickerTotalEps,episodeNumber:pickerEpisodeNum,extraNotes:pickerNotes})}] }) })
      const data=await resp.json()
      const raw=data.content?.[0]?.text?.replace(/```json|```/g,'').trim()
      const parsed=JSON.parse(raw)
      setPremiseOptions(parsed.options.map((o: Record<string,string>,i: number)=>({ id:`opt_${Date.now()}_${i}`, title:o.title||`Option ${i+1}`, hook:o.hook||'', premise:o.premise||'', author:o.author||'', narrator:o.narrator||'', genre:pickerGenre, runtime:pickerRuntime, seriesNote:o.seriesNote||'', scoringNote:o.scoringNote||'', queued:false })))
    } catch(err){ alert(`Failed: ${err}`) }
    finally{ setPickerLoading(false) }
  }

  async function generateSeries() {
    if(!seriesGenre){ alert('Select a genre first.'); return }
    setSeriesLoading(true); setSeriesPlan(null)
    try {
      const resp = await fetch('/api/claude-proxy',{ method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ model:'claude-sonnet-4-20250514', max_tokens:4000, messages:[{role:'user',content:buildSeriesPrompt({genre:seriesGenre,runtime:seriesRuntime,episodeCount:seriesEpisodeCount,notes:seriesNotes})}] }) })
      const data=await resp.json()
      const raw=data.content?.[0]?.text?.replace(/```json|```/g,'').trim()
      const parsed=JSON.parse(raw)
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
    const current=JSON.parse(localStorage.getItem('et_stories_v2')||'[]')
    saveStories([newStory,...current])
    setStatus(`Writing "${q.title}"...`)
    try {
      const prompt=buildScriptPrompt({ author:q.author, authorTone:authorObj?.tone||'', authorVoice:authorObj?.narrative_voice||'third_limited', genre:q.genre, runtime:q.runtime, narrator:q.narrator, premise:q.premise, requirements:q.requirements, isSeries:q.isSeries, seriesName:q.seriesName, episodeNumber:q.episodeNumber, totalEpisodes:q.totalEpisodes, isFinale:q.isFinale, episodeTitle:q.title })
      const resp=await fetch('/api/claude-proxy',{ method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ model:'claude-sonnet-4-20250514', max_tokens:16000, messages:[{role:'user',content:prompt}] }) })
      const data=await resp.json()
      const script=data.content?.[0]?.text||''
      const title=script.match(/"([^"]{5,80})"/)?.[1]||q.title
      setStatus(`Grading "${q.title}"...`)
      const aiScore=await gradeScript(script,q.author,q.genre)
      const latest=JSON.parse(localStorage.getItem('et_stories_v2')||'[]')
      saveStories(latest.map((s: Story)=>s.id===storyId?{...s,title:q.title,status:'ready',script,ai_score:aiScore}:s))
      setSelected({...newStory,title:q.title,status:'ready',script,ai_score:aiScore})
    } catch(err) {
      const latest=JSON.parse(localStorage.getItem('et_stories_v2')||'[]')
      saveStories(latest.map((s: Story)=>s.id===storyId?{...s,status:'rejected' as StoryStatus,notes:`Error: ${err}`}:s))
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
      const resp=await fetch('/api/claude-proxy',{ method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ model:'claude-sonnet-4-20250514', max_tokens:16000, messages:[{role:'user',content:prompt}] }) })
      const data=await resp.json(); const script=data.content?.[0]?.text||''
      const title=script.match(/"([^"]{5,60})"/)?.[1]||`${genre} Story`
      setStatus('Grading your story...')
      const aiScore=await gradeScript(script,pickedAuthor.name,genre)
      const finished: Story={...newStory,title,status:'ready',script,ai_score:aiScore}
      saveStories(updated.map(s=>s.id===storyId?finished:s))
      setSelected(finished); setTab('queue')
    } catch(err) {
      saveStories(updated.map(s=>s.id===storyId?{...s,status:'rejected' as StoryStatus,notes:`Error: ${err}`}:s))
      setStatus(`Failed: ${err}`)
    } finally{ setGenerating(false); setStatus('') }
  }

  async function gradeScript(script: string, author: string, g: string): Promise<AIScore|null> {
    try {
      const resp=await fetch('/api/claude-proxy',{ method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ model:'claude-sonnet-4-20250514', max_tokens:1500, messages:[{role:'user',content:`Grade this Endless Tales audio drama for commuters/truckers who cannot look at a screen. Brutally honest. Scores 1-10.\n\nWeights: opening_hook 25%, overall_listenability 25%, dialogue_quality 20%, structure_and_pacing 15%, audio_suitability 15%.\ncomposite_score = weighted average max 10. Shown as x2.5=/25. Policy fail = auto Rejected.\n\nReturn ONLY valid JSON:\n{"opening_hook":{"score":0,"feedback":""},"overall_listenability":{"score":0,"feedback":""},"dialogue_quality":{"score":0,"feedback":""},"structure_and_pacing":{"score":0,"feedback":""},"audio_suitability":{"score":0,"feedback":""},"policy_compliance":{"pass":true,"feedback":""},"composite_score":0,"recommendation":"Proceed","top_fixes":[],"evaluator_summary":""}\n\nrecommendation = "Proceed"|"Revise and Resubmit"|"Rejected"\nAuthor: ${author} | Genre: ${g}\nSCRIPT:\n${script.slice(0,6000)}`}] }) })
      const data=await resp.json()
      const raw=data.content?.[0]?.text?.replace(/```json|```/g,'').trim()
      return raw?JSON.parse(raw):null
    } catch{ return null }
  }

  function approve() { if(!selected) return; const updated=stories.map(s=>s.id===selected.id?{...s,status:'approved' as StoryStatus}:s); saveStories(updated); setSelected({...selected,status:'approved'}) }
  function reject(reason: string) { if(!selected) return; const updated=stories.map(s=>s.id===selected.id?{...s,status:'rejected' as StoryStatus,notes:reason}:s); saveStories(updated); setSelected({...selected,status:'rejected',notes:reason}) }

  function clearQueue() {
    if(!confirm('Clear the generation pipeline? Completed and approved stories will be kept.')) return
    setPremiseQueue([])
    setQueueRunning(false)
  }

  function deleteStory(id: string) {
    const updated = stories.filter(s => s.id !== id)
    saveStories(updated)
    if(selected?.id === id) setSelected(null)
  }

  const approvedStories=stories.filter(s=>s.status==='approved')
  const pendingStories=stories.filter(s=>s.status==='ready'||s.status==='generating')
  const waitingCount=premiseQueue.filter(q=>q.status==='waiting').length

  return (
    <div style={{fontFamily:'Georgia, serif',color:'#111',background:'#FAF9F6',minHeight:'100vh'}}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      {status&&<div style={{background:'#e8f5e9',borderBottom:'1px solid #c8e6c9',padding:'12px 32px',color:'#2e7d32',fontSize:15}}>● {status}</div>}

      <div style={{borderBottom:'2px solid #e0e0e0',padding:'0 32px',display:'flex',gap:0,background:'#fff'}}>
        {([{key:'pick' as const,label:'Premise Picker'},{key:'write' as const,label:'Write Manually'},{key:'queue' as const,label:`Queue (${approvedStories.length} approved${waitingCount>0?` · ${waitingCount} pending`:''})`}]).map(t=>(
          <button key={t.key} onClick={()=>setTab(t.key)} style={{background:'none',border:'none',borderBottom:tab===t.key?'2px solid #111':'2px solid transparent',marginBottom:-2,padding:'16px 24px',cursor:'pointer',fontFamily:'inherit',fontSize:15,fontWeight:tab===t.key?700:400,color:tab===t.key?'#111':'#888',textTransform:'uppercase',letterSpacing:1}}>{t.label}</button>
        ))}
      </div>

      {tab==='pick'&&(
        <div style={{padding:'36px 40px',maxWidth:900}}>
          <h1 style={{margin:'0 0 6px',fontSize:28,fontWeight:'bold',color:'#111'}}>Premise Picker</h1>
          <p style={{margin:'0 0 28px',fontSize:16,color:'#666'}}>Generate premises for a single story or a complete series.</p>

          {/* Mode toggle */}
          <div style={{display:'flex',gap:0,marginBottom:36,border:'2px solid #111',borderRadius:10,overflow:'hidden',width:'fit-content'}}>
            {([{v:'single' as const,label:'Single Story'},{v:'series' as const,label:'Full Series'}]).map(({v,label})=>(
              <button key={v} onClick={()=>setPickerMode(v)} style={{padding:'12px 32px',border:'none',background:pickerMode===v?'#111':'#fff',color:pickerMode===v?'#fff':'#111',cursor:'pointer',fontFamily:'inherit',fontSize:15,fontWeight:700,letterSpacing:0.5}}>{label}</button>
            ))}
          </div>

          {pickerMode==='single'&&(
            <>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:24,marginBottom:28}}>
                <div><label style={labelStyle}>Genre <span style={{color:'#c62828'}}>*</span></label>
                  <select value={pickerGenre} onChange={e=>setPickerGenre(e.target.value)} style={inputStyle}><option value="">Select a genre...</option>{GENRES.map(g=><option key={g} value={g}>{g}</option>)}</select>
                </div>
                <div><label style={labelStyle}>Runtime</label>
                  <div style={{display:'flex',gap:8}}>{RUNTIMES.map(r=><button key={r} onClick={()=>setPickerRuntime(r)} style={{flex:1,padding:'11px 0',border:`2px solid ${pickerRuntime===r?'#111':'#e0e0e0'}`,background:pickerRuntime===r?'#111':'#fff',color:pickerRuntime===r?'#fff':'#444',borderRadius:8,cursor:'pointer',fontFamily:'inherit',fontSize:14,fontWeight:pickerRuntime===r?700:400}}>{r}</button>)}</div>
                </div>
              </div>
              <div style={{marginBottom:28}}>
                <label style={labelStyle}>Story Type</label>
                <div style={{display:'flex',gap:12}}>
                  {[{v:false,label:'Standalone'},{v:true,label:'Series Episode'}].map(({v,label})=>(
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
              <div style={{marginBottom:28}}><label style={labelStyle}>Notes <span style={{color:'#888',fontSize:14,fontWeight:'normal',marginLeft:8}}>— Optional. Setting, themes, protagonist type, anything specific.</span></label><textarea value={seriesNotes} onChange={e=>setSeriesNotes(e.target.value)} rows={2} placeholder="e.g. Small-town sheriff in 1970s Appalachia. Dark mystery with folklore elements. Female protagonist." style={{...inputStyle,resize:'vertical',lineHeight:1.6}}/></div>
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
            {stories.length>0&&(
              <button onClick={clearQueue} style={{padding:'12px 20px',background:'#fff',border:'2px solid #e0e0e0',borderRadius:8,cursor:'pointer',fontFamily:'inherit',fontSize:14,fontWeight:700,color:'#c62828',whiteSpace:'nowrap'}}>
                🗑 Clear Queue
              </button>
            )}
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
              {stories.map(s=>{ const st=STATUS_CONFIG[s.status]; const ai=s.ai_score?.composite_score; const aiOf25=ai?(ai*2.5).toFixed(1):null; const isSel=selected?.id===s.id; return(
                <div key={s.id} onClick={()=>setSelected(isSel?null:s)} style={{background:'#fff',border:`2px solid ${isSel?'#111':'#e0e0e0'}`,borderRadius:10,overflow:'hidden',cursor:'pointer'}}>
                  <div style={{padding:'18px 24px',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                    <div><div style={{fontSize:18,fontWeight:700,color:'#111',marginBottom:4}}>{s.title}</div><div style={{fontSize:14,color:'#666'}}>{s.author} · {s.genre} · {s.runtime}{s.narrator?` · ${s.narrator}`:''}</div></div>
                    <div style={{display:'flex',alignItems:'center',gap:16}}>
                      {aiOf25&&<div style={{textAlign:'center'}}><div style={{fontSize:22,fontWeight:700,color:scoreColor(parseFloat(aiOf25),25)}}>{aiOf25}</div><div style={{fontSize:11,color:'#888',textTransform:'uppercase',letterSpacing:1}}>/25</div></div>}
                      <span style={{background:st.bg,color:st.color,padding:'4px 14px',borderRadius:20,fontSize:13,fontWeight:700}}>{st.label}</span>
                      <span style={{color:'#aaa',fontSize:20}}>{isSel?'▲':'▼'}</span>
                    </div>
                  </div>
                  {isSel&&(
                    <div style={{borderTop:'1px solid #e0e0e0'}}>
                      {s.status==='ready'&&(<div style={{padding:'16px 24px',background:'#f8f8f8',display:'flex',gap:12,borderBottom:'1px solid #e0e0e0',alignItems:'center'}}>
                        <button onClick={e=>{e.stopPropagation();approve()}} style={{background:'#2e7d32',color:'#fff',border:'none',borderRadius:6,padding:'12px 24px',cursor:'pointer',fontFamily:'inherit',fontSize:15,fontWeight:700}}>✓ Approve for Hal</button>
                        <button onClick={e=>{e.stopPropagation();const r=prompt('Reason?');if(r!==null)reject(r)}} style={{background:'#fff',color:'#c62828',border:'1px solid #c62828',borderRadius:6,padding:'12px 24px',cursor:'pointer',fontFamily:'inherit',fontSize:15,fontWeight:700}}>Reject</button>
                        <button onClick={e=>{e.stopPropagation();if(confirm('Delete this story?'))deleteStory(s.id)}} style={{marginLeft:'auto',background:'none',color:'#aaa',border:'1px solid #e0e0e0',borderRadius:6,padding:'12px 16px',cursor:'pointer',fontFamily:'inherit',fontSize:13}}>🗑 Delete</button>
                      </div>)}
                      {(s.status==='approved'||s.status==='rejected')&&(<div style={{padding:'12px 24px',background:'#f8f8f8',display:'flex',justifyContent:'flex-end',borderBottom:'1px solid #e0e0e0'}}>
                        <button onClick={e=>{e.stopPropagation();if(confirm('Delete this story?'))deleteStory(s.id)}} style={{background:'none',color:'#aaa',border:'1px solid #e0e0e0',borderRadius:6,padding:'8px 14px',cursor:'pointer',fontFamily:'inherit',fontSize:13}}>🗑 Delete</button>
                      </div>)}
                      <div style={{display:'grid',gridTemplateColumns:'1fr 340px'}}>
                        <div style={{borderRight:'1px solid #e0e0e0'}}>
                          <div style={{padding:'12px 20px',borderBottom:'1px solid #e0e0e0',fontSize:12,color:'#888',letterSpacing:1,textTransform:'uppercase',fontWeight:700}}>Script</div>
                          <pre style={{margin:0,padding:20,fontSize:13,lineHeight:1.7,color:'#333',whiteSpace:'pre-wrap',wordBreak:'break-word',maxHeight:500,overflowY:'auto',fontFamily:'Courier New, monospace'}}>
                            {s.script.split('\n').map((line,i)=>{ if(line.match(/^\[SFX:|^\[MUSIC:|^\[BEAT\]|^\[PAUSE/)) return <span key={i} style={{color:'#3949ab'}}>{line}{'\n'}</span>; if(line.match(/^[A-Z][A-Z\s]+:/)) return <span key={i} style={{color:'#e65100',fontWeight:700}}>{line}{'\n'}</span>; return <span key={i}>{line}{'\n'}</span> })}
                          </pre>
                        </div>
                        <div style={{padding:20}}>
                          <div style={{fontSize:12,color:'#888',letterSpacing:1,textTransform:'uppercase',fontWeight:700,marginBottom:16}}>AI Script Grade</div>
                          {s.ai_score?(<>
                            <div style={{background:s.ai_score.recommendation==='Proceed'?'#e8f5e9':s.ai_score.recommendation==='Revise and Resubmit'?'#fff3e0':'#ffebee',color:s.ai_score.recommendation==='Proceed'?'#2e7d32':s.ai_score.recommendation==='Revise and Resubmit'?'#e65100':'#c62828',padding:'8px 14px',borderRadius:6,fontSize:14,fontWeight:700,textAlign:'center',marginBottom:16}}>{s.ai_score.recommendation}</div>
                            {([{key:'opening_hook',label:'Hook',weight:'25%'},{key:'overall_listenability',label:'Listenability',weight:'25%'},{key:'dialogue_quality',label:'Dialogue',weight:'20%'},{key:'structure_and_pacing',label:'Pacing',weight:'15%'},{key:'audio_suitability',label:'Audio',weight:'15%'}] as const).map(({key,label,weight})=>{ const dim=s.ai_score![key] as {score:number;feedback:string}; if(!dim) return null; return(<div key={key} style={{marginBottom:12}}><div style={{display:'flex',justifyContent:'space-between',marginBottom:4}}><span style={{fontSize:13,color:'#555'}}>{label} <span style={{color:'#aaa',fontSize:11}}>({weight})</span></span><span style={{fontSize:14,fontWeight:700,color:scoreColor(dim.score,10)}}>{dim.score}/10</span></div><div style={{height:4,background:'#eee',borderRadius:2}}><div style={{height:'100%',width:`${dim.score*10}%`,background:scoreColor(dim.score,10),borderRadius:2}}/></div><div style={{marginTop:3,fontSize:12,color:'#888',lineHeight:1.4}}>{dim.feedback}</div></div>) })}
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
