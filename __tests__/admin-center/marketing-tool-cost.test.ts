import { findAirtableToolRecord, normalizeMarketingToolCost, firstText, costOrNull, monthlyCostOrNull, activeOrNull, AIRTABLE_CAMPAIGN_BASE_URL, MARKETING_TOOL_COST_TABLE_ID } from '../../lib/admin-center/marketing-tool-cost'

test('base link and tool table constants are pinned', () => {
  expect(AIRTABLE_CAMPAIGN_BASE_URL).toBe('https://airtable.com/appPYSnJkNbWCc9Lj')
  expect(MARKETING_TOOL_COST_TABLE_ID).toBe('tblXxUmh9BlGIQZ3F')
})

test('findAirtableToolRecord matches the Airtable vendor case-insensitively', () => {
  const records = [
    { id: 'rec1', fields: { Name: 'Meta Ads', Active: true } },
    { id: 'rec2', fields: { Vendor: 'airtable team plan', Active: true } },
  ]
  expect(findAirtableToolRecord(records)?.id).toBe('rec2')
  expect(findAirtableToolRecord([records[0]])).toBeNull()
  expect(findAirtableToolRecord([])).toBeNull()
})

test('normalizeMarketingToolCost maps record fields and never invents a cost', () => {
  const normalized = normalizeMarketingToolCost({ id: 'rec2', fields: { Vendor: 'Airtable', Plan: 'Team', 'Monthly Equivalent': 24, Billing: 'Monthly', Start: '2026-01-01', Active: true } })
  expect(normalized).toEqual({ found: true, recordId: 'rec2', name: 'Airtable', plan: 'Team', monthlyCost: 24, billing: 'Monthly', start: '2026-01-01', active: true })
})

test('missing record degrades to found:false with null cost (never $0)', () => {
  const normalized = normalizeMarketingToolCost(null)
  expect(normalized.found).toBe(false)
  expect(normalized.monthlyCost).toBeNull()
  expect(normalized.monthlyCost).not.toBe(0)
})

test('missing cost fields stay null so the UI renders Unavailable', () => {
  const normalized = normalizeMarketingToolCost({ id: 'rec9', fields: { Name: 'Airtable' } })
  expect(normalized.found).toBe(true)
  expect(normalized.monthlyCost).toBeNull()
  expect(normalized.plan).toBeNull()
  expect(normalized.billing).toBeNull()
  expect(normalized.start).toBeNull()
  expect(normalized.active).toBeNull()
})

test('firstText skips blanks and costOrNull rejects non-finite values', () => {
  expect(firstText({ Plan: '  ', Tier: 'Team' }, ['Plan', 'Tier'])).toBe('Team')
  expect(firstText({}, ['Plan'])).toBeNull()
  expect(costOrNull(20)).toBe(20)
  expect(costOrNull(0)).toBe(0)
  expect(costOrNull(NaN)).toBeNull()
  expect(costOrNull('20')).toBeNull()
  expect(monthlyCostOrNull({ Amount: 12 })).toBe(12)
  expect(monthlyCostOrNull({})).toBeNull()
})

test('activeOrNull accepts boolean, 1/0 and label forms', () => {
  expect(activeOrNull({ Active: true })).toBe(true)
  expect(activeOrNull({ Active: 1 })).toBe(true)
  expect(activeOrNull({ Active: 0 })).toBe(false)
  expect(activeOrNull({})).toBeNull()
})
