#!/usr/bin/env node
// Origin 2.0 Sequential Dispatch — voice gen → render for all 19 episodes
'use strict';

process.env.NODE_PATH='/Users/williampostlewaite/Projects/drivetimetales/node_modules';
require('module').Module._initPaths();

const {createClient} = require('@supabase/supabase-js');
require('dotenv').config({path:'/Users/williampostlewaite/Projects/drivetimetales/.env.local'});

const BOT_TOKEN = '8980120123:AAG2ZMRl426yj1AKCbwEGjeAy4rM9_itoJU';
const CHAT_ID = '8737860822';
const RUN_NEXT_URL = 'https://app.endless-tales.com/api/admin/production-jobs/run-next';

const EPISODES = [
  { id: '5ed5db9a-fdd1-4c33-a8dd-e9e73309d11a', title: 'Ancient Minds in a Digital World' },
  { id: 'b7a2241d-0049-4244-a0d4-d0bd011593a5', title: "Evolution's Blind Spot" },
  { id: '4ffd57e5-6e46-4119-9686-bf61d8fb389d', title: 'From Fire to Form' },
  { id: 'd671b599-2d7e-4b69-9f7c-505a1d879787', title: 'From Nothing to Something' },
  { id: '4053bd15-758e-42e6-84f2-e20a80af7ed2', title: 'Man the Maker' },
  { id: '06eaba1a-6439-4a21-9428-d384865e4966', title: 'Parallel Strategies' },
  { id: '9498d8b5-a5b9-4e5d-a04b-1a7191919bae', title: 'The Expanding Mind' },
  { id: '8196d4e2-30d7-4e63-b77a-dd09120a08fc', title: 'The Explosion of Form' },
  { id: 'b452a060-b563-4ff7-910a-756fb369f9ac', title: 'The Final Reflection' },
  { id: 'f4ec81f5-a715-47b9-9167-5dd033d4b8d7', title: "The Heat We Can't Escape" },
  { id: '2258a329-e5e6-4c5c-a518-fb0cc1639feb', title: 'The Hunger of Digital Minds' },
  { id: '11e8caea-c57c-4e7c-88f4-e1b5a8c9c8b7', title: 'The Mirror Mind' },
  { id: '17356d21-fb5a-4c30-a8e5-1d5cd8e10495', title: 'The Oxygen Revolution' },
  { id: '8c42c222-d0c5-419b-b390-170f71d3f597', title: 'The Radiant Fog and the First Lights' },
  { id: '4b7d3e6c-fed0-4685-8402-6c2a928572e8', title: 'The Rise of the Group' },
  { id: 'f7e4832a-f5f3-406b-833c-99fa2090a044', title: 'The Solar System Awakens' },
  { id: 'f80dcb89-873e-499e-b5a7-c8820897550a', title: 'The Spark Before Life' },
  { id: '453fc4f6-15d7-42d6-a873-e2351d9d469d', title: 'The Stories We Tell Ourselves' },
  { id: '3f3c013e-9888-47ac-a12b-7be6698c2095', title: 'When Giants Ruled and Mammals Waited' },
];

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function sendTelegram(text) {
  const https = require('https');
  const body = JSON.stringify({chat_id: CHAT_ID, text});
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.telegram.org',
      path: `/bot${BOT_TOKEN}/sendMessage`,
      method: 'POST',
      headers: {'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body)}
    }, res => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch(e) { resolve({raw: data}); } });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function triggerRunNext() {
  const https = require('https');
  const url = new URL(RUN_NEXT_URL);
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: url.hostname,
      path: url.pathname,
      method: 'POST',
      headers: {'Content-Type': 'application/json', 'Content-Length': '2'}
    }, res => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch(e) { resolve({raw: data}); } });
    });
    req.on('error', reject);
    req.write('{}');
    req.end();
  });
}

async function createJob(storyId) {
  const {data, error} = await supabase.from('production_jobs').insert({
    story_id: storyId,
    job_type: 'standalone',
    status: 'queued',
    current_step: 'voice_preflight',
    input_json: {mode: 'standalone', source: 'atlas', storyId},
    attempt_count: 0,
    step_index: 0,
    total_steps: 0
  }).select('*').single();
  if (error) throw new Error('Create job failed: ' + JSON.stringify(error));
  return data;
}

async function getJobStatus(jobId) {
  const {data, error} = await supabase.from('production_jobs')
    .select('id, status, current_step, state_json, error_json')
    .eq('id', jobId)
    .single();
  if (error) return {error};
  return data;
}

async function advanceJobToStep(jobId, step) {
  const {data, error} = await supabase.from('production_jobs')
    .update({current_step: step, status: 'queued', locked_at: null, locked_by: null})
    .eq('id', jobId)
    .select('*').single();
  if (error) throw new Error('Advance step failed: ' + JSON.stringify(error));
  return data;
}

async function checkFinalMixExists(storyId) {
  const {data} = await supabase.storage.from('audio')
    .list(`asc3/${storyId}`, {limit: 100});
  const files = (data || []).map(f => f.name);
  return files.includes('final_mix.mp3');
}

