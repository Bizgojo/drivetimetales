import { formatListenTime } from '@/lib/formatListenTime'

describe('LISTEN-TIME-001: long running times show hours and minutes', () => {
  it('Sunset of Competition (450 min) shows 7 hr 30 min', () => {
    expect(formatListenTime(450)).toBe('7 hr 30 min')
  })
  it('short and round values', () => {
    expect(formatListenTime(18)).toBe('18 min')
    expect(formatListenTime(60)).toBe('1 hr')
    expect(formatListenTime(125)).toBe('2 hr 5 min')
    expect(formatListenTime(0)).toBeNull()
    expect(formatListenTime(null)).toBeNull()
  })
})
