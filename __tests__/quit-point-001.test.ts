import { quitPointFields } from '@/lib/quitPoint'
describe('QUIT-POINT-001', () => {
  test('keeps where the listener stopped', () => {
    expect(quitPointFields(312.7, 840.2)).toEqual({ position_seconds: 312, duration_seconds: 840 })
  })
  test('drops nonsense values', () => {
    expect(quitPointFields(NaN, 0)).toEqual({})
    expect(quitPointFields(5000, 840)).toEqual({ duration_seconds: 840 })
    expect(quitPointFields(-3, 99999)).toEqual({})
  })
  test('the end event writes both fields', () => {
    const s = require('fs').readFileSync(require('path').join(process.cwd(), 'app/api/analytics/play-event/route.ts'), 'utf8')
    expect(s).toContain('const quitPoint = quitPointFields(body?.currentTime, body?.totalDuration)')
    expect((s.match(/\.\.\.quitPoint,/g) || []).length).toBe(2)
  })
})
