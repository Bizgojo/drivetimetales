/**
 * Endless Tales — Known Production Failures Dictionary
 * 
 * Every resolved production failure becomes a permanent rule here.
 * Prevents the same class of failure from happening again.
 * 
 * Structure:
 * - nameRisks: Names that TTS/Whisper struggle with
 * - dialogueFragments: Awkward spoken lines that cause QC failures
 * - qcNormalizations: Safe equivalences for QC (Miss/Ms, etc.)
 * - introOutroRules: Belle B intro/outro requirements
 * - seriesMetadataRules: Required series fields
 * - productionAssets: Expected files/settings
 */

export interface NameRisk {
  name: string
  risk: string
  preferred: string[]
  reason: string
  addedDate: string
  addedVia: string // story title or rule ID
}

export interface DialogueFragment {
  problemText: string
  issue: string
  preferredRewrite: string[]
  reason: string
  addedDate: string
  addedVia: string
}

export interface QCNormalization {
  rule: string
  type: 'homophone' | 'title' | 'surname' | 'numeric' | 'number' | 'punctuation'
  values: string[]
  reason: string
  addedDate: string
}

export const PHONETIC_FIRST_NAME_EQUIVALENCE_GROUPS: readonly (readonly string[])[] = [
  ['sara', 'sarah'],
  ['cora', 'korra'],
  ['john', 'jon'],
  ['stephen', 'steven'],
  ['allen', 'alan'],
  ['katherine', 'catherine'],
  ['kathy', 'cathy'],
  ['megan', 'meghan'],
  ['ann', 'anne'],
  ['brian', 'bryan'],
  ['sean', 'shawn'],
  ['kara', 'cara'],
] as const

export interface ProductionFailure {
  id: string
  failureType: string // 'name_risk', 'dialogue_fragment', 'qc_mismatch', 'metadata_missing', etc.
  detectedIn: string // story title or rule ID
  symptom: string
  rootCause: string
  resolution: string // 'preflight_rule' | 'normalization_rule' | 'script_rewrite' | 'metadata_fix'
  addedDate: string
}

export const KNOWN_NAME_RISKS: NameRisk[] = [
  {
    name: 'Elena',
    risk: 'Ambiguous pronunciation: EE-lay-nah vs. EL-en-uh. Whisper/ElevenLabs may diverge.',
    preferred: ['Ella', 'Anna', 'Elena (if plot-essential, add character note)'],
    reason: 'Fresh Gardenias pattern. TTS/Whisper interpret differently.',
    addedDate: '2026-05-24',
    addedVia: 'Fresh Gardenias (design guidance)',
  },
  {
    name: 'Laurens',
    risk: 'Place-name pronunciation risk. May be heard as "law-RENZ" instead of "LAW-renz".',
    preferred: ['Lawrence', 'Laurens (if local pronunciation required)'],
    reason: 'Proper noun with accent sensitivity.',
    addedDate: '2026-05-24',
    addedVia: 'Design guidance',
  },
  {
    name: 'Connelly',
    risk: 'Whisper spelling variance: "Connelly" heard as "Connolly" (identical pronunciation).',
    preferred: ['Connelly (with QC normalization rule in place)'],
    reason: 'Fresh Gardenias segment 21. Added to QC normalization.',
    addedDate: '2026-05-24',
    addedVia: 'Fresh Gardenias (resolved via normalization)',
  },
  {
    name: 'Cora',
    risk: 'Whisper spelling variance: "Cora" heard as "Korra" (identical pronunciation).',
    preferred: ['Cora (with QC normalization rule in place)', 'Nora', 'Clara'],
    reason: 'The Phantom Ledger episode 1 segment 35. Added to exact-name QC normalization.',
    addedDate: '2026-05-24',
    addedVia: 'The Phantom Ledger (resolved via normalization)',
  },
]

