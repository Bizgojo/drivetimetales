import { guideDescriptionNameCandidate, isDescriptorNotName } from '@/lib/rosterFullName'

describe('ROSTER-FULLNAME-001', () => {
  test.each([
    ['LOOMIS — Commander Bruce Loomis, male, mid-fifties, polished', 'Commander Bruce Loomis'],
    ['BRIGGS — Detective Mara Briggs, female, early thirties', 'Detective Mara Briggs'],
    ['GRAVES — Dominic Graves, late forties, male', 'Dominic Graves'],
    ['AMELIA: Amelia Raines, nineteen, female', 'Amelia Raines'],
    ['RAINES — Alderman Thomas Raines, male, late fifties.', 'Alderman Thomas Raines'],
    ['NICK - Nick Brennan, male, thirty-five', 'Nick Brennan'],
  ])('%s', (desc, name) => {
    expect(guideDescriptionNameCandidate(desc)).toBe(name)
  })

  test('descriptions that are not names give nothing', () => {
    expect(guideDescriptionNameCandidate('Commander Bruce Loomis — age 54, male, polished')).toBe('')
    expect(guideDescriptionNameCandidate('DISPATCHER — female, forties, flat professional tone')).toBe('')
    expect(guideDescriptionNameCandidate('')).toBe('')
    expect(isDescriptorNotName('MALE')).toBe(true)
    expect(isDescriptorNotName('RAY BARTON')).toBe(false)
  })
})
