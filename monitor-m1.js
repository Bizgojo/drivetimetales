'use strict';
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(
  'https://vmyhlfeouzslixtkmddy.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZteWhsZmVvdXpzbGl4dGttZGR5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjA4OTYxMiwiZXhwIjoyMDgxNjY1NjEyfQ.xa0VB5h-KgLMxmM_ZWwIDuSRPUOxOmxow-c-Ua_pdQ0'
);

const JOBS = [
  { id: 'f0d999d0-154f-4cdc-9563-4dd70e8f5fe7', label: '#2 The Case Number', storyId: '39220f22-4f94-46bb-9558-b405b0a7a8a4' },
  { id: 'c01b6f25-5b97-4443-b6c4-4d72832d273e', label: '#3 The Deed', storyId: '671abae4-f847-4b5e-b7e2-cf388a2e36eb' },
];

const PIPELINE_STEPS = [
  'generate_script','validate_script','validate_story_resolution',
  'voice_preflight','generate_voices','validate_voices',
  'generate_music','validate_music','generate_belle_assets',
  'validate_belle_assets','render_final_mix','validate_final_mix',
  'validate_belle_quality','ready_for_review'
];

const state = {};
JOBS.forEach(j => { state[j.id] = { status: null, step: null, retryVS: 0, retryVP: 0, logCount: 0, errorKind: null }; });

function ts() { return new Date().toISOString().slice(11,19); }
function stepNum(s) { const i = PIPELINE_STEPS.indexOf(s); return i >= 0 ? `[${i+1}/14]` : '[?/14]'; }

async function poll() {
  for (const { id, label, storyId } of JOBS) {
    const { data: j, error } = await sb.from('production_jobs')
      .select('id,story_id,status,current_step,state_json,error_json,locked_by,updated_at,logs')
      .eq('id', id).single();
    if (error || !j) { console.log(`${ts()} [${label}] DB error: ${error?.message}`); continue; }

    const prev = state[id];
    const retryVS = j.state_json?.validateScriptRetryCount ?? 0;
    const retryVP = j.state_json?.voicePreflightScriptRetryCount ?? 0;
    const logCount = Array.isArray(j.logs) ? j.logs.length : 0;
    const errorKind = j.error_json?.kind || null;
    const marcRequired = j.error_json?.marc_required;

    const stepChanged = j.current_step !== prev.step;
    const statusChanged = j.status !== prev.status;
    const retryVSChanged = retryVS !== prev.retryVS;
    const retryVPChanged = retryVP !== prev.retryVP;
    const errorChanged = errorKind !== prev.errorKind;

    if (stepChanged || statusChanged || retryVSChanged || retryVPChanged || errorChanged) {
      const sn = stepNum(j.current_step);
      const line = `${ts()} [${label}] ${sn} ${j.status}@${j.current_step}`;

      if (stepChanged && prev.step) {
        console.log(`\n🔄 STEP CHANGE → ${label}`);
        console.log(`   ${prev.step} ──► ${j.current_step} ${sn}`);
        console.log(`   status=${j.status}  locked_by=${j.locked_by || 'none'}`);
      } else if (statusChanged) {
        const icon = j.status === 'failed' ? '❌' : j.status === 'complete' ? '✅' : j.status === 'running' ? '⚙️' : '🔄';
        console.log(`\n${icon} STATUS → ${label}: ${prev.status} ──► ${j.status} @ ${j.current_step}`);
      }

      if (retryVSChanged && retryVS > prev.retryVS) {
        console.log(`   🔁 ATL-PIPE-008 retry ${retryVS}/2 — validate_script → generate_script`);
      }
      if (retryVPChanged && retryVP > prev.retryVP) {
        console.log(`   🔁 ATL-PIPE-009 retry ${retryVP}/2 — voice_preflight → generate_script`);
      }

      if (j.status === 'failed' && errorChanged) {
        const e = j.error_json || {};
        console.log(`\n❌ FAILURE — ${label}`);
        console.log(`   kind=${e.kind}  marc_required=${marcRequired}  retry_count=${e.retry_count}/${e.max_retries || '?'}`);
        console.log(`   message: ${String(e.message || '').slice(0, 120)}`);
        console.log(`   safe_resume_point=${e.safe_resume_point || 'none'}`);
        const detail = e.detail || {};
        if (detail.learningIncidentId) console.log(`   learning_incident_id=${detail.learningIncidentId}`);
        if (marcRequired === true) {
          console.log(`\n⚠️  MARC REQUIRED — ${label}`);
          console.log(`   M-1 IMPACT: This story CANNOT qualify. marc_required=true violates zero-intervention rule.`);
        }
      }

      if (j.current_step === 'ready_for_review' && stepChanged) {
        console.log(`\n🎯 REACHED READY_FOR_REVIEW — ${label}`);
        // Check story visibility
        const { data: story } = await sb.from('stories')
          .select('workflow_state,is_hidden,audio_url')
          .eq('id', storyId).single();
        console.log(`   workflow_state=${story?.workflow_state}  is_hidden=${story?.is_hidden}`);
        console.log(`   audio_url=${story?.audio_url ? '✅ present' : '❌ missing'}`);
        if (story?.is_hidden) console.log(`   ⚠️  is_hidden=true — NOT visible in RFR tab`);
        else console.log(`   ✅ is_hidden=false — visible in RFR tab`);
      }

      if (j.status === 'complete' && statusChanged) {
        console.log(`\n✅ PIPELINE COMPLETE — ${label}`);
        const { data: story } = await sb.from('stories')
          .select('workflow_state,is_hidden,audio_url')
          .eq('id', storyId).single();
        console.log(`   workflow_state=${story?.workflow_state}  is_hidden=${story?.is_hidden}`);
        console.log(`   audio_url=${story?.audio_url ? '✅ present' : '❌ missing'}`);
      }

      state[id] = { status: j.status, step: j.current_step, retryVS, retryVP, logCount, errorKind };
    } else {
      // Heartbeat — same state, show locked_by to confirm runner activity
      if (logCount !== prev.logCount) {
        console.log(`${ts()} [${label}] ${stepNum(j.current_step)} ${j.status}@${j.current_step} locked=${j.locked_by ? 'yes' : 'no'} logs=${logCount}`);
        state[id].logCount = logCount;
      }
    }
  }
}

