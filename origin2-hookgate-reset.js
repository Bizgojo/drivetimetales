const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://vmyhlfeouzslixtkmddy.supabase.co';
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZteWhsZmVvdXpzbGl4dGttZGR5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjA4OTYxMiwiZXhwIjoyMDgxNjY1NjEyfQ.xa0VB5h-KgLMxmM_ZWwIDuSRPUOxOmxow-c-Ua_pdQ0';
const ORIGIN2_SERIES_PREFIX = 'df27ac64';

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function main() {
  console.log('=== Origin 2.0 hook_gate_failed Reset ===');
  console.log('Authorization: Marc (Sep 16 14:38 EDT) — reset all hook_gate_failed EP5–EP18\n');

  // Step 1: Find all Origin 2.0 stories
  // series_id is a UUID column — filter by exact series UUID lookup
  // First get the series id that starts with our prefix
  const { data: seriesList, error: seriesErr } = await sb
    .from('series')
    .select('id, title')
    .ilike('id::text', `${ORIGIN2_SERIES_PREFIX}%`);

  // Fallback: if ilike on uuid fails, fetch all and filter in JS
  let seriesId;
  if (seriesErr || !seriesList || seriesList.length === 0) {
    console.log('Trying alternate series lookup...');
    const { data: allSeries } = await sb.from('series').select('id, title');
    const match = (allSeries || []).find(s => s.id.startsWith(ORIGIN2_SERIES_PREFIX));
    if (!match) {
      console.error('Could not find Origin 2.0 series with prefix:', ORIGIN2_SERIES_PREFIX);
      process.exit(1);
    }
    seriesId = match.id;
    console.log(`Found series: ${match.title} (${seriesId})`);
  } else {
    seriesId = seriesList[0].id;
    console.log(`Found series: ${seriesList[0].title} (${seriesId})`);
  }

  const { data: stories, error: storiesErr } = await sb
    .from('stories')
    .select('id, title, episode_number, series_id')
    .eq('series_id', seriesId)
    .order('episode_number', { ascending: true });

  if (storiesErr) {
    console.error('Error fetching stories:', storiesErr);
    process.exit(1);
  }

  console.log(`Found ${stories.length} Origin 2.0 stories total`);

  const storyIds = stories.map(s => s.id);
  const storyMap = {};
  for (const s of stories) {
    storyMap[s.id] = s;
  }

  // Step 2: Find production_jobs with hook_gate_failed for these stories
  // Try multiple possible step names for hook gate failure
  const { data: jobs, error: jobsErr } = await sb
    .from('production_jobs')
    .select('id, story_id, status, current_step, error_json, updated_at')
    .in('story_id', storyIds)
    .or('current_step.eq.hook_gate_failed,current_step.like.%hook_gate%');

  if (jobsErr) {
    console.error('Error fetching jobs:', jobsErr);
    process.exit(1);
  }

  console.log(`Found ${jobs.length} job(s) with hook_gate failure step\n`);

  if (jobs.length === 0) {
    // Broader search - any failed jobs for Origin 2.0
    console.log('No hook_gate_failed jobs found. Checking all failed Origin 2.0 jobs...');
    const { data: allJobs, error: allErr } = await sb
      .from('production_jobs')
      .select('id, story_id, status, current_step, error_json, updated_at')
      .in('story_id', storyIds)
      .neq('status', 'done')
      .order('updated_at', { ascending: false });

    if (allErr) {
      console.error('Error fetching all jobs:', allErr);
      process.exit(1);
    }

    console.log(`All non-done Origin 2.0 jobs (${allJobs.length} total):`);
    for (const j of allJobs) {
      const story = storyMap[j.story_id];
      console.log(`  EP${story?.episode_number} "${story?.title}" | ${j.id.slice(0,8)} | status=${j.status} | step=${j.current_step}`);
    }
    process.exit(0);
  }

  // Step 3: Reset each job
  const results = [];
  for (const job of jobs) {
    const story = storyMap[job.story_id];
    const oldStep = job.current_step;
    const oldStatus = job.status;

    console.log(`Resetting: EP${story?.episode_number} "${story?.title}" | ${job.id.slice(0,8)}`);
    console.log(`  ${oldStatus}/${oldStep} → queued/complete_story_package`);

    const { data: updated, error: updateErr } = await sb
      .from('production_jobs')
      .update({
        status: 'queued',
        current_step: 'complete_story_package',
        error_json: null,
        locked_at: null,
      })
      .eq('id', job.id)
      .select('id, status, current_step, error_json')
      .single();

    if (updateErr) {
      console.error(`  ❌ Update failed: ${updateErr.message}`);
      results.push({ job, story, success: false, error: updateErr.message });
      continue;
    }

    // Verify
    if (updated.status === 'queued' && updated.current_step === 'complete_story_package' && updated.error_json === null) {
      console.log(`  ✅ Verified: queued / complete_story_package / error_json=null`);
      results.push({ job: updated, story, oldStep, success: true });
    } else {
      console.error(`  ⚠️ Unexpected state after update: ${JSON.stringify(updated)}`);
      results.push({ job: updated, story, oldStep, success: false, error: 'Unexpected state' });
    }
  }

  // Step 4: Summary
  const succeeded = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);

  console.log(`\n=== RESET SUMMARY ===`);
  console.log(`✅ Successfully reset: ${succeeded.length}`);
  console.log(`❌ Failed: ${failed.length}`);
  console.log('');

  for (const r of results) {
    const ep = r.story?.episode_number;
    const title = r.story?.title;
    const jobShort = (r.job?.id || '').slice(0, 8);
    const mark = r.success ? '✅' : '❌';
    console.log(`${mark} EP${ep} "${title}" | ${jobShort} | ${r.oldStep} → complete_story_package/queued`);
  }

  // Output JSON for Telegram message building
  const outputJson = {
    total: jobs.length,
    succeeded: succeeded.length,
    failed: failed.length,
    jobs: results.map(r => ({
      ep: r.story?.episode_number,
      title: r.story?.title,
      jobId: (r.job?.id || '').slice(0, 8),
      success: r.success,
      oldStep: r.oldStep,
    }))
  };

  console.log('\n=== JSON OUTPUT ===');
  console.log(JSON.stringify(outputJson, null, 2));
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
