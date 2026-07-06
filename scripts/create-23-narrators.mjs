/**
 * create-23-narrators.mjs
 * Creates 23 new narrator voices in ElevenLabs + inserts into narrator_voices + updates authors
 * Run: node scripts/create-23-narrators.mjs
 */

import { readFileSync } from 'fs'
import { createClient } from '@supabase/supabase-js'

// Load env
const envFile = readFileSync('/Users/williampostlewaite/Projects/drivetimetales/.env.local', 'utf8')
const env = {}
for (const line of envFile.split('\n')) {
  const m = line.match(/^([^#=]+)=(.*)$/)
  if (m) env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '')
}

const EL_KEY = env.ELEVENLABS_API_KEY
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

// Sample texts by voice type
const SAMPLES = {
  dark: "He found her in the alley, same as the others. Three in a month. Someone was sending a message, and he was the only one left who could read it.",
  sardonic: "The plan was brilliant. Simple, clean, no loose ends. That lasted about four minutes before everything caught fire — literally.",
  gravelly: "Nobody told me the job would get complicated. I should have asked better questions. Now there were bodies, and I was the last one standing with a gun.",
  warm_male: "He'd driven this road a thousand times. But today it looked different — or maybe he did. Something had shifted in the night, and the morning hadn't put it back.",
  weathered: "The land didn't care about his problems. Never had. The river ran the same whether men lived or died along its banks, and that, he thought, was either comfort or cruelty.",
  bleak: "They buried him at first light, before the ground could freeze harder. Nobody spoke. There was nothing to say that the dirt didn't already know.",
  neutral_male: "What most people don't realize is that the universe has been doing this for fourteen billion years — and it has exactly zero opinion about whether we're watching.",
  adventurous_female: "The valley opened below them like a secret the mountain had kept for centuries. She checked her compass, then looked at the map, then at the sky. They were close.",
  crisp_female: "Navigation system offline. Oxygen reserves at sixty-two percent. Three crew members unaccounted for. She pulled up the emergency protocol and started making decisions.",
  witty_female: "The specimen in question was — and I say this as a scientist with no emotional attachment whatsoever — the most aggressively weird thing I had ever seen.",
  chaotic_warm: "The wedding was scheduled for two o'clock. By noon, the cake had collapsed, the groom was missing, and three different aunts were crying for entirely unrelated reasons.",
  intimate_spare: "She left the coat on the chair for a week. Then a month. After a year, she moved it to the closet. She never wore it. But she never gave it away.",
  dark_sharp: "Everyone in that room was lying. The question wasn't who — it was which lie mattered enough to kill for.",
  british_historical: "The court had heard a great many convenient confessions. This one, she noted, had the particular flavor of a man who had been told exactly what to say.",
  warm_probe: "Something about the village was wrong in a way she couldn't name. Not wrong like a crime. Wrong like a held breath — like everyone was waiting for something to exhale.",
  prairie_spare: "Winter came early that year, as if the prairie had decided it was done with the warmth and the pretending. She pulled her coat tighter and kept walking.",
  truecrime_female: "The case file was four hundred pages. She had read it six times. Somewhere in those pages, buried under the official version, was the truth — if it hadn't been buried with him.",
  earthy_warm: "He didn't know much about love, but he knew about loyalty. And sometimes, in the right light, they looked exactly the same.",
  young_horror: "The house at the end of Linden Street had been empty for three years. Everyone on the block knew that. Which made the light in the upstairs window very difficult to explain.",
  elegant_literary: "The detective — and he used the word loosely, professionally, the way one might describe a weapon — arrived in town on a Tuesday, which was, in retrospect, everyone's first mistake.",
  cool_espionage: "She had three identities, two aliases, and one rule: never let anyone know which version of herself she was operating as. Tonight, she wasn't sure she remembered either.",
  prickly_warm: "He was not, in any traditional sense, a pleasant man. His neighbors knew this. His doctor knew this. Even his dog, frankly, had reservations. And yet.",
  battle_ready: "The shield wall held on the left flank. It was the right flank that worried him — the gap between the third and fourth ranks, where a man could slip through if he knew how.",
  lean_sly: "The thing about a perfect getaway is that somebody always forgets about the dog.",
}

// The 23 narrators
const NARRATORS = [
  // Group 1: Ray Dolan split (keep Declan Marsh)
  {
    name: 'Cole Rafferty',
    authorName: 'Dex Carver',
    gender: 'male', age: 'middle_aged', accent: 'american',
    tone: 'sardonic', accentLabel: 'american',
    voiceCode: 'NR-MA-M4-SD-US-V1',
    description: 'Kinetic, cynical, hard-edged American male — the voice of someone who has seen the worst the city offers and stopped being surprised. Fast-moving, street-smart, never sentimental.',
    bio: "Cole narrates with the speed and cynicism of a detective who's worked too many bad cases in too many bad neighborhoods. His voice moves like traffic — always forward, always urgent, with a sardonic edge that never lets you forget: this world is not what it pretends to be.",
    tone_tags: ['Mystery', 'True Crime', 'Thriller', 'Noir'],
    sampleKey: 'sardonic',
  },
  {
    name: 'Harlan Cress',
    authorName: 'J. Calloway Reid',
    gender: 'male', age: 'old', accent: 'american',
    tone: 'weathered', accentLabel: 'american',
    voiceCode: 'NR-MA-L5-WD-US-V1',
    description: 'Spare, haunting Appalachian male — the voice of the mountain hollows, where stories are told slowly and nothing is wasted. Deliberate, unhurried, with deep mountain gravity.',
    bio: "Harlan carries the weight of Appalachian hills in every syllable — spare as stripped timber, patient as stone. He narrates the way old men tell stories on porches: nothing rushed, nothing decorated, and an honesty that cuts deeper for its plainness.",
    tone_tags: ['Classics', 'Drama', 'Historical', 'Southern'],
    sampleKey: 'weathered',
  },
  {
    name: 'Vince Caulfield',
    authorName: 'Jack Malone',
    gender: 'male', age: 'middle_aged', accent: 'american',
    tone: 'gravelly', accentLabel: 'american',
    voiceCode: 'NR-MA-E4-GR-US-V1',
    description: 'Hard-boiled, direct, slightly gravelly American male — the thriller voice. No-nonsense, fast, and built for momentum. Reads like Lee Child writes: stripped down, practical, and relentless.',
    bio: "Vince doesn't waste time. His voice is the sound of a man who moves fast, hits hard, and has already calculated the exits. Hard-boiled without posturing, gravelly without affect — built to carry action-thriller prose the way it was meant to sound: efficient and dangerous.",
    tone_tags: ['Thriller', 'Crime', 'Action', 'Mystery'],
    sampleKey: 'gravelly',
  },
  {
    name: 'Rex Drummond',
    authorName: 'Roman Steele',
    gender: 'male', age: 'middle_aged', accent: 'american',
    tone: 'dark', accentLabel: 'american',
    voiceCode: 'NR-MA-M4-DK-US-V1',
    description: 'Blunt, hard, aggressive American male — military-thriller energy. Cuts through. Every word is weight-bearing. The voice of a man who has been in rooms where the stakes were absolute.',
    bio: "Rex narrates like a classified briefing — clipped, hard, absolutely without decoration. His voice carries the particular authority of someone who has operated in darkness and doesn't pretend otherwise. Psychological thriller, espionage, and high-stakes action are his natural terrain.",
    tone_tags: ['Thriller', 'Psychological', 'Espionage', 'Military'],
    sampleKey: 'dark',
  },
  {
    name: 'Decker Raines',
    authorName: 'Wade Tolliver',
    gender: 'male', age: 'old', accent: 'american',
    tone: 'dark', accentLabel: 'american',
    voiceCode: 'NR-MA-L5-DK-US-V1',
    description: 'Bleak, spare, grave Western male — McCarthy\'s weight made audible. Every word costs something. The voice of the frontier without romanticism: violent, beautiful, and final.',
    bio: "Decker narrates the way McCarthy writes — each sentence placed like a stone. His voice carries the bleak grandeur of the American West: landscapes that don't care whether you live, and men who have made their peace with that. No false comfort. No easy exits.",
    tone_tags: ['Western', 'Literary', 'Drama', 'Historical'],
    sampleKey: 'bleak',
  },
  // Group 2: Walter Hayes split (keep Dale Harmon)
  {
    name: 'Gordon Paley',
    authorName: 'Linus Vane',
    gender: 'male', age: 'middle_aged', accent: 'american',
    tone: 'neutral', accentLabel: 'american',
    voiceCode: 'NR-MA-M4-NT-US-V1',
    description: 'Articulate, warm but precise American male — the engaged intellectual who loves what he\'s explaining. Clear, accessible, science-forward without being sterile. Think Neil deGrasse Tyson energy.',
    bio: "Gordon narrates the way great science communicators think: with genuine enthusiasm for the subject, total clarity of explanation, and a warmth that makes even abstract ideas feel personal. He is the voice of curiosity made audible — never lecturing, always inviting.",
    tone_tags: ['Learn', 'Science', 'Non-Fiction', 'Education'],
    sampleKey: 'neutral_male',
  },
  {
    name: 'Amara Daye',
    authorName: 'Zara Osei',
    gender: 'female', age: 'young', accent: 'american',
    tone: 'warm', accentLabel: 'american',
    voiceCode: 'NR-FE-M3-WM-US-V1',
    description: 'Warm, rich, adventurous female — built for sweeping historical adventure. Sun-scorched, romantic, with the emotional depth to carry epic scale. Wilbur Smith terrain.',
    bio: "Amara brings warmth and sweep to adventure on a grand scale — her voice carries the heat of open landscapes, the risk of long journeys, the emotional cost of heroism. She narrates historical adventure the way it deserves: as something real, physical, and worth everything it asks.",
    tone_tags: ['Adventure', 'Historical', 'Romance', 'Epic'],
    sampleKey: 'adventurous_female',
  },
  {
    name: 'Vera Koss',
    authorName: 'Zara Storm',
    gender: 'female', age: 'young', accent: 'american',
    tone: 'crisp', accentLabel: 'american',
    voiceCode: 'NR-FE-YO-CR-US-V1',
    description: 'Crisp, slightly epic female — built for deep space. Clear and propulsive, with a precision that suggests someone navigating at scale. James S.A. Corey energy: the cosmos feels personal.',
    bio: "Vera narrates the way starship helmswomen think: clear, fast, emotionally anchored even when the scale is astronomical. Her voice makes space feel both immense and intimate — the right balance for Sci-Fi where the technology is accurate and the stakes are human.",
    tone_tags: ['Sci-Fi', 'Adventure', 'Epic', 'Speculative'],
    sampleKey: 'crisp_female',
  },
  // Group 3: Riley Quinn split (keep Claire Ashford)
  {
    name: 'Priya Lunden',
    authorName: 'Dr. Halvard Reese',
    gender: 'female', age: 'young', accent: 'american',
    tone: 'neutral', accentLabel: 'american',
    voiceCode: 'NR-FE-M3-NT-US-V1',
    description: 'Witty, curious, accessible female — science journalist with warmth and genuine wonder. Mary Roach energy: the facts are accurate, the delivery is human, and the weirdness is embraced.',
    bio: "Priya narrates non-fiction the way the best science communicators write it: with genuine curiosity, an instinct for the surprising detail, and a sense of humor that never undermines the substance. She makes learning feel like an adventure rather than an obligation.",
    tone_tags: ['Learn', 'Science', 'Non-Fiction', 'Humor'],
    sampleKey: 'witty_female',
  },
  {
    name: 'Brigid Hanley',
    authorName: 'Maeve Kelly',
    gender: 'female', age: 'middle_aged', accent: 'american',
    tone: 'warm', accentLabel: 'american',
    voiceCode: 'NR-FE-E4-WM-US-V1',
    description: 'Warm, quick, slightly chaotic female — finds everything charming, thinks on her feet. Comedy/Drama narrator who makes accumulated disaster feel like an act of love.',
    bio: "Brigid narrates like someone who has been at every family disaster and loved every second of it — warmly, generously, with a speed that keeps pace with the chaos. Her voice is the comedy of unconditional affection: the world is ridiculous, people are impossible, and somehow that only makes her fonder of them.",
    tone_tags: ['Comedy', 'Drama', 'Heartwarming', 'Family'],
    sampleKey: 'chaotic_warm',
  },
  // Group 4: Iris Calloway split (keep Caroline Drake)
  {
    name: 'Lena Pruett',
    authorName: 'Diana Reeve',
    gender: 'female', age: 'middle_aged', accent: 'american',
    tone: 'intimate', accentLabel: 'american',
    voiceCode: 'NR-FE-M4-IT-US-V1',
    description: 'Spare, intimate, quietly devastating female — nothing wasted. Elizabeth Strout terrain: every silence earns its weight. Emotionally precise without sentimentality.',
    bio: "Lena narrates with the economy of a writer who knows that the most devastating things are said in the fewest words. Her voice is spare, controlled, and intimate — the literary drama voice for stories where what is not said matters as much as what is.",
    tone_tags: ['Drama', 'Literary', 'Family', 'Quiet'],
    sampleKey: 'intimate_spare',
  },
  {
    name: 'Darcy Morse',
    authorName: 'Sloane Prescott',
    gender: 'female', age: 'young', accent: 'american',
    tone: 'dark', accentLabel: 'american',
    voiceCode: 'NR-FE-M3-DK-US-V1',
    description: 'Acidic, dark, razor-sharp female — Gillian Flynn precision with an edge that cuts. The voice of unreliable narration and social observation that makes you feel implicated.',
    bio: "Darcy narrates the way Flynn writes: with intelligence, darkness, and the particular pleasure of a voice that sees through everything — including you. Her tone is cool, sharp, and slightly threatening, which is exactly right for psychological mystery and dark domestic thriller.",
    tone_tags: ['Mystery', 'True Crime', 'Thriller', 'Psychological'],
    sampleKey: 'dark_sharp',
  },
  // Group 5: Eve split (keep Holland Reese)
  {
    name: 'Cecily Greer',
    authorName: 'Ada Rourke',
    gender: 'female', age: 'middle_aged', accent: 'british',
    tone: 'authoritative', accentLabel: 'british',
    voiceCode: 'NR-FE-L5-AU-UK-V1',
    description: 'Psychologically sharp, vivid, authoritative British female — Hilary Mantel intelligence made audible. Historically dense and politically alive, with the weight of Tudor courts in her voice.',
    bio: "Cecily narrates historical fiction the way Mantel wrote it: from the inside, with total psychological conviction. Her British authority carries the density of lived history — the texture of courts, the cost of loyalty, the feel of power in rooms where the wrong word ends careers.",
    tone_tags: ['Historical', 'Drama', 'Literary', 'Political'],
    sampleKey: 'british_historical',
  },
  {
    name: 'Sylvie Thorn',
    authorName: 'Iris Fontaine',
    gender: 'female', age: 'middle_aged', accent: 'american',
    tone: 'warm', accentLabel: 'american',
    voiceCode: 'NR-FE-M4-WM-US-V1',
    description: 'Warm but probing, quietly observant female — Three Pines quality. Sees more than she reveals. Mystery and supernatural terrain where atmosphere and community are as important as plot.',
    bio: "Sylvie narrates mystery and supernatural fiction the way Louise Penny builds Three Pines — with warmth, patience, and the quiet certainty that something is wrong long before anyone admits it. Her voice invites trust and then uses it precisely.",
    tone_tags: ['Mystery', 'Supernatural', 'Drama', 'Atmospheric'],
    sampleKey: 'warm_probe',
  },
  // Group 6: Isla Sterling split (keep Frances Adler)
  {
    name: 'Clara Westing',
    authorName: 'Edith Vance',
    gender: 'female', age: 'old', accent: 'american',
    tone: 'neutral', accentLabel: 'american',
    voiceCode: 'NR-FE-L5-NT-US-V1',
    description: 'Quiet, spare, slightly formal American female — prairie restraint and frontier endurance. Willa Cather terrain: the land is a character, and the prose earns its beauty through plainness.',
    bio: "Clara narrates with the plainspoken dignity of the American frontier — quietly, without decoration, and with a patience that mirrors the landscape. Her voice is the sound of Willa Cather country: wide, still, and carrying more feeling than it shows.",
    tone_tags: ['Classics', 'Historical', 'Drama', 'Literary'],
    sampleKey: 'prairie_spare',
  },
  {
    name: 'Carmen Doyle',
    authorName: 'Rita Salazar',
    gender: 'female', age: 'middle_aged', accent: 'american',
    tone: 'neutral', accentLabel: 'american',
    voiceCode: 'NR-FE-E4-NT-US-V1',
    description: 'Measured, clear, controlled American female — true crime journalist with precise empathy. Ann Rule terrain: always factual, never cold, with the focused clarity of someone building an airtight case.',
    bio: "Carmen narrates true crime with the discipline of a journalist and the empathy of someone who never forgot these were real people. Her voice is measured, controlled, and credible — which makes the moments she allows herself to feel something land with particular weight.",
    tone_tags: ['True Crime', 'Mystery', 'Non-Fiction', 'Investigative'],
    sampleKey: 'truecrime_female',
  },
  // Group 7: James Alcott split (keep Daniel Wren)
  {
    name: 'Bert Hollis',
    authorName: 'Gus Pendry',
    gender: 'male', age: 'old', accent: 'american',
    tone: 'warm', accentLabel: 'american',
    voiceCode: 'NR-MA-L5-WM-US-V1',
    description: 'Warm, earthy, devoted American male — favorite uncle energy. W. Bruce Cameron terrain: big-hearted, loyal, the kind of voice you trust immediately with something you love.',
    bio: "Bert narrates the way the best heartwarming storytellers write — with total conviction, complete generosity, and no irony whatsoever. His voice is the sound of genuine devotion: to animals, to people, to the everyday small miracles of loyalty and love. You trust him immediately.",
    tone_tags: ['Heartwarming', 'Drama', 'Family', 'Animals'],
    sampleKey: 'earthy_warm',
  },
  {
    name: 'Nate Holford',
    authorName: 'Theo Wicks',
    gender: 'male', age: 'young', accent: 'american',
    tone: 'warm', accentLabel: 'american',
    voiceCode: 'NR-MA-YO-WM-US-V1',
    description: 'Warm, conversational, observational young male — sounds completely safe until he doesn\'t. Grady Hendrix terrain: Horror/Comedy where the warmth makes the dark moments hit harder.',
    bio: "Nate narrates like the most likeable person in the room — warm, funny, genuinely delightful. Which makes it all the more effective when the floor drops out. His voice is the horror/comedy instrument: establish trust, exploit trust, leave the listener unsettled and somehow still charmed.",
    tone_tags: ['Horror', 'Comedy', 'Supernatural', 'Thriller'],
    sampleKey: 'young_horror',
  },
  // Group 8: Desmond Vale split (keep Dr. Kai Osei)
  {
    name: 'Pierce Langley',
    authorName: 'Theodore Knox',
    gender: 'male', age: 'middle_aged', accent: 'american',
    tone: 'authoritative', accentLabel: 'american',
    voiceCode: 'NR-MA-M4-AU-US-V1',
    description: 'Elegant, literary, precise American male — slightly theatrical but always controlled. Truman Capote terrain: the voice makes the observation, and the observation is devastating.',
    bio: "Pierce narrates with the literary elegance of a man who has spent a lifetime paying attention. His voice carries Capote's quality — precise, slightly theatrical, with the particular authority of someone who notices everything and forgets nothing. For true crime and literary drama where observation is the instrument.",
    tone_tags: ['True Crime', 'Literary', 'Drama', 'Investigative'],
    sampleKey: 'elegant_literary',
  },
  // Group 9: Katherine Bell split (keep Edmund Worth)
  {
    name: 'Sasha Laine',
    authorName: 'Nadia Cross',
    gender: 'female', age: 'young', accent: 'american',
    tone: 'crisp', accentLabel: 'american',
    voiceCode: 'NR-FE-M3-CR-US-V1',
    description: 'Cool, crisp, controlled female with international texture — thinks in multiple languages. Daniel Silva terrain: espionage and thriller where control is competence and composure is armor.',
    bio: "Sasha narrates the way field operatives work — with complete control, zero unnecessary motion, and a precision that suggests she has run this scenario in her head seventeen times already. Her voice carries international texture: cosmopolitan, contained, and quietly lethal.",
    tone_tags: ['Thriller', 'Espionage', 'Mystery', 'International'],
    sampleKey: 'cool_espionage',
  },
  // Group 10: June Harlow split (keep Dani Reeves)
  {
    name: 'Ruth Engel',
    authorName: 'Eleanor Tate',
    gender: 'female', age: 'middle_aged', accent: 'american',
    tone: 'sardonic', accentLabel: 'american',
    voiceCode: 'NR-FE-L5-SD-US-V1',
    description: 'Slightly prickly, wry, quietly moving female — the softness lands when you least expect it. Fredrik Backman terrain: grumpy exterior, devastating interior.',
    bio: "Ruth narrates the way Backman writes: with impatience and wit on the surface and something much more tender underneath. Her voice is the sound of someone who keeps the world at arm's length because letting it close is terrifying — and occasionally, unexpectedly, does it anyway.",
    tone_tags: ['Heartwarming', 'Drama', 'Comedy', 'Family'],
    sampleKey: 'prickly_warm',
  },
  // Group 11: Bill Brody split (keep Hugh Marlowe)
  {
    name: 'Griffith Mace',
    authorName: 'Edmund Farr',
    gender: 'male', age: 'middle_aged', accent: 'british',
    tone: 'authoritative', accentLabel: 'british',
    voiceCode: 'NR-MA-M4-AU-UK-V1',
    description: 'Muscular, vivid, battle-ready British male — Cornwell\'s Saxon urgency made audible. The sound of the shield wall, the heat of the forge, the weight of iron in hand.',
    bio: "Griffith narrates historical battle fiction the way Cornwell writes it: with physical immediacy, tactical precision, and a voice that carries the actual weight of chainmail and consequence. His British authority grounds historical epic in the body, not the library.",
    tone_tags: ['Historical', 'Adventure', 'Military', 'Epic'],
    sampleKey: 'battle_ready',
  },
  // Group 12: Marcus Hale split (keep Julian Mercer)
  {
    name: 'Cray Tollins',
    authorName: 'Jesse Crane',
    gender: 'male', age: 'middle_aged', accent: 'american',
    tone: 'neutral', accentLabel: 'american',
    voiceCode: 'NR-MA-M4-NT-US-V2',
    description: 'Lean, dry, quick American male — every word earns its place. Elmore Leonard terrain: dialogue-first, always moving, with the sly intelligence of someone who finds the whole thing quietly hilarious.',
    bio: "Cray narrates the way Leonard writes — fast, lean, and with a sly internal amusement at the whole human comedy. His voice is dialogue-first: it moves like a scene rather than a sentence, and it never mistakes speed for urgency or dryness for indifference.",
    tone_tags: ['Western', 'Crime', 'Thriller', 'Comedy'],
    sampleKey: 'lean_sly',
  },
]

async function generateVoice(narrator) {
  const sampleText = SAMPLES[narrator.sampleKey]

  // Step 1: create-previews — returns 3 generated_voice_id options, we use the first
  const res = await fetch('https://api.elevenlabs.io/v1/text-to-voice/create-previews', {
    method: 'POST',
    headers: { 'xi-api-key': EL_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      voice_description: narrator.description,
      text: sampleText,
    })
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`create-previews failed for ${narrator.name}: ${res.status} ${err}`)
  }
  const data = await res.json()
  const previews = data.previews || []
  if (!previews.length) throw new Error(`No previews returned for ${narrator.name}`)
  return previews[0].generated_voice_id
}

async function createVoice(narrator, generatedVoiceId) {
  const res = await fetch('https://api.elevenlabs.io/v1/text-to-voice/create-voice-from-preview', {
    method: 'POST',
    headers: { 'xi-api-key': EL_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      voice_name: narrator.name,
      voice_description: narrator.description,
      generated_voice_id: generatedVoiceId,
      labels: {
        voice_code: narrator.voiceCode,
        narrator_for: narrator.authorName,
        platform: 'endless_tales',
        type: 'narrator',
      }
    })
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`create-voice-from-preview failed for ${narrator.name}: ${res.status} ${err}`)
  }
  const data = await res.json()
  return data.voice_id
}

