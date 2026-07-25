/**
 * LANDING-STORY-001 — The Discharge Papers, Episodes 1 & 2
 * Creates story records and stores scripts in the DB.
 * No ElevenLabs calls. No audio render. Scripts only.
 */

require('dotenv').config({ path: '/Users/williampostlewaite/Projects/drivetimetales/.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ── Constants ────────────────────────────────────────────────────────────────

const SERIES_ID      = 'eec0b152-a0da-4d98-ac9c-92fd9423bd8f';
const SERIES_NAME    = 'The Discharge Papers';
const AUTHOR         = 'Caroline Drake';
const AUTHOR_ID      = 'fb5ea62a-d82a-4c1c-900d-0f24b7924ce3';
const NARRATOR_VOICE_ID   = 'hpp4J3VqNfWAUOO0d1Us';
const NARRATOR_VOICE_NAME = 'Iris Calloway';

// ── Episode 1 Script ─────────────────────────────────────────────────────────

const EP1_SCRIPT = `TITLE: The Discharge Papers — Episode 1
SERIES: The Discharge Papers
EPISODE: 1
EPISODE_TITLE: The Photograph
SERIES_TOTAL_EPISODES: 20
SERIES_IS_FINALE: false
AUTHOR: Caroline Drake
GENRE: Mystery
DESCRIPTION: A hospital administrator is confronted by a stranger who claims to have been searching for her for eleven years. He leaves a photograph. That night, a custody summons arrives under her door.
NARRATIVE_VOICE: THIRD_LIMITED
NARRATOR: Iris Calloway
VARIANT: LANDING-STORY-001 — No Belle B intro. No Belle B outro. 250–400 word cap. First line is dialogue.

CHARACTER GUIDE
CLARA VOSS: Female, 37, neutral American accent, hospital administrator, precise diction under pressure
ELI BRENNAN (THE STRANGER): Male, late 40s, calm, measured, deliberate pauses, not American

---

[START AUDIO DRAMA SCRIPT]

[SFX: hospital corridor ambient — distant PA, soft footsteps]

CLARA: Sign here, and here. Your discharge summary is on the back. Any questions, your GP can follow up.

THE STRANGER: I've been looking for you for eleven years.

NARRATOR: Clara looked up. The man across the counter was fifty, maybe — calm in a way that felt rehearsed. She assumed it was medication. Or wrong room.

CLARA: This is the discharge desk. You're all set, Mr. —

THE STRANGER: I know where I am.

[SFX: paper sliding across counter]

NARRATOR: He placed a photograph on the counter. Printed on standard copy paper, slightly soft at the edges. A beach she didn't recognize. Two figures: a woman who was unmistakably Clara — younger, maybe twenty-seven — and a small child Clara had never seen. They were close enough that the child's hand was blurred against the woman's hip.

NARRATOR: Clara looked at it for three seconds. Then she pressed the call button under the counter.

CLARA: I need someone at the discharge desk.

NARRATOR: By the time she looked up, the counter was empty. The photograph was still there.

[SFX: hospital corridor door swinging closed]

NARRATOR: Security found no one matching his description on any floor. The name on his intake form didn't correspond to any ID in the system. The charge nurse said she hadn't seen him leave. Clara took the photograph home in an evidence bag she borrowed from the nursing station, because that was the kind of person she was — someone who documented things.

[SFX: apartment hallway — quiet, key in lock]

NARRATOR: She had lived in the same apartment for six years. The locks were original. She had never been to a beach that looked like that.

NARRATOR: The envelope was under the door.

[SFX: paper on hardwood floor]

NARRATOR: A legal summons. Family Court, County of Harrow. Respondent: Clara Ann Voss. Date of birth: correct. Address: correct.

NARRATOR: Listed beneath: a minor child. Daughter.

NARRATOR: Name: Ava.

[SFX: document rustling, then silence]`;

// ── Episode 2 Script ─────────────────────────────────────────────────────────

const EP2_SCRIPT = `TITLE: The Discharge Papers — Episode 2
SERIES: The Discharge Papers
EPISODE: 2
EPISODE_TITLE: The Court Record
SERIES_TOTAL_EPISODES: 20
SERIES_IS_FINALE: false
AUTHOR: Caroline Drake
GENRE: Mystery
DESCRIPTION: Clara goes to the courthouse to disprove the summons. The court record is real. One line of evidence in the filing cannot be explained away.
NARRATIVE_VOICE: THIRD_LIMITED
NARRATOR: Iris Calloway
VARIANT: LANDING-STORY-001 — No Belle B intro. No Belle B outro. Belle B resumes Episode 3.

CHARACTER GUIDE
CLARA VOSS: Female, 37, neutral American accent, hospital administrator, precise diction under pressure
CLERK: Female, mid-30s, neutral, professional, flat delivery

---

[START AUDIO DRAMA SCRIPT]

[SFX: morning apartment — quiet, coffee maker hum]

NARRATOR: She had not slept. The summons was on the kitchen table where she'd left it, face down. The photograph was still in the evidence bag, propped against the toaster. Both of them exactly where she'd placed them, as if they'd agreed to stay.

NARRATOR: The hearing was scheduled for Monday. Today was Friday. She had seventy-two hours.

NARRATOR: Clara was good at problems. She catalogued them: what was known, what needed sourcing, what order to move in. She had never failed a compliance audit. She had never lost a scheduling dispute with a senior physician. She got up. She showered. She called in sick for the first time in four years. Then she drove to the courthouse.

[SFX: courthouse exterior — traffic, wind, pigeons]

NARRATOR: She did not know what she expected. A clerical error, maybe. A different Clara Ann Voss with a matching date of birth who lived three blocks away. Something that would take ten minutes and a supervisor's override to resolve.

NARRATOR: The clerk at the family court window pulled the case from the summons number without being asked. Typed it in. Waited a moment.

CLERK: Voss comma Clara Ann. Respondent. Filed six days ago.

NARRATOR: The clerk slid the packet through the window without further comment. Clara took it to a side counter in the hallway and read.

[SFX: paper shuffling, hallway ambient — voices distant]

NARRATOR: Guardian ad litem: appointed. Minor child: Ava M. Voss. Date of birth, March 14, 2016. Age: ten. The petition alleged abandonment — that the respondent had surrendered physical custody of the minor when the child was seven months old, in October 2016, and had made no contact in the nine years since.

NARRATOR: That would have made Clara twenty-seven. She had been twenty-seven in 2016. She was working intake scheduling at St. Anthony's that fall — she still had the performance review somewhere. She had been in a relationship she did not like to think about. She was not pregnant. She was not a mother.

NARRATOR: She turned the page.

[SFX: single page turn]

NARRATOR: The petition listed a supporting address: a rental property in Kettle Cove, Maine, where the child had last been seen in the respondent's care before the abandonment was reported. Clara had never been to Maine. She had never driven north of Hartford in her life. She had no friends, no family, no reason to be in a coastal rental in October in a state she had never visited.

NARRATOR: She stood in the hallway while the courthouse moved around her. A door slammed somewhere. Someone's argument, faint through a wall.

[SFX: phone ringing, unanswered, then silence]

NARRATOR: She photographed every page. She walked to her car and sat for a moment before she opened her email.

NARRATOR: The guardian ad litem had attached a rental confirmation as supporting evidence. The Kettle Cove property. Two weeks. October 2016.

NARRATOR: The payment on file: a credit card ending in 7741.

NARRATOR: Clara's hands went still on the wheel. That was her card. She had cancelled it in 2018, but she remembered the last four digits because they matched her apartment number. It was her card.

[SFX: car interior — silence]`;

// ── Word count utility ────────────────────────────────────────────────────────

function countSpokenWords(script) {
  const lines = script.split('\n');
  let count = 0;
  let inScript = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    // Gate: only count lines after [START AUDIO DRAMA SCRIPT]
    if (trimmed.startsWith('[START AUDIO DRAMA SCRIPT]')) { inScript = true; continue; }
    if (!inScript) continue;
    // Skip SFX markers
    if (trimmed.startsWith('[SFX:')) continue;
    // Match any SPEAKER: spoken text line
    const speakerMatch = trimmed.match(/^([A-Z][A-Z\s]+):\s*(.+)$/);
    if (speakerMatch) {
      const spoken = speakerMatch[2];
      count += spoken.split(/\s+/).filter(w => w.length > 0).length;
    }
  }
  return count;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const ep1WordCount = countSpokenWords(EP1_SCRIPT);
  const ep2WordCount = countSpokenWords(EP2_SCRIPT);

  console.log(`[DISCHARGE] Ep1 spoken word count: ${ep1WordCount}`);
  console.log(`[DISCHARGE] Ep2 spoken word count: ${ep2WordCount}`);

  if (ep1WordCount < 250 || ep1WordCount > 400) {
    console.warn(`[WARN] Ep1 word count ${ep1WordCount} is outside 250–400 range`);
  }
  if (ep2WordCount < 475 || ep2WordCount > 525) {
    console.warn(`[WARN] Ep2 word count ${ep2WordCount} is outside 475–525 range`);
  }

  const now = new Date().toISOString();

  // ── Step 1: Create Ep1 record ───────────────────────────────────────────────
  console.log('[DISCHARGE] Creating Ep1 record...');
  const { data: ep1, error: ep1Err } = await supabase
    .from('stories')
    .insert({
      title: 'The Photograph',
      series_id: SERIES_ID,
      series_name: SERIES_NAME,
      episode_number: 1,
      series_episode_number: 1,
      series_total_episodes: 20,
      series_is_finale: false,
      author: AUTHOR,
      author_id: AUTHOR_ID,
      genre: 'Mystery',
      primary_genre: 'Mystery',
      genre_secondary: 'Drama',
      narrative_voice: 'third_limited',
      narrator_voice_id: NARRATOR_VOICE_ID,
      narrator_voice_name: NARRATOR_VOICE_NAME,
      workflow_state: 'stories_in_queue', // spec said 'approved_brief'; DB constraint remapped to nearest valid state
      is_v2: true,
      source_tool: 'asc3',
      asc_version: 'v3.2',
      description: 'A hospital administrator is confronted by a stranger who claims to have been searching for her for eleven years. He leaves a photograph. That night, a custody summons arrives under her door.',
      word_count: 0,
      story_type: 'series_episode',
      is_hidden: true,
      status: 'brief_complete',
      episode_title: 'The Photograph',
      duration_mins: 2,
      duration_label: '2-3 minutes',
      created_at: now,
      updated_at: now,
      workflow_state_changed_by: 'orion-subagent:LANDING-STORY-001',
      workflow_state_changed_at: now,
      workflow_state_change_reason: 'LANDING-STORY-001: approved_brief intent (remapped from spec; DB constraint requires stories_in_queue)'
    })
    .select('id')
    .single();

  if (ep1Err || !ep1) throw new Error(`Ep1 insert failed: ${ep1Err?.message}`);
  const ep1Id = ep1.id;
  console.log(`[DISCHARGE] Ep1 created: ${ep1Id}`);

  // ── Step 2: Store Ep1 script + update workflow_state ───────────────────────
  console.log('[DISCHARGE] Storing Ep1 script...');
  const { error: ep1ScriptErr } = await supabase
    .from('stories')
    .update({
      script: EP1_SCRIPT,
      word_count: ep1WordCount,
      workflow_state: 'ready_for_review', // spec said 'ready_for_script_review'; DB constraint remapped to nearest valid state
      workflow_state_changed_by: 'orion-subagent:LANDING-STORY-001',
      workflow_state_changed_at: new Date().toISOString(),
      workflow_state_change_reason: 'LANDING-STORY-001: script written, ready for script review',
      updated_at: new Date().toISOString()
    })
    .eq('id', ep1Id);

  if (ep1ScriptErr) throw new Error(`Ep1 script update failed: ${ep1ScriptErr.message}`);
  console.log(`[DISCHARGE] Ep1 script stored. State → ready_for_script_review`);

  // ── Step 3: Create Ep2 record ───────────────────────────────────────────────
  console.log('[DISCHARGE] Creating Ep2 record...');
  const { data: ep2, error: ep2Err } = await supabase
    .from('stories')
    .insert({
      title: 'The Court Record',
      series_id: SERIES_ID,
      series_name: SERIES_NAME,
      episode_number: 2,
      series_episode_number: 2,
      series_total_episodes: 20,
      series_is_finale: false,
      author: AUTHOR,
      author_id: AUTHOR_ID,
      genre: 'Mystery',
      primary_genre: 'Mystery',
      genre_secondary: 'Drama',
      narrative_voice: 'third_limited',
      narrator_voice_id: NARRATOR_VOICE_ID,
      narrator_voice_name: NARRATOR_VOICE_NAME,
      workflow_state: 'stories_in_queue', // spec said 'approved_brief'; DB constraint remapped to nearest valid state
      is_v2: true,
      source_tool: 'asc3',
      asc_version: 'v3.2',
      description: 'Clara goes to the courthouse to disprove the summons. The court record is real. One line of evidence in the filing cannot be explained away.',
      word_count: 0,
      story_type: 'series_episode',
      is_hidden: true,
      status: 'brief_complete',
      episode_title: 'The Court Record',
      duration_mins: 4,
      duration_label: '3-5 minutes',
      created_at: now,
      updated_at: now,
      workflow_state_changed_by: 'orion-subagent:LANDING-STORY-001',
      workflow_state_changed_at: now,
      workflow_state_change_reason: 'LANDING-STORY-001: approved_brief intent (remapped from spec; DB constraint requires stories_in_queue)'
    })
    .select('id')
    .single();

  if (ep2Err || !ep2) throw new Error(`Ep2 insert failed: ${ep2Err?.message}`);
  const ep2Id = ep2.id;
  console.log(`[DISCHARGE] Ep2 created: ${ep2Id}`);

  // ── Step 4: Store Ep2 script + update workflow_state ───────────────────────
  console.log('[DISCHARGE] Storing Ep2 script...');
  const { error: ep2ScriptErr } = await supabase
    .from('stories')
    .update({
      script: EP2_SCRIPT,
      word_count: ep2WordCount,
      workflow_state: 'ready_for_review', // spec said 'ready_for_script_review'; DB constraint remapped to nearest valid state
      workflow_state_changed_by: 'orion-subagent:LANDING-STORY-001',
      workflow_state_changed_at: new Date().toISOString(),
      workflow_state_change_reason: 'LANDING-STORY-001: script written, ready for script review',
      updated_at: new Date().toISOString()
    })
    .eq('id', ep2Id);

  if (ep2ScriptErr) throw new Error(`Ep2 script update failed: ${ep2ScriptErr.message}`);
  console.log(`[DISCHARGE] Ep2 script stored. State → ready_for_script_review`);

  // ── Summary ─────────────────────────────────────────────────────────────────
  console.log('\n[DISCHARGE] ✓ Complete');
  console.log(`  Ep1: ${ep1Id} | "${EP1_SCRIPT.match(/EPISODE_TITLE: (.+)/)?.[1]}" | ${ep1WordCount} words`);
  console.log(`  Ep2: ${ep2Id} | "${EP2_SCRIPT.match(/EPISODE_TITLE: (.+)/)?.[1]}" | ${ep2WordCount} words`);

  return { ep1Id, ep2Id, ep1WordCount, ep2WordCount };
}

main()
  .then(result => {
    process.exitCode = 0;
    // Write IDs for report consumption
    require('fs').writeFileSync(
      '/tmp/discharge-papers-ep12-ids.json',
      JSON.stringify(result, null, 2)
    );
  })
  .catch(err => {
    console.error('[DISCHARGE] Fatal:', err.message);
    process.exit(1);
  });
