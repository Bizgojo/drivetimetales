import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import {
  isLaunchStandardPlan,
  normalizePlan,
  normalizeSubscriptionStatus,
  recommendedCleanupAction,
} from '@/lib/admin/subscriberClassification'

const ADMIN_EMAILS = new Set([
  'marc@endless-tales.com',
  'hello.endlesstales@gmail.com',
  'williampostlewaite@icloud.com',
  'm.postlewaite@gmail.com',
])

function clients() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !anon || !service) throw new Error('Missing Supabase environment')
  return {
    auth: createClient(url, anon),
    admin: createClient(url, service, { auth: { persistSession: false } }),
  }
}

async function requireAdmin(req: NextRequest) {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
  if (!token) return false
  const { auth } = clients()
  const { data, error } = await auth.auth.getUser(token)
  if (error || !data.user?.email) return false
  return ADMIN_EMAILS.has(data.user.email.toLowerCase())
}

function dateMs(value: unknown) {
  const ms = Date.parse(String(value || ''))
  return Number.isFinite(ms) ? ms : 0
}

function displayName(user: any) {
  return user.display_name || user.name || [user.first_name, user.last_name].filter(Boolean).join(' ') || user.email || 'Unknown subscriber'
}

function pickPlan(user: any, subscription: any) {
  return normalizePlan(user.plan || user.subscription_type || user.subscription_tier || user.subscription_plan || subscription?.plan || subscription?.tier || 'unknown')
}

function pickStatus(user: any, subscription: any) {
  return normalizeSubscriptionStatus(user.subscription_status || subscription?.status || (user.plan && user.plan !== 'free' ? 'active' : 'unknown'))
}

function stripeUrl(customerId: string | null) {
  return customerId ? `https://dashboard.stripe.com/customers/${customerId}` : null
}

