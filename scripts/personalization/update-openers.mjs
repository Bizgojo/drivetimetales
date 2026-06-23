import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'

dotenv.config({ path: '.env.local' })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL) throw new Error('NEXT_PUBLIC_SUPABASE_URL is not configured')
if (!SERVICE_ROLE_KEY) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured')

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

const OPENERS = {
  dark: [
    'Pull the door shut behind you, [LISTENER_NAME]. Some stories are better told with the lights low.',
    "Stay close, [LISTENER_NAME] — this one keeps its secrets right up until it doesn't.",
    "Take a breath, [LISTENER_NAME]. What's coming doesn't rush, and it doesn't forgive.",
    "Don't look away now, [LISTENER_NAME] — that's exactly when these things slip past you.",
    'Settle in, [LISTENER_NAME], and trust me: nothing here is quite what it seems.',
    'Lean in a little, [LISTENER_NAME]. The quiet parts are where the truth is hiding.',
    'Keep your wits about you, [LISTENER_NAME] — this one likes to misdirect.',
    "Easy now, [LISTENER_NAME]. We're walking into something with a long shadow.",
    "You'll want to pay attention here, [LISTENER_NAME] — every small thing matters later.",
    "Hold still, [LISTENER_NAME]. Something's been waiting a long time to be told.",
    "Let the room go quiet, [LISTENER_NAME]. What's ahead is best met in the dark.",
    "Careful where you step, [LISTENER_NAME] — the ground here isn't as solid as it looks.",
    "Trust no one too quickly tonight, [LISTENER_NAME]. Not even the ones I'd vouch for.",
    "There's a chill to this one, [LISTENER_NAME]. Stay with me and we'll see it through.",
    'Listen close, [LISTENER_NAME] — the answer was there from the very first line.',
    "Brace yourself a little, [LISTENER_NAME]. This one doesn't ask permission.",
    "Some doors shouldn't be opened, [LISTENER_NAME] — but here we are, opening one.",
    "Keep your voice down, [LISTENER_NAME]. We're closer to the truth than anyone wants.",
    'It starts quiet, [LISTENER_NAME], the way the dangerous ones always do.',
    "Don't trust the calm, [LISTENER_NAME] — it never lasts as long as you'd like.",
    "Settle back, [LISTENER_NAME], but not too far. You'll want to be ready for this.",
    'Every shadow earns its keep in this one, [LISTENER_NAME]. Watch them all.',
    "Come a little closer, [LISTENER_NAME]. This isn't a story for shouting across a room.",
    "There's a knot to untie here, [LISTENER_NAME], and it's tighter than it looks.",
    "Hold onto something, [LISTENER_NAME] — the floor's about to shift under us.",
  ],
  light: [
    "There you are, [LISTENER_NAME]. Kick your shoes off — this one's just plain fun.",
    "Good timing, [LISTENER_NAME]. I've been saving this one because it made me laugh.",
    "Settle in, [LISTENER_NAME], and don't take this one too seriously — I sure didn't.",
    "Perfect, [LISTENER_NAME], you're here. This one's got a grin built right into it.",
    "Loosen up a little, [LISTENER_NAME] — we're in for a good time with this one.",
    'Welcome back, [LISTENER_NAME]. Leave the heavy stuff at the door for this one.',
    "Oh, you're going to like this, [LISTENER_NAME]. It doesn't try too hard, and that's the charm.",
    "Pull up a seat, [LISTENER_NAME]. This one's light on its feet and quick with a wink.",
    'Here we go, [LISTENER_NAME] — a little mischief, a little heart, no homework required.',
    'Get comfy, [LISTENER_NAME]. This one just wants to make your day a touch brighter.',
    "Hey [LISTENER_NAME], good to see you. Let's keep this one easy and breezy.",
    "Just relax, [LISTENER_NAME] — this story's whole job is to be a delight.",
    "You picked a fun one, [LISTENER_NAME]. I couldn't keep a straight face making it.",
    "Lean back, [LISTENER_NAME], and let this one tickle you a bit. It's earned the right.",
    "No big lessons today, [LISTENER_NAME] — just a story that's happy to be silly.",
    "Glad you're here, [LISTENER_NAME]. This one's got a spring in its step.",
    "Treat yourself, [LISTENER_NAME] — this one's the audio version of a good laugh.",
    'Settle in for something easy, [LISTENER_NAME]. Not every story needs to be serious.',
    "You're in for a chuckle, [LISTENER_NAME]. Maybe two, if I did my job right.",
    "Come on in, [LISTENER_NAME] — this one's bright, quick, and a little ridiculous.",
    "Take a load off, [LISTENER_NAME]. This story's only ambition is to be fun.",
    "Right on time, [LISTENER_NAME]. Let's let this one put a smile on you.",
    "Ease into it, [LISTENER_NAME] — this one's as light as a Sunday morning.",
    "Don't overthink this one, [LISTENER_NAME]. Just sit back and enjoy the ride.",
    "Here's a fun one, [LISTENER_NAME]. Consider it a little gift from me to you.",
  ],
  warm: [
    "Come on in, [LISTENER_NAME] — I saved you the good seat. Let's take this one slow.",
    "It's good to have you here, [LISTENER_NAME]. Get comfortable; this one's got a lot of heart.",
    "Whatever kind of day it's been, [LISTENER_NAME], set it down a while. You're in good company.",
    "Settle in close, [LISTENER_NAME]. This one's warm all the way through.",
    "I'm glad it's you, [LISTENER_NAME]. Let's spend a quiet little while together.",
    "Take your time getting comfortable, [LISTENER_NAME] — there's no rush with this one.",
    "Wrap up warm, [LISTENER_NAME]. This story's the kind that holds you gently.",
    'You made it, [LISTENER_NAME]. Breathe out, and let this one do you some good.',
    "Pull the blanket up, [LISTENER_NAME] — this one's soft around the edges.",
    "Stay a while, [LISTENER_NAME]. This story's in no hurry, and neither are we.",
    "Lean back and let go, [LISTENER_NAME]. This one's made of kind things.",
    "So glad you're here, [LISTENER_NAME]. Let's let this one warm you up a little.",
    "Rest easy, [LISTENER_NAME] — this story's got tenderness to spare.",
    "Get cozy, [LISTENER_NAME]. We're going somewhere gentle today.",
    'Hello again, [LISTENER_NAME]. Settle in — this one feels a bit like coming home.',
    "Take a slow breath, [LISTENER_NAME]. This story's here to be kind to you.",
    "You're right where you should be, [LISTENER_NAME]. Let this one wrap around you.",
    "Sit with me a moment, [LISTENER_NAME]. This one's full of small, good things.",
    'Let the day fall away, [LISTENER_NAME] — this story will hold the soft part.',
    "Make yourself at home, [LISTENER_NAME]. This one's got a fire going, so to speak.",
    "Good to see you, [LISTENER_NAME]. Let's ease into something gentle together.",
    "No need to brace for anything, [LISTENER_NAME] — this one's all warmth.",
    'Settle down nice and easy, [LISTENER_NAME]. This story loves you a little.',
    "You're welcome here anytime, [LISTENER_NAME]. Stay close for this gentle one.",
    "Let's slow it right down, [LISTENER_NAME]. This one's best taken to heart.",
  ],
  wonder: [
    "Look up for a second, [LISTENER_NAME]. We're about to go somewhere far bigger than this room.",
    'Keep an open mind, [LISTENER_NAME] — this one stretches all the way out past the edges.',
    "Wherever you are, [LISTENER_NAME], let it fall away. The place we're going is really something.",
    'Take a breath of the wide open, [LISTENER_NAME]. This one reaches for the far horizon.',
    "Let your imagination loose, [LISTENER_NAME] — this story doesn't stay inside the lines.",
    "Come dream a little, [LISTENER_NAME]. We're headed somewhere the maps don't cover.",
    "Eyes to the sky, [LISTENER_NAME]. This one's got more sky than you'd believe.",
    'Get ready to wander, [LISTENER_NAME] — this story goes a long, long way out.',
    "Hold the wonder for a moment, [LISTENER_NAME]. Where we're going, it'll come in handy.",
    "Step a little outside the ordinary, [LISTENER_NAME]. This one's built for it.",
    "Let the walls go soft, [LISTENER_NAME] — we're about to travel well past them.",
    "Breathe it in, [LISTENER_NAME]. This story tastes like somewhere you've never been.",
    "Loosen your grip on what's possible, [LISTENER_NAME]. This one likes to surprise.",
    "Come to the edge with me, [LISTENER_NAME], and look at what's out past it.",
    'Let yourself believe a little, [LISTENER_NAME] — this story earns it.',
    'Picture something vast, [LISTENER_NAME]. Then let this one make it bigger.',
    "We're leaving the ground behind, [LISTENER_NAME]. Don't worry, I've got you.",
    'Open the window in your mind, [LISTENER_NAME]. This one wants in.',
    "Set your sights far, [LISTENER_NAME] — this story's reaching for the impossible.",
    "Wonder's the price of admission here, [LISTENER_NAME]. Lucky for us, it's free.",
    "Let's chase something extraordinary, [LISTENER_NAME]. It's closer than you think.",
    'Tip your head back, [LISTENER_NAME], and let this one open all the way up.',
    "There's a whole universe in this one, [LISTENER_NAME]. Let's go find its edges.",
    "Trade the everyday for a while, [LISTENER_NAME]. This story's got somewhere to be.",
    "Keep your sense of awe handy, [LISTENER_NAME] — you're going to need it.",
  ],
}