export const KNOWN_DIALOGUE_FRAGMENTS: DialogueFragment[] = [
  {
    problemText: 'Are my business. Here\'s your room, Miss Connelly.',
    issue: 'Fragment response. Whisper hears "Are" as "All". QC fails.',
    preferredRewrite: [
      'That is my business. Here\'s your room, Miss Connelly.',
      'Those are my business. Here\'s your room, Miss Connelly.',
    ],
    reason: 'Fresh Gardenias segment 21. Fragment without context confuses ASR.',
    addedDate: '2026-05-24',
    addedVia: 'Fresh Gardenias',
  },
  {
    problemText: 'In this weather? The streets are flooding.',
    issue: 'Whisper VAD stops at question mark. REPEATED_IDENTICAL_TRUNCATION.',
    preferredRewrite: ['In this weather, with the streets already flooding?'],
    reason: 'Fresh Gardenias segment 44. Sentence boundary triggers VAD cutoff.',
    addedDate: '2026-05-24',
    addedVia: 'Fresh Gardenias',
  },
  {
    problemText: 'She waited. Five seconds. Ten.',
    issue: 'Fragment series. Whisper VAD stops at first period. REPEATED_IDENTICAL_TRUNCATION.',
    preferredRewrite: ['She waited, counting five seconds, then ten.'],
    reason: 'Fresh Gardenias segment 70. Short fragments trigger VAD at boundaries.',
    addedDate: '2026-05-24',
    addedVia: 'Fresh Gardenias',
  },
  {
    problemText: 'Two weeks ago. After Kingsley died.',
    issue: 'Two short sentence fragments. Whisper VAD can miss the opening word and return only the second fragment.',
    preferredRewrite: ['It was two weeks ago, after Kingsley died.'],
    reason: 'The Phantom Ledger episode 1 segment 68. Short fragment pair triggered repeated transcript truncation.',
    addedDate: '2026-05-24',
    addedVia: 'The Phantom Ledger',
  },
]

export const KNOWN_QC_NORMALIZATIONS: QCNormalization[] = [
  {
    rule: 'miss_ms_title',
    type: 'title',
    values: ['miss', 'ms'],
    reason: 'Whisper substitutes female title forms phonetically near-identical in spoken audio.',
    addedDate: '2026-05-24',
  },
  {
    rule: 'connelly_connolly_surname',
    type: 'surname',
    values: ['connelly', 'connolly'],
    reason: 'Identical pronunciation. Whisper spelling variance. Fresh Gardenias.',
    addedDate: '2026-05-24',
  },
  {
    rule: 'cora_korra_first_name',
    type: 'homophone',
    values: ['cora', 'korra'],
    reason: 'Identical pronunciation. Whisper spelling variance. The Phantom Ledger segment 35.',
    addedDate: '2026-05-24',
  },
  {
    rule: 'spoken_decade_numeric_shorthand',
    type: 'number',
    values: ['sixties/60s', 'seventies/70s', 'eighties/80s', 'nineties/90s', 'nineteen seventies/1970s'],
    reason: 'Whisper may transcribe spoken decade words as numeric decade shorthand.',
    addedDate: '2026-05-24',
  },
  {
    rule: 'brake_break_homophone',
    type: 'homophone',
    values: ['brake', 'break'],
    reason: 'Automotive: Whisper transcribes car-part noun as common verb homophone.',
    addedDate: '2026-04-01',
  },
  {
    rule: 'gray_grey_color',
    type: 'homophone',
    values: ['gray', 'grey'],
    reason: 'Whisper uses British spelling for American color.',
    addedDate: '2026-04-01',
  },
  {
    rule: 'mister_mr_title',
    type: 'title',
    values: ['mister', 'mr'],
    reason: 'Male title abbreviation/expansion. Safe equivalence.',
    addedDate: '2026-05-24',
  },
  {
    rule: 'doctor_dr_title',
    type: 'title',
    values: ['doctor', 'dr'],
    reason: 'Professional title abbreviation/expansion. Safe equivalence.',
    addedDate: '2026-05-24',
  },
]

