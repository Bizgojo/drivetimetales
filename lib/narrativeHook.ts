/**
 * NARRATIVE-HOOK DETECTOR — single definition (PUBLICATION-HOLD-001, 2026-10-23).
 *
 * Moved verbatim from app/api/admin/production-jobs/run-next/route.ts
 * (ATL-PIPE-020) so the publication-time Belle gate enforces the SAME
 * deterministic hook rule the pipeline validator uses — no divergent copy.
 * run-next imports from here; behavior is unchanged.
 *
 * ATL-PIPE-020: Narrative Hook Detection Immunity.
 * Replaces keyword-matching with category-based narrative hook detection.
 * Rationale: the validator should recognise hook classes, not specific words.
 * Writing to satisfy a keyword list is a validator defect, not a story defect.
 *
 * The nine categories (per Marc's classification):
 *   1. suspicious_discrepancy - numbers/data/records that tell an unintended story
 *   2. unexplained_event      - something happened without explanation
 *   3. hidden_evidence        - something concealed or suppressed
 *   4. secret                 - information deliberately withheld
 *   5. fraud_wrongdoing       - explicit criminal or deceptive action
 *   6. betrayal               - breach of trust
 *   7. conspiracy             - organised deception or plot
 *   8. impossible_fact        - something that should not be possible
 *   9. missing_person         - someone absent, disappeared, or unaccounted for
 *   10. concrete_threat       - a specific danger, warning, or lurking presence
 *
 * Ledger intro: "numbers tell a story they were never meant to tell"
 *   → matches suspicious_discrepancy (pattern: numbers.{0,50}story.{0,30}meant)
 *   → PASS - intro unchanged, validator updated.
 *
 * LEARN-001 classification: Validation-Model Defect (not story defect, not validator bug).
 * Root cause: keyword matching approximates hook detection but cannot recognise
 * inferential or structural forms of narrative tension.
 */

export type NarrativeHookCategory =
  | 'suspicious_discrepancy'
  | 'unexplained_event'
  | 'hidden_evidence'
  | 'secret'
  | 'fraud_wrongdoing'
  | 'betrayal'
  | 'conspiracy'
  | 'impossible_fact'
  | 'missing_person'
  | 'concrete_threat'

