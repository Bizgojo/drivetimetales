import Stripe from 'stripe'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2023-10-16' })

const FM_MONTHLY_PRICE_ID = process.env.STRIPE_PRICE_FOUNDING_MEMBER!
const FM_LIMIT = parseInt(process.env.ET_FOUNDING_MEMBER_LIMIT || '500')

export interface FMStatus {
  spotsUsed: number;
  spotsRemaining: number;
  capReached: boolean;
  warningThreshold: boolean;
  priceId: string;
}

export interface FMSubscriber {
  customerId: string;
  subscriptionId: string;
  status: string;
  currentPeriodEnd: Date;
  createdAt: Date;
}

async function listActiveFMSubscriptions(limit?: number): Promise<Stripe.Subscription[]> {
  const subscriptions: Stripe.Subscription[] = []
  let hasMore = true
  let startingAfter: string | undefined

  while (hasMore) {
    const page = await stripe.subscriptions.list({
      price: FM_MONTHLY_PRICE_ID,
      status: 'active',
      limit: 100,
      ...(startingAfter ? { starting_after: startingAfter } : {}),
    })

    subscriptions.push(...page.data)
    hasMore = page.has_more
    startingAfter = page.data[page.data.length - 1]?.id

    if (limit && subscriptions.length >= limit) {
      return subscriptions.slice(0, limit)
    }
  }

  return subscriptions
}

export async function getFMStatus(): Promise<FMStatus> {
  const subscriptions = await listActiveFMSubscriptions()
  const spotsUsed = subscriptions.length
  const spotsRemaining = Math.max(0, FM_LIMIT - spotsUsed)

  return {
    spotsUsed,
    spotsRemaining,
    capReached: spotsUsed >= FM_LIMIT,
    warningThreshold: spotsRemaining < 50 && spotsUsed < FM_LIMIT,
    priceId: FM_MONTHLY_PRICE_ID,
  }
}

export async function getFMSubscribers(limit = 100): Promise<FMSubscriber[]> {
  const subscriptions = await listActiveFMSubscriptions(limit)
  return subscriptions.map((subscription) => ({
    customerId: typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id,
    subscriptionId: subscription.id,
    status: subscription.status,
    currentPeriodEnd: new Date(subscription.current_period_end * 1000),
    createdAt: new Date(subscription.created * 1000),
  }))
}

export async function isFMCapReached(): Promise<boolean> {
  const status = await getFMStatus()
  return status.capReached
}