export const PRODUCTION_FAILURE_LOG: ProductionFailure[] = [
  {
    id: 'fresh_gardenias_seg21_fragment',
    failureType: 'dialogue_fragment',
    detectedIn: 'Fresh Gardenias (segment 21)',
    symptom: 'Whisper detected "All my business" instead of "Are my business". QC failed.',
    rootCause: 'Fragment response without context. "Are" sounds like "All" to ASR.',
    resolution: 'Script rewrite: Changed to "That is my business."',
    addedDate: '2026-05-24',
  },
  {
    id: 'fresh_gardenias_seg44_vad_truncation',
    failureType: 'dialogue_clarity',
    detectedIn: 'Fresh Gardenias (segment 44)',
    symptom: 'REPEATED_IDENTICAL_TRUNCATION: Whisper returned "in this weather." on all retries.',
    rootCause: 'Question mark in middle of dialogue triggers VAD sentence boundary detection.',
    resolution: 'Script rewrite: Merged into single flowing sentence.',
    addedDate: '2026-05-24',
  },
  {
    id: 'fresh_gardenias_seg70_vad_truncation',
    failureType: 'dialogue_clarity',
    detectedIn: 'Fresh Gardenias (segment 70)',
    symptom: 'REPEATED_IDENTICAL_TRUNCATION: Whisper returned "She waited." on all retries.',
    rootCause: 'Fragment series with periods trigger VAD at each boundary.',
    resolution: 'Script rewrite: Merged into continuous clause with commas.',
    addedDate: '2026-05-24',
  },
  {
    id: 'phantom_ledger_seg68_short_fragment_pair',
    failureType: 'dialogue_clarity',
    detectedIn: 'The Phantom Ledger (episode 1 segment 68)',
    symptom: 'REPEATED_IDENTICAL_TRUNCATION: Whisper returned "weeks ago." across retry candidates.',
    rootCause: 'Two very short sentence fragments in one segment made Whisper miss the opening word/fragment boundary.',
    resolution: 'Script rewrite: Merged into "It was two weeks ago, after Kingsley died."',
    addedDate: '2026-05-24',
  },
  {
    id: 'bridges_bad_blood_ep2_seg5_silence_buffer',
    failureType: 'silence_buffer',
    detectedIn: 'Bridges of Bad Blood Ep 2 (segment 5: "She said nothing.")',
    symptom: 'SILENCE_BUFFER rejection: 18,016 bytes < 20KB flat threshold. 3-word line, legitimate ElevenLabs output.',
    rootCause: 'Flat 20KB threshold not word-count aware. Short lines produce ~15-18KB audio.',
    resolution: 'ATL-PIPE-001/006: word-count-aware threshold. <10 words → 5KB floor. ≥10 words → 20KB.',
    addedDate: '2026-06-13',
  },
  {
    id: 'leland_hall_narrator_is_character_header',
    failureType: 'narrator_mismatch',
    detectedIn: 'The Leland Hall Case (M-1 Story 1)',
    symptom: 'voice_preflight Rule 2 failed: NARRATOR "Detective Collier" not in narrator_voices.',
    rootCause: 'NARRATOR_IS_CHARACTER: true — script used character name in NARRATOR header. Voice name is always required in header.',
    resolution: 'Updated NARRATOR header from "Detective Collier" to "Ray Dolan" (DB narrator_voice_name).',
    addedDate: '2026-06-13',
  },
  {
    id: 'segment_0066_stale_loop',
    failureType: 'segment_stale_loop',
    detectedIn: 'generate_voices retryMissingOnly (segment_0066)',
    symptom: 'Segment_0066 ("I\'m not scared. I\'m done being patient.", ~15KB) regenerated infinitely.',
    rootCause: 'retryMissingOnly STALE_SIZE_THRESHOLD=20KB caused 15KB valid segment to be flagged as stale on every inventory. Infinite loop.',
    resolution: 'ATL-PIPE-006: lowered retryMissingOnly threshold to 5KB. Matches run-next hard-fail floor.',
    addedDate: '2026-06-13',
  },
  {
    id: 'fresh_gardenias_final_mix_ffmpeg_bug',
    failureType: 'infrastructure',
    detectedIn: 'Fresh Gardenias (final mix render)',
    symptom: 'HTTP 500: ffmpeg amix filter failed with "Option \'normalize\' not found".',
    rootCause: 'Code bug: amix filter parameter "normalize=0" not supported in ffmpeg version.',
    resolution: 'Code fix required: Remove "normalize=0" from filter.',
    addedDate: '2026-05-24',
  },
  {
    id: 'phantom_ledger_seg35_cora_korra',
    failureType: 'qc_mismatch',
    detectedIn: 'The Phantom Ledger (episode 1 segment 35)',
    symptom: 'Whisper detected "Korra" instead of protagonist name "Cora". QC failed.',
    rootCause: 'Identical pronunciation; Whisper chose an alternate spelling.',
    resolution: 'Exact-name QC normalization: Cora ↔ Korra.',
    addedDate: '2026-05-24',
  },
  {
    id: 'phantom_ledger_seg41_spoken_decade',
    failureType: 'qc_mismatch',
    detectedIn: 'The Phantom Ledger (episode 1 segment 41)',
    symptom: 'Whisper detected "70s" instead of spoken decade word "seventies". QC failed.',
    rootCause: 'Equivalent spoken decade expression rendered as numeric shorthand.',
    resolution: 'Exact decade-expression QC normalization for sixties/seventies/eighties/nineties and nineteen-* forms.',
    addedDate: '2026-05-24',
  },
]