function assertOpenerShape() {
  for (const [tone, lines] of Object.entries(OPENERS)) {
    if (lines.length !== 25) throw new Error(`${tone} has ${lines.length} openers; expected 25`)
    for (const [index, line] of lines.entries()) {
      const matches = line.match(/\[LISTENER_NAME\]/g) || []
      if (matches.length !== 1) throw new Error(`${tone} line ${index + 1} must contain [LISTENER_NAME] exactly once`)
    }
  }
}

async function updateOpenersForTone(tone, lines) {
  const { data: rows, error } = await supabase
    .from('personalized_intro_openers')
    .select('id')
    .eq('tone_cluster', tone)
    .eq('is_active', true)
    .order('id', { ascending: true })

  if (error) throw new Error(`Failed to fetch ${tone} openers: ${error.message}`)
  if ((rows || []).length !== lines.length) {
    throw new Error(`${tone} has ${(rows || []).length} active rows; expected ${lines.length}`)
  }

  let updated = 0
  for (let index = 0; index < rows.length; index += 1) {
    const { error: updateError } = await supabase
      .from('personalized_intro_openers')
      .update({ template_text: lines[index], updated_at: new Date().toISOString() })
      .eq('id', rows[index].id)
    if (updateError) throw new Error(`Failed to update ${tone} opener ${rows[index].id}: ${updateError.message}`)
    updated += 1
  }
  return updated
}

