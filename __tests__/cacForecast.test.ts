import {
  SCENARIO_RATES,
  SPEND_WEEKS,
  TOTAL_WEEKS,
  weeklySpend,
  simulateScenario,
  simulateAll,
} from '@/lib/marketing/cacForecast'

describe('cacForecast model', () => {
  test('weekly spend spreads budget over weeks 1-6, $0 in weeks 7-8', () => {
    const budget = 3000
    for (let w = 1; w <= SPEND_WEEKS; w++) {
      expect(weeklySpend(budget, w)).toBeCloseTo(500)
    }
    expect(weeklySpend(budget, 7)).toBe(0)
    expect(weeklySpend(budget, 8)).toBe(0)
    // total across 8 weeks equals budget
    let total = 0
    for (let w = 1; w <= TOTAL_WEEKS; w++) total += weeklySpend(budget, w)
    expect(total).toBeCloseTo(budget)
  })

  test('trial converts to paid with 2-week lag (no paid before week 3)', () => {
    const r = simulateScenario(3000, 'likely')
    expect(r.weeks[0].newPaid).toBe(0)
    expect(r.weeks[1].newPaid).toBe(0)
    expect(r.weeks[2].newPaid).toBeGreaterThan(0)
  })

  test('running CAC = cumSpend / cumPaid, null before first paid', () => {
    const r = simulateScenario(3000, 'likely')
    expect(r.weeks[0].runningCac).toBeNull()
    const wk4 = r.weeks[3]
    expect(wk4.runningCac).toBeCloseTo(wk4.cumSpend / wk4.cumPaid)
  })

  test('scenario ordering: best CAC < likely CAC < worst CAC', () => {
    const all = simulateAll(3000)
    expect(all.best.finalCac).not.toBeNull()
    expect(all.likely.finalCac).not.toBeNull()
    expect(all.worst.finalCac).not.toBeNull()
    expect(all.best.finalCac!).toBeLessThan(all.likely.finalCac!)
    expect(all.likely.finalCac!).toBeLessThan(all.worst.finalCac!)
  })

  test('zero budget yields zero paid and null CAC', () => {
    const r = simulateScenario(0, 'best')
    expect(r.totalPaid).toBe(0)
    expect(r.finalCac).toBeNull()
  })

  test('paid math matches funnel constants for week 3 likely', () => {
    const budget = 3000
    const rates = SCENARIO_RATES.likely
    const r = simulateScenario(budget, 'likely')
    const wk1Spend = budget / SPEND_WEEKS
    const expected = ((wk1Spend / rates.cpc) * rates.clickToTrial) * rates.trialToPaid
    expect(r.weeks[2].newPaid).toBeCloseTo(expected)
  })
})