export function normalizeNarrativeHookText(text: string) {
  return String(text || '')
    .normalize('NFKC')
    .replace(/[\u2018\u2019\u201A\u201B\u2032\u02BC]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F\u2033]/g, '"')
    .replace(/[\u2010-\u2015\u2212]/g, ' ')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export function detectNarrativeHookCategory(text: string): NarrativeHookCategory | null {
  const raw = normalizeNarrativeHookText(text).toLowerCase()
  const normalized = raw
    .replace(/\bshouldn.?t\b/g, 'should not')
    .replace(/\bcan.?t\b/g, 'cannot')
    .replace(/\bcan not\b/g, 'cannot')
    .replace(/\bdoesn.?t\b/g, 'does not')
    .replace(/\bisn.?t\b/g, 'is not')
    .replace(/\bwasn.?t\b/g, 'was not')
    .replace(/\bwon.?t\b/g, 'will not')
  const contracted = normalized
    .replace(/\bshould (not|never)\b/g, "shouldn't")
    .replace(/\bcannot\b/g, "can't")
    .replace(/\bdoes not\b/g, "doesn't")
    .replace(/\bis not\b/g, "isn't")
    .replace(/\bwas not\b/g, "wasn't")
    .replace(/\bwill not\b/g, "won't")
  const t = `${raw}\n${normalized}\n${contracted}`

  // 1. Suspicious discrepancy - numbers/data/records that don't add up,
  //    things that communicate an unintended truth, anomalies in records.
  //    Covers: "numbers tell a story they were never meant to tell",
  //    "the entry doesn't reconcile", "entries refuse to match",
  //    "four payments to a vendor that may not exist".
  if (
    /\b(discrepancy|doesn.t add up|doesn.t match|anomal|irregularit|reconciliation|reconciling|reconcile|off the books|never meant to tell|weren.t meant|wasn.t meant|not meant to|never supposed to|shouldn.t exist|can.t exist|numbers.*wrong|wrong.*numbers)\b/i.test(t) ||
    /numbers.{0,60}story.{0,40}meant/i.test(t) ||
    /story.{0,40}(never|not|wasn.t|weren.t).{0,20}meant/i.test(t) ||
    /\b(entries|entry|payments?|invoices?|transaction|figure|amount|sum).{0,40}(refuse|fail|don.t|doesn.t|won.t|can.t).{0,20}(match|reconcile|add up|balance|align)\b/i.test(t) ||
    /\b(vendor|account|entity|company|supplier|payee).{0,40}(may not|might not|doesn.t|don.t|can.t|cannot|never|shouldn.t).{0,20}(exist|be real|be found|have existed)\b/i.test(t) ||
    /\b(ledger|account|entry|invoice|payment|transaction|column|figure|balance|books?).{0,40}(wrong|off|false|missing|extra|unexplained|shouldn.t|didn.t|doesn.t|not right|bad|error|mistake)\b/i.test(t) ||
    /\b(wrong|off|false|missing|extra|unexplained).{0,40}(ledger|account|entry|invoice|payment|transaction|column|figure|balance|books?)\b/i.test(t)
  ) return 'suspicious_discrepancy'

  // 2. Unexplained event - something happened with no apparent reason.
  if (
    /\b(unexplained|no explanation|no one knows why|never explained|without warning|out of nowhere|for no reason|reasons? unclear|nobody.?s sure|mysterious circumstances|can.?t explain|nobody can explain)\b/i.test(t)
  ) return 'unexplained_event'

  // 3. Hidden evidence - something concealed, suppressed, or not meant to surface.
  if (
    /\b(hidden|concealed|buried|covered up|cover.?up|suppressed|sealed|locked away|kept secret|kept quiet|wasn.t meant to be found|never meant to be found|shouldn.t have surfaced|didn.t want found|didn.t want anyone to find)\b/i.test(t)
  ) return 'hidden_evidence'

  // 4. Secret - information deliberately withheld from someone.
  if (
    /\b(secret|no one knew|nobody knew|didn.t tell|never told|withheld|confidential|classified|kept from|wasn.t supposed to know|not supposed to know)\b/i.test(t)
  ) return 'secret'

  // 5. Fraud / wrongdoing - explicit criminal or deceptive act.
  if (
    /\b(fraud|fraudulent|scheme|scam|theft|stolen|embezzl|forgery|falsif|tamper|manipulat|corrupt|brib|crime|criminal|illegal|illicit|wrongdoing|cover.?up|decei|on purpose|paper trail)\b/i.test(t)
  ) return 'fraud_wrongdoing'

  // 6. Betrayal - breach of trust between people.
  if (
    /\b(betrayal|betrayed|betrays|trust.{0,20}broken|broken.{0,20}trust|backstab|double.?cross|sold.{0,10}out|turned.{0,10}against|let.{0,10}down by someone)\b/i.test(t)
  ) return 'betrayal'

  // 7. Conspiracy - organised deception, plot, or coordinated wrongdoing.
  if (
    /\b(conspiracy|conspired|conspiring|plot|orchestrated|coordinated|web of|network of|scheme involving|working together to|they planned|planned together)\b/i.test(t)
  ) return 'conspiracy'

  // 8. Impossible fact - something that defies logic or should not exist.
  if (
    /\b(impossible|can.?t be right|can.?t be true|makes no sense|doesn.?t make sense|defies|against all (odds|logic|reason)|shouldn.?t (exist|be possible|have happened)|never should have|no way that|how is it possible)\b/i.test(t)
  ) return 'impossible_fact'

  // 9. Missing person - someone absent, disappeared, or unaccounted for.
  if (
    /\b(missing|disappeared|vanished|gone without|unaccounted|never came back|never returned|last seen|never found|no trace)\b/i.test(t)
  ) return 'missing_person'

  // 10. Concrete threat / danger / menace - a specific danger, warning, or
  //     lurking presence tied to a subject/place/action, not just mood.
  if (
    /\b(something|someone|somebody|a man|a woman|a figure|a shadow|a voice|footsteps?|a presence).{0,50}(moving|watching|following|waiting|hiding|lurking|standing|breathing|scratching|knocking|whispering|coming|approaching)\b/i.test(t) ||
    /\b(moving|watching|following|waiting|hiding|lurking|standing|breathing|scratching|knocking|whispering|coming|approaching).{0,50}\b(behind|inside|under|above|outside|across|beneath|within)\b/i.test(t) ||
    /\b(danger|threat|warning|warned|trap|ambush|menace|stalked|stalker|predator|hunted|hunter).{0,60}\b(door|hallway|room|house|road|car|truck|phone|note|wall|walls|window|basement|attic|neighbor|family|home|town|station|route)\b/i.test(t) ||
    /\b(door|hallway|room|house|road|car|truck|phone|note|wall|walls|window|basement|attic|neighbor|family|home|town|station|route).{0,60}\b(danger|threat|warning|trap|ambush|menace|stalked|hunted|not safe|unsafe)\b/i.test(t)
  ) return 'concrete_threat'

  return null
}