/**
 * Preflight Check Rules
 */

export const PREFLIGHT_RULES = {
  // 1. NAME PRONUNCIATION RISK
  checkNamePronunciationRisk: (characterNames: string[]): { riskFound: boolean; risks: string[]; suggestions: string[] } => {
    const risks: string[] = []
    const suggestions: string[] = []
    const normalizedNames = new Set(characterNames.map((name) => name.toLowerCase().replace(/[^a-z]/g, '')).filter(Boolean))

    characterNames.forEach((name) => {
      const riskRecord = KNOWN_NAME_RISKS.find((r) => r.name.toLowerCase() === name.toLowerCase())
      if (riskRecord) {
        risks.push(`${name}: ${riskRecord.risk}`)
        suggestions.push(`Prefer: ${riskRecord.preferred.join(' or ')}`)
      }
    })

    PHONETIC_FIRST_NAME_EQUIVALENCE_GROUPS.forEach((group) => {
      const present = group.filter((name) => normalizedNames.has(name))
      if (present.length > 1) {
        risks.push(`Phonetic-name conflict: ${present.join(' / ')} are in the same equivalence group.`)
        suggestions.push(`Use only one spelling from this group in a series unless the distinction is plot-essential: ${group.join(' / ')}`)
      }
    })

    return {
      riskFound: risks.length > 0,
      risks,
      suggestions,
    }
  },

  // 2. DIALOGUE CLARITY
  checkDialogueClarity: (script: string): { issuesFound: boolean; issues: string[]; fixes: string[] } => {
    const issues: string[] = []
    const fixes: string[] = []

    KNOWN_DIALOGUE_FRAGMENTS.forEach((fragment) => {
      if (script.includes(fragment.problemText)) {
        issues.push(`Found: "${fragment.problemText}" — ${fragment.issue}`)
        fixes.push(`Rewrite as: "${fragment.preferredRewrite[0]}"`)
      }
    })

    return {
      issuesFound: issues.length > 0,
      issues,
      fixes,
    }
  },

  // 3. QC NORMALIZATION READINESS
  checkQCNormalizationReadiness: (): { rulesInPlace: number; coverage: string } => {
    return {
      rulesInPlace: KNOWN_QC_NORMALIZATIONS.length,
      coverage: `${KNOWN_QC_NORMALIZATIONS.length} normalization rules active`,
    }
  },

  // 4. INTRO/OUTRO COMPLIANCE
  checkIntroOutroCompliance: (introText: string | undefined, outroText: string | undefined, isSeriesFinal: boolean): { compliant: boolean; errors: string[] } => {
    const errors: string[] = []

    if (!introText) {
      errors.push('Intro missing')
    } else {
      if (!introText.includes('[LISTENER_NAME]') && introText.length < 20) {
        errors.push('Intro too short or missing personalization')
      }
      if (introText.toLowerCase() === 'welcome' || introText.toLowerCase() === 'hello') {
        errors.push('Intro is generic placeholder text')
      }
    }

    if (!outroText) {
      errors.push('Outro missing')
    } else {
      if (!outroText.includes('Endless Tales') && outroText.length < 30) {
        errors.push('Outro must credit "Endless Tales original" and be substantial')
      }
    }

    return {
      compliant: errors.length === 0,
      errors,
    }
  },

  // 5. SERIES METADATA CHECK
  checkSeriesMetadata: (metadata: {
    seriesName?: string
    episodeTitle?: string
    episodeNumber?: number
    author?: string
    narrator?: string
    genre?: string
    durationMins?: number
  }): { complete: boolean; missing: string[] } => {
    const missing: string[] = []

    if (!metadata.seriesName || metadata.seriesName === 'Untitled Series Package') {
      missing.push('Series title required (not "Untitled Series Package")')
    }
    if (!metadata.episodeTitle) {
      missing.push('Episode title required')
    }
    if (!metadata.episodeNumber || metadata.episodeNumber === 0) {
      missing.push('Episode number required')
    }
    if (!metadata.author) {
      missing.push('Author required')
    }
    if (!metadata.narrator) {
      missing.push('Narrator required')
    }
    if (!metadata.genre) {
      missing.push('Genre required')
    }
    if (!metadata.durationMins || metadata.durationMins === 0) {
      missing.push('Duration (minutes) required')
    }

    return {
      complete: missing.length === 0,
      missing,
    }
  },

  // 6. REPETITION CHECK
  checkForRepetition: (script: string): { repetitionFound: boolean; issues: string[] } => {
    const lines = script.split('\n').filter((l) => l.trim())
    const issues: string[] = []

    // Check for exact duplicated lines
    const seen = new Set<string>()
    lines.forEach((line) => {
      const normalized = line.toLowerCase().trim()
      if (seen.has(normalized) && line.length > 50) {
        issues.push(`Repeated line: "${line.slice(0, 80)}..."`)
      }
      seen.add(normalized)
    })

    // Check for repeated paragraphs (3+ consecutive sentences)
    const paragraphs = script.split(/\n\n+/)
    const seenParas = new Set<string>()
    paragraphs.forEach((para) => {
      const normalized = para.toLowerCase().trim()
      if (seenParas.has(normalized) && para.length > 200) {
        issues.push(`Repeated paragraph detected (length: ${para.length})`)
      }
      seenParas.add(normalized)
    })

    return {
      repetitionFound: issues.length > 0,
      issues,
    }
  },

  // 7. PRODUCTION ASSET CHECK
  checkProductionAssets: (storyId: string): { present: string[]; missing: string[] } => {
    // This would be expanded in actual implementation to check storage
    return {
      present: ['story metadata', 'script'],
      missing: [],
    }
  },
}

export default {
  KNOWN_NAME_RISKS,
  KNOWN_DIALOGUE_FRAGMENTS,
  KNOWN_QC_NORMALIZATIONS,
  PRODUCTION_FAILURE_LOG,
  PREFLIGHT_RULES,
}
