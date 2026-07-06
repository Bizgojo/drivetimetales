#!/usr/bin/env node

/**
 * Endless Tales — Batch Production Runner
 * Drives 12 series through the full ASC pipeline until all reach ready_for_review.
 * Sends Telegram notifications on each series completion and on failures.
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const { createClient } = require('@supabase/supabase-js');

// ─── Config ───────────────────────────────────────────────────────────────────

const envPath = path.join(process.env.HOME, 'Projects/drivetimetales/.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');
const parseEnv = (c) => {
  const r = {};
  c.split('\n').forEach(l => { const m = l.match(/^([A-Z_]+)="(.+)"$/); if (m) r[m[1]] = m[2]; });
  return r;
};
const env = parseEnv(envContent);

const SUPABASE_URL  = env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY   = env.SUPABASE_SERVICE_ROLE_KEY;
const ANTHROPIC_KEY = env.ANTHROPIC_API_KEY;
const supabase      = createClient(SUPABASE_URL, SERVICE_KEY);

const RUN_NEXT_URL = 'http://localhost:3000/api/admin/production-jobs/run-next';
const TELEGRAM_BOT_TOKEN = '7993271701:AAFpnzAj_JHmDioV4EWF7LakpLrMNJcNulU';
const TELEGRAM_CHAT_ID   = '8737860822';

const TERMINAL_STEPS = ['ready_for_review', 'complete'];
const MAX_RETRIES_PER_STEP = 3;
const STEP_WAIT_MS  = 5_000;
const POLL_WAIT_MS  = 15_000;
const MAX_IDLE_ROUNDS = 30;   // bail if run-next returns no work 30× in a row

// Series name map (series_id → name) populated during run
const seriesNames = {};

// ─── Telegram ─────────────────────────────────────────────────────────────────

function tgRequest(text) {
  return new Promise((resolve) => {
    const body = JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text, parse_mode: 'Markdown' });
    const req = https.request({
      hostname: 'api.telegram.org',
      path: `/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    }, res => { res.resume(); resolve(); });
    req.on('error', () => resolve());
    req.write(body);
    req.end();
  });
}

async function notify(text) {
  console.log(`[TELEGRAM] ${text}`);
  await tgRequest(text).catch(() => {});
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function nowStr() { return new Date().toISOString(); }

function log(msg, ...args) {
  const line = `[${nowStr()}] ${msg}`;
  console.log(line, ...args);
  fs.appendFileSync('/tmp/batch_production.log', line + (args.length ? ' ' + JSON.stringify(args) : '') + '\n');
}

async function fetchJson(url, opts = {}) {
  const { default: fetch } = await import('node-fetch');
  const res = await fetch(url, opts);
  const text = await res.text();
  try { return { ok: res.ok, status: res.status, data: JSON.parse(text) }; }
  catch { return { ok: false, status: res.status, data: { error: text.slice(0, 500) } }; }
}

// ─── DB Helpers ───────────────────────────────────────────────────────────────

async function getQueuedJobs() {
  const { data, error } = await supabase
    .from('production_jobs')
    .select('id,job_type,series_id,story_id,status,current_step,error_json,updated_at')
    .in('status', ['queued', 'running'])
    .order('created_at', { ascending: true });
  if (error) throw new Error(`getQueuedJobs: ${error.message}`);
  return data || [];
}

async function getAllBatchJobs() {
  const { data, error } = await supabase
    .from('production_jobs')
    .select('id,job_type,series_id,story_id,status,current_step,error_json,updated_at')
    .order('created_at', { ascending: true })
    .limit(200);
  if (error) throw new Error(`getAllBatchJobs: ${error.message}`);
  return data || [];
}

async function getSeriesName(seriesId) {
  if (!seriesId) return 'Unknown';
  if (seriesNames[seriesId]) return seriesNames[seriesId];
  const { data } = await supabase.from('series').select('title').eq('id', seriesId).maybeSingle();
  seriesNames[seriesId] = data?.title || seriesId.slice(0, 8);
  return seriesNames[seriesId];
}

async function getCompletedSeriesIds() {
  const { data } = await supabase
    .from('production_jobs')
    .select('series_id')
    .in('current_step', TERMINAL_STEPS)
    .eq('job_type', 'series');
  return new Set((data || []).map(d => d.series_id).filter(Boolean));
}

// ─── Core Run Loop ────────────────────────────────────────────────────────────

async function callRunNext(jobId) {
  const url = jobId ? `${RUN_NEXT_URL}?jobId=${jobId}` : RUN_NEXT_URL;
  const result = await fetchJson(url, { method: 'POST' });
  return result;
}

async function runProductionLoop() {
  log('=== Batch Production Runner started ===');
  await notify('🎬 *Production pipeline started* — 12 series queuing up. Will notify as each completes.');

  const alreadyNotified = new Set();
  let idleRounds = 0;
  let totalErrors = 0;

  while (true) {
    // Check what's still active
    const activeJobs = await getQueuedJobs();
    
    if (activeJobs.length === 0) {
      log('No active jobs found. Checking for completions...');
      
      // Final check — are all 12 done?
      const allJobs = await getAllBatchJobs();
      const completedSeries = allJobs.filter(j => TERMINAL_STEPS.includes(j.current_step) && j.job_type === 'series');
      const failedJobs     = allJobs.filter(j => j.status === 'failed' && j.job_type === 'series');
      const pendingJobs    = allJobs.filter(j => !TERMINAL_STEPS.includes(j.current_step) && j.status !== 'failed' && j.job_type === 'series');
      
      log(`Complete: ${completedSeries.length} | Failed: ${failedJobs.length} | Pending: ${pendingJobs.length}`);
      
      if (pendingJobs.length === 0) {
        log('All series jobs are complete or failed. Exiting.');
        break;
      }
      
      idleRounds++;
      if (idleRounds >= MAX_IDLE_ROUNDS) {
        log('Max idle rounds reached. Exiting.');
        break;
      }
      await sleep(POLL_WAIT_MS);
      continue;
    }
    
    idleRounds = 0;

    // Call run-next (it picks oldest queued/running job)
    const result = await callRunNext();
    
    if (!result.ok) {
      // 409 = job already locked by another worker — totally normal, just wait
      if (result.status === 409) {
        const lockedJobId = result.data?.jobId || '?';
        log(`run-next: job locked (${lockedJobId}) — waiting for it to complete...`);
        await sleep(30_000); // wait 30s before retry when locked
        continue;
      }
      
      // 404/422 = no eligible job right now
      if (result.status === 404 || result.status === 422) {
        log(`run-next: no eligible job (${result.status}) — polling...`);
        await sleep(POLL_WAIT_MS);
        continue;
      }
      
      log(`run-next HTTP error: ${result.status}`, result.data);
      totalErrors++;
      if (totalErrors >= 10) {
        await notify('⚠️ *Production runner*: 10 consecutive HTTP errors from run-next. Halting.');
        break;
      }
      await sleep(STEP_WAIT_MS * 2);
      continue;
    }

    const data = result.data;
    
    // No work available
    if (data?.noWork || data?.noJob || data?.skipped || (!data?.success && !data?.step && !data?.nextStep)) {
      log('run-next: no work available right now');
      await sleep(POLL_WAIT_MS);
      continue;
    }

    totalErrors = 0;

    const step       = data?.step || data?.current_step || data?.nextStep || '?';
    const seriesId   = data?.seriesId || data?.series_id;
    const jobId      = data?.jobId || data?.job_id;
    const seriesName = seriesId ? await getSeriesName(seriesId) : 'Unknown';

    log(`  → Job advanced | series:"${seriesName}" | step:${step} | success:${data?.success}`);

    // Handle failure
    if (data?.success === false || data?.failed) {
      const errMsg = data?.error || data?.message || 'Unknown error';
      log(`  ✗ Job failed: ${errMsg}`);
      
      const repairableSteps = ['validate_script', 'score_validate_package', 'generate_voices', 'series_generate_voices'];
      const isAutoRepair = repairableSteps.some(s => step?.includes(s));
      
      await notify(
        `⚠️ *Job failed*: "${seriesName}"\n` +
        `Step: \`${step}\`\n` +
        `Error: ${errMsg.slice(0, 200)}\n` +
        (isAutoRepair ? '🔄 Attempting auto-repair...' : '🔴 Manual review needed.')
      );
      
      // Auto-repair: reset job to retry step
      if (isAutoRepair && jobId) {
        log(`  Auto-retrying ${step}...`);
        await supabase.from('production_jobs')
          .update({ status: 'queued', error_json: null })
          .eq('id', jobId);
      }
      
      await sleep(STEP_WAIT_MS);
      continue;
    }

    // Check for series completion
    if (TERMINAL_STEPS.includes(step) && seriesId && !alreadyNotified.has(seriesId)) {
      alreadyNotified.add(seriesId);
      const remaining = (await getQueuedJobs()).length;
      await notify(
        `✅ *Series complete!*\n` +
        `"${seriesName}" → Ready for Review\n` +
        `${remaining} series still in production.`
      );
      
      // Update workflow_state for all episodes in this series
      await supabase.from('stories')
        .update({ workflow_state: 'ready_for_review' })
        .eq('series_id', seriesId);
      
      log(`  ✓ Series "${seriesName}" complete — moved to ready_for_review`);
    }

    // Brief pause between steps
    await sleep(STEP_WAIT_MS);
  }

  // Final summary
  const allJobs = await getAllBatchJobs();
  const complete = allJobs.filter(j => TERMINAL_STEPS.includes(j.current_step) && j.job_type === 'series');
  const failed   = allJobs.filter(j => j.status === 'failed' && j.job_type === 'series');

  const completedNames = await Promise.all(complete.map(j => getSeriesName(j.series_id)));
  const failedNames    = await Promise.all(failed.map(j => getSeriesName(j.series_id)));

  const summary =
    `🎬 *Production batch complete!*\n\n` +
    `✅ Complete (${complete.length}):\n${completedNames.map(n => `  • ${n}`).join('\n')}\n` +
    (failed.length ? `\n❌ Failed (${failed.length}):\n${failedNames.map(n => `  • ${n}`).join('\n')}\n` : '') +
    `\nAll complete series are in Ready for Review. 🎙️`;

  log('=== Runner finished ===');
  log(summary.replace(/\*/g, ''));
  await notify(summary);
}

// ─── Entry ────────────────────────────────────────────────────────────────────

runProductionLoop().catch(async (err) => {
  console.error('[FATAL]', err);
  await notify(`🚨 *Production runner crashed*: ${err.message}`).catch(() => {});
  process.exit(1);
});
