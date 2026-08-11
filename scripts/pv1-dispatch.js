#!/usr/bin/env node
// PV1 Voice Gen Dispatch - waits for storage clear, then dispatches and monitors
'use strict';

process.env.NODE_PATH='/Users/williampostlewaite/Projects/drivetimetales/node_modules';
require('module').Module._initPaths();

const {createClient} = require('@supabase/supabase-js');
require('dotenv').config({path:'/Users/williampostlewaite/Projects/drivetimetales/.env.local'});

const STORY_ID = 'a8c8b8d0-f717-44c4-a6a5-39c3a65d9c2e';
const BOT_TOKEN = '8980120123:AAG2ZMRl426yj1AKCbwEGjeAy4rM9_itoJU';
const CHAT_ID = '8737860822';
const RUN_NEXT_URL = 'https://app.endless-tales.com/api/admin/production-jobs/run-next';

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
      res.on('end', () => resolve(JSON.parse(data)));
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
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch(e) { resolve({raw: data}); }
      });
    });
    req.on('error', reject);
    req.write('{}');
    req.end();
  });
}

async function checkStorageCleared() {
  const {data, error} = await supabase.storage.from('audio')
    .list(`asc3/${STORY_ID}`, {limit: 100});
  if (error) return {error};
  const files = data || [];
  const nonBg = files.filter(f => f.name !== 'background_music.mp3');
  return {fileCount: files.length, clearedCount: nonBg.length, cleared: nonBg.length === 0};
}

async function getJobStatus(jobId) {
  const {data, error} = await supabase.from('production_jobs')
    .select('id, status, current_step, state_json, error_json, logs')
    .eq('id', jobId)
    .single();
  if (error) return {error};
  return data;
}