async function exactCount(table, query = x => x) {
  const builder = query(supabase.from(table).select('*', { count: 'exact', head: true }))
  const { count, error } = await builder
  if (error) throw new Error(`Failed to count ${table}: ${error.message}`)
  return count || 0
}

async function main() {
  assertOpenerShape()

  const updatedByTone = {}
  for (const [tone, lines] of Object.entries(OPENERS)) {
    updatedByTone[tone] = await updateOpenersForTone(tone, lines)
  }

  const { error: deleteClipError } = await supabase
    .from('name_opener_clips')
    .delete()
    .neq('pronunciation_key', '__never__')
  if (deleteClipError) throw new Error(`Failed to delete name_opener_clips: ${deleteClipError.message}`)

  const { error: poolError } = await supabase
    .from('name_pools')
    .update({ status: 'pending', clip_count: 0, updated_at: new Date().toISOString() })
    .neq('pronunciation_key', '__never__')
  if (poolError) throw new Error(`Failed to reset name_pools: ${poolError.message}`)

  const { error: jobError } = await supabase
    .from('name_pool_jobs')
    .update({ status: 'pending', error_text: null, finished_at: null })
    .neq('id', '00000000-0000-0000-0000-000000000000')
  if (jobError) throw new Error(`Failed to reset name_pool_jobs: ${jobError.message}`)

  const clipsRemaining = await exactCount('name_opener_clips')
  const poolsPending = await exactCount('name_pools', q => q.eq('status', 'pending'))
  const jobsPending = await exactCount('name_pool_jobs', q => q.eq('status', 'pending'))

  console.log('updated dark:', updatedByTone.dark)
  console.log('updated light:', updatedByTone.light)
  console.log('updated warm:', updatedByTone.warm)
  console.log('updated wonder:', updatedByTone.wonder)
  console.log('updated total:', Object.values(updatedByTone).reduce((sum, count) => sum + count, 0))
  console.log('clips remaining:', clipsRemaining)
  console.log('pools pending:', poolsPending)
  console.log('jobs pending:', jobsPending)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
