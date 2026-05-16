const NUMBER_WORDS = {
  zero: '0', oh: '0', o: '0', one: '1', two: '2', three: '3', four: '4', five: '5',
  six: '6', seven: '7', eight: '8', nine: '9', ten: '10', eleven: '11', twelve: '12',
  thirteen: '13', fourteen: '14', fifteen: '15', sixteen: '16', seventeen: '17',
  eighteen: '18', nineteen: '19', twenty: '20', thirty: '30', forty: '40', fifty: '50',
}

function normalizeNumberWords(text) {
  return text
    .replace(/\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty)\s+(hundred|thousand)\b/gi, (match, numberWord, scale) => {
      const value = NUMBER_WORDS[String(numberWord).toLowerCase()]
      const multiplier = String(scale).toLowerCase() === 'thousand' ? 1000 : 100
      const amount = Number(value)
      if (!Number.isFinite(amount)) return match
      return String(amount * multiplier)
    })
    .replace(/\b(zero|oh|o|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty)(?:[\s-]+(one|two|three|four|five|six|seven|eight|nine))?\b/gi, (match, first, second) => {
      const firstValue = NUMBER_WORDS[String(first).toLowerCase()]
      const secondValue = second ? NUMBER_WORDS[String(second).toLowerCase()] : ''
      if (!firstValue) return match
      if (!secondValue) return firstValue
      const tens = Number(firstValue)
      const ones = Number(secondValue)
      if (Number.isFinite(tens) && Number.isFinite(ones) && tens >= 20) return String(tens + ones)
      return `${firstValue} ${secondValue}`
    })
}

function normalizeCurrencyForms(text) {
  return text
    .replace(/\$\s*(\d[\d,]*)\b/g, (_, amount) => `${String(amount).replace(/,/g, '')} dollars`)
    .replace(/\b(zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty)\s+(hundred|thousand)\s+dollars\b/gi, (match, numberWord, scale) => {
      const value = NUMBER_WORDS[String(numberWord).toLowerCase()]
      const multiplier = String(scale).toLowerCase() === 'thousand' ? 1000 : 100
      const amount = Number(value)
      if (!Number.isFinite(amount)) return match
      return `${amount * multiplier} dollars`
    })
    .replace(/\b(zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty)\s+dollars\b/gi, (match, numberWord) => {
      const value = NUMBER_WORDS[String(numberWord).toLowerCase()]
      return value ? `${value} dollars` : match
    })
}

function transcriptTokens(text) {
  return normalizeNumberWords(normalizeCurrencyForms(text))
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/\b([a-z]+)'s\b/g, '$1')
    .replace(/\b(\d{1,2})\s*[\.:]\s*(\d{2})\s*(?:p\s*\.?\s*m\.?|pm)\b/g, '$1 $2 pm')
    .replace(/\b(\d{1,2})\s*[\.:]\s*(\d{2})\s*(?:a\s*\.?\s*m\.?|am)\b/g, '$1 $2 am')
    .replace(/\bp\s*\.?\s*m\.?\b/g, 'pm')
    .replace(/\ba\s*\.?\s*m\.?\b/g, 'am')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
}

function compactTranscriptTokens(tokens) {
  return tokens.map(token => token.replace(/[^a-z0-9]/gi, '')).filter(Boolean)
}

function transcriptTokenVariants(tokens) {
  const compacted = compactTranscriptTokens(tokens)
  const joinedAll = compacted.join('')
  const withoutMeridiem = compacted.filter(token => token !== 'am' && token !== 'pm')
  const variants = [compacted]
  if (joinedAll && joinedAll !== compacted.join(' ')) variants.push([joinedAll])
  if (withoutMeridiem.length !== compacted.length) variants.push(withoutMeridiem)
  return variants
}

function containsOrderedTokens(haystack, needle) {
  if (needle.length === 0) return true
  let cursor = 0
  for (const token of haystack) {
    if (transcriptTokenMatches(needle[cursor], token)) cursor++
    if (cursor >= needle.length) return true
  }
  return false
}

function containsOrderedTokenVariant(haystack, needle) {
  return transcriptTokenVariants(haystack).some(haystackVariant =>
    transcriptTokenVariants(needle).some(needleVariant => containsOrderedTokens(haystackVariant, needleVariant))
  )
}

function transcriptCoverage(expected, detected) {
  if (expected.length === 0) return 1
  let cursor = 0
  let matched = 0
  for (const token of detected) {
    if (transcriptTokenMatches(expected[cursor], token)) {
      matched++
      cursor++
    }
    if (cursor >= expected.length) break
  }
  return matched / expected.length
}

function transcriptVariantCoverage(expected, detected) {
  let best = transcriptCoverage(expected, detected)
  for (const expectedVariant of transcriptTokenVariants(expected)) {
    for (const detectedVariant of transcriptTokenVariants(detected)) {
      best = Math.max(best, transcriptCoverage(expectedVariant, detectedVariant))
    }
  }
  return best
}

