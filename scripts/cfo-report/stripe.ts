/**
 * scripts/cfo-report/stripe.ts
 * Minimal Stripe rollup: MRR, paying subscriber count, new revenue (24h), active trials.
 *
 * BLOCKED: STRIPE_SECRET_KEY not found in .env.local.
 * When key is added, this module will auto-activate.
 *
 * Credentials needed: STRIPE_SECRET_KEY
 */

export interface StripeData {
  mrr: number
  payingSubCount: number
  newRev24h: number
  activeTrials: number
  stale: false
  fetchedAt: string
}

export interface StripeStale {
  stale: true
  reason: string
}

async function stripeGet(path: string): Promise<unknown> {
  const secretKey = process.env.STRIPE_SECRET_KEY
  if (!secretKey) throw new Error('STRIPE_SECRET_KEY not set')

  const res = await fetch(`https://api.stripe.com/v1${path}`, {
    headers: {
      Authorization: `Bearer ${secretKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    cache: 'no-store',
  })
  if (!res.ok) {
    const txt = await res.text()
    throw new Error(`Stripe API error ${res.status}: ${txt.slice(0, 300)}`)
  }
  return res.json()
}

async function fetchStripeSubscriptions(): Promise<{
  mrr: number
  payingSubCount: number
  activeTrials: number
}> {
  // Paginate through all active subscriptions
  let mrr = 0
  let payingSubCount = 0
  let activeTrials = 0
  let hasMore = true
  let startingAfter: string | null = null

  while (hasMore) {
    const params = new URLSearchParams({
      status: 'active',
      limit: '100',
      'expand[]': 'data.items.data.price',
    })
    if (startingAfter) params.set('starting_after', startingAfter)

    const data = await stripeGet(`/subscriptions?${params.toString()}`) as {
      data: Array<{
        id: string
        status: string
        trial_end: number | null
        items: { data: Array<{ price: { unit_amount: number; recurring: { interval: string } } }> }
      }>
      has_more: boolean
    }

    for (const sub of data.data) {
      const isTrialing = sub.trial_end !== null && sub.trial_end > Date.now() / 1000

      if (isTrialing) {
        activeTrials++
      } else {
        payingSubCount++
        // Sum MRR from each subscription item
        for (const item of sub.items.data) {
          const price = item.price
          if (!price?.unit_amount) continue
          const amountCents = price.unit_amount
          const interval = price.recurring?.interval || 'month'
          // Normalize to monthly
          const monthlyAmount =
            interval === 'year' ? amountCents / 12 :
            interval === 'week' ? amountCents * 4.33 :
            interval === 'day' ? amountCents * 30 :
            amountCents
          mrr += monthlyAmount / 100 // convert cents → dollars
        }
      }
    }

    hasMore = data.has_more
    if (hasMore && data.data.length > 0) {
      startingAfter = data.data[data.data.length - 1].id
    } else {
      hasMore = false
    }
  }

  return { mrr, payingSubCount, activeTrials }
}

async function fetchNewRev24h(): Promise<number> {
  // Use Stripe Balance Transactions to get last-24h charges
  const since = Math.floor((Date.now() - 24 * 60 * 60 * 1000) / 1000)
  const params = new URLSearchParams({
    type: 'charge',
    limit: '100',
    'created[gte]': String(since),
  })

  const data = await stripeGet(`/balance_transactions?${params.toString()}`) as {
    data: Array<{ amount: number; fee: number; net: number }>
  }

  // Sum net amounts (after Stripe fees), convert cents → dollars
  return data.data.reduce((sum, tx) => sum + tx.net / 100, 0)
}

export async function fetchStripeData(): Promise<StripeData | StripeStale> {
  const secretKey = process.env.STRIPE_SECRET_KEY
  if (!secretKey) {
    return {
      stale: true,
      reason: 'STRIPE_SECRET_KEY not configured — add to .env.local and Vercel environment variables to activate',
    }
  }

  try {
    const [{ mrr, payingSubCount, activeTrials }, newRev24h] = await Promise.all([
      fetchStripeSubscriptions(),
      fetchNewRev24h(),
    ])

    return {
      mrr,
      payingSubCount,
      newRev24h,
      activeTrials,
      stale: false,
      fetchedAt: new Date().toISOString(),
    }
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err)
    console.error('[cfo/stripe] Fetch failed:', reason)
    return { stale: true, reason }
  }
}

// CLI entry point for standalone testing
if (require.main === module) {
  ;(async () => {
    const result = await fetchStripeData()
    console.log(JSON.stringify(result, null, 2))
  })()
}
