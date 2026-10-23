// COVER-DALLE3-RESPONSE-FORMAT-001: dall-e-3 now 400-rejects
// `response_format` ("Unknown parameter: 'response_format'"), which blocked
// the cover stage (no covers in storage for any Creek episode).
// Fix: omit response_format; the handler already accepts both payload shapes.
import fs from 'fs'
import path from 'path'

const read = (p: string) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8')

describe('regenerate-cover image request shape (dall-e-3 response_format fix)', () => {
  const src = read('app/api/asc3/regenerate-cover/route.ts')

  it('does not send response_format (rejected by dall-e-3 with 400)', () => {
    expect(src).not.toContain('response_format =')
    expect(src).not.toMatch(/response_format['"]\s*:/)
  })

  it('handler still accepts b64_json payloads', () => {
    expect(src).toContain('b64_json')
    expect(src).toContain("Buffer.from(b64Json, 'base64')")
  })

  it('handler still accepts url payloads (dall-e-3 default)', () => {
    expect(src).toContain('json.data?.[0]?.url')
    expect(src).toContain('Failed to download generated image')
  })

  it('still pins quality per model family', () => {
    expect(src).toContain("imageRequest.quality = 'high'")
    expect(src).toContain("imageRequest.quality = 'hd'")
  })
})
