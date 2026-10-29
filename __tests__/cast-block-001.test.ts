import {
  isUnsuitableAutoCastVoice,
  isNonDramaPurposeVoice,
  ageBandFromDescription,
  ageFitScore,
  energyFitPenalty,
} from '@/lib/castingVoiceFilter'

describe('CAST-BLOCK-001 non-drama voices are never auto-cast', () => {
  test.each([
    'Nora - Cozy ASMR',
    'Nicole - ASMR, Meditation, Hypnosis',
    'Linda – Soft Mom Reading & Bedtime Voice',
    'Solomon - Deep Guided Meditation Voice',
    'Dustin - Phone & On-Hold Voice',
    'Cade - Phone Recording',
    'Eryn – Professional IVR Voicemail American Female Voice',
    'Liz - Customer Service Assistant',
    'Juliet - Customer Care: Professional, Empathic, Warm',
    'Karen - Conversational Receptionist',
    'Kayley - Social Media',
    'Brittney - Young, Peppy Female - Social Media, How To\'s, Explainers',
    'Tessa – App Tutorial & Product Walkthrough',
    'Jon - Natural Authority (Agent / Assistant)',
    'Shannon B - ASMR American Whisper',
  ])('blocks %s', (name) => {
    expect(isUnsuitableAutoCastVoice({ name })).toBe(true)
  })

  test.each([
    'B. Oxley - Promovoice',
    'Jerry B. - Commanding, Deep and Gritty',
    'Brian - Deep, Resonant and Comforting',
    'Ingred - Mature, Calm and Relaxed',
    'Daniel - Commercial Salesman',
    'Grant – Composed and Direct',
  ])('keeps %s', (name) => {
    expect(isUnsuitableAutoCastVoice({ name })).toBe(false)
  })

  test('meditative / whispery descriptive labels are blocked', () => {
    expect(isNonDramaPurposeVoice({ name: 'Hollis Calder', descriptive: 'meditative' })).toBe(true)
    expect(isNonDramaPurposeVoice({ name: 'Somebody', descriptive: 'whispery' })).toBe(true)
    expect(isNonDramaPurposeVoice({ name: 'Somebody', descriptive: 'deep' })).toBe(false)
  })
})

describe('CAST-BLOCK-001 age reading', () => {
  test.each([
    ['A grizzled, menacing commander who has run the city for decades', 'old'],
    ['older man, retired detective', 'old'],
    ['in his 60s, gravelly', 'old'],
    ['a woman in her sixties', 'old'],
    ['62-year-old fixer', 'old'],
    ['young rookie officer', 'young'],
    ['a 19 year old courier', 'young'],
    ['sharp detective, brisk and driven', 'middle_aged'],
    ['in her 40s, tough', 'middle_aged'],
  ])('%s → %s', (desc, band) => {
    expect(ageBandFromDescription(desc)).toBe(band)
  })

  test('two-band age miss disqualifies; one band costs', () => {
    expect(ageFitScore('young', 'old')).toBe(-999)
    expect(ageFitScore('middle_aged', 'old')).toBeLessThan(0)
    expect(ageFitScore('old', 'old')).toBeGreaterThan(0)
  })
})

describe('CAST-BLOCK-001 energy fit', () => {
  test('intense character penalises calm/soft voices', () => {
    expect(energyFitPenalty(['intense'], 'calm')).toBeLessThan(0)
    expect(energyFitPenalty(['intense'], 'deep')).toBe(0)
  })
  test('calm characters are not penalised', () => {
    expect(energyFitPenalty(['calm'], 'calm')).toBe(0)
    expect(energyFitPenalty(['intense', 'calm'], 'soft')).toBe(0)
    expect(energyFitPenalty([], 'chill')).toBe(0)
  })
})

describe('AGE-WORDS-001 spelled ages and "old-money"', () => {
  test.each([
    ['EDWARD MONROE — forty-eight, male, old-money Southern accent, smooth and controlled', 'middle_aged'],
    ['ELIZA CALLAHAN — twenty-six, female, mild North Carolina accent', 'young'],
    ['SELMA SUTTER — fifty-nine, female, working-class Charlotte accent', 'old'],
    ['VIOLA MONROE — forty-five, female, cultured Southern accent', 'middle_aged'],
    ['RUSSELL GLASS — late fifties, male, deep Carolina drawl', 'old'],
    ['an old-fashioned bookkeeper in his forties', 'middle_aged'],
    ['a seventeen-year-old runaway', 'young'],
    ['a grizzled old fisherman', 'old'],
  ])('%s → %s', (desc, band) => {
    expect(ageBandFromDescription(desc)).toBe(band)
  })
})
