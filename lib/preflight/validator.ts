/**
 * Endless Tales — Series Production Preflight Validator
 * 
 * Runs comprehensive checks before voice generation begins.
 * Returns a detailed report of risks, fixes, and blockers.
 */

import { PREFLIGHT_RULES, KNOWN_DIALOGUE_FRAGMENTS } from './knownFailures'

// ---------------------------------------------------------------------------
// Narrator voice preflight check
// ---------------------------------------------------------------------------
// Validates that the script NARRATOR header resolves to a known narrator voice.
// Prevents INC-002 (narrator_mismatch) from reaching voice_preflight at run-next.

export interface NarratorVoiceCheckResult {
  passed: boolean
  scriptNarratorName: string | null
  dbNarratorVoiceName: string | null
  resolvedVoiceId: string | null
  issues: string[]
  suggestedFix: string | null
}

const NARRATOR_HEADER_RE = /^NARRATOR:\s*(.+)$/im

/**
 * Check that the script NARRATOR header matches a narrator voice.
 * knownNarratorNames: array of { name: string; voice_id: string } from narrator_voices table.
 * dbNarratorVoiceName: the story's narrator_voice_name field from DB (may be null).
 */
export function checkNarratorVoice(params: {
  script: string
  knownNarratorNames: { name: string; voice_id: string }[]
  dbNarratorVoiceName?: string | null
}): NarratorVoiceCheckResult {
  const { script, knownNarratorNames, dbNarratorVoiceName } = params
  const issues: string[] = []

  const match = NARRATOR_HEADER_RE.exec(script)
  const scriptNarratorName = match ? match[1].trim() : null

  if (!scriptNarratorName) {
    return {
      passed: false,
      scriptNarratorName: null,
      dbNarratorVoiceName: dbNarratorVoiceName ?? null,
      resolvedVoiceId: null,
      issues: ['Script is missing a NARRATOR: header. Voice generation cannot proceed.'],
      suggestedFix: dbNarratorVoiceName
        ? `Add "NARRATOR: ${dbNarratorVoiceName}" header to the script (from DB narrator_voice_name).`
        : 'Add a NARRATOR: <voice_name> header to the script matching a row in narrator_voices.',
    }
  }

  const nameNorm = scriptNarratorName.toLowerCase().trim()
  const resolved = knownNarratorNames.find(v => v.name.toLowerCase().trim() === nameNorm)

  if (!resolved) {
    // INC-002 prevention: check if DB narrator_voice_name provides the fix
    const dbNorm = dbNarratorVoiceName ? dbNarratorVoiceName.toLowerCase().trim() : null
    const dbResolved = dbNorm
      ? knownNarratorNames.find(v => v.name.toLowerCase().trim() === dbNorm)
      : null

    issues.push(`NARRATOR "${scriptNarratorName}" not found in narrator_voices.`)
    if (dbNarratorVoiceName) {
      issues.push(`DB narrator_voice_name is "${dbNarratorVoiceName}" — use this instead of the character name.`)
    }

    const suggestedFix = dbResolved
      ? `Update NARRATOR header to "${dbNarratorVoiceName}" (matches narrator_voices and DB narrator_voice_name).`
      : `Add "${scriptNarratorName}" to narrator_voices table, or change NARRATOR header to a known voice name.`

    return {
      passed: false,
      scriptNarratorName,
      dbNarratorVoiceName: dbNarratorVoiceName ?? null,
      resolvedVoiceId: null,
      issues,
      suggestedFix,
    }
  }

  return {
    passed: true,
    scriptNarratorName,
    dbNarratorVoiceName: dbNarratorVoiceName ?? null,
    resolvedVoiceId: resolved.voice_id,
    issues: [],
    suggestedFix: null,
  }
}

export interface PreflightReport {
  passed: boolean
  timestamp: string
  storyId: string
  checks: {
    namePronunciationRisk: CheckResult
    dialogueClarity: CheckResult
    qcNormalizationReadiness: CheckResult
    introOutroCompliance: CheckResult
    seriesMetadataCheck: CheckResult
    repetitionCheck: CheckResult
    productionAssets: CheckResult
    narratorVoiceCheck: CheckResult
  }
  summary: {
    totalChecks: number
    passed: number
    failed: number
  }
  blockers: string[]
  warnings: string[]
  recommendations: string[]
  safeToGenerateVoices: boolean
}

export interface CheckResult {
  passed: boolean
  checkName: string
  findings: {
    riskFound?: boolean
    issuesFound?: boolean
    complete?: boolean
    compliant?: boolean
    repetitionFound?: boolean
    present?: string[]
    missing?: string[]
    risks?: string[]
    issues?: string[]
    errors?: string[]
  }
  details: string[]
  suggestedFixes: string[]
}

