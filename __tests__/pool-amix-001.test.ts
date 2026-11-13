import { readFileSync } from 'fs'
import { join } from 'path'

describe('POOL-AMIX-001', () => {
  const src = readFileSync(join(__dirname, '..', 'scripts/personalization/pool-worker.mjs'), 'utf8')
  test('the greeting mix no longer uses amix normalize (missing in the bundled 2018 ffmpeg)', () => {
    expect(src).not.toMatch(/amix=inputs=2:duration=longest:normalize=0/)
    expect(src).toContain('[s][v]amerge=inputs=2,pan=stereo|c0=c0+c2|c1=c1+c3[out]')
    expect(src).toContain('channel_layouts=stereo,apad[s]')
  })
  test('long errors keep their end, where ffmpeg names the real cause', () => {
    expect(src).toContain('${text.slice(0, 600)}\\n…\\n${text.slice(-1300)}')
  })
})
