const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

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

const narratorVoiceIds = {
  'Cole Hargrove': 'IRHApOXLvnW57QJPQH2P',
  'Lena Pruett': '7vcAfiAL1LP6cgdQF51s',
  'Elliott Crane': 'jQKNVOWM9XL57z7bMalU'
};

const narratorNames = {
  '5': 'Cole Hargrove',
  '7': 'Lena Pruett',
  '13': 'Elliott Crane'
};

const seriesDesigns = {
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
};

async function main() {
  console.log('[MYSTERY] Creating 3 mystery series...');
  
  const { data: narratorsData } = await supabase
    .from('narrator_voices')
    .select('id,name,elevenlabs_voice_id')
    .in('name', Object.keys(narratorVoiceIds));
  
  const narratorMap = {};
  narratorsData.forEach(n => {
    narratorMap[n.name] = { id: n.id, voiceId: n.elevenlabs_voice_id };
  });
  
  const results = [];
  
  for (const [epCount, design] of Object.entries(seriesDesigns)) {
    try {
      console.log(`\n[MYSTERY] Creating ${epCount}-episode series: ${design.title}`);
      
      const narratorName = narratorNames[epCount];
      const narratorData = narratorMap[narratorName];
      if (!narratorData) throw new Error(`Narrator not found: ${narratorName}`);
      
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
            seriesId: seriesId
          }
        })
        .select('id')
        .single();
      
      if (jobError || !job) throw new Error(`Failed to create job: ${jobError?.message}`);
      
      console.log(`  → Job created: ${job.id}`);
      results.push({ episodes: epCount, series: design.title, status: 'queued', jobId: job.id });
      
    } catch (err) {
      console.error(`  ✗ Failed: ${err.message}`);
      results.push({ episodes: epCount, series: design.title, status: 'failed', error: err.message });
    }
  }
  
  console.log('\n[MYSTERY] Summary:');
  results.forEach(r => {
    console.log(`  ${r.status === 'failed' ? '✗' : '✓'} ${r.episodes}ep: ${r.series}`);
  });
}

main().catch(err => {
  console.error('[MYSTERY] Error:', err);
  process.exit(1);
});
