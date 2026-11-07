import { checkSeriesFacts, extractRelationshipFacts, baseRelation, formatFactSheet, castListsText } from '@/lib/seriesFacts'

// Rerouted EP1-3 (production scripts, Nov 7 2026). Every line of the three
// scripts that contains a family word is here verbatim, plus the full cast
// lists, so the check sees exactly what it would see on the full scripts.
const head = (guide: string) => `TITLE: x\n\nCHARACTER GUIDE\n---\n${guide}\n---\n\n[START AUDIO DRAMA SCRIPT]\n`
const EP1 = head(`DANIEL REYES — thirty-eight, male, a medical courier driving nights since the crash.
SARAH REYES — thirty-six at death, female, warm and dry, a former audiobook narrator.
RAE OKORO — forty-one, female, Daniel's sister-in-law, hospital nights. Practical, unsentimental, the only person Daniel still picks up for. Phone filter when on speaker.
EDDIE — twenty-four, male, night clerk at a highway gas station.
THE DISPATCHER — fifties, male, voice only, Daniel's night dispatcher.`) +
`NARRATOR: Daniel could hear the hospital breathing behind his sister-in-law, machines and murmurs.
RAE: I heard it. Daniel, the store sounds like a recording. The car does not. I know live from tape. I am a nurse.
EDDIE: Who are you talking to, man.
DANIEL: My sister. She is on the phone.
EDDIE: What voice in your car.
\nBELLE B OUTRO\n---\nBELLE B: That was Rerouted.\n`
const EP2 = head(`DANIEL REYES — thirty-eight, male, medical courier.
RAE OKORO — forty-one, female. Daniel's sister-in-law, hospital nights. Phone filter on speaker. Practical and scared in equal measure.
EDDIE — twenty-four, male. Night clerk at the highway gas station.
BELLE B — Announcer only. Never a character.`) +
`EDDIE: I have a cousin in dispatch at the county sheriff's office.
DANIEL REYES: That works. Do that now.
SARAH REYES: He licensed it. That is what I am. A proof of concept with a family member in the car.
DANIEL REYES: Phone. Waterproof. I am going to need your cousin at the county.
RAE OKORO: My cousin is at the county sheriff's office. That is different from wanting him involved in whatever this is.
\nBELLE B OUTRO\n---\nBELLE B: Stay close.\n`
const EP3 = head(`DANIEL REYES — thirty-eight, male, medical courier.
RAE OKORO — forty-one, female. Daniel's sister-in-law, hospital nights. Phone filter on speaker.
THE MAN AT THE QUARRY — sixty-two, male. Former voice rights attorney.`) +
`RAE OKORO: My cousin.
DANIEL REYES: Your cousin is in dispatch at a county sheriff's office and I am on a road that does not exist on any county map.
DANIEL REYES: Rae. If I do not come back through that fence in twenty minutes, call your cousin and tell him everything.
DANIEL REYES: Eddie. It is Daniel Reyes. If anything happens to me tonight, tell your county cousin where the gray road goes.
\nBELLE B OUTRO\n---\nBELLE B: Stay with me.\n`

const rerouted = [
  { episodeNumber: 1, script: EP1 },
  { episodeNumber: 2, script: EP2 },
  { episodeNumber: 3, script: EP3 },
]

