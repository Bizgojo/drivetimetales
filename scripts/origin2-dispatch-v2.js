#!/usr/bin/env node
// Origin 2.0 Dispatch v2 — monitors pre-queued jobs (narrator fix applied Sep 23 2026)
// Jobs already reset to queued/voice_preflight — no job creation needed.
'use strict';

process.env.NODE_PATH='/Users/williampostlewaite/Projects/drivetimetales/node_modules';
require('module').Module._initPaths();

const {createClient} = require('@supabase/supabase-js');
require('dotenv').config({path:'/Users/williampostlewaite/Projects/drivetimetales/.env.local'});

const BOT_TOKEN = '8980120123:AAG2ZMRl426yj1AKCbwEGjeAy4rM9_itoJU';
const CHAT_ID = '8737860822';
const RUN_NEXT_URL = 'https://app.endless-tales.com/api/admin/production-jobs/run-next';

// Pre-reset job IDs — narrator fix applied, all queued at voice_preflight
const EPISODES = [
 { id: '5ed5db9a-fdd1-4c33-a8dd-e9e73309d11a', title: 'Ancient Minds in a Digital World', jobId: 'ad6f9d73-562f-4afc-bce1-bc7651958b86' },
 { id: 'b7a2241d-0049-4244-a0d4-d0bd011593a5', title: "Evolution's Blind Spot", jobId: '0a0b5f28-f5f8-488e-a59d-e1705c9c701b' },
 { id: '4ffd57e5-6e46-4119-9686-bf61d8fb389d', title: 'From Fire to Form', jobId: '183fcd58-50ca-406b-ba8f-13141b8def95' },
 { id: 'd671b599-2d7e-4b69-9f7c-505a1d879787', title: 'From Nothing to Something', jobId: '1d622c2c-1a1a-4517-a5d1-4ea8d21470bd' },
 { id: '4053bd15-758e-42e6-84f2-e20a80af7ed2', title: 'Man the Maker', jobId: 'eceaa02b-77ac-467e-bd55-5fc24fe59359' },
 { id: '06eaba1a-6439-4a21-9428-d384865e4966', title: 'Parallel Strategies', jobId: '0f320e3e-25e4-4a24-a08e-9ee22e6f4e33' },
 { id: '9498d8b5-a5b9-4e5d-a04b-1a7191919bae', title: 'The Expanding Mind', jobId: '4e7f4898-55a8-4ecf-bfe6-659292d4bcbe' },
 { id: '8196d4e2-30d7-4e63-b77a-dd09120a08fc', title: 'The Explosion of Form', jobId: 'bdb0bec9-ae90-437c-a56c-cce035352c6c' },
 { id: 'b452a060-b563-4ff7-910a-756fb369f9ac', title: 'The Final Reflection', jobId: '37974ea6-ecd6-4e61-bb8f-6bbe1ba924d9' },
 { id: 'f4ec81f5-a715-47b9-9167-5dd033d4b8d7', title: "The Heat We Can't Escape", jobId: '9ad6f49c-1cc3-46af-80d0-9acc8c139041' },
 { id: '2258a329-e5e6-4c5c-a518-fb0cc1639feb', title: 'The Hunger of Digital Minds', jobId: '6173654d-5338-45bb-8876-d9f6b4267a13' },
 { id: '11e8caea-c57c-4e7c-88f4-e1b5a8c9c8b7', title: 'The Mirror Mind', jobId: '21216b85-3f99-40e8-a069-67e99105395d' },
 { id: '17356d21-fb5a-4c30-a8e5-1d5cd8e10495', title: 'The Oxygen Revolution', jobId: 'd9c67bc5-00d4-4ac5-be31-38ac2f10ed7c' },
 { id: '8c42c222-d0c5-419b-b390-170f71d3f597', title: 'The Radiant Fog and the First Lights', jobId: '41ab393a-04d8-4d3b-8ab8-9f3b24c6f136' },
 { id: '4b7d3e6c-fed0-4685-8402-6c2a928572e8', title: 'The Rise of the Group', jobId: '01eee671-02d5-4895-96ba-c257e7ffbc4d' },
 { id: 'f7e4832a-f5f3-406b-833c-99fa2090a044', title: 'The Solar System Awakens', jobId: '457ae2a0-7c4b-47e5-8713-2dfafdf8d53b' },
 { id: 'f80dcb89-873e-499e-b5a7-c8820897550a', title: 'The Spark Before Life', jobId: '28d4fce8-e7da-4b32-89c2-3c465b7785f2' },
 { id: '453fc4f6-15d7-42d6-a873-e2351d9d469d', title: 'The Stories We Tell Ourselves', jobId: 'ffe5b221-3043-4c94-acb0-d9df8ee923d4' },
 { id: '3f3c013e-9888-47ac-a12b-7be6698c2095', title: 'When Giants Ruled and Mammals Waited', jobId: 'c83abf71-ae3d-4960-9cf9-c3a0f25b356b' },
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
 console.log(`\n${tag} Starting with pre-queued job ${ep.jobId}...`);

 // Trigger initial run-next
 await triggerRunNext();

 // Phase A: Monitor voice gen (max 30 min)
 const voiceMaxWait = 30 * 60 * 1000;
 const voiceStart = Date.now();
 let voiceComplete = false;
 let triggerCount = 0;
 const voiceStepsDone = ['generate_belle_assets', 'validate_belle_assets', 'validate_belle_quality',
 'generate_music', 'render_final_mix', 'complete_story_package', 'ready_for_review'];

 while (!voiceComplete) {
 if (Date.now() - voiceStart > voiceMaxWait) {
 console.log(`${tag} Voice gen timeout after 30min.`);
 await sendTelegram(`⚠️ Origin2 Ep ${index+1}/${total} "${ep.title}" — voice gen timed out (30min). Job: ${ep.jobId}`);
 return {success: false, reason: 'voice_timeout'};
 }

 await sleep(20000);

 const jobStatus = await getJobStatus(ep.jobId);
 if (jobStatus.error) { console.log(`${tag} Job status error:`, jobStatus.error); continue; }

 const state = jobStatus.state_json || {};
 const voiceGen = state.voiceGeneration || {};
 const missing = voiceGen.missingSegments || [];
 const step = jobStatus.current_step;
 const status = jobStatus.status;

 console.log(`${tag} Step: ${step} | Status: ${status} | Missing: ${missing.length}`);

 if (status === 'failed') {
 console.log(`${tag} Job failed at ${step}:`, JSON.stringify(jobStatus.error_json)?.slice(0,200));
 await sendTelegram(`❌ Origin2 Ep ${index+1}/${total} "${ep.title}" — failed at ${step}. Job: ${ep.jobId}`);
 return {success: false, reason: 'job_failed', step};
 }

 // Keep triggering run-next if still in voice steps
 if ((status === 'queued' || status === 'running') &&
 (step === 'voice_preflight' || step === 'generate_voices' || step === 'generate_belle_assets') &&
 triggerCount < 40) {
 const r = await triggerRunNext();
 console.log(`${tag} Triggered run-next (${++triggerCount}):`, JSON.stringify(r).slice(0,80));
 }

 if ((missing.length === 0 && voiceGen.presentCount > 0) || voiceStepsDone.includes(step)) {
 console.log(`${tag} ✅ Voice gen complete. presentCount=${voiceGen.presentCount}, step=${step}`);
 voiceComplete = true;
 }
 }

 // Phase B: Advance to generate_music if needed
 const currentStatus = await getJobStatus(ep.jobId);
 const currentStep = currentStatus.current_step;
 const postVoiceSteps = ['render_final_mix', 'complete_story_package', 'ready_for_review'];

 if (currentStep !== 'generate_music' && !postVoiceSteps.includes(currentStep)) {
 console.log(`${tag} Advancing to generate_music from ${currentStep}...`);
 await advanceJobToStep(ep.jobId, 'generate_music');
 } else {
 console.log(`${tag} Already at/past generate_music (${currentStep}).`);
 }

 await triggerRunNext();

 // Phase C: Monitor for final_mix.mp3 (max 15 min)
 const mixMaxWait = 15 * 60 * 1000;
 const mixStart = Date.now();
 let mixReady = false;
 let mixTriggerCount = 0;

 while (!mixReady) {
 if (Date.now() - mixStart > mixMaxWait) {
 console.log(`${tag} Final mix timeout after 15min.`);
 await sendTelegram(`⚠️ Origin2 Ep ${index+1}/${total} "${ep.title}" — final_mix not generated after 15min. Job: ${ep.jobId}`);
 return {success: false, reason: 'mix_timeout'};
 }

 await sleep(20000);

 if (await checkFinalMixExists(ep.id)) {
 console.log(`${tag} ✅ final_mix.mp3 found!`);
 mixReady = true;
 break;
 }

 const jobStatus = await getJobStatus(ep.jobId);
 const step = jobStatus?.current_step;
 const status = jobStatus?.status;
 console.log(`${tag} No final_mix yet | step: ${step} | status: ${status}`);

 if ((status === 'queued' || status === 'running') && mixTriggerCount < 25) {
 const r = await triggerRunNext();
 console.log(`${tag} Triggered run-next for mix (${++mixTriggerCount}):`, JSON.stringify(r).slice(0,80));
 }

 if (status === 'failed' && step !== 'complete_story_package') {
 if (!(await checkFinalMixExists(ep.id))) {
 console.log(`${tag} Job failed at ${step}.`);
 await sendTelegram(`❌ Origin2 Ep ${index+1}/${total} "${ep.title}" — render failed at ${step}. Job: ${ep.jobId}`);
 return {success: false, reason: 'render_failed', step};
 }
 }
 }

 console.log(`${tag} ✅ COMPLETE`);
 return {success: true};
}

