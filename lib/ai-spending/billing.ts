// Official contracts: developers.openai.com API /organization/costs and
// platform.claude.com Usage & Cost Admin API. These are costs, not card payments.
export type BilledRow = { date: string; provider: string; amount: number; currency: 'USD'; account: string; line: string }
export type BillingResult = { provider: string; status: string; detail: string; rows: BilledRow[]; scope: string; from: string; to: string }
export async function providerCosts(provider: 'OpenAI' | 'Anthropic', from: string, to: string, fetchImpl: typeof fetch = fetch): Promise<BillingResult> {
  const key = provider === 'OpenAI' ? process.env.OPENAI_ADMIN_KEY : (process.env.ANTHROPIC_ADMIN_KEY || process.env.ANTHROPIC_API_KEY)
  const project = process.env.OPENAI_BILLING_PROJECT_ID, workspace = process.env.ANTHROPIC_BILLING_WORKSPACE_ID
  const scope = provider === 'OpenAI' ? project ? 'Configured OpenAI project' : 'Entire OpenAI organization; may include non-ET activity' : workspace ? 'Configured Anthropic workspace' : 'Entire Anthropic organization; may include non-ET activity'
  const base = { provider, scope, from, to, rows: [] as BilledRow[] }
  if (!key) return { ...base, status: 'not_connected', detail: `Configure ${provider === 'OpenAI' ? 'OPENAI_ADMIN_KEY' : 'ANTHROPIC_ADMIN_KEY'} in Vercel Production.` }
  const deadline = Date.now() + 40000; let cursor: string | null = null
  const seen = new Set<string>(); const rows: BilledRow[] = []; let count = 0
  try {
    for (let page = 0; page < 50; page++) {
      const url = new URL(provider === 'OpenAI' ? 'https://api.openai.com/v1/organization/costs' : 'https://api.anthropic.com/v1/organizations/cost_report')
      const end = new Date(to + 'T00:00:00Z'); end.setUTCDate(end.getUTCDate() + 1)
      if (provider === 'OpenAI') {
        url.searchParams.set('start_time', String(Date.parse(from + 'T00:00:00Z') / 1000)); url.searchParams.set('end_time', String(end.getTime() / 1000)); url.searchParams.set('limit', '180')
        url.searchParams.append('group_by', 'project_id'); url.searchParams.append('group_by', 'line_item')
        if (project) url.searchParams.append('project_ids', project)
      } else {
        url.searchParams.set('starting_at', from + 'T00:00:00Z'); url.searchParams.set('ending_at', end.toISOString()); url.searchParams.set('limit', '31')
        url.searchParams.append('group_by[]', 'workspace_id'); url.searchParams.append('group_by[]', 'description')
      }
      url.searchParams.set('bucket_width', '1d'); if (cursor) url.searchParams.set('page', cursor)
      const remaining = deadline - Date.now(); if (remaining <= 0) throw new Error('deadline')
      const headers: Record<string, string> = provider === 'OpenAI' ? { Authorization: `Bearer ${key}` } : { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'User-Agent': 'EndlessTales-AISpending/1.0' }
      const response = await fetchImpl(url.toString(), { headers, cache: 'no-store', signal: AbortSignal.timeout(Math.min(10000, remaining)) })
      if (response.status === 401 || response.status === 403) return { ...base, status: 'permission_required', detail: provider === 'OpenAI' ? 'OpenAI organization admin access is required. Add OPENAI_ADMIN_KEY; the generation key is insufficient.' : 'Anthropic rejected billing access. Add ANTHROPIC_ADMIN_KEY or an eligible organization-level credential. Individual accounts do not support this Admin API.' }
      if (!response.ok) throw new Error('provider unavailable')
      const payload = await response.json()
      if (!Array.isArray(payload.data) || typeof payload.has_more !== 'boolean') throw new Error('invalid report')
      for (const bucket of payload.data) {
        const timestamp = provider === 'OpenAI' ? new Date(bucket.start_time * 1000) : new Date(bucket.starting_at)
        if (!Number.isFinite(timestamp.getTime()) || !Array.isArray(bucket.results)) throw new Error('invalid bucket')
        const date = timestamp.toISOString().slice(0, 10)
        if (date < from || date > to) throw new Error('out of range bucket')
        for (const result of bucket.results) {
          if (++count > 100000) throw new Error('report limit')
          if (provider === 'Anthropic' && workspace && result.workspace_id !== workspace) continue
          const raw = provider === 'OpenAI' ? result.amount?.value : result.amount
          const currency = provider === 'OpenAI' ? result.amount?.currency : result.currency
          if ((typeof raw !== 'number' && typeof raw !== 'string') || raw === '' || !Number.isFinite(Number(raw)) || typeof currency !== 'string' || currency.toUpperCase() !== 'USD') throw new Error('invalid cost')
          // Anthropic reports decimal CENTS. OpenAI's USD amount.value is DOLLARS.
          const amount = Number(raw) / (provider === 'Anthropic' ? 100 : 1)
          rows.push({ date, provider, amount, currency: 'USD', account: String((provider === 'OpenAI' ? result.project_id : result.workspace_id) || 'Default / organization'), line: String((provider === 'OpenAI' ? result.line_item : result.description) || 'Provider cost') })
        }
      }
      if (!payload.has_more) return { ...base, rows, status: 'connected', detail: 'Provider-reported costs, not token estimates or cash receipts. Current-day charges may arrive with a delay.' }
      if (typeof payload.next_page !== 'string' || !payload.next_page || seen.has(payload.next_page)) throw new Error('invalid pagination')
      cursor = payload.next_page; seen.add(payload.next_page)
    }
    throw new Error('pagination limit')
  } catch { return { ...base, status: 'unavailable', detail: 'Complete billing report could not be fetched. No partial cost total is shown. Check access, provider availability and date range.' } }
}
