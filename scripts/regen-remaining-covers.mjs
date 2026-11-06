/**
 * regen-remaining-covers.mjs
 * Triggers regeneration for all flagged covers starting from index 11
 * (re-includes #12 "What the Radio Knew" which may have been killed mid-call)
 */
import { readFileSync, writeFileSync } from 'fs';

const CRON_SECRET = process.env.CRON_SECRET;
const REGEN_ENDPOINT = 'https://app.endless-tales.com/api/asc3/regenerate-cover';
const FLAGGED_PATH = '/Users/williampostlewaite/.openclaw/workspace-orion/series-fix/flagged-covers-20261105.json';
const RESULTS_PATH = '/Users/williampostlewaite/.openclaw/workspace-orion/series-fix/regen-results-20261105.json';

const flagged = JSON.parse(readFileSync(FLAGGED_PATH, 'utf8'));

// First 11 were confirmed OK; index 11 (Saturday Repair Shop Ep4) was uncertain — re-fire from idx 11
const alreadyDone = flagged.slice(0, 11).map(s => ({ ...s, regen: { ok: true, status: 200, note: 'triggered in prior run' } }));
const toProcess = flagged.slice(11); // 45 stories

console.log(`=== Cover Regen — Remaining Batch ===`);
console.log(`Already done: ${alreadyDone.length}`);
console.log(`To process: ${toProcess.length}\n`);

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

const newResults = [];

for (let i = 0; i < toProcess.length; i++) {
  const story = toProcess[i];
  const label = `${story.series_name || '(standalone)'} Ep${story.episode_number ?? '—'} "${story.title}"`;
  process.stdout.write(`  [${i + 1}/${toProcess.length}] ${label}... `);

  try {
    const resp = await fetch(REGEN_ENDPOINT, {
      method: 'POST',
      headers: {
        'x-cron-secret': CRON_SECRET,
        'Content-Type': 'application/json',
        'x-et-internal-key': process.env.ADMIN_INTERNAL_TOKEN || ''
      },
      body: JSON.stringify({
        storyId: story.storyId,
        coverFeedback: 'no maps, charts, diagrams, or geographic elements'
      })
    });

    const ok = resp.ok;
    const status = resp.status;
    let data = {};
    try { data = await resp.json(); } catch {}
    const result = { ok, status, data };
    console.log(ok ? `✓ OK (${status})` : `✗ FAIL (${status}): ${JSON.stringify(data).slice(0, 100)}`);
    newResults.push({ story, regen: result });
  } catch (err) {
    console.log(`✗ ERROR: ${err.message}`);
    newResults.push({ story, regen: { ok: false, error: err.message } });
  }

  if (i < toProcess.length - 1) await sleep(2000);
}

const allResults = [...alreadyDone.map((s, i) => ({ story: flagged[i], regen: s.regen })), ...newResults];
const okCount = allResults.filter(r => r.regen.ok).length;
const failCount = allResults.filter(r => !r.regen.ok).length;

writeFileSync(RESULTS_PATH, JSON.stringify(allResults, null, 2));

console.log(`\n=== REGEN COMPLETE ===`);
console.log(`Total flagged: ${flagged.length}`);
console.log(`Regen OK: ${okCount}`);
console.log(`Regen FAIL: ${failCount}`);
console.log(`Results saved to: ${RESULTS_PATH}`);

// Print failures if any
const failures = allResults.filter(r => !r.regen.ok);
if (failures.length > 0) {
  console.log('\nFailed stories:');
  failures.forEach(r => console.log(`  - ${r.story.series_name} Ep${r.story.episode_number} "${r.story.title}": ${r.regen.error || r.regen.status}`));
}
