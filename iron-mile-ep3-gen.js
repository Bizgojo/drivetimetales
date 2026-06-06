// Iron Mile EP3 — "Open Channel" — full generation, seg 1–77
// Operating standard: Fix blockers. Accept blemishes. Keep moving toward beta.
// Approved inline fixes: mechanical splits, ASR normalization (times/callsigns/roads/miles), Voss pronoun in narrator bridges.

const STORY_ID = 'bdf3c804-8a2b-4657-87cb-591576c57bf9';
const START_SEG = 14;
let END_SEG     = 77; // updated dynamically if splits add segments
const BASE_URL  = 'http://localhost:3000/api/admin/generate-voices';

const { createClient } = require('@supabase/supabase-js');
const sb = createClient(
  'https://vmyhlfeouzslixtkmddy.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZteWhsZmVvdXpzbGl4dGttZGR5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjA4OTYxMiwiZXhwIjoyMDgxNjY1NjEyfQ.xa0VB5h-KgLMxmM_ZWwIDuSRPUOxOmxow-c-Ua_pdQ0'
);

function classify(errMsg) {
  const e = errMsg || '';
  if (/fetch failed|econnrefused|network|timeout/i.test(e))   return 'NETWORK';
  if (/quota|rate.limit|429|credits/i.test(e))                return 'EL_QUOTA';
  if (/upload|storage|supabase/i.test(e))                     return 'STORAGE';
  if (/repeated_identical_truncation/i.test(e))               return 'QC_TRUNCATION';
  if (/transcript qc/i.test(e))                               return 'QC_MISMATCH';
  if (/loudness|lufs|true.peak/i.test(e))                     return 'QC_LOUDNESS';
  return 'UNKNOWN';
}

function tryInlineAsrPatch(expected) {
  if (!expected) return null;
  const candidate = expected
    // Military/dispatch times
    .replace(/\boh-six-hundred\b/gi, '0600')
    .replace(/\bzero-six-hundred\b/gi, '0600')
    .replace(/\boh-four-thirty\b/gi, '0430')
    .replace(/\bfour fifty-one\b/gi, '4:51')
    .replace(/\bfour fifty\b/gi, '4:50')
    .replace(/\bfive (oh|zero) (one|two|three|four|five|six|seven|eight|nine)\b/gi, (m, _, d) => '5:0' + d.replace(/one/i,'1').replace(/two/i,'2').replace(/three/i,'3').replace(/four/i,'4').replace(/five/i,'5').replace(/six/i,'6').replace(/seven/i,'7').replace(/eight/i,'8').replace(/nine/i,'9'))
    .replace(/\bsix thirty\b/gi, '0630')
    .replace(/\bthirteen-hundred\b/gi, '1300')
    .replace(/\btwenty-three-hundred\b/gi, '2300')
    // Callsigns
    .replace(/\btwo-seven\b/gi, '2-7')
    .replace(/\btwo-nineteen\b/gi, '2-19')
    // Road numbers
    .replace(/\bon forty\b/gi, 'on 40')
    .replace(/\bwestbound forty\b/gi, 'westbound 40')
    .replace(/\bRoute forty\b/gi, 'Route 40')
    // Mile markers
    .replace(/\bmile marker (\w+-?\w*)\b/gi, (m, n) => {
      const map = {'seventy-nine':'79','seventy-two':'72','eighty-eight':'88','eighty-five':'85','eighty-four':'84','eighty-nine':'89','eighty-seven':'87','ninety':'90','ninety-one':'91','ninety-two':'92','sixty':'60','sixty-five':'65'};
      return map[n.toLowerCase()] ? 'mile marker ' + map[n.toLowerCase()] : m;
    })
    .replace(/\bmile (seventy-nine|eighty-eight|eighty-five|seventy-two|ninety)\b/gi, (m, n) => {
      const map = {'seventy-nine':'79','eighty-eight':'88','eighty-five':'85','seventy-two':'72','ninety':'90'};
      return 'mile ' + (map[n.toLowerCase()] || n);
    })
    .replace(/\bjust passed mile\b/gi, 'just past mile')
    // Decades
    .replace(/\bnineteen-eighties\b/gi, '1980s')
    .replace(/\bnineteen-nineties\b/gi, '1990s')
    .replace(/\btwenty-nineteen\b/gi, '2019')
    // Percentages
    .replace(/\bsixty percent\b/gi, '60%')
    .replace(/\beighty-five percent\b/gi, '85%')
    .replace(/\bNinety\b/g, '90')
    .replace(/\bSeventy\b/g, '70')
    // Compound adjective hyphens Whisper drops
    .replace(/\bsingle-wide\b/gi, 'single wide');
  return candidate !== expected ? { oldText: expected, newText: candidate } : null;
}

