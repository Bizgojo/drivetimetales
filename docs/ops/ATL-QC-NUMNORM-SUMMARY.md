# ATL-QC-NUMNORM Summary

## Objective
Fix false segment transcript QC failures where Whisper renders spoken numeric text as digits, causing retry loops and `REPEATED_IDENTICAL_TRUNCATION` classification for otherwise correct audio.

## Files changed
- `lib/transcriptQC.ts`
- `__tests__/atl-followup-002-transcript-qc.test.ts`

## Implementation
- Added deterministic, dependency-free spoken number normalization in `normalizeSpokenNumberPhrases()`.
- Handles spoken decimals:
  - `four-point-seven` -> `4.7`
  - `twelve-point-eight` -> `12.8`
- Handles common composed numbers:
  - `twenty-three` / `twenty three` -> `23`
  - `one hundred and five` -> `105`
  - `nineteen eighty-four` -> `1984`
- Handles ordinal words:
  - `third` -> `3rd`
  - `first` -> `1st`
- Wired the new normalization into the existing shared `normalizeNumberWords()` pipeline, which is already applied to both expected script text and Whisper detected text through `transcriptTokens()` and `normalizeForQC()`.
- Added year splitting to `normalizeForQC()` so character-level fallback agrees with token normalization for `1984` versus `nineteen eighty-four`.
- Added `numericTokenSequenceMismatch()` and applied it in `evaluateTranscriptQC()` so numeric substitutions like `4.7` versus `5.7` still fail even when normalized string similarity is high.

## Coverage added
Focused tests were added for:
- Production case: `Four-point-seven seconds.` == `4.7 seconds.`
- Production case: `The twelve-point-eight hertz stopped.` == `The 12.8 hertz stopped`
- `Twenty-three seconds passed.` == `23 seconds passed.`
- `Nineteen eighty-four...` == `1984...`
- `One hundred and five...` == `105...`
- `Third of June.` == `3rd of June.`
- `First of June.` == `1st of June.`
- Negative control: `Four-point-seven seconds.` != `5.7 seconds.`

## Verification
- `./node_modules/.bin/tsc --noEmit --pretty false --target ES2020 --module commonjs --esModuleInterop --skipLibCheck --types node lib/transcriptQC.ts`
  - Passed.
- Direct runtime execution through the local TypeScript compiler verified all new production and edge cases:
  - All equivalent spoken/digit cases produced identical token streams.
  - `evaluateTranscriptQC()` passed all equivalent cases.
  - `evaluateTranscriptQC('Four-point-seven seconds.', '5.7 seconds.')` failed as intended.
- `npx jest __tests__/atl-followup-002-transcript-qc.test.ts --no-coverage`
  - Blocked before Jest execution by environment error: `ERROR: SecItemCopyMatching failed -50`.
- `./node_modules/.bin/jest __tests__/atl-followup-002-transcript-qc.test.ts --no-coverage`
  - Blocked by the same environment error before test execution.
- Full-project `tsc --noEmit` was attempted and failed on pre-existing unrelated project errors outside this change set.
