import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://vmyhlfeouzslixtkmddy.supabase.co';
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZteWhsZmVvdXpzbGl4dGttZGR5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjA4OTYxMiwiZXhwIjoyMDgxNjY1NjEyfQ.xa0VB5h-KgLMxmM_ZWwIDuSRPUOxOmxow-c-Ua_pdQ0';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function main() {
  console.log('=== STEP 1: Audit Sunset of Competition episodes ===\n');

  // First, find the series
  const { data: series, error: seriesErr } = await supabase
    .from('series')
    .select('id, title')
    .ilike('title', '%sunset%competition%');

  if (seriesErr) {
    console.error('Error finding series:', seriesErr);
    process.exit(1);
  }

  console.log('Found series:', series);

  if (!series || series.length === 0) {
    console.error('No series found matching "sunset competition"');
    process.exit(1);
  }

  const seriesIds = series.map(s => s.id);

  // Query all ready_for_review episodes
  const { data: episodes, error: queryErr } = await supabase
    .from('stories')
    .select('id, title, episode_number, workflow_state, audio_url, story_body_with_outro_url, needs_attention')
    .in('series_id', seriesIds)
    .eq('workflow_state', 'ready_for_review')
    .order('episode_number');

  if (queryErr) {
    console.error('Error querying episodes:', queryErr);
    process.exit(1);
  }

  console.log(`\nFound ${episodes?.length ?? 0} episodes at ready_for_review:\n`);
  
  const toPublish = [];
  const toSkip = [];

  for (const ep of (episodes || [])) {
    console.log(`  EP${ep.episode_number}: ${ep.title}`);
    console.log(`    audio_url: ${ep.audio_url ? ep.audio_url.substring(0, 60) + '...' : 'NULL'}`);
    console.log(`    story_body_with_outro_url: ${ep.story_body_with_outro_url ? ep.story_body_with_outro_url.substring(0, 60) + '...' : 'NULL'}`);
    
    if (ep.story_body_with_outro_url) {
      toPublish.push(ep);
    } else {
      toSkip.push(ep);
      console.log(`    ⚠️ SKIPPING — story_body_with_outro_url is null`);
    }
  }

  console.log(`\nTo publish: ${toPublish.length}`);
  console.log(`To skip (no outro url): ${toSkip.length}`);

  if (toPublish.length === 0) {
    console.log('\nNothing to publish!');
    return { toPublish, toSkip, published: [], failed: [] };
  }

  console.log('\n=== STEP 2: Publishing episodes ===\n');

  const published = [];
  const failed = [];
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

  for (const ep of toPublish) {
    const { error: updateErr } = await supabase
      .from('stories')
      .update({
        audio_url: ep.story_body_with_outro_url,
        workflow_state: 'published',
        published_on: today,
        needs_attention: false,
      })
      .eq('id', ep.id)
      .eq('workflow_state', 'ready_for_review'); // safety check

    if (updateErr) {
      console.error(`  ❌ EP${ep.episode_number}: ${ep.title} — ERROR: ${updateErr.message}`);
      failed.push({ ep, error: updateErr.message });
    } else {
      console.log(`  ✅ EP${ep.episode_number}: ${ep.title} — published`);
      published.push(ep);
    }
  }

  console.log('\n=== STEP 3: Verify ===\n');

  const publishedIds = published.map(p => p.id);
  
  if (publishedIds.length > 0) {
    const { data: verified, error: verifyErr } = await supabase
      .from('stories')
      .select('id, title, episode_number, workflow_state, audio_url')
      .in('id', publishedIds)
      .order('episode_number');

    if (verifyErr) {
      console.error('Verification query failed:', verifyErr);
    } else {
      let allGood = true;
      for (const v of (verified || [])) {
        if (v.workflow_state !== 'published') {
          console.error(`  ❌ EP${v.episode_number}: ${v.title} — still at ${v.workflow_state}!`);
          allGood = false;
        } else {
          console.log(`  ✅ EP${v.episode_number}: ${v.title} — confirmed published`);
        }
      }
      if (allGood) console.log('\nAll verified ✅');
    }
  }

  return { toPublish, toSkip, published, failed };
}

main()
  .then(result => {
    console.log('\n=== SUMMARY ===');
    console.log(JSON.stringify({
      total_ready: result.toPublish.length + result.toSkip.length,
      published: result.published.length,
      skipped: result.toSkip.length,
      failed: result.failed.length,
      publishedList: result.published.map(e => `EP${e.episode_number}: ${e.title}`),
      skippedList: result.toSkip.map(e => `EP${e.episode_number}: ${e.title}`),
      failedList: result.failed.map(f => `EP${f.ep.episode_number}: ${f.ep.title} — ${f.error}`),
    }, null, 2));
  })
  .catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
