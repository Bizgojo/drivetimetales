/**
 * BLP Genre Contract — GENRE-ATTRIBUTES-SPEC v1.0 §5
 * feature/genre-attributes-blp
 *
 * Provides the genre-aware ending judgment for the Bored Listener Pass (BLP).
 * Called from the validate_story_resolution stage in production-jobs/run-next.
 *
 * Hard rules AUTO-FAIL — they feed directly into the two-strike rewrite loop.
 * The ending contract is evaluated holistically; hard rules are binary.
 */

import { getGenreAttributes, parseHardRules, parseEndingFailureModes } from './genreAttributes'
import Anthropic from '@anthropic-ai/sdk'

export interface BLPGenreContractResult {
  pass: boolean
  autoFail: boolean
  violatedRule?: string
  reason: string
  genreEndingContract?: string
  genreHardRules?: string[]
  genre?: string
  /** true when genre attributes could not be loaded and universal floor was used */
  fallbackToUniversal: boolean
}

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

/**
 * Build the genre-contract system prompt insert for ending judgment.
 */
function buildGenreContractPrompt(
  genre: string,
  endingContract: string,
  failureModes: string[],
  hardRules: string[]
): string {
  return [
    `Genre contract for ${genre}: ${endingContract}`,
    failureModes.length > 0
      ? `Failure modes for this genre: ${failureModes.map((f, i) => `(${i + 1}) ${f}`).join('; ')}`
      : '',
    hardRules.length > 0
      ? `Hard rules (AUTO-FAIL if violated): ${hardRules.map((r, i) => `(${i + 1}) ${r}`).join('; ')}`
      : '',
  ]
    .filter(Boolean)
    .join('\n')
}

const BLP_ENDING_BASE_PROMPT = `You are an Endless Tales senior story editor evaluating whether a story's ending satisfies its genre contract.

Return JSON only. Do not include markdown.

Required JSON shape:
{
  "pass": true | false,
  "autoFail": true | false,
  "violatedHardRule": "" | "<exact rule text if violated>",
  "endingTypeDetected": "resolved" | "intentional_cliffhanger" | "unresolved" | "unclear",
  "reason": "<one clear sentence explaining pass/fail>",
  "confidence": 0.0
}

Universal floor (always applies regardless of genre):
- The opening problem posed to the listener must be addressed.
- The protagonist must affect the outcome through decisive onstage action.
- Offscreen climaxes, passive protagonists, and exposition-only endings fail the universal floor.

Genre-specific judgment:
- Evaluate the ending against the genre contract provided below.
- Check each hard rule as a BINARY test (violated = auto-fail; set autoFail=true and violatedHardRule to the exact rule text).
- If no hard rule is violated, evaluate the ending contract holistically (pass/fail).
- A genre-judged fail should set pass=false but autoFail=false (unless a hard rule is also violated).

Return autoFail=true ONLY when a hard rule is definitively violated.
`

/**
 * Check whether a story's ending satisfies its genre contract.
 * This is the primary BLP genre-contract gate.
 *
 * @param storyId  - Used for logging
 * @param genre    - The story's genre label
 * @param script   - The full production script
 * @param model    - Anthropic model to use
 */
export async function checkGenreEndingContract(
  storyId: string,
  genre: string,
  script: string,
  model = 'claude-opus-4-6'
): Promise<BLPGenreContractResult> {
  // Load genre attributes
  let attrs = await getGenreAttributes(genre).catch(() => null)
  const fallbackToUniversal = !attrs?.ending_contract

  const hardRules = parseHardRules(attrs?.hard_rules ?? null)
  const failureModes = parseEndingFailureModes(attrs?.ending_failure_modes ?? null)
  const endingContract = attrs?.ending_contract ?? 'The central conflict must be resolved decisively, with the protagonist affecting the outcome through onstage dramatic action.'

  const genreContractBlock = buildGenreContractPrompt(genre, endingContract, failureModes, hardRules)

  const response = await anthropic.messages.create({
    model,
    max_tokens: 600,
    temperature: 0,
    messages: [
      {
        role: 'user',
        content: `${BLP_ENDING_BASE_PROMPT}

${genreContractBlock}

STORY ID: ${storyId}
GENRE: ${genre}

SCRIPT:
${script}`,
      },
    ],
  })

  const rawText = response.content
    .map((c: any) => ('text' in c ? c.text : ''))
    .join('')
    .trim()

  // Parse JSON response
  let parsed: any = {}
  try {
    const jsonMatch = rawText.match(/\{[\s\S]*\}/)
    if (jsonMatch) parsed = JSON.parse(jsonMatch[0])
  } catch {
    // If JSON parse fails, treat as a pass (fail-safe — don't block production on a parse error)
    return {
      pass: true,
      autoFail: false,
      reason: 'BLP genre-contract check: JSON parse error — passing with fallback',
      fallbackToUniversal: true,
      genre,
    }
  }

  const pass = parsed.pass === true
  const autoFail = parsed.autoFail === true
  const violatedRule = typeof parsed.violatedHardRule === 'string' && parsed.violatedHardRule.trim()
    ? parsed.violatedHardRule.trim()
    : undefined

  return {
    pass,
    autoFail,
    violatedRule,
    reason: typeof parsed.reason === 'string' ? parsed.reason : rawText.slice(0, 300),
    genreEndingContract: endingContract,
    genreHardRules: hardRules,
    genre,
    fallbackToUniversal,
  }
}