async function main() {
 console.log('[ORIGIN2-DISPATCH-V2] Starting. 19 episodes pre-queued. Narrator fix applied.');
 await sendTelegram(`🚀 Origin 2.0 dispatch v2 started — ${EPISODES.length} episodes queued (narrator fix applied). Updates per episode.`);

 const results = [];
 for (let i = 0; i < EPISODES.length; i++) {
 const ep = EPISODES[i];
 const result = await processEpisode(ep, i, EPISODES.length);
 results.push({...ep, ...result});

 if (result.success) {
 await sendTelegram(`✅ Origin2 [${i+1}/${EPISODES.length}] "${ep.title}" — done.`);
 }
 if (i < EPISODES.length - 1) await sleep(5000);
 }

 const succeeded = results.filter(r => r.success).length;
 const failed = results.filter(r => !r.success);

 const summary = [
 `🏁 Origin 2.0 dispatch v2 complete: ${succeeded}/${EPISODES.length} succeeded.`,
 failed.length > 0 ? `Failed: ${failed.map(f => `"${f.title}" (${f.reason})`).join(', ')}` : 'No failures.',
 '⬛ DONE'
 ].join('\n\n');

 console.log('[ORIGIN2-DISPATCH-V2]', summary);
 await sendTelegram(summary);
}

main().catch(async e => {
 console.error('[ORIGIN2-DISPATCH-V2] FATAL:', e);
 try { await sendTelegram(`❌ Origin2 v2 dispatch fatal: ${e.message?.slice(0,200)}\n\n⬛ DONE`); } catch(_) {}
 process.exit(1);
});
