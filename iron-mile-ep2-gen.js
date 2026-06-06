// Iron Mile EP2 — missing-only voice generation, seg 1–96
// ASR + Voss narrator sweeps already applied in DB.
// Inline classification: stops hard on unhandled failures.

const STORY_ID = '032af7d4-ce51-4f6b-898d-69d0505a3000';
const START_SEG = 1;
const END_SEG   = 96;
const BASE_URL  = 'http://localhost:3000/api/admin/generate-voices';

const { createClient } = require('@supabase/supabase-js');
const sb = createClient(
  'https://vmyhlfeouzslixtkmddy.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZteWhsZmVvdXpzbGl4dGttZGR5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjA4OTYxMiwiZXhwIjoyMDgxNjY1NjEyfQ.xa0VB5h-KgLMxmM_ZWwIDuSRPUOxOmxow-c-Ua_pdQ0'
);

function classify(errMsg) {
  const e = errMsg.toLowerCase();
  if (/fetch failed|econnrefused|network|timeout/i.test(e))    return 'NETWORK';
  if (/quota|rate.limit|429|credits/i.test(e))                  return 'EL_QUOTA';
  if (/upload|storage|supabase/i.test(e))                       return 'STORAGE';
  if (/repeated_identical_truncation/i.test(e))                 return 'QC_TRUNCATION';
  if (/transcript qc/i.test(e))                                 return 'QC_MISMATCH';
  if (/loudness|lufs|true.peak/i.test(e))                       return 'QC_LOUDNESS';
  return 'UNKNOWN';
}

// ── Approved inline ASR patches ────────────────────────────────────────────
// Applied automatically when failure matches an approved normalization class.

// Known number-word → digit patterns Whisper normalizes (approved classes):
//   callsigns, road numbers, mile markers, military time, percentages
// Returns { patched: bool, oldText, newText } or null if no patch found.
function tryInlineAsrPatch(expected, detected) {
  if (!expected || !detected) return null;

  // Build candidate by applying approved substitutions to expected
  let candidate = expected
    // Military/dispatch time
    .replace(/\boh-six-hundred\b/gi, '0600')
    .replace(/\bzero-six-hundred\b/gi, '0600')
    .replace(/\boh-four-thirty\b/gi, '0430')
    .replace(/\bthirteen-hundred\b/gi, '1300')
    .replace(/\btwenty-three-hundred\b/gi, '2300')
    // Callsigns
    .replace(/\btwo-seven\b/gi, '2-7')
    .replace(/\btwo-nineteen\b/gi, '2-19')
    // Road/highway number
    .replace(/\bon forty\b/gi, 'on 40')
    .replace(/\bwestbound forty\b/gi, 'westbound 40')
    .replace(/\bRoute forty\b/gi, 'Route 40')
    // Mile markers
    .replace(/\bmile marker eighty-eight\b/gi, 'mile marker 88')
    .replace(/\bmile marker eighty-five\b/gi, 'mile marker 85')
    .replace(/\bmile marker eighty-four\b/gi, 'mile marker 84')
    .replace(/\bmile marker eighty-nine\b/gi, 'mile marker 89')
    .replace(/\bmile marker seventy-two\b/gi, 'mile marker 72')
    .replace(/\bmile marker seventy-nine\b/gi, 'mile marker 79')
    .replace(/\bmile marker eighty-seven\b/gi, 'mile marker 87')
    .replace(/\bnear marker eighty-eight\b/gi, 'near marker 88')
    .replace(/\bnear eighty-eight\b/gi, 'near 88')
    .replace(/\bmile eighty-eight\b/gi, 'mile 88')
    .replace(/\bmile eighty-five\b/gi, 'mile 85')
    .replace(/\bmile seventy-nine\b/gi, 'mile 79')
    .replace(/\bjust passed mile\b/gi, 'just past mile')
    // Percentages
    .replace(/\bsixty percent\b/gi, '60%')
    .replace(/\beighty-five percent\b/gi, '85%')
    .replace(/\bNinety\b/g, '90')
    .replace(/\bSeventy\b/g, '70');

  if (candidate !== expected) {
    return { patched: true, oldText: expected, newText: candidate };
  }
  return null;
}