export async function runPreflightChecks(params: {
  storyId: string
  script: string
  characters: string[]
  intro?: string
  outro?: string
  seriesMetadata?: {
    seriesName?: string
    episodeTitle?: string
    episodeNumber?: number
    author?: string
    narrator?: string
    genre?: string
    durationMins?: number
  }
  isSeriesFinal?: boolean
  /** For narrator voice check (INC-002 prevention). Pass all narrator_voices rows. */
  knownNarratorVoices?: { name: string; voice_id: string }[]
  /** DB narrator_voice_name from the story row — used as fallback if script NARRATOR is wrong. */
  dbNarratorVoiceName?: string | null
}): Promise<PreflightReport> {
  const report: PreflightReport = {
    passed: true,
    timestamp: new Date().toISOString(),
    storyId: params.storyId,
    checks: {
      namePronunciationRisk: { passed: true, checkName: 'Name Pronunciation Risk', findings: {}, details: [], suggestedFixes: [] },
      dialogueClarity: { passed: true, checkName: 'Dialogue Clarity', findings: {}, details: [], suggestedFixes: [] },
      qcNormalizationReadiness: { passed: true, checkName: 'QC Normalization Readiness', findings: {}, details: [], suggestedFixes: [] },
      introOutroCompliance: { passed: true, checkName: 'Intro/Outro Compliance', findings: {}, details: [], suggestedFixes: [] },
      seriesMetadataCheck: { passed: true, checkName: 'Series Metadata Check', findings: {}, details: [], suggestedFixes: [] },
      repetitionCheck: { passed: true, checkName: 'Repetition Check', findings: {}, details: [], suggestedFixes: [] },
      productionAssets: { passed: true, checkName: 'Production Assets', findings: {}, details: [], suggestedFixes: [] },
      narratorVoiceCheck: { passed: true, checkName: 'Narrator Voice Check', findings: {}, details: [], suggestedFixes: [] },
    },
    summary: { totalChecks: 8, passed: 8, failed: 0 },
    blockers: [],
    warnings: [],
    recommendations: [],
    safeToGenerateVoices: true,
  }

  // Check 1: Name Pronunciation Risk
  {
    const result = PREFLIGHT_RULES.checkNamePronunciationRisk(params.characters)
    report.checks.namePronunciationRisk.findings = { riskFound: result.riskFound, risks: result.risks }
    if (result.riskFound) {
      report.checks.namePronunciationRisk.passed = false
      report.checks.namePronunciationRisk.details = result.risks
      report.checks.namePronunciationRisk.suggestedFixes = result.suggestions
      report.warnings.push(`Name pronunciation risks detected: ${result.risks.length}`)
      report.summary.failed += 1
      report.summary.passed -= 1
    } else {
      report.checks.namePronunciationRisk.details = ['No known pronunciation risks detected']
    }
  }

  // Check 2: Dialogue Clarity
  {
    const result = PREFLIGHT_RULES.checkDialogueClarity(params.script)
    report.checks.dialogueClarity.findings = { issuesFound: result.issuesFound, issues: result.issues }
    if (result.issuesFound) {
      report.checks.dialogueClarity.passed = false
      report.checks.dialogueClarity.details = result.issues
      report.checks.dialogueClarity.suggestedFixes = result.fixes
      report.blockers.push(`Dialogue clarity issues: ${result.issues.length}`)
      report.summary.failed += 1
      report.summary.passed -= 1
      report.passed = false
    } else {
      report.checks.dialogueClarity.details = ['No known dialogue clarity issues']
    }
  }

  // Check 3: QC Normalization Readiness
  {
    const result = PREFLIGHT_RULES.checkQCNormalizationReadiness()
    report.checks.qcNormalizationReadiness.findings = { rulesInPlace: result.rulesInPlace }
    report.checks.qcNormalizationReadiness.details = [result.coverage]
    if (result.rulesInPlace > 0) {
      report.recommendations.push(`${result.rulesInPlace} QC normalization rules active and ready`)
    }
  }

  // Check 4: Intro/Outro Compliance
  {
    const result = PREFLIGHT_RULES.checkIntroOutroCompliance(params.intro, params.outro, params.isSeriesFinal ?? false)
    report.checks.introOutroCompliance.findings = { compliant: result.compliant, errors: result.errors }
    if (!result.compliant) {
      report.checks.introOutroCompliance.passed = false
      report.checks.introOutroCompliance.details = result.errors
      report.blockers.push(`Intro/outro issues: ${result.errors.join('; ')}`)
      report.summary.failed += 1
      report.summary.passed -= 1
      report.passed = false
    } else {
      report.checks.introOutroCompliance.details = ['Intro and outro are compliant']
    }
  }

  // Check 5: Series Metadata Check
  {
    const result = PREFLIGHT_RULES.checkSeriesMetadata(params.seriesMetadata ?? {})
    report.checks.seriesMetadataCheck.findings = { complete: result.complete, missing: result.missing }
    if (!result.complete) {
      report.checks.seriesMetadataCheck.passed = false
      report.checks.seriesMetadataCheck.details = result.missing
      report.blockers.push(`Missing metadata: ${result.missing.join('; ')}`)
      report.summary.failed += 1
      report.summary.passed -= 1
      report.passed = false
    } else {
      report.checks.seriesMetadataCheck.details = ['All series metadata present']
    }
  }

  // Check 6: Repetition Check
  {
    const result = PREFLIGHT_RULES.checkForRepetition(params.script)
    report.checks.repetitionCheck.findings = { repetitionFound: result.repetitionFound, issues: result.issues }
    if (result.repetitionFound) {
      report.checks.repetitionCheck.passed = false
      report.checks.repetitionCheck.details = result.issues
      report.warnings.push(`Repetition detected: ${result.issues.length} instance(s)`)
      report.summary.failed += 1
      report.summary.passed -= 1
    } else {
      report.checks.repetitionCheck.details = ['No significant repetition detected']
    }
  }

  // Check 7: Production Assets (simplified for now)
  {
    const result = PREFLIGHT_RULES.checkProductionAssets(params.storyId)
    report.checks.productionAssets.findings = { present: result.present, missing: result.missing }
    if (result.missing.length > 0) {
      report.checks.productionAssets.passed = false
      report.checks.productionAssets.details = result.missing
      report.summary.failed += 1
      report.summary.passed -= 1
    } else {
      report.checks.productionAssets.details = ['All production assets in place']
    }
  }

  // Check 8: Narrator Voice Check (INC-002 prevention)
  // Validates script NARRATOR header against narrator_voices table.
  // Runs only if knownNarratorVoices is provided (requires DB access).
  {
    if (params.knownNarratorVoices && params.knownNarratorVoices.length > 0) {
      const result = checkNarratorVoice({
        script: params.script,
        knownNarratorNames: params.knownNarratorVoices,
        dbNarratorVoiceName: params.dbNarratorVoiceName,
      })
      report.checks.narratorVoiceCheck.findings = {
        riskFound: !result.passed,
        present: result.scriptNarratorName ? [result.scriptNarratorName] : [],
        missing: result.issues,
      }
      if (!result.passed) {
        report.checks.narratorVoiceCheck.passed = false
        report.checks.narratorVoiceCheck.details = result.issues
        if (result.suggestedFix) {
          report.checks.narratorVoiceCheck.suggestedFixes = [result.suggestedFix]
        }
        report.blockers.push(`Narrator voice check failed: ${result.issues[0]}`)
        report.summary.failed += 1
        report.summary.passed -= 1
        report.passed = false
      } else {
        report.checks.narratorVoiceCheck.details = [
          `NARRATOR "${result.scriptNarratorName}" resolves to voice_id ${result.resolvedVoiceId}`,
        ]
        report.recommendations.push(`Narrator voice validated: "${result.scriptNarratorName}"`)
      }
    } else {
      report.checks.narratorVoiceCheck.details = ['Narrator voice check skipped — knownNarratorVoices not provided']
      report.recommendations.push('Pass knownNarratorVoices to enable narrator voice preflight check (INC-002 prevention)')
    }
  }

  // Summary
  report.safeToGenerateVoices = report.passed && report.blockers.length === 0

  return report
}

