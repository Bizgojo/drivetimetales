const { createClient } = require('@supabase/supabase-js');

const sb = createClient(
  'https://vmyhlfeouzslixtkmddy.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZteWhsZmVvdXpzbGl4dGttZGR5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjA4OTYxMiwiZXhwIjoyMDgxNjY1NjEyfQ.xa0VB5h-KgLMxmM_ZWwIDuSRPUOxOmxow-c-Ua_pdQ0'
);

const NARRATOR_VOICE_ID = 'hpp4J3VqNfWAUOO0d1Us';

const STORY_PREFIXES = [
  '70ac7ba1',  // The Estate
  'c8013cd1',  // Clean Provenance
  '50d850a8',  // The Dedication
];

async function main() {
  console.log('=== Caroline Drake Narrator Fix ===\n');
  console.log('Target narrator_voice_id:', NARRATOR_VOICE_ID);

  // Step 1: Find full story IDs via UUID range query (UUID LIKE not supported in PostgREST)
  const storyResults = [];
  for (const prefix of STORY_PREFIXES) {
    const lo = `${prefix}-0000-0000-0000-000000000000`;
    const hi = `${prefix}-ffff-ffff-ffff-ffffffffffff`;
    const { data, error } = await sb
      .from('stories')
      .select('id, title, narrator_voice_id')
      .gte('id', lo)
      .lte('id', hi);
    if (error) {
      console.error(`Error fetching story with prefix ${prefix}:`, error);
      process.exit(1);
    }
    if (!data || data.length === 0) {
      console.error(`No story found with prefix ${prefix}!`);
      process.exit(1);
    }
    storyResults.push(data[0]);
  }
  const stories = storyResults;

  console.log(`Found ${stories.length} stories:`);
  stories.forEach(s => console.log(`  - ${s.title} | id: ${s.id} | narrator_voice_id: ${s.narrator_voice_id}`));

  // Step 2: Update narrator_voice_id on each story
  console.log('\n--- Updating narrator_voice_id on stories ---');
  for (const story of stories) {
    const { error: updateErr } = await sb
      .from('stories')
      .update({ narrator_voice_id: NARRATOR_VOICE_ID })
      .eq('id', story.id);

    if (updateErr) {
      console.error(`Error updating story ${story.id}:`, updateErr);
      process.exit(1);
    }

    const { data: verified, error: verifyErr } = await sb
      .from('stories')
      .select('id, title, narrator_voice_id')
      .eq('id', story.id)
      .single();

    if (verifyErr || !verified) {
      console.error(`Error verifying story ${story.id}:`, verifyErr);
      process.exit(1);
    }

    const ok = verified.narrator_voice_id === NARRATOR_VOICE_ID;
    console.log(`  ${ok ? '✅' : '❌'} ${verified.title}: narrator_voice_id = ${verified.narrator_voice_id}`);
    if (!ok) { console.error('Mismatch! Aborting.'); process.exit(1); }
  }

  // Step 3: Find ONE canonical job per story — the most recent (highest created_at)
  // The unique constraint "production_jobs_one_active_per_story" means only one can be active.
  // We target the most recent job (the one at generate_voices) per story.
  console.log('\n--- Finding canonical (most recent) job per story ---');
  const storyIds = stories.map(s => s.id);

  const targetJobs = [];
  for (const story of stories) {
    const { data, error } = await sb
      .from('production_jobs')
      .select('id, story_id, status, current_step, error_json, created_at')
      .eq('story_id', story.id)
      .order('created_at', { ascending: false })
      .limit(1);

    if (error) {
      console.error(`Error fetching jobs for story ${story.id}:`, error);
      process.exit(1);
    }
    if (!data || data.length === 0) {
      console.error(`No jobs found for story ${story.id}!`);
      process.exit(1);
    }
    const job = data[0];
    console.log(`  ${story.title}: job_id=${job.id} | status=${job.status} | step=${job.current_step}`);
    targetJobs.push({ job, story });
  }

  // Step 4: Reset each canonical job to voice_preflight / queued
  // First, delete or fail all OTHER jobs for these stories to avoid constraint conflicts
  console.log('\n--- Archiving stale jobs (set failed) to clear unique constraint ---');
  for (const { job, story } of targetJobs) {
    // Mark all OTHER jobs for this story as failed (permanently) so unique constraint won't fire
    const { error: archiveErr } = await sb
      .from('production_jobs')
      .update({ status: 'failed', error_json: { archived: 'superseded by narrator fix' } })
      .eq('story_id', story.id)
      .neq('id', job.id)
      .neq('status', 'failed'); // only touch non-failed ones

    if (archiveErr) {
      console.error(`Error archiving old jobs for story ${story.id}:`, archiveErr);
      // Non-fatal — they may already be failed
    }
  }

  console.log('\n--- Resetting canonical jobs to voice_preflight / queued ---');
  const results = [];
  for (const { job, story } of targetJobs) {
    const { error: resetErr } = await sb
      .from('production_jobs')
      .update({
        status: 'queued',
        current_step: 'voice_preflight',
        error_json: null,
        locked_at: null,
      })
      .eq('id', job.id);

    if (resetErr) {
      console.error(`Error resetting job ${job.id}:`, resetErr);
      process.exit(1);
    }

    // Verify
    const { data: v, error: verErr } = await sb
      .from('production_jobs')
      .select('id, story_id, status, current_step, error_json')
      .eq('id', job.id)
      .single();

    if (verErr || !v) {
      console.error(`Error verifying job ${job.id}:`, verErr);
      process.exit(1);
    }

    const jobOk = v.status === 'queued' && v.current_step === 'voice_preflight' && v.error_json === null;
    console.log(`  ${jobOk ? '✅' : '❌'} ${story.title}: job=${v.id} status=${v.status} step=${v.current_step} error_json=${v.error_json}`);
    if (!jobOk) { console.error('Verification failed!'); process.exit(1); }

    results.push({
      title: story.title,
      story_id: story.id,
      job_id: job.id,
      narrator_voice_id: NARRATOR_VOICE_ID,
      step: 'voice_preflight',
      status: 'queued',
    });
  }

  console.log('\n=== ALL DONE ===\n');
  results.forEach(r => {
    console.log(`📖 ${r.title}`);
    console.log(`   story_id: ${r.story_id}`);
    console.log(`   job_id:   ${r.job_id}`);
    console.log(`   narrator: ${r.narrator_voice_id}`);
    console.log(`   step:     ${r.step} / ${r.status}\n`);
  });

  console.log('JSON_RESULTS:' + JSON.stringify(results, null, 2));
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