async function applyScriptPatch(oldText, newText) {
  const { data: story } = await sb.from('stories').select('script').eq('id', STORY_ID).single();
  const count = story.script.split(oldText).length - 1;
  if (count !== 1) throw new Error(`Patch ABORT: expected 1 occurrence of old text, found ${count}`);
  const newScript = story.script.replace(oldText, newText);
  const { error } = await sb.from('stories').update({ script: newScript }).eq('id', STORY_ID);
  if (error) throw new Error(`DB update failed: ${error.message}`);
}

async function retrySeg(segNum) {
  const res = await fetch(BASE_URL, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ storyId: STORY_ID, retryMissingOnly: true, segmentNumber: segNum }),
    signal: AbortSignal.timeout(120_000),
  });
  return { status: res.status, body: await res.json() };
}

async function main() {
  console.log(`[${new Date().toISOString()}] Iron Mile EP2 — seg ${START_SEG}–${END_SEG}`);
  let done = 0;

  for (let seg = START_SEG; seg <= END_SEG; seg++) {
    const ts = new Date().toISOString();
    let result;
    try { result = await retrySeg(seg); }
    catch (e) {
      console.error(`[${ts}] seg ${seg} FETCH_EXCEPTION: ${e.message}`);
      console.error(`STOP: NETWORK`);
      process.exit(1);
    }

    const { status, body } = result;
    const { generatedSegments = [], failures = [], presentCount } = body;

    if (failures.length > 0) {
      const f = failures[0];
      const cls = classify(f.error);
      const expected = (f.error.match(/expected "([^"]+)"/) || [])[1] || '';
      const detected = (f.error.match(/detected "([^"]+)"/) || [])[1] || '';

      console.error(`[${ts}] seg ${seg} HTTP ${status} FAILED [${cls}]  speaker=${f.speaker}`);
      console.error(`  expected: ${expected}`);
      console.error(`  detected: ${detected}`);

      // ── Rule 1: approved ASR normalization → auto-patch and retry once ──
      if (cls === 'QC_MISMATCH' || cls === 'QC_TRUNCATION') {
        const patch = tryInlineAsrPatch(expected, detected);
        if (patch) {
          console.log(`  → AUTO-PATCH [ASR_NORM]: "${patch.oldText}" → "${patch.newText}"`);
          try {
            await applyScriptPatch(patch.oldText, patch.newText);
            const retry = await retrySeg(seg);
            const rf = retry.body.failures || [];
            if (rf.length === 0 && (retry.body.generatedSegments || []).length > 0) {
              console.log(`  → RETRY ✅ seg ${seg} passed after patch (present: ${retry.body.presentCount})`);
              done++;
              await new Promise(r => setTimeout(r, 400));
              continue;
            } else {
              console.error(`  → RETRY FAILED after patch: ${rf[0]?.error || 'unknown'}`);
              console.error(`STOP at seg ${seg}. Class=${cls}. Done: ${done}.`);
              process.exit(2);
            }
          } catch (patchErr) {
            console.error(`  → PATCH ERROR: ${patchErr.message}`);
            console.error(`STOP at seg ${seg}. Patch failed.`);
            process.exit(2);
          }
        }
      }

      // ── Rule 2: loudness/mechanical → just stop and report ──
      // ── Rule 3/default: unrecognised → stop and report ──
      console.error(`STOP at seg ${seg}. Class=${cls}. No auto-fix. Done: ${done}.`);
      process.exit(2);
    }

    if (generatedSegments.length > 0) {
      console.log(`[${ts}] seg ${seg} ✅  ${generatedSegments[0].speaker}  (present: ${presentCount})`);
      done++;
    } else {
      console.log(`[${ts}] seg ${seg} —  already present (present: ${presentCount})`);
    }

    await new Promise(r => setTimeout(r, 400));
  }

  console.log(`[${new Date().toISOString()}] ✅ EP2 COMPLETE. Generated ${done} new segments.`);
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(99); });