/**
 * Format preflight report for human readability
 */
export function formatPreflightReport(report: PreflightReport): string {
  const lines: string[] = []

  lines.push(`\n🔍 PREFLIGHT REPORT — ${new Date(report.timestamp).toLocaleString()}`)
  lines.push(`Story ID: ${report.storyId}`)
  lines.push(`\n📊 Summary: ${report.summary.passed}/${report.summary.totalChecks} checks passed`)

  if (report.passed) {
    lines.push(`✅ Status: PREFLIGHT PASSED`)
  } else {
    lines.push(`❌ Status: PREFLIGHT FAILED`)
  }

  lines.push(`\n--- CHECK RESULTS ---`)

  Object.values(report.checks).forEach((check) => {
    const status = check.passed ? '✅' : '❌'
    lines.push(`\n${status} ${check.checkName}`)
    if (check.details.length > 0) {
      check.details.forEach((d) => lines.push(`   • ${d}`))
    }
    if (check.suggestedFixes.length > 0) {
      lines.push(`   Suggested fixes:`)
      check.suggestedFixes.forEach((f) => lines.push(`     → ${f}`))
    }
  })

  if (report.blockers.length > 0) {
    lines.push(`\n🚨 BLOCKERS (must fix before voice generation):`)
    report.blockers.forEach((b) => lines.push(`   ❌ ${b}`))
  }

  if (report.warnings.length > 0) {
    lines.push(`\n⚠️  WARNINGS (review, may be acceptable):`)
    report.warnings.forEach((w) => lines.push(`   ⚠️  ${w}`))
  }

  if (report.recommendations.length > 0) {
    lines.push(`\n💡 RECOMMENDATIONS:`)
    report.recommendations.forEach((r) => lines.push(`   💡 ${r}`))
  }

  lines.push(`\n--- FINAL VERDICT ---`)
  if (report.safeToGenerateVoices) {
    lines.push(`✅ SAFE TO BEGIN VOICE GENERATION`)
  } else {
    lines.push(`❌ DO NOT BEGIN VOICE GENERATION — FIX BLOCKERS FIRST`)
  }

  lines.push('')

  return lines.join('\n')
}

export default {
  runPreflightChecks,
  formatPreflightReport,
}