function levenshteinDistance(a, b) {
  if (a === b) return 0
  if (!a.length) return b.length
  if (!b.length) return a.length
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  const curr = Array.from({ length: b.length + 1 }, () => 0)
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost)
    }
    for (let j = 0; j <= b.length; j++) prev[j] = curr[j]
  }
  return prev[b.length]
}

function transcriptSimilarity(expected, detected) {
  const expectedCompact = compactTranscriptTokens(expected).join('')
  const detectedCompact = compactTranscriptTokens(detected).join('')
  if (!expectedCompact && !detectedCompact) return 1
  if (!expectedCompact || !detectedCompact) return 0
  const maxLen = Math.max(expectedCompact.length, detectedCompact.length)
  return 1 - (levenshteinDistance(expectedCompact, detectedCompact) / maxLen)
}

function phoneticTokenKey(token) {
  const normalized = token
    .toLowerCase()
    .replace(/ie$/, 'y')
    .replace(/([a-z])\1+/g, '$1')
    .replace(/ph/g, 'f')
    .replace(/ck/g, 'k')
  if (!normalized) return ''
  return normalized[0] + normalized.slice(1).replace(/[aeiou]/g, '')
}

function transcriptTokenMatches(expected, detected) {
  if (expected === detected) return true
  if (expected.length < 7 || detected.length < 7) return false
  if (expected[0] !== detected[0]) return false

  const maxLen = Math.max(expected.length, detected.length)
  if (maxLen > 16) return false
  const similarity = 1 - (levenshteinDistance(expected, detected) / maxLen)
  if (similarity >= 0.82) return true

  const expectedKey = phoneticTokenKey(expected)
  const detectedKey = phoneticTokenKey(detected)
  return expectedKey.length >= 4 && expectedKey === detectedKey
}

function validate(expectedText, detectedText) {
  const expected = transcriptTokens(expectedText)
  const detected = transcriptTokens(detectedText)
  const tail = expected.slice(Math.max(0, expected.length - 4))
  const tailMatches = containsOrderedTokenVariant(detected, tail)
  const coverage = transcriptVariantCoverage(expected, detected)
  const similarity = transcriptSimilarity(expected, detected)
  const shortLineMatches = expected.length <= 8
    ? containsOrderedTokenVariant(detected, expected) || similarity >= 0.88
    : true
  return { passed: tailMatches && shortLineMatches && coverage >= 0.62, coverage, similarity, tailMatches, shortLineMatches, expected, detected }
}

const examples = [
  { expected: 'Prairieview station was already dark.', detected: 'Prairie View station was already dark.', passed: true },
  { expected: 'It was nine-fourteen p.m.', detected: 'It was 9.14pm.', passed: true },
  { expected: 'Meet me at five.', detected: 'Meet me at 5.', passed: true },
  { expected: 'Prairie View closed at nine-fourteen p.m.', detected: 'Prairieview closed at 9:14 p m.', passed: true },
  { expected: 'Bart Wallboard stood in the street with his hat in his hand. Not out of reverence. The heat still radiating from the rubble made wearing it unbearable. Ash drifted through the morning air and settled on his coat, on his shoulders, on the badge he kept in his breast pocket rather than pinned where anyone could see it.', detected: 'Bart Walbord stood in the street with his hat in his hand. Not out of reverence, the heat still radiating from the rubble made wearing it unbearable. Ash drifted through the morning air and settled on his coat, on his shoulders, on the badge he kept in his breast pocket rather than pinned where anyone could see it.', passed: true },
  { expected: 'Bellamy waited under the broken clock.', detected: 'Bellamie waited under the broken clock.', passed: true },
  { expected: 'I think Ridgeway is next.', detected: 'I think Ridgway is next.', passed: true },
  { expected: 'Our bank has about eight thousand dollars in it. The railroad payroll comes through on Friday.', detected: 'Our bank has about $8,000 in it. The railroad payroll comes through on Friday.', passed: true },
  { expected: 'The envelope held five hundred dollars.', detected: 'The envelope held $500.', passed: true },
  { expected: 'He owed ten dollars.', detected: 'He owed $10.', passed: true },
  { expected: 'Ridgeway was a town of perhaps four hundred souls.', detected: 'Ridgeway was a town of perhaps 400 souls.', passed: true },
  { expected: 'One hundred riders waited outside.', detected: '100 riders waited outside.', passed: true },
  { expected: 'Twenty five lamps burned in the hall.', detected: '25 lamps burned in the hall.', passed: true },
  { expected: 'Eight thousand ties lined the railroad.', detected: '8000 ties lined the railroad.', passed: true },
  { expected: 'The railroad crews come through on Friday.', detected: 'The railroad cruise come through on Friday.', passed: false },
  { expected: 'Tell me what happened. Start with when they rode in.', detected: 'Tell me what happened. Start with when they wrote in.', passed: false },
]

let failed = 0
for (const { expected, detected, passed } of examples) {
  const result = validate(expected, detected)
  console.log(JSON.stringify({ expected, detected, expectedPass: passed, result }, null, 2))
  if (result.passed !== passed) failed++
}

if (failed) {
  console.error(`${failed} transcript normalization example(s) failed`)
  process.exit(1)
}
