/**
 * CANON-GUARD-001: the canon's numbers in one place (Marc, approved Nov 9 2026).
 * __tests__/canon-guard-001.test.ts fails whenever the code or a writer prompt file disagrees
 * with these. To change a number: Marc approves it on CANON-99, the canon document is updated,
 * then this file and the code change together in one PR.
 */
export const CANON = {
  /** CANON-03 / decision 8: story card description, characters. */
  DESCRIPTION_MAX_CHARS: 100,
  /** CANON-04 / decision 30: Belle outro, words. */
  BELLE_OUTRO_MAX_WORDS: 42,
  /** CANON-03 / decision 3: hook lands within this many words in a new Episode 1. */
  HOOK_WORDS: 15,
  /** CANON-03 rule 44 / decision 6: named speakers, standalone or ≤3 episodes / longer series. */
  CAST_SHORT: 4,
  CAST_LONG: 6,
  /** CANON-03 / decision 4: speaking rate and episode length. */
  SPEAKING_RATE_WPM: 160,
  SERIES_FLOOR_MINS: 12.5,
  SERIES_CAP_FACTOR: 1.35,
  STANDALONE_TOLERANCE: 0.10,
  /** CANON-03 / decisions 129-131 (Marc, Nov 10): reading level, twists, open questions. */
  READING_GRADE_MAX: 8,
  TWISTS_PER_EPISODE_MAX: 1,
  /** TWIST-BUDGET-SERIES-002 (Marc, Nov 12, 2026, option A): a series episode may have up to 2 major twists; the writer aims for 1. Standalone stays 1. */
  TWISTS_PER_SERIES_EPISODE_MAX: 2,
  OPEN_QUESTIONS_MAX: 3,
  /** CANON-12 / decision 52: prices. */
  PRICE_MONTHLY: 9.99,
  PRICE_ANNUAL: 79.99,
  /** CANON-14 / decision 57: plow-back starting percentage (a Marc-only setting). */
  PLOW_BACK_START: 0.75,
} as const
