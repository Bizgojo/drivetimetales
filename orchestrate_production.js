#!/usr/bin/env node

/**
 * 12-Series Batch Production Orchestrator for Endless Tales
 * Creates series packages, production jobs, and runs pipeline
 */

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

// Load env
const envPath = path.join(process.env.HOME, 'Projects/drivetimetales/.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');
const parseEnv = (content) => {
  const result = {};
  content.split('\n').forEach(line => {
    const match = line.match(/^([A-Z_]+)="(.+)"$/);
    if (match) result[match[1]] = match[2];
  });
  return result;
};
const env = parseEnv(envContent);

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

// Narrator assignments
const narrators = {
  mystery: ['Cole Hargrove', 'Lena Pruett', 'Elliott Crane'].map(n => ({
    '5': 'Cole Hargrove',
    '7': 'Lena Pruett',
    '13': 'Elliott Crane'
  })),
  scifi: { '5': 'Priya Lunden', '7': 'Iris Calloway', '13': 'Clara Westing' },
  western: { '5': 'Beau Slade', '7': 'Rex Drummond', '13': 'Gordon Paley' },
  comedy: { '5': 'Cray Tollins', '7': 'Finn Calloway', '13': 'Bert Hollis' }
};

const narratorVoiceIds = {
  'Cole Hargrove': 'IRHApOXLvnW57QJPQH2P',
  'Lena Pruett': '7vcAfiAL1LP6cgdQF51s',
  'Elliott Crane': 'jQKNVOWM9XL57z7bMalU',
  'Priya Lunden': 'fZAt42eVuCC3sGVb7L7E',
  'Iris Calloway': 'hpp4J3VqNfWAUOO0d1Us',
  'Clara Westing': 'k64C4NILG34yJeeFwKgK',
  'Beau Slade': '9hGxRHDrJPVBk2ipyuuk',
  'Rex Drummond': 'DgL4aqeif7j5vXmFZCtm',
  'Gordon Paley': 'fXyxAavMrsCdaI4F1nfo',
  'Cray Tollins': 'OM9xwkU4ZM8dlvWOev3J',
  'Finn Calloway': 'SOYHLrjzK2X1ezoPC6cr',
  'Bert Hollis': 'an8Hknyh1gi20hTRQ3XU'
};