async function createJob() {
  const {data, error} = await supabase.from('production_jobs').insert({
    story_id: STORY_ID,
    job_type: 'standalone',
    status: 'queued',
    current_step: 'voice_preflight',
    input_json: {mode: 'standalone', source: 'atlas', storyId: STORY_ID},
    attempt_count: 0,
    step_index: 0,
    total_steps: 0
  }).select('*').single();
  if (error) throw new Error('Create job failed: ' + JSON.stringify(error));
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

async function generateSignedUrl() {
  const path = `asc3/${STORY_ID}/final_mix.mp3`;
  const {data, error} = await supabase.storage.from('audio')
    .createSignedUrl(path, 86400); // 24h
  if (error) throw error;
  return data.signedUrl;
}

async function main() {
  console.log('[PV1-DISPATCH] Starting. Waiting for storage clear...');
  
  // Phase 1: Wait for Marc to clear storage (poll every 30s, max 40min)
  const maxWait = 40 * 60 * 1000;
  const pollInterval = 30000;
  const startTime = Date.now();
  
  while (true) {
    if (Date.now() - startTime > maxWait) {
      console.log('[PV1-DISPATCH] Timeout: storage not cleared after 40 minutes.');
      await sendTelegram('⚠️ PV1 dispatch timed out waiting for storage clear (40min). Please run the SQL and re-trigger dispatch manually.\n\n⬛ DONE');
      process.exit(1);
    }
    
    const storage = await checkStorageCleared();
    if (storage.error) {
      console.log('[PV1-DISPATCH] Storage check error:', storage.error);
      await sleep(pollInterval);
      continue;
    }
    
    console.log(`[PV1-DISPATCH] Storage: ${storage.fileCount} files, non-bg: ${storage.clearedCount}`);
    
    if (storage.cleared) {
      console.log('[PV1-DISPATCH] ✅ Storage cleared! Only background_music.mp3 remains. Proceeding with voice gen dispatch.');
      break;
    }
    
    await sleep(pollInterval);
  }
  
  // Phase 2: Create production job
  console.log('[PV1-DISPATCH] Creating production job at voice_preflight...');
  const job = await createJob();
  console.log('[PV1-DISPATCH] Job created:', job.id);
  
  // Phase 3: Trigger runner
  console.log('[PV1-DISPATCH] Triggering run-next...');
  const runResult = await triggerRunNext();
  console.log('[PV1-DISPATCH] run-next response:', JSON.stringify(runResult).slice(0, 200));
  
  // Send confirmation to Marc
  await sendTelegram(`🎙️ Voice gen dispatched for PV1 (job ${job.id}). Monitoring segments... will update when complete.`);
  
  // Phase 4: Monitor voice gen until missingSegments=0
  console.log('[PV1-DISPATCH] Monitoring voice gen completion...');
  const voiceMaxWait = 25 * 60 * 1000; // 25 min
  const voiceStart = Date.now();
  let voiceComplete = false;
  let triggerCount = 0;
  
  while (!voiceComplete) {
    if (Date.now() - voiceStart > voiceMaxWait) {
      console.log('[PV1-DISPATCH] Voice gen timeout after 25 minutes.');
      await sendTelegram(`⚠️ PV1 voice gen timed out after 25min. Job: ${job.id}\n\n⬛ DONE`);
      process.exit(1);
    }
    
    await sleep(20000); // Check every 20s
    
    const jobStatus = await getJobStatus(job.id);
    if (jobStatus.error) { console.log('Job status error:', jobStatus.error); continue; }
    
    const state = jobStatus.state_json || {};
    const voiceGen = state.voiceGeneration || {};
    const missing = voiceGen.missingSegments || [];
    const step = jobStatus.current_step;
    const status = jobStatus.status;
    
    console.log(`[PV1-DISPATCH] Step: ${step} | Status: ${status} | Missing: ${missing.length}`);
    
    // If job is still queued or running at voice-related steps, trigger runner
    if ((status === 'queued' || status === 'running') && 
        (step === 'voice_preflight' || step === 'generate_voices' || step === 'generate_belle_assets')) {
      
      if (triggerCount < 30) { // Max 30 triggers
        const r = await triggerRunNext();
        console.log(`[PV1-DISPATCH] Triggered run-next (${++triggerCount}):`, JSON.stringify(r).slice(0,100));
      }
    }
    
    if (status === 'failed') {
      console.log('[PV1-DISPATCH] Job failed during voice gen:', JSON.stringify(jobStatus.error_json));
      await sendTelegram(`❌ PV1 voice gen failed at ${step}. Error: ${JSON.stringify(jobStatus.error_json)?.slice(0,200)}\n\n⬛ DONE`);
      process.exit(1);
    }
    
    // Check if voice gen is done (missingSegments=0 AND current step is past generate_voices)
    const voiceStepsDone = ['generate_belle_assets', 'validate_belle_assets', 'validate_belle_quality', 
                            'generate_music', 'render_final_mix', 'complete_story_package', 'ready_for_review'];
    
    if ((missing.length === 0 && voiceGen.presentCount > 0) || 
        voiceStepsDone.includes(step) || status === 'failed') {
      
      if (missing.length === 0 && voiceGen.presentCount > 0) {
        console.log(`[PV1-DISPATCH] ✅ Voice gen complete! ${voiceGen.presentCount} segments present, 0 missing.`);
        voiceComplete = true;
      } else if (voiceStepsDone.includes(step)) {
        console.log('[PV1-DISPATCH] Runner already advanced past voice gen. Step:', step);
        voiceComplete = true;
      }
    }
  }
  
  // Phase 5: Dispatch at generate_music (workaround as per instructions)
  const currentJobStatus = await getJobStatus(job.id);
  const currentStep = currentJobStatus.current_step;
  
  if (currentStep !== 'generate_music' && 
      !['render_final_mix', 'complete_story_package', 'ready_for_review'].includes(currentStep)) {
    console.log(`[PV1-DISPATCH] Advancing job to generate_music (from ${currentStep})...`);
    await advanceJobToStep(job.id, 'generate_music');
  } else {
    console.log(`[PV1-DISPATCH] Job already at/past generate_music (${currentStep}), no advance needed.`);
  }
  
  // Trigger run-next for generate_music → render_final_mix
  console.log('[PV1-DISPATCH] Triggering run-next for music+render...');
  await triggerRunNext();
  
  // Phase 6: Monitor for final_mix.mp3
  console.log('[PV1-DISPATCH] Monitoring for final_mix.mp3...');
  const mixMaxWait = 15 * 60 * 1000;
  const mixStart = Date.now();
  let mixReady = false;
  let mixTriggerCount = 0;
  
  while (!mixReady) {
    if (Date.now() - mixStart > mixMaxWait) {
      console.log('[PV1-DISPATCH] Final mix timeout after 15 minutes.');
      await sendTelegram(`⚠️ PV1 final_mix.mp3 not generated after 15min. Job: ${job.id}\n\n⬛ DONE`);
      process.exit(1);
    }
    
    await sleep(20000);
    
    // Check if file exists in storage
    const storage = await supabase.storage.from('audio')
      .list(`asc3/${STORY_ID}`, {limit: 100});
    const files = (storage.data || []).map(f => f.name);
    
    if (files.includes('final_mix.mp3')) {
      console.log('[PV1-DISPATCH] ✅ final_mix.mp3 found in storage!');
      mixReady = true;
      break;
    }
    
    // Check job status and trigger runner if needed
    const jobStatus = await getJobStatus(job.id);
    const step = jobStatus?.current_step;
    const status = jobStatus?.status;
    
    console.log(`[PV1-DISPATCH] Storage: no final_mix yet | Job step: ${step} | Status: ${status}`);
    
    if ((status === 'queued' || status === 'running') && mixTriggerCount < 20) {
      const r = await triggerRunNext();
      console.log(`[PV1-DISPATCH] Triggered run-next for mix (${++mixTriggerCount}):`, JSON.stringify(r).slice(0,100));
    }
    
    if (status === 'failed' && step !== 'complete_story_package') {
      // If failed somewhere other than complete_story_package (which we know is a known bug), stop
      console.log('[PV1-DISPATCH] Job failed:', step, JSON.stringify(jobStatus.error_json)?.slice(0,100));
      if (!files.includes('final_mix.mp3')) {
        await sendTelegram(`❌ PV1 render failed at ${step}. Job: ${job.id}\n\n⬛ DONE`);
        process.exit(1);
      }
    }
  }
  
  // Phase 7: Generate signed URL and send to Marc
  console.log('[PV1-DISPATCH] Generating 24h signed URL for final_mix.mp3...');
  const signedUrl = await generateSignedUrl();
  
  console.log('[PV1-DISPATCH] ✅ All done! Sending URL to Marc...');
  console.log('[PV1-DISPATCH] Signed URL:', signedUrl);
  
  const telegramResult = await sendTelegram(
    `✅ PV1 render complete! New final_mix.mp3 is ready.\n\n🎧 24h signed URL:\n${signedUrl}\n\n⬛ DONE`
  );
  console.log('[PV1-DISPATCH] Telegram message sent:', telegramResult?.ok ? 'OK' : JSON.stringify(telegramResult));
  
  console.log('[PV1-DISPATCH] COMPLETE.');
}

main().catch(async e => {
  console.error('[PV1-DISPATCH] FATAL:', e);
  try {
    await sendTelegram(`❌ PV1 dispatch fatal error: ${e.message?.slice(0,200)}\n\n⬛ DONE`);
  } catch(_) {}
  process.exit(1);
});
