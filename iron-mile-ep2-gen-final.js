// Iron Mile EP2 — final segments 95–99 (after time patch on seg 95)

const STORY_ID = '032af7d4-ce51-4f6b-898d-69d0505a3000';
const START_SEG = 95;
const END_SEG   = 100;
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

async function retrySeg(segNum) {
  const res = await fetch(BASE_URL, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ storyId: STORY_ID, retryMissingOnly: true, segmentNumber: segNum }),
    signal: AbortSignal.timeout(180_000),
  });
  return { status: res.status, body: await res.json() };
}

async function main() {
  console.log(`[${new Date().toISOString()}] EP2 final seg ${START_SEG}–${END_SEG}`);
  let done = 0;

  for (let seg = START_SEG; seg <= END_SEG; seg++) {
    const ts = new Date().toISOString();
    let result;
    try { result = await retrySeg(seg); }
    catch (e) {
      console.error(`[${ts}] seg ${seg} FETCH_EXCEPTION: ${e.message}`);
      process.exit(1);
    }

    const { status, body } = result;
    const { generatedSegments = [], failures = [], presentCount } = body;

    if (failures.length > 0) {
      const f = failures[0];
      const cls = classify(f.error);
      const expected = (f.error.match(/expected "([^"]+)"/) || [])[1] || '';
      const detected = (f.error.match(/detected "([^"]+)"/) || [])[1] || '';

      console.error(`[${ts}] seg ${seg} HTTP ${status} FAILED [${cls}]  ${f.speaker}`);
      console.error(`  expected: ${expected.substring(0,90)}`);
      console.error(`  detected: ${(detected || '(empty)').substring(0,90)}`);
      console.error(`STOP at seg ${seg}. Class=${cls}. Done: ${done}.`);
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

  console.log(`[${new Date().toISOString()}] ✅ EP2 COMPLETE. Generated ${done} final segments.`);
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(99); });
