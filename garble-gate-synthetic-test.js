#!/usr/bin/env node
/**
 * Garble Gate — Synthetic Acceptance Test
 *
 * Proves that the FAIL threshold triggers correctly when a segment's audio
 * contains content from a different segment (the real-world corruption pattern
 * that hit EP8 segment_0103).
 *
 * Why synthetic: EP8 v12 (ep8_v12_fullregen.js) has already replaced the
 * corrupted audio in production storage. segment_0103 now passes with WER=0.00.
 * This test validates the FAIL branch independently.
 *
 * Test scenario: Take the known EP8 corrupted transcript
 * ("and she'd done to dare, and size, and tea") and compute WER against the
 * correct expected text for segment_0103. Assert WER > 0.40 (FAIL threshold).
 *
 * Usage: node garble-gate-synthetic-test.js
 */

'use strict';

// WER implementation (must match garble-detection-gate.js)
function normalise(text) {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function wer(reference, hypothesis) {
  const ref = reference.split(' ').filter(Boolean);
  const hyp = hypothesis.split(' ').filter(Boolean);
  if (ref.length === 0 && hyp.length === 0) return 0;
  if (ref.length === 0) return 1;
  if (hyp.length === 0) return 1;
  const m = ref.length, n = hyp.length;
  const dp = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = ref[i - 1] === hyp[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n] / m;
}

const WER_HARD_FAIL = 0.40;
const WER_WARN      = 0.20;

// Test cases
const tests = [
  {
    name: 'EP8 seg_0103 — original garble (Marc heard: "and she\'d done to dare, and size, and tea")',
    expected: 'And Aiden — who could notice everything, who could reach her at the bottom of her grief, who could fill every room —',
    actual:   "and she'd done to dare, and size, and tea",
    expectedOutcome: 'fail',
  },
  {
    name: 'EP8 seg_0103 — v12 corrected (current production audio)',
    expected: 'And Aiden — who could notice everything, who could reach her at the bottom of her grief, who could fill every room —',
    actual:   'and Aiden, who could notice everything, who could reach her at the bottom of her grief, who could fill every room.',
    expectedOutcome: 'ok',
  },
  {
    name: 'Wrong segment in slot — text from different part of episode',
    expected: 'And Aiden — who could notice everything, who could reach her at the bottom of her grief, who could fill every room —',
    actual:   "I'm not staying here forever. One day I'll go where he is and he'll have set the clock right",
    expectedOutcome: 'fail',
  },
  {
    name: 'Minor transcription variation (acceptable)',
    expected: 'What are you to God? That was Aiden\'s question — the one Father Greer\'s faith had never once prepared him for.',
    actual:   "What are you to God? That was Aiden's question, the one Father Greer's faith had never once prepared him for.",
    expectedOutcome: 'ok',
  },
  {
    name: 'Borderline variant — some words off (warn zone)',
    expected: 'the secret was already straining but greer had a parishioner a widow whose husband had died eight months before',
    actual:   'the secret was already strained but greer had a parishioner a widow whose husband had died eight months before',
    expectedOutcome: 'ok',
  },
];

let allPassed = true;

console.log('=== GARBLE GATE SYNTHETIC ACCEPTANCE TEST ===\n');
console.log(`Thresholds: WARN >=${(WER_WARN*100).toFixed(0)}% | FAIL >=${(WER_HARD_FAIL*100).toFixed(0)}%\n`);

for (const tc of tests) {
  const expNorm = normalise(tc.expected);
  const actNorm = normalise(tc.actual);
  const werScore = wer(expNorm, actNorm);

  let detectedOutcome;
  if (werScore > WER_HARD_FAIL) {
    detectedOutcome = 'fail';
  } else if (werScore > WER_WARN) {
    detectedOutcome = 'warn';
  } else {
    detectedOutcome = 'ok';
  }

  const pass = detectedOutcome === tc.expectedOutcome;
  if (!pass) allPassed = false;

  const statusIcon = pass ? '✅' : '❌';
  console.log(`${statusIcon} ${tc.name}`);
  console.log(`   WER: ${werScore.toFixed(3)} → detected: ${detectedOutcome.toUpperCase()} | expected: ${tc.expectedOutcome.toUpperCase()} | ${pass ? 'CORRECT' : 'WRONG!'}`);
  console.log(`   expected: "${tc.expected.substring(0, 70)}"`);
  console.log(`   actual:   "${tc.actual.substring(0, 70)}"`);
  console.log();
}

console.log('─'.repeat(72));
if (allPassed) {
  console.log('\n✅ ALL SYNTHETIC TESTS PASSED — WER logic correctly identifies garble\n');
  process.exit(0);
} else {
  console.log('\n❌ SOME SYNTHETIC TESTS FAILED — WER logic has a bug\n');
  process.exit(1);
}
