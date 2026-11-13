import { scriptStructureIssues, openingExcerpt, NO_COUNTING_RULE } from '@/lib/countInCode'
import { readFileSync } from 'fs'
import { join } from 'path'

const script = `TITLE: One Suite
DESCRIPTION: Jess holds her breath as the clerk hands over one key to one room.
NARRATOR: Sage Wilder

CHARACTER GUIDE
---
CONNOR — Connor Reed, 34.

BELLE B ANNOUNCEMENT
---
BELLE B: In Episode Two of "Weekend Wife in Miami," the hotel has one bed.

[START AUDIO DRAMA SCRIPT]

NARRATOR: Last night, Diane took my hand.

[SFX: Footsteps, walking, tile or hallway]

CONNOR: And the other rooms?
<!-- note: not spoken -->
NARRATOR: Fully booked. A wedding block.`

describe('COUNT-IN-CODE-001', () => {
  test('required blocks are checked by code', () => {
    expect(scriptStructureIssues(script)).toEqual([])
    expect(scriptStructureIssues(script.replace('CHARACTER GUIDE\n', ''))).toEqual(['The script has no CHARACTER GUIDE block.'])
    expect(scriptStructureIssues(script.replace('BELLE B ANNOUNCEMENT\n', ''))).toEqual(['The script has no BELLE B ANNOUNCEMENT block.'])
    expect(scriptStructureIssues(script.replace('BELLE B ANNOUNCEMENT\n', ''), { belleExempt: true })).toEqual([])
  })
  test('the opening excerpt is spoken lines only, after Belle, cut at an exact word count', () => {
    expect(openingExcerpt(script)).toBe('NARRATOR: Last night, Diane took my hand.\nCONNOR: And the other rooms?\nNARRATOR: Fully booked. A wedding block.')
    expect(openingExcerpt(script, 7)).toBe('NARRATOR: Last night, Diane took my hand.\nCONNOR: And')
  })
  test('the AI checker no longer counts and is given the excerpt', () => {
    const src = readFileSync(join(__dirname, '..', 'app/api/admin/production-jobs/run-next/route.ts'), 'utf8')
    const prompt = src.slice(src.indexOf('const VALIDATOR_PROMPT = `'), src.indexOf('const STORY_RESOLUTION_VALIDATOR_PROMPT'))
    expect(prompt).toContain('${NO_COUNTING_RULE}')
    expect(prompt).not.toMatch(/28 characters or fewer|85 to 95 characters|first ~400 words|must include the required header fields|must include a CHARACTER GUIDE/)
    expect(prompt).not.toMatch(/"found", "discovered"/)
    expect(prompt).toContain('Judge only the main verb.')
    expect(src.match(/OPENING EXCERPT \(first \$\{OPENING_EXCERPT_WORDS\} spoken words/g)?.length).toBe(2)
    expect(src.match(/scriptStructureIssues\(/g)?.length).toBe(2)
    expect(NO_COUNTING_RULE).toMatch(/Never count words, characters, lines or minutes yourself/)
  })
})