async function run() {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`M-1 PIPELINE MONITOR — started ${ts()}`);
  console.log(`Story #2: f0d999d0 | Story #3: c01b6f25`);
  console.log(`Poll interval: 45s | Zero-intervention mode`);
  console.log(`${'='.repeat(60)}`);

  // Initial snapshot
  for (const { id, label } of JOBS) {
    const { data: j } = await sb.from('production_jobs')
      .select('status,current_step,state_json,error_json,logs,locked_by')
      .eq('id', id).single();
    const retryVS = j?.state_json?.validateScriptRetryCount ?? 0;
    const retryVP = j?.state_json?.voicePreflightScriptRetryCount ?? 0;
    const logCount = Array.isArray(j?.logs) ? j.logs.length : 0;
    const errorKind = j?.error_json?.kind || null;
    state[id] = { status: j?.status, step: j?.current_step, retryVS, retryVP, logCount, errorKind };
    console.log(`BASELINE [${label}] status=${j?.status} step=${j?.current_step} ${stepNum(j?.current_step)} locked=${j?.locked_by ? 'yes' : 'no'}`);
  }

  let iteration = 0;
  const MAX_ITER = 120; // 120 × 45s = 90 min max
  while (iteration < MAX_ITER) {
    await new Promise(r => setTimeout(r, 45000));
    iteration++;
    try {
      await poll();
    } catch (e) {
      console.log(`${ts()} poll error: ${e.message}`);
    }

    // Check if both jobs are in terminal state
    const allDone = JOBS.every(j => ['failed','complete'].includes(state[j.id]?.status));
    const bothRFR = JOBS.every(j => state[j.id]?.step === 'ready_for_review' && state[j.id]?.status === 'complete');

    if (allDone) {
      console.log(`\n${'='.repeat(60)}`);
      console.log(`MONITOR COMPLETE — ${ts()}`);
      for (const { id, label } of JOBS) {
        const s = state[id];
        console.log(`  ${label}: ${s.status}@${s.step} retryVS=${s.retryVS} retryVP=${s.retryVP}`);
      }
      break;
    }
  }
}

run().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
