type SupabaseLike = {
  from: (table: string) => any
}

export type ProductionLearningEventInput = {
  job_id?: string | null
  story_id?: string | null
  series_id?: string | null
  series_title?: string | null
  episode_title?: string | null
  stage?: string | null
  failure_type: string
  root_cause?: string | null
  fix_applied?: string | null
  fix_type?: string | null
  prevention_rule?: string | null
  reusable?: boolean
  confidence?: number
}

export type LearningFeedbackItem = {
  id: string
  severity: 'warning' | 'blocker'
  failureType: string
  fixType: string | null
  preventionRule: string | null
  rootCause: string | null
  fixApplied: string | null
  matchedText: string | null
  confidence: number
}

const STATIC_NAMED_RULES = [
  {
    id: 'known_dialogue_fragment_are_my_business',
    failureType: 'dialogue_fragment',
    fixType: 'script_rewrite',
    preventionRule: 'contains:Are my business.',
    rootCause: 'Short fragment is easily misheard by transcript QC.',
    fixApplied: 'Rewrite as "That is my business."',
    severity: 'blocker' as const,
    confidence: 0.9,
  },
  {
    id: 'known_dialogue_fragment_weather_question',
    failureType: 'whisper_truncation',
    fixType: 'preflight_rewrite',
    preventionRule: 'contains:In this weather? The streets are flooding.',
    rootCause: 'Question boundary can trigger repeated Whisper truncation.',
    fixApplied: 'Rewrite as one flowing sentence before voice generation.',
    severity: 'blocker' as const,
    confidence: 0.85,
  },
  {
    id: 'known_dialogue_fragment_waited_count',
    failureType: 'whisper_truncation',
    fixType: 'preflight_rewrite',
    preventionRule: 'contains:She waited. Five seconds. Ten.',
    rootCause: 'Short sentence fragments can trigger repeated Whisper truncation.',
    fixApplied: 'Rewrite as "She waited, counting five seconds, then ten."',
    severity: 'blocker' as const,
    confidence: 0.85,
  },
  {
    id: 'known_name_risk_elena',
    failureType: 'name_risk',
    fixType: 'preflight_warning',
    preventionRule: 'word:Elena',
    rootCause: 'Ambiguous pronunciation can cause TTS and transcript-QC disagreement.',
    fixApplied: 'Use a lower-risk name or add explicit pronunciation guidance.',
    severity: 'warning' as const,
    confidence: 0.75,
  },
  {
    id: 'known_name_risk_laurens',
    failureType: 'place_name_risk',
    fixType: 'preflight_warning',
    preventionRule: 'word:Laurens',
    rootCause: 'Place-name pronunciation variance can cause transcript-QC disagreement.',
    fixApplied: 'Use a lower-risk spelling or add explicit pronunciation guidance.',
    severity: 'warning' as const,
    confidence: 0.75,
  },
]

function clean(value: unknown) {
  return String(value || '').trim()
}

function confidenceValue(value: unknown) {
  const confidence = Number(value)
  return Number.isFinite(confidence) ? Math.min(1, Math.max(0, confidence)) : 0.7
}

function parseRuleMatch(script: string, rule: string | null | undefined) {
  const cleanRule = clean(rule)
  if (!cleanRule) return null

  if (cleanRule.startsWith('contains:')) {
    const text = cleanRule.slice('contains:'.length).trim()
    return text && script.includes(text) ? text : null
  }

  if (cleanRule.startsWith('word:')) {
    const word = cleanRule.slice('word:'.length).trim()
    if (!word) return null
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    return new RegExp(`\\b${escaped}\\b`).test(script) ? word : null
  }

  return null
}

export async function recordProductionLearningEvent(supabase: SupabaseLike, input: ProductionLearningEventInput) {
  const payload = {
    job_id: input.job_id || null,
    story_id: input.story_id || null,
    series_id: input.series_id || null,
    series_title: input.series_title || null,
    episode_title: input.episode_title || null,
    stage: input.stage || null,
    failure_type: clean(input.failure_type) || 'unknown',
    root_cause: input.root_cause || null,
    fix_applied: input.fix_applied || null,
    fix_type: input.fix_type || null,
    prevention_rule: input.prevention_rule || null,
    reusable: Boolean(input.reusable),
    confidence: confidenceValue(input.confidence),
  }

  const { data, error } = await supabase
    .from('production_learning_events')
    .insert(payload)
    .select('*')
    .single()

  if (error) {
    console.warn('[production-learning] Failed to record learning event:', error.message)
    return { data: null, error }
  }

  return { data, error: null }
}

export async function loadReusableLearningEvents(supabase: SupabaseLike, limit = 100) {
  const { data, error } = await supabase
    .from('production_learning_events')
    .select('id,failure_type,root_cause,fix_applied,fix_type,prevention_rule,reusable,confidence,created_at')
    .eq('reusable', true)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) {
    console.warn('[production-learning] Failed to load reusable learning events:', error.message)
    return []
  }

  return data || []
}

export async function buildProductionLearningFeedback(supabase: SupabaseLike, script: string) {
  const dynamicRules = await loadReusableLearningEvents(supabase)
  const candidates = [
    ...STATIC_NAMED_RULES,
    ...dynamicRules.map((event: any) => ({
      id: String(event.id),
      failureType: String(event.failure_type || 'unknown'),
      fixType: event.fix_type || null,
      preventionRule: event.prevention_rule || null,
      rootCause: event.root_cause || null,
      fixApplied: event.fix_applied || null,
      severity: event.fix_type === 'preflight_rewrite' || event.fix_type === 'script_rewrite' ? 'blocker' as const : 'warning' as const,
      confidence: confidenceValue(event.confidence),
    })),
  ]

  const items: LearningFeedbackItem[] = []
  const seen = new Set<string>()

  for (const candidate of candidates) {
    const matchedText = parseRuleMatch(script, candidate.preventionRule)
    if (!matchedText) continue
    const key = `${candidate.failureType}:${candidate.preventionRule}`
    if (seen.has(key)) continue
    seen.add(key)
    items.push({
      id: candidate.id,
      severity: candidate.severity,
      failureType: candidate.failureType,
      fixType: candidate.fixType,
      preventionRule: candidate.preventionRule,
      rootCause: candidate.rootCause,
      fixApplied: candidate.fixApplied,
      matchedText,
      confidence: candidate.confidence,
    })
  }

  return {
    checked: true,
    ruleCount: candidates.length,
    warnings: items.filter(item => item.severity === 'warning'),
    blockers: items.filter(item => item.severity === 'blocker'),
  }
}