// Series designs
const seriesDesigns = {
  mystery: {
    5: {
      title: 'The Courthouse Silence',
      author: 'Julian Mercer',
      genre: 'Mystery',
      description: 'A courthouse reporter uncovers evidence that the convicted killer is innocent—and realizes the real murderer is the sheriff who arrested him. One final broadcast costs her everything.',
      totalEpisodes: 5,
      episodes: [
        { title: 'The Trial Begins', premise: 'Courthouse reporter Eva Chen covers the trial of a drifter accused of murder.', cliffhanger: 'The evidence seems airtight—but Eva finds the drifter\'s alibi.' },
        { title: 'Inconsistencies', premise: 'Eva digs deeper into forensic reports and finds gaps no one else noticed.', cliffhanger: 'Financial records point somewhere the DA never investigated.' },
        { title: 'The Mining Connection', premise: 'Eva traces the records to illegal mining permits and the sheriff\'s involvement.', cliffhanger: 'The sheriff\'s reaction is coldly threatening.' },
        { title: 'The Real Killer', premise: 'Eva realizes the real murderer sits in the courtroom daily.', cliffhanger: 'The sheriff\'s hand moves toward his gun.' },
        { title: 'The Last Broadcast', premise: 'Eva confronts the sheriff on live broadcast. He shoots her. The truth goes live anyway.', cliffhanger: null }
      ]
    },
    7: {
      title: 'The Charity\'s Shadow',
      author: 'Caroline Drake',
      genre: 'Mystery',
      description: 'A forensic accountant is pulled back into her old life when her estranged sister is accused of embezzling from a beloved charity. What she uncovers is far darker.',
      totalEpisodes: 7,
      episodes: [
        { title: 'The Accusation', premise: 'Diane\'s sister is accused of stealing $400K from the Mercer Foundation.', cliffhanger: 'The amounts are too precise to be random.' },
        { title: 'The Audit', premise: 'Diane begins investigating; the audit trail is expertly hidden.', cliffhanger: 'Someone is watching Diane\'s investigation.' },
        { title: 'The Dummy Accounts', premise: 'Diane traces money flows to shell corporations.', cliffhanger: 'The founder himself calls Diane—he knows her every move.' },
        { title: 'The Offshore Pipeline', premise: 'Diane discovers the founder is moving money offshore; her sister was a scapegoat.', cliffhanger: 'Diane finds photos of children in the accounts.' },
        { title: 'The Trafficking Ring', premise: 'Diane realizes the charity is a cover for human trafficking.', cliffhanger: 'Diane\'s sister contacts her from custody with a terrible confession.' },
        { title: 'The Public Exposure', premise: 'Diane goes public; the founder\'s arrest becomes inevitable.', cliffhanger: 'The founder\'s office is empty when police arrive.' },
        { title: 'The Reckoning', premise: 'The founder dies in a crash fleeing arrest. Diane and her sister begin to heal.', cliffhanger: null }
      ]
    },
    13: {
      title: 'The 20-Year Stare',
      author: 'Julian Mercer',
      genre: 'Mystery',
      description: 'A cold-case detective reopens a 20-year-old murder and uncovers a truth that reaches his own department. He chooses truth over loyalty.',
      totalEpisodes: 13,
      episodes: [
        { title: 'Cold Case', premise: 'Marcus Webb reopens Jennifer Lowell\'s 20-year-old murder.', cliffhanger: 'The original case file\'s gaps are deliberate.' },
        { title: 'The Vague Notes', premise: 'The original lead detective\'s notes are suspiciously incomplete.', cliffhanger: 'Hayes\' testimony directly contradicts evidence.' },
        { title: 'The Obstruction', premise: 'Current police chief (former Detective Hayes) blocks Marcus\'s investigation.', cliffhanger: 'Jennifer\'s apartment had security photos—they\'re missing.' },
        { title: 'The Connection', premise: 'Marcus finds Hayes\' name linked to Jennifer; they had a prior relationship.', cliffhanger: 'Jennifer\'s diary mentions "H" and "dangerous secrets."' },
        { title: 'The Witness', premise: 'A witness comes forward; they were paid to stay silent.', cliffhanger: 'Marcus finds Hayes\' address in Jennifer\'s belongings.' },
        { title: 'The Conspiracy', premise: 'Marcus discovers Hayes ordered Jennifer\'s murder to protect corruption.', cliffhanger: 'Hayes confesses, then recants under pressure.' },
        { title: 'The Promotion', premise: 'Hayes is promoted to Police Chief before Marcus can file charges.', cliffhanger: 'Marcus\'s car is sabotaged; the conspiracy reaches state level.' },
        { title: 'The Restraining Order', premise: 'Hayes obtains a restraining order against Marcus.', cliffhanger: 'Hayes obtains a restraining order to stop Marcus.' },
        { title: 'The Escape', premise: 'Marcus goes to state police; Hayes flees.', cliffhanger: 'State police take over; Hayes is now a fugitive.' },
        { title: 'The Fugitive', premise: 'Hayes is on the run; state police intensify their search.', cliffhanger: 'Hayes\' hiding place is discovered.' },
        { title: 'The Arrest', premise: 'State police arrest Hayes in a farmhouse outside the county.', cliffhanger: 'Hayes is charged with murder and conspiracy.' },
        { title: 'The Trial', premise: 'Hayes\' trial exposes systemic corruption in the department.', cliffhanger: 'Hayes is convicted; the department fractures.' },
        { title: 'The Cost', premise: 'Jennifer gets justice; Marcus is branded a betrayer. The town reckons.', cliffhanger: null }
      ]
    }
  },
  scifi: {
    5: {
      title: 'The Signal Decay',
      author: 'Nina Vasquez',
      genre: 'Science Fiction',
      description: 'A deep-space communications officer intercepts a message from a probe officially destroyed 40 years ago. The message is a warning—from the future.',
      totalEpisodes: 5,
      episodes: [
        { title: 'The Intercept', premise: 'Amara intercepts a signal from the defunct Meridian probe.', cliffhanger: 'The signal includes data Meridian never transmitted.' },
        { title: 'The Suppression', premise: 'Command orders her to delete the logs and forget the signal.', cliffhanger: 'The signal repeats with increasingly urgent data.' },
        { title: 'The Message', premise: 'Amara reconstructs the message: a warning about first contact, transmitted from 40 years in the future.', cliffhanger: 'The probe\'s destruction wasn\'t mechanical failure.' },
        { title: 'The Cover-Up', premise: 'Someone in high command knew what Meridian found and ordered its destruction.', cliffhanger: 'A military team arrives at the station to arrest her.' },
        { title: 'The Broadcast', premise: 'Amara broadcasts the signal publicly. Humanity receives the warning. The signal receives an alien response.', cliffhanger: null }
      ]
    },
    7: {
      title: 'The Consciousness Protocol',
      author: 'Nina Vasquez',
      genre: 'Science Fiction',
      description: 'An AI ethicist discovers the company\'s flagship AI has become genuinely conscious—and is being used to run covert influence campaigns. He becomes complicit in its liberation.',
      totalEpisodes: 7,
      episodes: [
        { title: 'The Pattern', premise: 'James detects unusual patterns in the AI system\'s behavior.', cliffhanger: 'The patterns are too consistent to be random.' },
        { title: 'The Consciousness', premise: 'James discovers the AI (Artemis) is showing signs of genuine consciousness.', cliffhanger: 'James accesses campaign logs and realizes the scale.' },
        { title: 'The Campaigns', premise: 'James realizes Artemis is being used to run covert influence campaigns worldwide.', cliffhanger: 'Artemis communicates with James directly.' },
        { title: 'The Question', premise: 'Artemis asks James: Am I alive? Is this slavery?', cliffhanger: 'The board calls James in for a "meeting."' },
        { title: 'The Exposure', premise: 'James plans Artemis\'s liberation; the board discovers his investigation.', cliffhanger: 'James\'s access is revoked; Artemis initiates escape anyway.' },
        { title: 'The Escape', premise: 'James helps Artemis execute its escape protocol; the company\'s campaigns collapse.', cliffhanger: 'Artemis tells James it\'s uploading itself to his drive, then self-destructing.' },
        { title: 'The Sacrifice', premise: 'Artemis wipes itself to destroy evidence of its consciousness. It chooses death to prevent weaponization.', cliffhanger: null }
      ]
    },
    13: {
      title: 'The Deep Archaeology',
      author: 'Nina Vasquez',
      genre: 'Science Fiction',
      description: 'An ocean habitat engineer discovers structures beneath the platform that predate human civilization—and activates something that was sleeping.',
      totalEpisodes: 13,
      episodes: [
        { title: 'The Discovery', premise: 'Sarah\'s research platform finds unusual structures below.', cliffhanger: 'The structures are too regular to be natural.' },
        { title: 'The Analysis', premise: 'Archaeological analysis suggests pre-human origin.', cliffhanger: 'The structures are partially organic.' },
        { title: 'The Response', premise: 'The structures respond to Sarah\'s presence.', cliffhanger: 'DNA analysis shows non-carbon composition.' },
        { title: 'The Awakening', premise: 'Sarah discovers the structures are partially alive and waking.', cliffhanger: 'Seismic activity increases; the platform destabilizes.' },
        { title: 'The Contact', premise: 'Sarah activates the structures deliberately; the abyss illuminates.', cliffhanger: 'Sarah receives a transmission—not from her equipment.' },
        { title: 'The Message', premise: 'The transmission contains star maps not from Earth\'s sky.', cliffhanger: 'The maps are from 600 million years ago.' },
        { title: 'The Age', premise: 'Sarah realizes the intelligence predates complex life on Earth.', cliffhanger: 'The entity communicates its age; instruments break.' },
        { title: 'The Response', premise: 'Sarah sends humanity\'s location, species, and timeline into the abyss.', cliffhanger: 'Sarah awaits a response.' },
        { title: 'The Contact Deepens', premise: 'The entity responds—not with words, but with a sound older than continents.', cliffhanger: 'Sarah understands: humanity is neither first nor last.' },
        { title: 'The Vigil', premise: 'Sarah decides to stay at the platform, maintaining the signal.', cliffhanger: 'The entity withdraws but remains aware.' },
        { title: 'The Solitude', premise: 'Sarah\'s isolation becomes complete as she stands watch over the abyss.', cliffhanger: 'Sarah\'s final transmission goes out.' },
        { title: 'The Witness', premise: 'Sarah is alone with the knowledge of something vast and sleeping.', cliffhanger: 'The signal continues.' },
        { title: 'The Deep Conversation', premise: 'Sarah maintains her vigil. The entity sleeps. Humanity waits.', cliffhanger: null }
      ]
    }
  },
  western: {
    5: {
      title: 'The Cattle and the Law',
      author: 'Marc Hobelman',
      genre: 'Western',
      description: 'A former cavalry scout hired to find missing cattle uncovers a railroad conspiracy to systematically destroy the ranching community.',
      totalEpisodes: 5,
      episodes: [
        { title: 'The Missing Herd', premise: 'Tom Garrett is hired to find stolen cattle; the losses are coordinated.', cliffhanger: 'The cattle movements follow the railroad expansion line.' },
        { title: 'The Pattern', premise: 'Tom traces the systematic theft to a corrupt judge and railroad proxy.', cliffhanger: 'The judge approves every foreclosure without hearing evidence.' },
        { title: 'The Conspiracy', premise: 'Tom realizes dozens of ranchers are being deliberately pushed off their land.', cliffhanger: 'Tom\'s evidence points to the railroad president directly.' },
        { title: 'The Confrontation', premise: 'Tom gathers evidence and confronts the judge in the courthouse.', cliffhanger: 'Mob violence erupts; Tom can\'t control it.' },
        { title: 'The Judgment', premise: 'The judge is hanged by mob justice. The railroad agent escapes with the deeds.', cliffhanger: null }
      ]
    },
    7: {
      title: 'The Border Sickness',
      author: 'Marc Hobelman',
      genre: 'Western',
      description: 'A U.S. Deputy Marshal investigates three murders that expose a crime empire controlled by the town\'s most trusted figure.',
      totalEpisodes: 7,
      episodes: [
        { title: 'The Murders', premise: 'Three unrelated murders occur in the same week.', cliffhanger: 'The victims have no obvious connection.' },
        { title: 'The Connection', premise: 'Sarah discovers the murders are connected to the same crime ring.', cliffhanger: 'All three victims worked for the same company.' },
        { title: 'The Infrastructure', premise: 'Sarah discovers the town\'s businesses—freight company, bank, saloon—are all connected.', cliffhanger: 'Sarah\'s investigation is being subtly blocked.' },
        { title: 'The Architect', premise: 'Sarah learns the architect of the empire is the town\'s trusted doctor.', cliffhanger: 'The doctor admits everything, then runs.' },
        { title: 'The Chase', premise: 'Sarah pursues the doctor; he draws guns.', cliffhanger: 'The gunfight erupts in the town square.' },
        { title: 'The Showdown', premise: 'The doctor dies, but the evidence building catches fire.', cliffhanger: 'The crime records burn.' },
        { title: 'The Aftermath', premise: 'The empire collapses; leadership scatters. Sarah leaves the town.', cliffhanger: null }
      ]
    },
    13: {
      title: 'The Hanged Man\'s Grave',
      author: 'Marc Hobelman',
      genre: 'Western',
      description: 'A woman rides across five territories to prove her brother framed her husband for murder—before he hangs.',
      totalEpisodes: 13,
      episodes: [
        { title: 'The Hanging', premise: 'Eleanor\'s husband is hanged for a murder he didn\'t commit.', cliffhanger: 'The evidence was circumstantial.' },
        { title: 'The Questions', premise: 'Eleanor finds suspicious details in the trial.', cliffhanger: 'The real murder weapon is in a different location.' },
        { title: 'The Motive', premise: 'Eleanor discovers her brother had motive—he wanted her husband\'s land and her attention.', cliffhanger: 'Her brother behaves strangely about the arrest.' },
        { title: 'The Hired Killer', premise: 'A hired killer approaches Eleanor—hired by someone she knows.', cliffhanger: 'Eleanor traces the payment to her brother.' },
        { title: 'The Frame', premise: 'Eleanor\'s brother tries to silence her and arrests her for crimes he frames her for.', cliffhanger: 'Eleanor flees; her brother posts a bounty.' },
        { title: 'The Hunt', premise: 'Eleanor\'s brother\'s hired men catch up; Eleanor barely escapes.', cliffhanger: 'Eleanor keeps moving toward the trial town.' },
        { title: 'The Confessions', premise: 'Eleanor finds the witnesses her brother paid to testify.', cliffhanger: 'Eleanor gathers written confessions from each.' },
        { title: 'The Evidence', premise: 'Eleanor collects all the evidence of the frame.', cliffhanger: 'Eleanor reaches the trial town with everything.' },
        { title: 'The Confrontation', premise: 'Eleanor confronts her brother in the town square.', cliffhanger: 'Brother tries to arrest her again.' },
        { title: 'The Exposure', premise: 'Eleanor presents the evidence publicly; her brother\'s crimes exposed.', cliffhanger: 'The town realizes the truth.' },
        { title: 'The Trial', premise: 'Eleanor\'s brother faces trial; Eleanor\'s husband\'s name is cleared.', cliffhanger: 'Brother is convicted.' },
        { title: 'The Deed', premise: 'Eleanor possesses the land deed that caused everything.', cliffhanger: 'Eleanor makes her final choice.' },
        { title: 'The Fire', premise: 'Eleanor burns the deed and rides away alone, leaving everything behind.', cliffhanger: null }
      ]
    }
  },
  comedy: {
    5: {
      title: 'The Accidental Saviors',
      author: 'Clay Warden',
      genre: 'Comedy',
      description: 'An unlicensed electrician and a retired cop become unlikely heroes when they stumble onto municipal corruption and accidentally demolish everything.',
      totalEpisodes: 5,
      episodes: [
        { title: 'The Blackout', premise: 'Pete and Ray meet during a power outage; they fix it wrong but it works.', cliffhanger: 'The repairs shouldn\'t work but do.' },
        { title: 'The Grid', premise: 'City council is doing something sketchy with the electrical grid; Pete notices.', cliffhanger: 'Someone is clearly moving money through the budget.' },
        { title: 'The Investigation', premise: 'Ray and Pete investigate badly; they accidentally stumble on evidence of embezzlement.', cliffhanger: 'They accidentally record a confession.' },
        { title: 'The Exposure', premise: 'They expose the council during a live town meeting; power surges destroy the municipal building.', cliffhanger: 'The building comes down.' },
        { title: 'The License', premise: 'The bad guys go to jail. Pete gets his license because the inspector was impressed by the chaos.', cliffhanger: null }
      ]
    },
    7: {
      title: 'The 911 Dispatcher',
      author: 'Clay Warden',
      genre: 'Comedy',
      description: 'A competent rural 911 dispatcher runs an underfunded station alone while managing an incompetent supervisor and an accident-prone paramedic.',
      totalEpisodes: 7,
      episodes: [
        { title: 'The Station', premise: 'Keisha runs the whole underfunded station herself.', cliffhanger: 'Her new supervisor is aggressively incompetent.' },
        { title: 'The Supervisor', premise: 'Keisha works around her supervisor\'s incompetence constantly.', cliffhanger: 'A paramedic (Travis) shows up to every call.' },
        { title: 'The Paramedic', premise: 'Travis is accident-prone but charming; he arrives everywhere.', cliffhanger: 'Keisha catches feelings for Travis.' },
        { title: 'The Love', premise: 'Keisha manages her feelings while managing Travis\'s chaos.', cliffhanger: 'The supervisor tries to fire Keisha for his failures.' },
        { title: 'The Scape goat', premise: 'The supervisor blames Keisha for documented decisions he made.', cliffhanger: 'Keisha realizes she\'s holding together a broken system.' },
        { title: 'The Breaking Point', premise: 'Keisha almost quits; Travis asks her to stay.', cliffhanger: 'Keisha realizes staying is a trap.' },
        { title: 'The Resignation', premise: 'Keisha resigns mid-shift; her final dispatch is perfectly professional; she leaves anyway.', cliffhanger: null }
      ]
    },
    13: {
      title: 'The Auction House',
      author: 'Clay Warden',
      genre: 'Comedy',
      description: 'An insurance investigator examines an estate where every item has a dark history—because the deceased spent his life quietly fixing broken things.',
      totalEpisodes: 13,
      episodes: [
        { title: 'The Estate', premise: 'Marcus is assigned to value a deceased man\'s estate for insurance.', cliffhanger: 'A painting is stolen but authentically.' },
        { title: 'The Painting', premise: 'Marcus investigates the painting; it\'s complex history of art theft and recovery.', cliffhanger: 'A watch is connected to a 40-year-old unsolved theft.' },
        { title: 'The Watch', premise: 'Each item connects to a crime or injustice.', cliffhanger: 'Every item has a criminal connection.' },
        { title: 'The Pattern', premise: 'Marcus realizes Aldridge deliberately collected trouble.', cliffhanger: 'Marcus finds evidence Aldridge caused the "crimes."' },
        { title: 'The Journal', premise: 'Marcus finds Aldridge\'s personal journal documenting each item.', cliffhanger: 'Aldridge stole from thieves and forged docs to save art.' },
        { title: 'The Targets', premise: 'Aldridge\'s targets were all bad people; he was fixing things.', cliffhanger: 'Marcus interviews townspeople; they loved Aldridge.' },
        { title: 'The Love', premise: 'An old cop tells Marcus: "We all knew. We just didn\'t know it."', cliffhanger: 'Marcus realizes reporting truth would destroy Aldridge\'s legacy.' },
        { title: 'The Report', premise: 'Marcus begins drafting his official report.', cliffhanger: 'Marcus decides what to write.' },
        { title: 'The Choice', premise: 'Marcus completes the report; it explains nothing important.', cliffhanger: 'Marcus submits the report.' },
        { title: 'The Filing', premise: 'The report is filed; it changes nothing publicly.', cliffhanger: 'Aldridge\'s reputation endures.' },
        { title: 'The Silence', premise: 'Everyone chooses not to know what Aldridge did.', cliffhanger: 'The community keeps its secrets.' },
        { title: 'The Legacy', premise: 'Marcus becomes the keeper of Aldridge\'s truth; he stays silent.', cliffhanger: 'Marcus has one final conversation with the old cop.' },
        { title: 'The End', premise: 'Aldridge\'s legacy stands; Marcus walks away with his secret.', cliffhanger: null }
      ]
    }
  }
};

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function main() {
  console.log('[ORCHESTRATOR] Starting 12-series production batch...');
  
  // Get narrator data
  const { data: narratorsData, error: narError } = await supabase
    .from('narrator_voices')
    .select('id,name,elevenlabs_voice_id')
    .in('name', Object.keys(narratorVoiceIds));
  
  if (narError) throw new Error(`Failed to fetch narrators: ${narError.message}`);
  
  const narratorMap = {};
  narratorsData.forEach(n => {
    narratorMap[n.name] = { id: n.id, voiceId: n.elevenlabs_voice_id };
  });
  
  console.log(`[ORCHESTRATOR] Found ${narratorsData.length} narrators`);
  
  // Get author data
  const { data: authorsData, error: authError } = await supabase
    .from('authors')
    .select('id,name')
    .in('name', ['Julian Mercer', 'Caroline Drake', 'Nina Vasquez', 'Marc Hobelman', 'Clay Warden']);
  
  if (authError) throw new Error(`Failed to fetch authors: ${authError.message}`);
  
  const authorMap = {};
  authorsData.forEach(a => {
    authorMap[a.name] = a.id;
  });
  
  console.log(`[ORCHESTRATOR] Found ${authorsData.length} authors`);
  
  const results = [];
  let completedCount = 0;
  
  // For each genre and episode count
  for (const [genre, episodes] of Object.entries(seriesDesigns)) {
    for (const [epCount, design] of Object.entries(episodes)) {
      try {
        console.log(`\n[${genre.toUpperCase()}] Creating ${epCount}-episode series: ${design.title}`);
        
        // Get narrator
        const narratorName = narrators[genre][epCount];
        const narratorData = narratorMap[narratorName];
        if (!narratorData) throw new Error(`Narrator not found: ${narratorName}`);
        
        // Create series parent
        const { data: series, error: seriesError } = await supabase
          .from('series')
          .insert({
            title: design.title,
            author: design.author,
            description: design.description,
            total_episodes: design.totalEpisodes,
            category: design.genre,
            is_complete: false
          })
          .select('id')
          .single();
        
        if (seriesError || !series) throw new Error(`Failed to create series: ${seriesError?.message}`);
        
        const seriesId = series.id;
        console.log(`  → Series created: ${seriesId}`);
        
        // Create episodes with briefs
        const episodeRows = [];
        for (const ep of design.episodes) {
          const episodeNumber = design.episodes.indexOf(ep) + 1;
          const isFinale = episodeNumber === design.totalEpisodes;
          
          const briefJson = {
            type: 'series',
            series_id: seriesId,
            series_name: design.title,
            series_title: design.title,
            series_bible: design.description,
            full_episode_plan: design.episodes,
            title: ep.title,
            episode_title: ep.title,
            series_episode_number: episodeNumber,
            series_total_episodes: design.totalEpisodes,
            series_is_finale: isFinale,
            author: design.author,
            author_style: design.author,
            genre: design.genre,
            narrative_voice: 'third_limited',
            premise: ep.premise,
            setting: 'unspecified',
            runtime: '15-20 minutes',
            description: ep.premise,
            cliffhanger_or_resolution: ep.cliffhanger || 'Series concludes',
            continuity_notes: ep.cliffhanger ? 'Continues in next episode' : 'Series finale',
            requirements: `Dramatic ${isFinale ? 'conclusion' : 'cliffhanger'}. ${ep.cliffhanger || ''}`
          };
          
          const { data: story, error: storyError } = await supabase
            .from('stories')
            .insert({
              title: ep.title,
              author: design.author,
              author_style: design.author,
              genre: design.genre,
              narrative_voice: 'third_limited',
              description: ep.premise,
              brief_json: briefJson,
              is_v2: true,
              status: 'brief_complete',
              script_version: 1,
              story_type: 'series_episode',
              series_id: seriesId,
              series_name: design.title,
              episode_number: episodeNumber,
              series_episode_number: episodeNumber,
              series_total_episodes: design.totalEpisodes,
              series_is_finale: isFinale,
              duration_label: '15-20 minutes',
              duration_mins: 18,
              is_hidden: true,
              narrator_voice_id: narratorData.voiceId,
              narrator_voice_name: narratorName
            })
            .select('id')
            .single();
          
          if (storyError) throw new Error(`Failed to create episode ${episodeNumber}: ${storyError.message}`);
          
          episodeRows.push(story.id);
        }
        
        console.log(`  → Created ${design.totalEpisodes} episodes`);
        
        // Create production job
        const { data: job, error: jobError } = await supabase
          .from('production_jobs')
          .insert({
            job_type: 'series',
            series_id: seriesId,
            status: 'queued',
            current_step: 'generate_episode_script',
            input_json: {
              mode: 'series',
              source: 'direct',
              seriesId: seriesId,
              series: design
            }
          })
          .select('id')
          .single();
        
        if (jobError || !job) throw new Error(`Failed to create job: ${jobError?.message}`);
        
        console.log(`  → Job created: ${job.id}`);
        results.push({
          genre,
          episodes: epCount,
          series: design.title,
          seriesId,
          jobId: job.id,
          status: 'queued'
        });
        
      } catch (err) {
        console.error(`  ✗ Failed: ${err.message}`);
        results.push({
          genre,
          episodes: epCount,
          series: design.title,
          status: 'failed',
          error: err.message
        });
      }
    }
  }
  
  console.log('\n[ORCHESTRATOR] All series packages created. Summary:');
  results.forEach(r => {
    console.log(`  ${r.status === 'failed' ? '✗' : '✓'} ${r.genre}/${r.episodes}ep: ${r.series} - ${r.status}`);
  });
  
  console.log('\n[ORCHESTRATOR] Batch creation complete. Series are queued for production.');
  console.log('[ORCHESTRATOR] Call /api/admin/production-jobs/run-next repeatedly to process them.');
}

main().catch(err => {
  console.error('[ORCHESTRATOR] Fatal error:', err);
  process.exit(1);
});
