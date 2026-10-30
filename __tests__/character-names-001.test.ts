import {
  buildNameIndex, resolveCharacterName, canonicalizeCharacterNames, aliasesForLabel, possibleDuplicateCast, characterNameConflictDetails,
} from '@/lib/characterNames'
import { castReviewHeader } from '@/lib/castReview'

const CHARS = [
  { label: 'NICK', name: 'Nick Brennan', aliases: ['Detective Brennan'] },
  { label: 'LOOMIS', name: 'Commander Bruce Loomis' },
  { label: 'BRIGGS', name: 'Detective Mara Briggs' },
  { label: 'RAINES', name: 'Alderman Thomas Raines' },
  { label: 'AMELIA', name: 'Amelia Raines' },
  { label: 'SMITH', name: 'John Smith', aliases: ['Johnny'] },
]

describe('CHARACTER-NAMES-001 name index', () => {
  const index = buildNameIndex(CHARS)
  test.each([
    ['John Smith', 'SMITH'], ['Mr. Smith', 'SMITH'], ['JOHN', 'SMITH'], ['Johnny', 'SMITH'], ['MR SMITH', 'SMITH'],
    ['Commander Bruce Loomis', 'LOOMIS'], ['Bruce Loomis', 'LOOMIS'], ['COMMANDER LOOMIS', 'LOOMIS'], ['Loomis', 'LOOMIS'],
    ['Detective Mara Briggs', 'BRIGGS'], ['MARA', 'BRIGGS'], ['Detective Brennan', 'NICK'], ['Brennan', 'NICK'],
    ['Thomas Raines', 'RAINES'], ['Alderman Raines', 'RAINES'], ['Amelia Raines', 'AMELIA'], ['Amelia', 'AMELIA'],
  ])('%s → %s', (name, label) => {
    expect(resolveCharacterName(index, name)).toBe(label)
  })

  test('a shared family name alone never picks one of them, but each label still maps to itself', () => {
    // "RAINES" is the alderman's own label, so it stays his; "Ms. Raines" is ambiguous → no match.
    expect(resolveCharacterName(index, 'RAINES')).toBe('RAINES')
    expect(index.ambiguous.has('RAINES')).toBe(true)
    expect(aliasesForLabel(index, 'AMELIA')).not.toContain('RAINES')
  })

  test('roster aliases cover the variants', () => {
    expect(aliasesForLabel(index, 'SMITH')).toEqual(expect.arrayContaining(['JOHN SMITH', 'JOHN', 'JOHNNY']))
  })
})

describe('CHARACTER-NAMES-001 script rewrite', () => {
  const script = [
    'TITLE: Lower Wacker',
    'CHARACTER GUIDE',
    '---',
    'Nick Brennan — age 35, male, rough-edged',
    'Commander Bruce Loomis — age 54, male, political',
    'LOOMIS — Commander Bruce Loomis, male, mid-fifties',
    'DESK GUARD — male, forties, one scene',
    '',
    'BELLE B ANNOUNCEMENT',
    '---',
    'BELLE B: Wrong Side of the River, Episode 5.',
    '[START AUDIO DRAMA SCRIPT]',
    'NARRATOR: Rain on the glass.',
    'COMMANDER BRUCE LOOMIS: Close it, Nick.',
    'MR. SMITH: I saw nothing.',
    'NICK: Sure you did.',
    'DESK GUARD: Sign in.',
  ].join('\n')

  test('every label and guide entry becomes the plan label; duplicate guide entries go', () => {
    const r = canonicalizeCharacterNames(script, CHARS)
    expect(r.script).toContain('\nLOOMIS: Close it, Nick.')
    expect(r.script).toContain('\nSMITH: I saw nothing.')
    expect(r.script).toContain('\nNICK — Nick Brennan, age 35, male, rough-edged')
    expect(r.script).toContain('\nLOOMIS — Commander Bruce Loomis, age 54, male, political')
    expect(r.script.match(/^LOOMIS —/gm)).toHaveLength(1)
    expect(r.script).toContain('\nDESK GUARD: Sign in.')
    expect(r.script).toContain('NARRATOR: Rain on the glass.')
    expect(r.script).toContain('BELLE B: Wrong Side of the River, Episode 5.')
    expect(r.conflicts).toEqual([])
  })

  test('a new name sharing a main character\'s name is flagged for the writer', () => {
    const r = canonicalizeCharacterNames('[START AUDIO DRAMA SCRIPT]\nTOM BRIGGS: Where is she?\nAGENT LOOMIS JR: Hm.', CHARS)
    expect(r.conflicts.map((c) => c.looksLike)).toEqual(expect.arrayContaining(['BRIGGS', 'LOOMIS']))
    expect(characterNameConflictDetails(r.conflicts)[0]).toMatch(/shares a name with/)
  })

  test('a shared family name alone is not a conflict', () => {
    const r = canonicalizeCharacterNames('[START AUDIO DRAMA SCRIPT]\nMRS RAINES: Thomas?', CHARS)
    expect(r.conflicts).toEqual([])
  })
})

describe('CHARACTER-NAMES-001 cast review warning', () => {
  test('flags label/full-name pairs, not different people', () => {
    const pairs = possibleDuplicateCast(['BRIGGS', 'Detective Mara Briggs', 'LOOMIS', 'Commander Bruce Loomis', 'Thomas Raines', 'Amelia Raines'])
    expect(pairs).toEqual(expect.arrayContaining([['BRIGGS', 'Detective Mara Briggs'], ['LOOMIS', 'Commander Bruce Loomis']]))
    expect(pairs).not.toContainEqual(['Thomas Raines', 'Amelia Raines'])
    expect(castReviewHeader('X', 4, null, pairs)).toMatch(/SAME person/)
    expect(castReviewHeader('X', 4, null)).not.toMatch(/SAME person/)
  })
})
