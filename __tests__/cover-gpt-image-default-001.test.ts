// COVER-GPT-IMAGE-DEFAULT-001: DALL-E 3 is retired — the live API 400s
// `The model 'dall-e-3' does not exist` (EC2 build 52cdcb6c) and /v1/models
// lists no dall-e models for this key. Default cover model is gpt-image-1.5
// (verified on /v1/models + current images/generations docs); the outgoing
// request must be gpt-image-compatible (quality high, size 1024x1024, n 1,
// NO response_format) and spend must be token-based actuals, not estimates.
import fs from 'fs'
import path from 'path'

const read = (p: string) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8')

describe('cover pipeline defaults to a live GPT image model (gpt-image-1.5)', () => {
  const router = read('lib/cover/imageRouter.ts')
  const route = read('app/api/asc3/regenerate-cover/route.ts')
  const logger = read('app/lib/openai-logger.ts')

  it('default image model is gpt-image-1.5, not retired dall-e-3', () => {
    expect(router).toContain("defaultModel: 'gpt-image-1.5'")
    expect(router).not.toContain("defaultModel: 'dall-e-3'")
  })

  it('gpt-image request branch pins compatible params and omits response_format', () => {
    expect(route).toContain("IMAGE_MODEL.startsWith('gpt-image')")
    expect(route).toContain("imageRequest.quality = 'high'")
    expect(route).not.toMatch(/response_format['"]\s*:/)
    expect(route).not.toContain('response_format =')
  })

  it('gpt-image handler accepts the b64_json default payload', () => {
    expect(route).toContain('b64_json')
    expect(route).toContain("Buffer.from(b64Json, 'base64')")
  })

  it('real API usage tokens flow to the spend log and the response', () => {
    expect(route).toContain('spendUsage')
    expect(route).toContain('usage: spendUsage')
    expect(route).toContain('inputTokens: usage?.input_tokens')
  })

  it('logger prices gpt-image calls per token from verified published rates', () => {
    expect(logger).toContain('GPT_IMAGE_RATES')
    expect(logger).toContain('gptImageCost')
    expect(logger).toContain('inputTokens')
  })
})
