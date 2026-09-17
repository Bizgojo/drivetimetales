/**
 * scripts/cfo-report/mercury.ts
 * Pulls Mercury banking data: main account balance, virtual cards, last-24h transactions.
 *
 * API reference: https://docs.mercury.com/reference
 * Credentials: MERCURY_API_TOKEN, MERCURY_ACCOUNT_ID (env)
 */

const MERCURY_BASE = 'https://api.mercury.com/api/v1'

export interface MercuryCard {
  id: string
  name: string
  last4: string
  balance: number
  dailyLimit: number
  monthlyLimit: number
  status: string
}

export interface MercuryTransaction {
  id: string
  merchant: string
  card: string
  amount: number
  postedAt: string | null
  createdAt: string
  purpose: string
  counterpartyName: string
}

export interface MercuryData {
  balance: number
  accountName: string
  accountKind: string
  cards: MercuryCard[]
  transactions24h: MercuryTransaction[]
  stale: false
  fetchedAt: string
}

export interface MercuryStale {
  stale: true
  reason: string
}

function mercuryHeaders() {
  const token = process.env.MERCURY_API_TOKEN
  if (!token) throw new Error('MERCURY_API_TOKEN not set')
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  }
}

async function fetchMainAccount(): Promise<{ id: string; balance: number; name: string; kind: string }> {
  const accountId = process.env.MERCURY_ACCOUNT_ID?.replace(/\\n/g, '').trim()
  if (!accountId) throw new Error('MERCURY_ACCOUNT_ID not set')

  const res = await fetch(`${MERCURY_BASE}/account/${accountId}`, {
    headers: mercuryHeaders(),
    cache: 'no-store',
  })
  if (!res.ok) {
    const txt = await res.text()
    throw new Error(`Mercury account fetch failed ${res.status}: ${txt.slice(0, 300)}`)
  }
  const data = await res.json() as Record<string, unknown>

  // Mercury returns availableBalance or currentBalance
  const balance =
    typeof data.availableBalance === 'number' ? data.availableBalance :
    typeof data.currentBalance === 'number' ? data.currentBalance :
    typeof data.balance === 'number' ? data.balance : 0

  return {
    id: accountId,
    balance,
    name: (data.nickname as string) || (data.name as string) || 'Checking',
    kind: (data.kind as string) || 'checking',
  }
}

async function fetchVirtualCards(): Promise<MercuryCard[]> {
  // Mercury cards endpoint: GET /cards
  const res = await fetch(`${MERCURY_BASE}/cards`, {
    headers: mercuryHeaders(),
    cache: 'no-store',
  })
  if (!res.ok) {
    // Cards API may not be on all plans — return empty gracefully
    console.warn(`[cfo/mercury] Cards fetch failed ${res.status} — returning empty`)
    return []
  }
  const data = await res.json() as { cards?: unknown[] }
  const rawCards = data.cards || []

  return rawCards.map((c: unknown) => {
    const card = c as Record<string, unknown>
    const limits = (card.spendingLimits as Record<string, unknown>) || {}
    const daily = (limits.daily as Record<string, unknown>) || {}
    const monthly = (limits.monthly as Record<string, unknown>) || {}

    return {
      id: String(card.id || ''),
      name: String(card.name || card.nickname || 'Virtual Card'),
      last4: String(card.last4 || '????'),
      balance: typeof card.balance === 'number' ? card.balance : 0,
      dailyLimit: typeof daily.amount === 'number' ? daily.amount : 0,
      monthlyLimit: typeof monthly.amount === 'number' ? monthly.amount : 0,
      status: String(card.status || 'active'),
    }
  })
}

async function fetchRecentTransactions(accountId: string): Promise<MercuryTransaction[]> {
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

  // Mercury transactions: GET /account/{id}/transactions?start=ISO&limit=50&sort=createdAt:desc
  const params = new URLSearchParams({
    limit: '50',
    sort: 'createdAt:desc',
    start: since24h,
  })

  const res = await fetch(
    `${MERCURY_BASE}/account/${accountId}/transactions?${params.toString()}`,
    { headers: mercuryHeaders(), cache: 'no-store' }
  )
  if (!res.ok) {
    console.warn(`[cfo/mercury] Transactions fetch failed ${res.status}`)
    return []
  }
  const data = await res.json() as { transactions?: unknown[] }
  const rawTxns = data.transactions || []

  return rawTxns.map((t: unknown) => {
    const tx = t as Record<string, unknown>
    const merchant =
      (tx.merchantName as string) ||
      (tx.counterpartyName as string) ||
      (tx.description as string) ||
      'Unknown'

    // Try to find the card last4 from the transaction
    const cardRef = (tx.card as Record<string, unknown> | undefined)
    const cardName = cardRef
      ? `${String(cardRef.name || 'Card')} (…${String(cardRef.last4 || '????')})`
      : 'Main Account'

    return {
      id: String(tx.id || ''),
      merchant,
      card: cardName,
      amount: typeof tx.amount === 'number' ? tx.amount : 0,
      postedAt: tx.postedAt ? String(tx.postedAt) : null,
      createdAt: String(tx.createdAt || new Date().toISOString()),
      purpose: String(tx.note || tx.externalMemo || tx.description || ''),
      counterpartyName: String(tx.counterpartyName || merchant),
    }
  })
}

export async function fetchMercuryData(): Promise<MercuryData | MercuryStale> {
  try {
    const account = await fetchMainAccount()
    const [cards, transactions24h] = await Promise.all([
      fetchVirtualCards(),
      fetchRecentTransactions(account.id),
    ])

    return {
      balance: account.balance,
      accountName: account.name,
      accountKind: account.kind,
      cards,
      transactions24h,
      stale: false,
      fetchedAt: new Date().toISOString(),
    }
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err)
    console.error('[cfo/mercury] Fetch failed:', reason)
    return { stale: true, reason }
  }
}

// CLI entry point for standalone testing
if (require.main === module) {
  ;(async () => {
    const result = await fetchMercuryData()
    console.log(JSON.stringify(result, null, 2))
  })()
}
