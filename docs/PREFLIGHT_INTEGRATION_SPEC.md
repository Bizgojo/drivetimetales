# Series Production Preflight — Integration Specification

**Status:** Ready for deployment  
**Requires:** Code change approval by Marc  
**Impact:** Blocks voice generation until preflight passes  
**Goal:** Reduce manual rescue; catch known failures early

---

## Overview

The Preflight system is a comprehensive validation gate that runs BEFORE any ElevenLabs voice generation begins. It checks for 7 known failure classes and returns a detailed report.

**Key property:** Do not call `generate-voices` if preflight returns `success: false`.

---

## Integration Points

### 1. **Admin UI — Call Preflight Before Triggering Voice Generation**

**Current flow:**
```
Admin clicks "Generate Voices" 
  → POST /api/admin/generate-voices
  → Voice generation starts (may fail mid-way)
```

**Proposed flow:**
```
Admin clicks "Generate Voices"
  → POST /api/admin/preflight
  → If preflight.success == false:
     - Show report to admin
     - Block voice generation
     - Suggest fixes
  → If preflight.success == true:
     - Auto-proceed to POST /api/admin/generate-voices
     - Voice generation starts
```

### 2. **generate-voices Endpoint — Add Preflight Gate**

**Location:** `/app/api/admin/generate-voices/route.ts`

**Change required:**
```typescript
export async function POST(req: NextRequest) {
  const { storyId, script: scriptParam, ... } = await req.json()
  
  // NEW: Mandatory preflight before voice generation
  if (generateVoices === true || retryMissingOnly === true) {  // not preflightOnly
    const preflightResult = await runPreflightChecks({...})
    if (!preflightResult.safeToGenerateVoices) {
      return NextResponse.json({
        success: false,
        error: 'Preflight validation failed',
        preflight: preflightResult,
        instruction: 'Fix blockers and resubmit.',
      }, { status: 422 })
    }
  }
  
  // Continue with voice generation...
}
```

### 3. **Preflight Endpoint — Already Built**

**Path:** `POST /api/admin/preflight`  
**Status:** Ready to call immediately

**Request:**
```json
{ "storyId": "38bf113b-..." }
```

**Response:**
```json
{
  "success": true,
  "report": {
    "passed": true,
    "safeToGenerateVoices": true,
    "checks": { ... },
    "blockers": [],
    "warnings": [],
    "recommendations": [...]
  },
  "formattedReport": "...(human-readable)"
}
```

---

## Known Failure Checks

### 1. Name Pronunciation Risk
- Flags: Elena, Laurens, Connelly, etc.
- Action: Suggest phonetically clear alternative or apply QC normalization

### 2. Dialogue Clarity
- Flags: Awkward fragments, VAD truncation patterns
- Examples: "Are my business", "In this weather?", "She waited. Five seconds."
- Action: Suggest script rewrite

### 3. QC Normalization Readiness
- Current rules: 6+ active (Miss/Ms, Connelly/Connolly, brake/break, gray/grey, etc.)
- Action: Inform admin that rules are in place

### 4. Intro/Outro Compliance
- Flags: Missing intro/outro, generic placeholders, missing credits
- Action: Require Belle B intro with story title and outro with "Endless Tales original" credit

### 5. Series Metadata Check
- Flags: Missing title, "Untitled Series Package", missing author/narrator/genre
- Action: Block until all required fields present

### 6. Repetition Detection
- Flags: Duplicate paragraphs, repeated scenes
- Action: Alert admin; may be acceptable if intentional

### 7. Production Assets
- Flags: Missing music, wrong sting, broken narrator assignment
- Action: Alert admin; may need asset upload

---

## Extending the System

### Adding a New Known Failure

1. **Identify** the failure pattern from production
2. **Add to `knownFailures.ts`:**
   - Add to `KNOWN_NAME_RISKS`, `KNOWN_DIALOGUE_FRAGMENTS`, or `KNOWN_QC_NORMALIZATIONS`
   - Update `PRODUCTION_FAILURE_LOG` with incident details
3. **Add check function** in `PREFLIGHT_RULES` if needed
4. **Deploy** to production
5. **Future runs** will catch this pattern before voice generation

### Adding a New QC Normalization Rule

1. Identify: Whisper or TTS misheard a word
2. Classify: homophone, title, surname, numeric, or punctuation
3. Add to `KNOWN_QC_NORMALIZATIONS` in `knownFailures.ts`
4. Update `generate-voices/route.ts` `HOMOPHONE_PAIRS` or equivalent
5. Deploy both files
6. Preflight will report the rule is active; QC will apply it

---

## Deployment Checklist

- [ ] Review `knownFailures.ts` (add known risks as needed)
- [ ] Review `validator.ts` (check all 7 tests are appropriate)
- [ ] Test `/api/admin/preflight` endpoint with a known risky story
- [ ] Integrate preflight into admin UI or voice generation endpoint
- [ ] Add preflight check to Hal's session startup for existing jobs
- [ ] Document in landing pages / admin documentation
- [ ] Brief Marc on how to read/interpret preflight reports

---

## Example Preflight Report

```
🔍 PREFLIGHT REPORT — 2026-05-24 14:30:00

Story ID: 38bf113b-...

📊 Summary: 5/7 checks passed
❌ Status: PREFLIGHT FAILED

--- CHECK RESULTS ---

✅ Name Pronunciation Risk
   No known pronunciation risks detected

❌ Dialogue Clarity
   • Found: "Are my business..." — Fragment response. Whisper hears "Are" as "All".
   Suggested fixes:
     → Rewrite as: "That is my business..."

✅ QC Normalization Readiness
   6 normalization rules active and ready

❌ Intro/Outro Compliance
   • Intro is generic placeholder text
   • Outro must credit "Endless Tales original"

✅ Series Metadata Check
   All series metadata present

✅ Repetition Check
   No significant repetition detected

✅ Production Assets
   All production assets in place

🚨 BLOCKERS (must fix before voice generation):
   ❌ Dialogue clarity issues: 1
   ❌ Intro/outro issues: Intro is generic; Outro must credit Endless Tales original

⚠️  WARNINGS (review, may be acceptable):
   (none)

💡 RECOMMENDATIONS:
   6 QC normalization rules active and ready

--- FINAL VERDICT ---
❌ DO NOT BEGIN VOICE GENERATION — FIX BLOCKERS FIRST
```

---

## Troubleshooting

**Q: Preflight passes but voice generation still fails on a segment.**
A: Preflight catches known patterns. New failure patterns will be added to the dictionary after resolution. Report the failure to the runbook.

**Q: Preflight flags a name that should be kept.**
A: Review `knownFailures.ts`. If the risk is acceptable for this story, Marc can override. Otherwise, find a phonetically similar alternative.

**Q: Can I skip preflight?**
A: No. Preflight is a hard gate before voice generation. It reduces manual rescue significantly.

---

## Future Enhancements

- [ ] Automated script rewrite suggestions (Claude)
- [ ] Voice preview for risky character names
- [ ] Integrated story editor with preflight feedback
- [ ] Admin dashboard showing preflight history / common failures
- [ ] Machine learning on failure patterns
