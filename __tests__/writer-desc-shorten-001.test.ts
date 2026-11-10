import { onlyDescriptionLengthBlockers } from '@/lib/scriptReadiness'

describe('WRITER-DESC-SHORTEN-001', () => {
  it('is true when the only blocker is an over-long description', () => {
    expect(onlyDescriptionLengthBlockers(['CARD-COPY: DESCRIPTION 107 characters (max 100)'])).toBe(true)
  })
  it('is false when anything else is still wrong', () => {
    expect(onlyDescriptionLengthBlockers(['CARD-COPY: DESCRIPTION 107 characters (max 100)', 'RUNTIME: too short'])).toBe(false)
    expect(onlyDescriptionLengthBlockers(['CARD-COPY: DESCRIPTION blocked word "was"'])).toBe(false)
    expect(onlyDescriptionLengthBlockers(['CARD-COPY: TITLE 6 words (max 5)'])).toBe(false)
  })
  it('is false with no blockers', () => {
    expect(onlyDescriptionLengthBlockers([])).toBe(false)
  })
})