async function insertNarratorVoice(narrator, elVoiceId) {
  const { data, error } = await supabase.from('narrator_voices').insert({
    name: narrator.name,
    elevenlabs_voice_id: elVoiceId,
    gender: narrator.gender,
    tone: narrator.tone,
    accent: narrator.accentLabel,
    description: narrator.description,
    bio: narrator.bio,
    tone_tags: narrator.tone_tags,
    age_bracket: narrator.age,
    voice_code: narrator.voiceCode,
    is_active: true,
    is_platform_narrator: true,
    rotation_count: 0,
    follower_count: 0,
  }).select('id').single()

  if (error) throw new Error(`DB insert failed for ${narrator.name}: ${error.message}`)
  return data.id
}

async function updateAuthor(authorName, narratorId) {
  const { error } = await supabase.from('authors')
    .update({ narrator_id: narratorId })
    .eq('name', authorName)
  if (error) throw new Error(`Author update failed for ${authorName}: ${error.message}`)
}

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

async function main() {
  console.log(`\n🎙️  Creating 23 narrator voices...\n`)
  const results = []
  let success = 0, failed = 0

  for (let i = 0; i < NARRATORS.length; i++) {
    const n = NARRATORS[i]
    console.log(`[${i+1}/23] ${n.name} → ${n.authorName}`)
    try {
      // Step 1: Generate voice preview
      process.stdout.write(`  → Generating voice design...`)
      const generatedVoiceId = await generateVoice(n)
      console.log(` ✓ (generated_voice_id: ${generatedVoiceId})`)

      // Step 2: Create permanent voice
      process.stdout.write(`  → Creating permanent EL voice...`)
      const elVoiceId = await createVoice(n, generatedVoiceId)
      console.log(` ✓ EL ID: ${elVoiceId}`)

      // Step 3: Insert into narrator_voices
      process.stdout.write(`  → Inserting into narrator_voices...`)
      const narratorId = await insertNarratorVoice(n, elVoiceId)
      console.log(` ✓ DB ID: ${narratorId}`)

      // Step 4: Update author
      process.stdout.write(`  → Updating author ${n.authorName}...`)
      await updateAuthor(n.authorName, narratorId)
      console.log(` ✓`)

      results.push({ narrator: n.name, author: n.authorName, elId: elVoiceId, dbId: narratorId, status: 'OK' })
      success++
    } catch (err) {
      console.log(`\n  ❌ FAILED: ${err.message}`)
      results.push({ narrator: n.name, author: n.authorName, status: 'FAILED', error: err.message })
      failed++
    }
    if (i < NARRATORS.length - 1) await sleep(1500) // rate limit buffer
  }

  console.log(`\n${'─'.repeat(60)}`)
  console.log(`✅ Done: ${success}/23 succeeded, ${failed} failed`)
  console.log(`\nFull results:`)
  for (const r of results) {
    if (r.status === 'OK') {
      console.log(`  ✓ ${r.narrator} (${r.author}) → EL: ${r.elId} | DB: ${r.dbId}`)
    } else {
      console.log(`  ✗ ${r.narrator} (${r.author}) → ${r.error}`)
    }
  }

  // Write results to file for memory
  const fs = await import('fs')
  fs.writeFileSync('/tmp/narrator-creation-results.json', JSON.stringify(results, null, 2))
  console.log(`\nResults saved to /tmp/narrator-creation-results.json`)
}

main().catch(console.error)
