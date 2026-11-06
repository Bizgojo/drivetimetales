/**
 * screen-covers-gemini.mjs
 * Atlas / Endless Tales CTO utility
 * Screens all published story covers for maps/charts/diagrams using Gemini,
 * then triggers regeneration for flagged ones.
 */

import { createClient } from '@supabase/supabase-js';
import { writeFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GOOGLE_API_KEY;
const CRON_SECRET = process.env.CRON_SECRET;

const FLAGGED_PATH = '/Users/williampostlewaite/.openclaw/workspace-orion/series-fix/flagged-covers-20261105.json';
const REPORT_PATH = '/Users/williampostlewaite/.openclaw/workspace-orion/series-fix/cover-screen-report-20261105.md';

const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=${GEMINI_API_KEY}`;
const REGEN_ENDPOINT = 'https://app.endless-tales.com/api/asc3/regenerate-cover';

function ensureDir(filePath) {
  mkdirSync(dirname(filePath), { recursive: true });
}

async function fetchImageAsBase64(url) {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`HTTP ${resp.status} fetching ${url}`);
  const buffer = await resp.arrayBuffer();
  return Buffer.from(buffer).toString('base64');
}

async function screenWithGemini(cover_url) {
  let base64;
  let mimeType = 'image/jpeg';
  
  // Determine mime type from URL
  if (cover_url.endsWith('.png')) mimeType = 'image/png';
  else if (cover_url.endsWith('.webp')) mimeType = 'image/webp';

  try {
    base64 = await fetchImageAsBase64(cover_url);
  } catch (err) {
    return { result: 'ERROR', error: `fetch failed: ${err.message}` };
  }

  const body = {
    contents: [{
      parts: [
        {
          inlineData: {
            mimeType,
            data: base64
          }
        },
        {
          text: "Does this image show any map, chart, graph, diagram, or geographic/cartographic element? Answer only YES or NO."
        }
      ]
    }]
  };

  try {
    const resp = await fetch(GEMINI_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    if (!resp.ok) {
      const errText = await resp.text();
      return { result: 'ERROR', error: `Gemini HTTP ${resp.status}: ${errText.slice(0,200)}` };
    }

    const data = await resp.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim().toUpperCase() ?? 'ERROR';
    // Normalize — Gemini sometimes says "YES." or "NO."
    if (text.startsWith('YES')) return { result: 'YES' };
    if (text.startsWith('NO')) return { result: 'NO' };
    return { result: 'UNCLEAR', raw: text };
  } catch (err) {
    return { result: 'ERROR', error: `Gemini call failed: ${err.message}` };
  }
}

async function triggerRegen(storyId) {
  try {
    const resp = await fetch(REGEN_ENDPOINT, {
      method: 'POST',
      headers: {
        'x-cron-secret': CRON_SECRET,
        'Content-Type': 'application/json',
        'x-et-internal-key': process.env.ADMIN_INTERNAL_TOKEN || ''
      },
      body: JSON.stringify({
        storyId,
        coverFeedback: 'no maps, charts, diagrams, or geographic elements'
      })
    });
    if (!resp.ok) {
      const errText = await resp.text();
      return { ok: false, status: resp.status, error: errText.slice(0,200) };
    }
    const data = await resp.json().catch(() => ({}));
    return { ok: true, status: resp.status, data };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function main() {
  console.log('=== Cover Screening Script — Atlas / Endless Tales ===\n');

  // Step 1: Fetch published stories
  console.log('Step 1: Fetching published stories from Supabase...');
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
  const { data: stories, error } = await supabase
    .from('stories')
    .select('id,title,series_name,episode_number,cover_url')
    .eq('workflow_state', 'published')
    .not('cover_url', 'is', null);

  if (error) {
    console.error('Supabase error:', error.message);
    process.exit(1);
  }
  console.log(`  → ${stories.length} published stories with cover_url\n`);

  // Step 2: Screen covers in batches of 10
  console.log('Step 2: Screening covers with Gemini 2.0 Flash...');
  const BATCH_SIZE = 10;
  const results = []; // { story, geminiResult, error? }

  for (let i = 0; i < stories.length; i += BATCH_SIZE) {
    const batch = stories.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(stories.length / BATCH_SIZE);
    process.stdout.write(`  Batch ${batchNum}/${totalBatches} (stories ${i+1}–${Math.min(i+BATCH_SIZE, stories.length)})... `);

    const batchResults = await Promise.all(
      batch.map(async (story) => {
        const gemini = await screenWithGemini(story.cover_url);
        return { story, gemini };
      })
    );

    batchResults.forEach(r => results.push(r));

    const flags = batchResults.filter(r => r.gemini.result === 'YES').length;
    const errors = batchResults.filter(r => r.gemini.result === 'ERROR').length;
    console.log(`done. Flagged: ${flags}, Errors: ${errors}`);

    if (i + BATCH_SIZE < stories.length) {
      await sleep(100);
    }
  }

  const flagged = results.filter(r => r.gemini.result === 'YES');
  const errors = results.filter(r => r.gemini.result === 'ERROR');
  const unclear = results.filter(r => r.gemini.result === 'UNCLEAR');

  console.log(`\n  → Total screened: ${results.length}`);
  console.log(`  → Flagged (YES): ${flagged.length}`);
  console.log(`  → Errors: ${errors.length}`);
  console.log(`  → Unclear: ${unclear.length}\n`);

  // Step 3: Save flagged list
  console.log('Step 3: Saving flagged list...');
  ensureDir(FLAGGED_PATH);
  const flaggedJson = flagged.map(r => ({
    storyId: r.story.id,
    title: r.story.title,
    series_name: r.story.series_name,
    episode_number: r.story.episode_number,
    cover_url: r.story.cover_url
  }));
  writeFileSync(FLAGGED_PATH, JSON.stringify(flaggedJson, null, 2));
  console.log(`  → Saved to ${FLAGGED_PATH}\n`);

  // Step 4: Trigger regeneration for flagged covers
  console.log('Step 4: Triggering cover regeneration for flagged stories...');
  const regenResults = [];

  for (const r of flagged) {
    process.stdout.write(`  Regen: ${r.story.series_name} Ep${r.story.episode_number} "${r.story.title}"... `);
    const regen = await triggerRegen(r.story.id);
    regenResults.push({ story: r.story, regen });
    console.log(regen.ok ? `✓ OK (${regen.status})` : `✗ FAILED: ${regen.error || regen.status}`);
    await sleep(2000);
  }

  const regenOk = regenResults.filter(r => r.regen.ok).length;
  const regenFail = regenResults.filter(r => !r.regen.ok).length;
  console.log(`\n  → Regen triggered: ${regenOk} success, ${regenFail} failed\n`);

  // Step 5: Write report
  console.log('Step 5: Writing report...');

  const now = new Date().toISOString();
  const estimatedCost = (flagged.length * 0.151).toFixed(2);

  let report = `# Cover Screening Report — Endless Tales
**Date:** ${now}  
**Run by:** Atlas (CTO subagent)  
**Model:** Gemini 2.0 Flash (screening) + GPT-Image-1.5 (regeneration)

---

## Summary

| Metric | Value |
|--------|-------|
| Published covers screened | ${stories.length} |
| Flagged (maps/charts/diagrams) | ${flagged.length} |
| Screening errors | ${errors.length} |
| Unclear responses | ${unclear.length} |
| Regen triggered (success) | ${regenOk} |
| Regen failed | ${regenFail} |
| Estimated regen cost | $${estimatedCost} |

---

## Flagged Stories

${flagged.length === 0 ? '_No covers flagged._' : flagged.map((r, idx) => {
  const regenR = regenResults.find(rr => rr.story.id === r.story.id);
  const regenStatus = regenR ? (regenR.regen.ok ? '✅ Regen triggered' : `❌ Regen failed: ${regenR.regen.error || regenR.regen.status}`) : '—';
  return `### ${idx + 1}. ${r.story.series_name} — Episode ${r.story.episode_number}: "${r.story.title}"
- **Story ID:** \`${r.story.id}\`
- **Cover URL:** ${r.story.cover_url}
- **Gemini verdict:** YES (contains map/chart/diagram)
- **Regeneration:** ${regenStatus}`;
}).join('\n\n')}

---

## Screening Errors

${errors.length === 0 ? '_No errors._' : errors.map(r => `- **${r.story.series_name} Ep${r.story.episode_number}** \`${r.story.id}\`: ${r.gemini.error}`).join('\n')}

---

## Unclear Responses

${unclear.length === 0 ? '_No unclear responses._' : unclear.map(r => `- **${r.story.series_name} Ep${r.story.episode_number}** \`${r.story.id}\`: raw="${r.gemini.raw}"`).join('\n')}

---

## Cost Estimate

- Covers flagged: **${flagged.length}**
- Cost per regeneration (gpt-image-1.5): **$0.151**
- **Total estimated regen cost: $${estimatedCost}**

---

_Report generated by Atlas cover-screening subagent_
`;

  ensureDir(REPORT_PATH);
  writeFileSync(REPORT_PATH, report);
  console.log(`  → Report saved to ${REPORT_PATH}\n`);

  // Print summary to stdout for subagent return
  console.log('=== FINAL SUMMARY ===');
  console.log(`Screened: ${stories.length} covers`);
  console.log(`Flagged: ${flagged.length}`);
  console.log(`Regen: ${regenOk} success, ${regenFail} failed`);
  console.log(`Est. cost: $${estimatedCost}`);
  if (flagged.length > 0) {
    console.log('\nFlagged stories:');
    flagged.forEach(r => console.log(`  - ${r.story.series_name} Ep${r.story.episode_number}: "${r.story.title}"`));
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