describe('SERIES-FACTS-001 relationship fact check', () => {
  it('reads the fact sheet from the cast lists', () => {
    const facts = extractRelationshipFacts(rerouted)
    expect(facts).toEqual([expect.objectContaining({ holder: 'RAE OKORO', relation: 'sister-in-law', of: 'Daniel' })])
    expect(formatFactSheet(facts)).toBe("- RAE OKORO is Daniel's sister-in-law.")
  })

  it('PROOF: catches both Rerouted errors Marc heard', () => {
    const { issues } = checkSeriesFacts(rerouted)
    expect(issues).toHaveLength(2)
    expect(issues[0]).toMatchObject({ episode: 1, line: 'DANIEL: My sister. She is on the phone.' })
    expect(issues[0].problem).toMatch(/sister-in-law/)
    expect(issues[1]).toMatchObject({ episode: 2 })
    expect(issues[1].problem).toMatch(/cousin/)
    expect(issues[1].problem).toMatch(/EDDIE: I have a cousin in dispatch/)
    expect(issues[1].problem).toMatch(/RAE OKORO: My cousin is at the county sheriff/)
  })

  it('passes once the lines are fixed', () => {
    const fixed = [
      { episodeNumber: 1, script: EP1.replace('DANIEL: My sister.', 'DANIEL: My sister-in-law.') },
      { episodeNumber: 2, script: EP2.replace("RAE OKORO: My cousin is at the county sheriff's office.", "RAE OKORO: Eddie's cousin is at the county sheriff's office.") },
      { episodeNumber: 3, script: EP3 },
    ]
    expect(checkSeriesFacts(fixed).issues).toEqual([])
  })

  it('does not flag two characters with unrelated relatives', () => {
    const eps = [{ episodeNumber: 1, script: head('ANNA — sister of nobody.\nBEN — male.') + 'ANNA: My cousin runs a bakery in Ohio.\nBEN: My cousin is a pilot in Texas.\n' }]
    expect(checkSeriesFacts(eps).issues).toEqual([])
  })

  it('does not flag the exact relationship word', () => {
    const eps = [{ episodeNumber: 1, script: head("JO — Mark's ex-wife.\nMARK — male.") + 'MARK: My ex-wife is on the phone.\n' }]
    expect(checkSeriesFacts(eps).issues).toEqual([])
  })

  it('flags ex-wife said as wife', () => {
    const eps = [{ episodeNumber: 1, script: head("JO — Mark's ex-wife.\nMARK — male.") + 'MARK: My wife is on the phone.\n' }]
    expect(checkSeriesFacts(eps).issues[0].problem).toMatch(/ex-wife/)
  })

  // False-positive guards taken from published series (Nov 7 2026 scan of all 36 series).
  it('ignores a relative of someone else in the description (Toll at Marsh Crossing)', () => {
    const eps = [{ episodeNumber: 2, script: head("CONRAD BURKE — early 60s, male. Retired county records clerk. Was close to Nell's father.") + 'NELL FARADAY: My father has been dead for twenty-one years.\n' }]
    expect(extractRelationshipFacts(eps)).toEqual([])
    expect(checkSeriesFacts(eps).issues).toEqual([])
  })

  it('reads multi-word and titled names (Commuter of the Year, Hardin Falls)', () => {
    const eps = [{ episodeNumber: 1, script: head("Earl Blanchard — 76, male, Miss Ottie's brother\nHOLDEN — Holden Vane, age 34, male, Emmett Vane's nephew") + 'MISS OTTIE: My brother. Got a place off Highway Eleven.\nHOLDEN: Emmett was my uncle.\n' }]
    expect(extractRelationshipFacts(eps).map((f) => `${f.holder}|${f.relation}|${f.of}`)).toEqual(['Earl Blanchard|brother|Miss Ottie', 'HOLDEN|nephew|Emmett Vane'])
    expect(checkSeriesFacts(eps).issues).toEqual([])
  })

  it('two characters whose fathers died do not share a father (What the Shallows Keep)', () => {
    const eps = [{ episodeNumber: 3, script: head('REMY — male.\nCOLE — male.') + 'COLE: My father died when I was eleven. My uncle had a lake house.\nREMY: I was nineteen when my father drowned.\nREMY: Twelve years. Started the year after my father died.\n' }]
    expect(checkSeriesFacts(eps).issues).toEqual([])
  })

  it('base relations', () => {
    expect(baseRelation('sister-in-law')).toBe('sister')
    expect(baseRelation('ex-wife')).toBe('wife')
    expect(baseRelation('stepsister')).toBe('sister')
  })

  it('cast lists for the AI check skip Belle and duplicates', () => {
    const text = castListsText(rerouted)
    expect(text).toMatch(/\(Episode 1\) RAE OKORO/)
    expect(text).not.toMatch(/BELLE B/)
  })
})

describe('SERIES-FACTS-001 wiring', () => {
  const fs = require('fs')
  const path = require('path')
  const runNext = fs.readFileSync(path.join(__dirname, '../app/api/admin/production-jobs/run-next/route.ts'), 'utf8')
  const { buildContinuityPrompt } = require('@/lib/seriesContinuity')

  it('the continuity step runs the plain-text fact check and blocks on it', () => {
    expect(runNext).toMatch(/const factCheck = checkSeriesFacts\(factEpisodes\)/)
    expect(runNext).toMatch(/blockingFactIssues\.length\s*\?\s*\{ pass: false/)
  })

  it('published episodes are reported, never rewritten', () => {
    expect(runNext).toMatch(/publishedFactIssues = factCheck\.issues\.filter\(\(i\) => frozenNumbers\.has/)
  })

  it('the writer is told relationships are fixed facts', () => {
    expect(runNext).toMatch(/a sister-in-law is never "my sister"/)
  })

  it('the AI check now sees the cast lists and fact sheet', () => {
    const prompt = buildContinuityPrompt({ seriesTitle: 'Rerouted', episodes: [{ episodeNumber: 1, title: 't', body: 'b' }], castLists: '- (Episode 1) RAE', factSheet: "- RAE OKORO is Daniel's sister-in-law." })
    expect(prompt).toMatch(/FACT SHEET[\s\S]*sister-in-law/)
    expect(prompt).toMatch(/CAST LISTS/)
    expect(prompt).toMatch(/6\. Dialogue that contradicts/)
  })
})
