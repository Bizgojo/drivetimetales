#!/usr/bin/env node
/**
 * Quick status check for the 12-series production batch.
 * Run anytime to see current state.
 */
const fs = require('fs'), path = require('path');
const { createClient } = require('@supabase/supabase-js');

const env = Object.fromEntries(
  fs.readFileSync(path.join(process.env.HOME, 'Projects/drivetimetales/.env.local'), 'utf8')
    .split('\n').filter(l => l.match(/^[A-Z_]+="/))
    .map(l => { const m = l.match(/^([A-Z_]+)="(.+)"$/); return m ? [m[1], m[2]] : null; })
    .filter(Boolean)
);
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const BATCH_SERIES_IDS = [
  '7cffc169-e86d-42ce-9150-77d8cb782100', // Mystery 5ep: The Courthouse Silence
  '709f7317-42f8-4631-8a6d-bd9306438fec', // Mystery 7ep: The Charity's Shadow
  'af568771-c45d-475f-9928-93943629a69b', // Mystery 13ep: The 20-Year Stare
  '400db5ac-ebbb-4aab-a2a4-f2d505d9de13', // Sci-Fi 5ep: The Signal Decay
  'bc89490a-b693-432d-8079-1e16265cc25f', // Sci-Fi 7ep: The Consciousness Protocol
  '4120c04a-0dd9-4b24-be8f-42c20c54c84a', // Sci-Fi 13ep: The Deep Archaeology
  'efc1e31b-2d23-4df8-b6f0-fa160862d1f2', // Western 5ep: The Cattle and the Law
  '7fc3f4fe-e5c5-48ce-9b71-aa43cead9a4c', // Western 7ep: The Border Sickness
  '1bd35f9a-db21-48dd-9acd-112e35a70328', // Western 13ep: The Hanged Man's Grave
  'b684a5de-5c7f-41f9-b21b-8f65cce16514', // Comedy 5ep: The Accidental Saviors
  '8fb02edf-b0bb-47fa-b887-e121fed6a2f4', // Comedy 7ep: The 911 Dispatcher
  '9eba3574-4c55-49bb-9377-5c3304db2321', // Comedy 13ep: The Auction House
];

async function main() {
  const { data: jobs } = await supabase
    .from('production_jobs')
    .select('id,series_id,status,current_step,error_json,updated_at')
    .in('series_id', BATCH_SERIES_IDS)
    .eq('job_type', 'series');

  const { data: series } = await supabase
    .from('series')
    .select('id,title')
    .in('id', BATCH_SERIES_IDS);

  const seriesMap = Object.fromEntries(series.map(s => [s.id, s.title]));

  const statusEmoji = {
    complete: '✅', ready_for_review: '✅', running: '🔄',
    queued: '⏳', failed: '❌'
  };
  const stepEmoji = {
    generate_episode_script: '📝', score_validate_package: '🔍',
    series_voice_preflight: '🎤', series_generate_voices: '🎙️',
    series_generate_belle_assets: '🔔', series_generate_music: '🎵',
    series_render_final_mix: '🎬', complete_story_package: '📦',
    ready_for_review: '✅', complete: '✅'
  };

  console.log(`\n${'─'.repeat(70)}`);
  console.log(`ENDLESS TALES — BATCH PRODUCTION STATUS  ${new Date().toLocaleString()}`);
  console.log('─'.repeat(70));

  let doneCount = 0, failedCount = 0, inProgressCount = 0;

  for (const sid of BATCH_SERIES_IDS) {
    const job = jobs?.find(j => j.series_id === sid);
    const name = seriesMap[sid] || sid.slice(0, 8);
    
    if (!job) {
      console.log(`  ⚠️  ${name.padEnd(40)} (no job found)`);
      continue;
    }

    const se = statusEmoji[job.status] || '❓';
    const step = job.current_step || '?';
    const ste = stepEmoji[step] || '▶️';
    const isTerminal = ['complete', 'ready_for_review'].includes(step);
    const updatedMinsAgo = Math.round((Date.now() - new Date(job.updated_at).getTime()) / 60000);

    if (isTerminal) doneCount++;
    else if (job.status === 'failed') failedCount++;
    else inProgressCount++;

    const errNote = job.status === 'failed' ? `  ← ${(job.error_json?.message || '?').slice(0, 60)}` : '';
    console.log(`  ${se} ${name.padEnd(40)} ${ste} ${step.padEnd(30)} ${updatedMinsAgo}m ago${errNote}`);
  }

  console.log('─'.repeat(70));
  console.log(`  Completed: ${doneCount}/12  |  In progress: ${inProgressCount}  |  Failed: ${failedCount}`);
  const runnerAlive = require('child_process').execSync('pgrep -f run_batch_production || echo ""').toString().trim();
  console.log(`  Runner: ${runnerAlive ? `🟢 alive (PID ${runnerAlive})` : '🔴 not running'}`);
  console.log('─'.repeat(70) + '\n');
}

main().catch(err => console.error(err));