export async function GET(req: NextRequest) {
  try {
    if (!(await requireAdmin(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { admin } = clients()

    const [usersRes, subsRes, libraryRes, referralsRes] = await Promise.all([
      admin.from('users').select('*').order('created_at', { ascending: false }),
      admin.from('subscriptions').select('*').order('created_at', { ascending: false }),
      admin.from('user_library').select('user_id,progress,completed,updated_at,last_played').limit(10000),
      admin.from('referrals').select('*').limit(10000),
    ])

    if (usersRes.error) throw usersRes.error
    const users = usersRes.data || []
    const subscriptions = subsRes.data || []
    const libraryRows = libraryRes.data || []
    const referrals = referralsRes.data || []

    const subByUser = new Map<string, any>()
    subscriptions.forEach((sub: any) => {
      const userId = sub.user_id || sub.metadata?.userId
      if (!userId) return
      const current = subByUser.get(userId)
      if (!current || dateMs(sub.created_at) > dateMs(current.created_at)) subByUser.set(userId, sub)
    })

    const listeningByUser = new Map<string, any[]>()
    libraryRows.forEach((row: any) => {
      if (!row.user_id) return
      listeningByUser.set(row.user_id, [...(listeningByUser.get(row.user_id) || []), row])
    })

    const referralByUser = new Map<string, any[]>()
    referrals.forEach((row: any) => {
      const keys = [row.user_id, row.referrer_id, row.referred_user_id].filter(Boolean)
      keys.forEach((key) => referralByUser.set(key, [...(referralByUser.get(key) || []), row]))
    })

    const rows = users.map((user: any) => {
      const sub = subByUser.get(user.id)
      const plan = pickPlan(user, sub)
      const isFoundingMember = Boolean(user.is_founding_member || sub?.is_founding_member || plan === 'founding_member')
      const status = pickStatus(user, sub)
      const listening = listeningByUser.get(user.id) || []
      const lastActive = [user.last_active, user.last_login, ...listening.map((row) => row.last_played || row.updated_at)]
        .map(dateMs)
        .filter(Boolean)
        .sort((a, b) => b - a)[0]
      const stripeCustomerId = user.stripe_customer_id || sub?.stripe_customer_id || sub?.customer_id || null
      const stripeSubscriptionId = user.stripe_subscription_id || sub?.stripe_subscription_id || sub?.subscription_id || null

      return {
        id: user.id,
        email: user.email,
        name: displayName(user),
        plan,
        status,
        isFoundingMember,
        signupDate: user.created_at || sub?.created_at || null,
        lastActive: lastActive ? new Date(lastActive).toISOString() : null,
        stripeCustomerId,
        stripeSubscriptionId,
        stripeStatus: sub?.status || user.subscription_status || null,
        stripeUrl: stripeUrl(stripeCustomerId),
        subscriptionEndsAt: user.subscription_ends_at || sub?.current_period_end || null,
        adminNotes: user.admin_notes || '',
        accessGranted: status === 'active' || status === 'trialing',
        listening: {
          storiesStarted: listening.length,
          storiesCompleted: listening.filter((row) => row.completed).length,
          totalProgressMinutes: Math.round(listening.reduce((sum, row) => sum + Number(row.progress || 0), 0) / 60),
        },
        playlist: {
          activityKnown: false,
          note: 'Playlist activity is stored client-side unless persisted by a future server event.',
        },
        referrals: {
          count: (referralByUser.get(user.id) || []).length,
          rows: referralByUser.get(user.id) || [],
        },
      }
    })

    const standardSubscribers = rows.filter((row) => isLaunchStandardPlan(row.plan, row.isFoundingMember))
    const nonStandardUsers = rows
      .filter((row) => !isLaunchStandardPlan(row.plan, row.isFoundingMember))
      .map((row) => ({
        id: row.id,
        email: row.email,
        plan: row.plan || 'unknown',
        hasStripeRecord: Boolean(row.stripeCustomerId || row.stripeSubscriptionId),
        hasListeningHistory: row.listening.storiesStarted > 0,
        authUser: true,
        recommendedAction: recommendedCleanupAction(row.plan, Boolean(row.stripeCustomerId || row.stripeSubscriptionId), row.listening.storiesStarted > 0),
      }))

    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000
    const summary = {
      totalStandard: standardSubscribers.length,
      activePaid: standardSubscribers.filter((row) => row.status === 'active' && (row.stripeCustomerId || row.stripeSubscriptionId)).length,
      canceledExpired: standardSubscribers.filter((row) => ['canceled', 'expired', 'past_due'].includes(row.status)).length,
      foundingMembers: standardSubscribers.filter((row) => row.isFoundingMember).length,
      newThisWeek: standardSubscribers.filter((row) => dateMs(row.signupDate) >= weekAgo).length,
    }

    return NextResponse.json({ summary, subscribers: standardSubscribers, audit: { nonStandardUsers } })
  } catch (error) {
    console.error('[admin/subscribers] failed:', error)
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Subscriber load failed' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    if (!(await requireAdmin(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { admin } = clients()
    const body = await req.json()
    const userId = String(body.userId || '')
    const action = String(body.action || '')
    if (!userId) return NextResponse.json({ error: 'Missing userId' }, { status: 400 })

    const updates: Record<string, unknown> = {}
    if (action === 'grant_founding') updates.is_founding_member = true
    else if (action === 'remove_founding') updates.is_founding_member = false
    else if (action === 'grant_access') {
      updates.plan = 'standard'
      updates.subscription_status = 'active'
    } else if (action === 'revoke_access') {
      updates.plan = 'free'
      updates.subscription_status = 'canceled'
    } else if (action === 'mark_internal') {
      updates.plan = 'internal'
    } else if (action === 'disable_account') {
      updates.disabled = true
    } else {
      return NextResponse.json({ error: 'Unsupported action' }, { status: 400 })
    }

    const { error } = await admin.from('users').update(updates).eq('id', userId)
    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[admin/subscribers] action failed:', error)
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Action failed' }, { status: 500 })
  }
}
