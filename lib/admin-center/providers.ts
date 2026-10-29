import 'server-only'
import Stripe from 'stripe'

export async function stripeSummary() {
  if (!process.env.STRIPE_SECRET_KEY) return { status: 'unavailable', reason: 'STRIPE_SECRET_KEY is missing' }
  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2023-10-16', timeout: 12000, maxNetworkRetries: 1 })
    let mrr = 0, paid = 0, newPaid = 0, collections = 0, fees = 0, currency: string | null = null
    const since = Math.floor(Date.now()/1000) - 30 * 86400
    // Require evidence of a paid invoice; complimentary active subscriptions are excluded.
    for await (const sub of stripe.subscriptions.list({ status: 'active', limit: 100, expand: ['data.latest_invoice'] })) {
      const invoice = sub.latest_invoice as Stripe.Invoice | null
      if (!invoice || typeof invoice === 'string' || !invoice.paid || invoice.amount_paid <= 0 || !invoice.livemode) continue
      paid++
      let firstPaid=Infinity
      for await(const paidInvoice of stripe.invoices.list({subscription:sub.id,status:'paid',limit:100})){if(paidInvoice.livemode&&paidInvoice.amount_paid>0)firstPaid=Math.min(firstPaid,paidInvoice.status_transitions.paid_at||paidInvoice.created)}
      if(firstPaid>=since&&Number.isFinite(firstPaid))newPaid++
      for (const item of sub.items.data) {
        const price = item.price, r = price.recurring
        if (!r || price.currency !== 'usd' || price.unit_amount === null || price.billing_scheme !== 'per_unit') throw new Error('Unsupported recurring price')
        const months = r.interval === 'year' ? 12 * r.interval_count : r.interval === 'month' ? r.interval_count : r.interval === 'week' ? r.interval_count * 12/52 : r.interval_count * 12/365
        mrr += price.unit_amount * (item.quantity || 1) / 100 / months
      }
    }
    // Stripe balance transactions are cash ledger entries, including refund and dispute adjustments.
    for await (const tx of stripe.balanceTransactions.list({ created: { gte: since }, limit: 100 })) {
      if (tx.currency !== 'usd') throw new Error('Multiple currencies require reconciliation')
      if (!['charge','payment','refund','payment_refund','adjustment'].includes(tx.type)) continue
      collections += tx.net/100; fees += tx.fee/100; currency = tx.currency
    }
    if (!process.env.STRIPE_SECRET_KEY.startsWith('sk_live_') && !process.env.STRIPE_SECRET_KEY.startsWith('rk_live_')) return { status: 'unavailable', reason: 'Test-mode Stripe cannot supply actual financial KPIs' }
    return { status: 'connected', source: 'Stripe live subscriptions and balance transactions', fetchedAt: new Date().toISOString(), paid, newPaid, mrr, collections, fees, currency: currency || 'usd', period: 'rolling 30 days', definition: 'Collections net of Stripe fees, refunds and adjustments; payout transfers excluded. MRR before subscription discounts/taxes; active subscriptions with paid latest invoice only.' }
  } catch { return { status: 'unavailable', reason: 'Stripe read or reconciliation failed; no zero substituted' } }
}
export async function mercurySummary() {
  if (!process.env.MERCURY_API_TOKEN) return { status: 'unavailable', reason: 'MERCURY_API_TOKEN is missing' }
  try {
    const r = await fetch('https://api.mercury.com/api/v1/accounts', { headers: { Authorization: `Bearer ${process.env.MERCURY_API_TOKEN}` }, cache: 'no-store', signal: AbortSignal.timeout(10000) })
    if (!r.ok) throw new Error('Mercury denied')
    const p = await r.json()
    if (!Array.isArray(p.accounts) || !p.accounts.length) throw new Error('No accounts')
    const accounts = p.accounts.map((a: any) => ({ id: a.id, name: a.nickname || a.name || a.kind, balance: a.availableBalance, status: a.status, kind: a.kind }))
    if (accounts.some((a: any) => typeof a.balance !== 'number' || !Number.isFinite(a.balance))) throw new Error('Unverified balance')
    return { status: 'connected', source: 'Mercury availableBalance (USD)', fetchedAt: new Date().toISOString(), cash: accounts.reduce((s: number,a: any) => s+a.balance,0), accounts, transfersEnabled: false }
  } catch { return { status: 'unavailable', reason: 'Mercury account access or balance format could not be verified', transfersEnabled: false } }
}
export async function metaSummary() {
  const token = process.env.META_ACCESS_TOKEN, account = process.env.META_AD_ACCOUNT_ID
  if (!token || !account) return { status: 'unavailable', reason: 'Meta ads read credentials are missing' }
  try {
    const params = new URLSearchParams({ fields: 'id,name,status,effective_status,daily_budget,lifetime_budget', limit: '100' })
    const r = await fetch(`https://graph.facebook.com/v21.0/${account.startsWith('act_') ? account : `act_${account}`}/campaigns?${params}`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store', signal: AbortSignal.timeout(10000) })
    if (!r.ok) throw new Error('Meta denied')
    const p = await r.json()
    return { status: p.paging?.next ? 'partial' : 'connected', source: 'Meta read-only campaigns', fetchedAt: new Date().toISOString(), data: p.data || [], writeEnabled: false }
  } catch { return { status: 'unavailable', reason: 'Meta ads permissions or read request failed', writeEnabled: false } }
}