async function applyScriptPatch(oldText, newText) {
  const { data: story } = await sb.from('stories').select('script').eq('id', STORY_ID).single();
  const count = story.script.split(oldText).length - 1;
  if (count !== 1) throw new Error(`Patch ABORT: expected 1, found ${count}`);
  const { error } = await sb.from('stories').update({ script: story.script.replace(oldText, newText) }).eq('id', STORY_ID);
  if (error) throw new Error(`DB update: ${error.message}`);
}

async function retrySeg(segNum) {
  const res = await fetch(BASE_URL, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ storyId: STORY_ID, retryMissingOnly: true, segmentNumber: segNum }),
    signal: AbortSignal.timeout(180_000),
  });
  return { status: res.status, body: await res.json() };
}

async function getStoryLine(segNum) {
  // Returns the Nth story line text from current DB script (for split decisions)
  const { data: story } = await sb.from('stories').select('script').eq('id', STORY_ID).single();
  const lines = story.script.split('\n');
  const announcerIndices = [];
  lines.forEach((l,i) => { const t=l.trim(); if(/^ANNOUNCER:\s*Belle B\s*$/i.test(t))return; if(t.match(/^(ANNOUNCER|BELLE B|SANDY):/i))announcerIndices.push(i); });
  const firstAnn=announcerIndices[0]??-1, lastAnn=announcerIndices[announcerIndices.length-1]??-1;
  const startIdx=lines.findIndex(l=>l.includes('[START AUDIO DRAMA SCRIPT]'));
  const HK=['SERIES:','EPISODE:','AUTHOR:','GENRE:','DESCRIPTION:','SUNO PROMPT:','NARRATIVE_VOICE:','NARRATOR_IS_CHARACTER:','NARRATOR_IS_','EPISODE_TITLE:','SERIES_TOTAL','SERIES_IS_FINALE:','[START AUDIO DRAMA SCRIPT]','CHARACTER GUIDE','---'];
  let idx=0; const parsed=[];
  lines.forEach((line,rawIdx) => {
    const t=line.trim(); if(!t)return;
    if(startIdx>-1&&rawIdx<startIdx&&rawIdx!==firstAnn&&rawIdx!==lastAnn)return;
    if(HK.some(k=>t.startsWith(k)))return;
    if(t==='[BEAT]'){idx++;return;}
    if(t.startsWith('['))return;
    const dm=t.match(/^([A-Z][A-ZÀ-Ú\s'.()]+?):\s*(.+)$/);
    if(dm){const sp=dm[1].trim(),tx=dm[2].trim();const isAnn=sp==='ANNOUNCER'||sp==='BELLE B'||sp==='SANDY';const isIntro=isAnn&&rawIdx===firstAnn,isOutro=isAnn&&rawIdx===lastAnn;if(!isIntro&&!isOutro){if(idx+1===segNum)return parsed.push({speaker:sp,text:tx,raw:`${sp}: ${tx}`});idx++;}}
  });
  return parsed[0] || null;
}

async function trySplitAndRetry(seg, failClass, expected) {
  // Only attempt mechanical split for NARRATOR lines on truncation
  const lineInfo = await getStoryLine(seg);
  if (!lineInfo) return false;
  if (lineInfo.speaker !== 'NARRATOR' && !lineInfo.speaker.match(/^(NARRATOR|KATE REEVES|NATHAN WEST|GLASS|CHARLES VOSS|TROOPER FINCH)$/)) return false;

  const sentences = lineInfo.text.match(/[^.!?]+[.!?]+\s*/g) || [];
  if (sentences.length < 2) return false; // Can't split a single sentence

  const mid = Math.ceil(sentences.length / 2);
  const partA = sentences.slice(0, mid).join('').trim();
  const partB = sentences.slice(mid).join('').trim();
  if (!partA || !partB) return false;

  const oldRaw = `${lineInfo.speaker}: ${lineInfo.text}`;
  const newRaw = `${lineInfo.speaker}: ${partA}\n${lineInfo.speaker}: ${partB}`;
  try {
    await applyScriptPatch(oldRaw, newRaw);
    console.log(`  → SPLIT [${failClass}]: "${partA.substring(0,40)}..." | "${partB.substring(0,40)}..."`);
    END_SEG++; // one extra segment added
    console.log(`  → END_SEG now ${END_SEG}`);
    return true;
  } catch(e) {
    console.error(`  → SPLIT FAILED: ${e.message}`);
    return false;
  }
}

async function main() {
  console.log(`[${new Date().toISOString()}] Iron Mile EP3 — seg ${START_SEG}–${END_SEG} (77 expected, missing-only)`);
  let done = 0;
  let seg = START_SEG;

  while (seg <= END_SEG) {
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

      // 1. Try ASR normalization patch (QC_MISMATCH or QC_TRUNCATION)
      if ((cls === 'QC_MISMATCH' || cls === 'QC_TRUNCATION') && expected) {
        const patch = tryInlineAsrPatch(expected);
        if (patch) {
          console.log(`  → AUTO-PATCH [ASR]: "${patch.oldText.substring(0,50)}" → "${patch.newText.substring(0,50)}"`);
          try {
            await applyScriptPatch(patch.oldText, patch.newText);
            const retry = await retrySeg(seg);
            const rf = retry.body.failures || [];
            if (rf.length === 0 && (retry.body.generatedSegments || []).length > 0) {
              console.log(`  → RETRY ✅ seg ${seg} passed after ASR patch (present: ${retry.body.presentCount})`);
              done++;
              seg++;
              await new Promise(r => setTimeout(r, 400));
              continue;
            }
            console.error(`  → ASR RETRY FAILED: ${rf[0]?.error?.substring(0,80) || 'unknown'}`);
          } catch(patchErr) { console.error(`  → PATCH ERR: ${patchErr.message}`); }
        }
      }

      // 2. Try mechanical split for truncation
      if (cls === 'QC_TRUNCATION') {
        const split = await trySplitAndRetry(seg, cls, expected);
        if (split) {
          const retry = await retrySeg(seg);
          const rf = retry.body.failures || [];
          if (rf.length === 0 && (retry.body.generatedSegments || []).length > 0) {
            console.log(`  → SPLIT RETRY ✅ seg ${seg} passed (present: ${retry.body.presentCount})`);
            done++;
            seg++;
            await new Promise(r => setTimeout(r, 400));
            continue;
          }
          console.error(`  → SPLIT RETRY FAILED: ${rf[0]?.error?.substring(0,80) || 'unknown'}`);
        }
      }

      // 3. Hard stop — new/unhandled class
      console.error(`STOP at seg ${seg}. Class=${cls}. Done: ${done}. Manual review required.`);
      process.exit(2);
    }

    if (generatedSegments.length > 0) {
      console.log(`[${ts}] seg ${seg} ✅  ${generatedSegments[0].speaker}  (present: ${presentCount}/${END_SEG})`);
      done++;
    } else {
      console.log(`[${ts}] seg ${seg} —  already present`);
    }

    seg++;
    await new Promise(r => setTimeout(r, 400));
  }

  console.log(`[${new Date().toISOString()}] ✅ EP3 COMPLETE. Generated ${done} segments. Total: ${END_SEG}.`);
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(99); });