async function processEpisode(ep, index, total) {
  const tag = `[Ep ${index+1}/${total} "${ep.title}"]`;
  console.log(`\n${tag} Starting...`);

  let job;
  try {
    job = await createJob(ep.id);
    console.log(`${tag} Job created: ${job.id}`);
  } catch(e) {
    console.error(`${tag} FAILED to create job:`, e.message);
    await sendTelegram(`❌ Origin2 Ep ${index+1}/${total} "${ep.title}" — job creation failed: ${e.message?.slice(0,150)}`);
    return {success: false, reason: 'job_create_failed'};
  }

  await triggerRunNext();

  const voiceMaxWait = 30 * 60 * 1000;
  const voiceStart = Date.now();
  let voiceComplete = false;
  let triggerCount = 0;
  const voiceStepsDone = ['generate_belle_assets','validate_belle_assets','validate_belle_quality',
                          'generate_music','render_final_mix','complete_story_package','ready_for_review'];

  while (!voiceComplete) {
    if (Date.now() - voiceStart > voiceMaxWait) {
      await sendTelegram(`⚠️ Origin2 Ep ${index+1}/${total} "${ep.title}" — voice gen timed out (30min). Job: ${job.id}`);
      return {success: false, reason: 'voice_timeout'};
    }
    await sleep(20000);
    const jobStatus = await getJobStatus(job.id);
    if (jobStatus.error) { console.log(`${tag} status error:`, jobStatus.error); continue; }
    const voiceGen = (jobStatus.state_json || {}).voiceGeneration || {};
    const missing = voiceGen.missingSegments || [];
    const step = jobStatus.current_step;
    const status = jobStatus.status;
    console.log(`${tag} Step: ${step} | Status: ${status} | Missing: ${missing.length}`);
    if (status === 'failed') {
      await sendTelegram(`❌ Origin2 Ep ${index+1}/${total} "${ep.title}" — failed at ${step}. Job: ${job.id}`);
      return {success: false, reason: 'job_failed', step};
    }
    if ((status === 'queued' || status === 'running') &&
        (step === 'voice_preflight' || step === 'generate_voices' || step === 'generate_belle_assets') &&
        triggerCount < 40) {
      const r = await triggerRunNext();
      console.log(`${tag} run-next (${++triggerCount}):`, JSON.stringify(r).slice(0,80));
    }
    if ((missing.length === 0 && voiceGen.presentCount > 0) || voiceStepsDone.includes(step)) {
      console.log(`${tag} ✅ Voice gen complete. presentCount=${voiceGen.presentCount}`);
      voiceComplete = true;
    }
  }

  const cur = await getJobStatus(job.id);
  const curStep = cur.current_step;
  const postVoice = ['render_final_mix','complete_story_package','ready_for_review'];
  if (curStep !== 'generate_music' && !postVoice.includes(curStep)) {
    console.log(`${tag} Advancing to generate_music from ${curStep}...`);
    await advanceJobToStep(job.id, 'generate_music');
  }
  await triggerRunNext();

  const mixMaxWait = 15 * 60 * 1000;
  const mixStart = Date.now();
  let mixReady = false;
  let mixTriggerCount = 0;

  while (!mixReady) {
    if (Date.now() - mixStart > mixMaxWait) {
      await sendTelegram(`⚠️ Origin2 Ep ${index+1}/${total} "${ep.title}" — final_mix timeout. Job: ${job.id}`);
      return {success: false, reason: 'mix_timeout'};
    }
    await sleep(20000);
    if (await checkFinalMixExists(ep.id)) {
      console.log(`${tag} ✅ final_mix.mp3 found!`);
      mixReady = true;
      break;
    }
    const jobStatus = await getJobStatus(job.id);
    const step = jobStatus?.current_step;
    const status = jobStatus?.status;
    console.log(`${tag} No final_mix yet | step: ${step} | status: ${status}`);
    if ((status === 'queued' || status === 'running') && mixTriggerCount < 25) {
      const r = await triggerRunNext();
      console.log(`${tag} run-next for mix (${++mixTriggerCount}):`, JSON.stringify(r).slice(0,80));
    }
    if (status === 'failed' && step !== 'complete_story_package') {
      if (!(await checkFinalMixExists(ep.id))) {
        await sendTelegram(`❌ Origin2 Ep ${index+1}/${total} "${ep.title}" — render failed at ${step}. Job: ${job.id}`);
        return {success: false, reason: 'render_failed', step};
      }
    }
  }

  console.log(`${tag} ✅ COMPLETE`);
  return {success: true};
}

async function main() {
  console.log('[ORIGIN2-DISPATCH] Starting 19 episodes sequentially.');
  await sendTelegram(`🚀 Origin 2.0 dispatch started — 19 episodes queued. Updates per episode.`);
  const results = [];
  for (let i = 0; i < EPISODES.length; i++) {
    const ep = EPISODES[i];
    const result = await processEpisode(ep, i, EPISODES.length);
    results.push({...ep, ...result});
    if (result.success) await sendTelegram(`✅ Origin2 [${i+1}/19] "${ep.title}" — done.`);
    if (i < EPISODES.length - 1) await sleep(5000);
  }
  const succeeded = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success);
  const summary = [
    `🏁 Origin 2.0 complete: ${succeeded}/19 succeeded.`,
    failed.length > 0 ? `Failed: ${failed.map(f => `"${f.title}" (${f.reason})`).join(', ')}` : 'No failures.',
    '⬛ DONE'
  ].join('\n\n');
  console.log('[ORIGIN2-DISPATCH]', summary);
  await sendTelegram(summary);
}

main().catch(async e => {
  console.error('[ORIGIN2-DISPATCH] FATAL:', e);
  try { await sendTelegram(`❌ Origin2 fatal: ${e.message?.slice(0,200)}\n\n⬛ DONE`); } catch(_) {}
  process.exit(1);
});
