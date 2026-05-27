import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
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

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

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
  if (token) {
    const { auth } = clients()
    const { data, error } = await auth.auth.getUser(token)
    if (!error && data.user?.email && ADMIN_EMAILS.has(data.user.email.toLowerCase())) return true
  }

  const cookieStore = cookies()
  const authClient = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: () => {},
      },
    }
  )
  const { data: { user } } = await authClient.auth.getUser()
  const email = (user?.email || '').toLowerCase()
  return Boolean(email && ADMIN_EMAILS.has(email))
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

async function safeSelect(admin: any, table: string, select: string) {
  const { data, error } = await admin.from(table).select(select).limit(10000)
  if (error) {
    console.warn(`[admin/subscribers] ${table} unavailable:`, error.message)
    return []
  }
  return data || []
}

async function listAuthUsers(admin: any) {
  const authUsers: any[] = []
  try {
    for (let page = 1; page < 50; page += 1) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 })
      if (error) {
        console.warn('[admin/subscribers] auth user list unavailable:', error.message)
        break
      }
      authUsers.push(...(data?.users || []))
      if (!data?.users || data.users.length < 1000) break
    }
  } catch (error) {
    console.warn('[admin/subscribers] auth user list failed:', error instanceof Error ? error.message : String(error))
  }
  return authUsers
}

function durationBucket(minutes: number | null | undefined) {
  const duration = Number(minutes || 0)
  if (!duration) return null
  if (duration < 20) return 'short'
  if (duration <= 40) return 'medium'
  return 'long'
}

function topEntries(map: Map<string, number>, limit = 5) {
  return [...map.entries()]
    .filter(([key]) => Boolean(key))
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([name, weight]) => ({ name, weight: Math.round(weight) }))
}

function dayName(index: number) {
  return ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][index] || 'Unknown'
}

function timeBucket(date: Date) {
  const hour = date.getHours()
  if (hour >= 5 && hour < 12) return 'morning'
  if (hour >= 12 && hour < 17) return 'afternoon'
  if (hour >= 17 && hour < 22) return 'evening'
  return 'night'
}

function movementContext(events: any[]) {
  const contexts = events
    .map((event) => String(event.movement_context || event.travel_context || event.motion_context || '').trim().toLowerCase())
    .filter(Boolean)
  if (!contexts.length) return { value: 'Not collected', source: 'Movement/travel context is not collected by default.' }
  if (contexts.includes('possibly_driving') || contexts.includes('travel') || contexts.includes('traveling') || contexts.includes('possibly_traveling')) {
    return { value: 'travel', source: 'Coarse opt-in movement signal' }
  }
  if (contexts.includes('stationary')) return { value: 'stationary', source: 'Coarse opt-in movement signal' }
  return { value: 'unknown', source: 'Coarse movement signal unavailable' }
}

function buildListeningSummary(userId: string, libraryRows: any[], playEvents: any[], storyById: Map<string, any>) {
  const userLibrary = libraryRows.filter((row) => row.user_id === userId)
  const userEvents = playEvents.filter((row) => row.user_id === userId)
  const storyIds = new Set<string>()
  const completedStoryIds = new Set<string>()
  const genreWeights = new Map<string, number>()
  const durationWeights = new Map<string, number>()
  const completedDurations: number[] = []
  const listenedDurations: number[] = []
  const timeBuckets = new Map<string, number>()
  const dayBuckets = new Map<string, number>()
  const sessionLengths: number[] = []

  let totalSecondsFromEvents = 0
  for (const event of userEvents) {
    if (event.story_id) storyIds.add(event.story_id)
    const seconds = Math.max(0, Number(event.seconds_played || 0))
    totalSecondsFromEvents += seconds
    if (seconds > 0) sessionLengths.push(seconds)
    const startedAt = dateMs(event.started_at)
    if (startedAt) {
      const startedDate = new Date(startedAt)
      const bucket = timeBucket(startedDate)
      timeBuckets.set(bucket, (timeBuckets.get(bucket) || 0) + Math.max(1, seconds / 60))
      const day = dayName(startedDate.getDay())
      dayBuckets.set(day, (dayBuckets.get(day) || 0) + Math.max(1, seconds / 60))
    }
    const story = event.story_id ? storyById.get(event.story_id) : null
    const genre = String(event.genre || story?.genre || '').trim()
    const duration = Number(event.duration_mins || story?.duration_mins || 0)
    const weight = seconds > 0 ? seconds / 60 : 1
    if (genre) genreWeights.set(genre, (genreWeights.get(genre) || 0) + weight)
    if (duration > 0) {
      listenedDurations.push(duration)
      const bucket = durationBucket(duration)
      if (bucket) durationWeights.set(bucket, (durationWeights.get(bucket) || 0) + weight)
    }
    if (event.stop_reason === 'completed' || Number(event.progress_pct || 0) >= 95) {
      if (event.story_id) completedStoryIds.add(event.story_id)
      if (duration > 0) completedDurations.push(duration)
    }
  }

  let fallbackProgressSeconds = 0
  for (const row of userLibrary) {
    if (row.story_id) storyIds.add(row.story_id)
    const story = row.story_id ? storyById.get(row.story_id) : null
    const duration = Number(story?.duration_mins || 0)
    const progress = Math.max(0, Number(row.progress || 0))
    fallbackProgressSeconds += duration > 0 ? Math.min(progress, duration * 60) : progress
    if (row.completed) {
      if (row.story_id) completedStoryIds.add(row.story_id)
      if (duration > 0) completedDurations.push(duration)
    }
    if (userEvents.length === 0) {
      const genre = String(story?.genre || '').trim()
      const weight = progress > 0 ? progress / 60 : 1
      if (genre) genreWeights.set(genre, (genreWeights.get(genre) || 0) + weight)
      if (duration > 0 && progress > 0) {
        listenedDurations.push(duration)
        const bucket = durationBucket(duration)
        if (bucket) durationWeights.set(bucket, (durationWeights.get(bucket) || 0) + weight)
      }
    }
  }

  const recentListeningMs = [
    ...userEvents.flatMap((event) => [event.ended_at, event.started_at, event.updated_at]),
    ...userLibrary.flatMap((row) => [row.last_played, row.updated_at, row.created_at]),
  ].map(dateMs).filter(Boolean).sort((a, b) => b - a)[0] || 0

  const topGenres = topEntries(genreWeights)
  const topDurationBucket = topEntries(durationWeights, 1)[0]?.name || null
  const topTimeBuckets = topEntries(timeBuckets)
  const topDayBuckets = topEntries(dayBuckets)
  const avgListenedDuration = listenedDurations.length
    ? Math.round(listenedDurations.reduce((sum, value) => sum + value, 0) / listenedDurations.length)
    : null
  const avgCompletedDuration = completedDurations.length
    ? Math.round(completedDurations.reduce((sum, value) => sum + value, 0) / completedDurations.length)
    : null
  const averageSessionLength = sessionLengths.length
    ? Math.round(sessionLengths.reduce((sum, value) => sum + value, 0) / sessionLengths.length / 60)
    : null
  const recentSessions = userEvents
    .slice()
    .sort((a, b) => dateMs(b.started_at || b.ended_at) - dateMs(a.started_at || a.ended_at))
    .slice(0, 5)
    .map((event) => ({
      storyId: event.story_id || null,
      storyTitle: event.story_id ? storyById.get(event.story_id)?.title || null : null,
      startedAt: event.started_at || null,
      endedAt: event.ended_at || null,
      secondsPlayed: Math.max(0, Number(event.seconds_played || 0)),
      stopReason: event.stop_reason || null,
    }))
  const movement = movementContext(userEvents)

  return {
    storiesStarted: storyIds.size,
    storiesCompleted: completedStoryIds.size,
    totalListenedMinutes: Math.round((totalSecondsFromEvents || fallbackProgressSeconds) / 60),
    recentListeningDate: recentListeningMs ? new Date(recentListeningMs).toISOString() : null,
    hasReliableEvents: userEvents.some((event) => Number(event.seconds_played || 0) > 0 || event.ended_at),
    preferences: {
      hasEnoughData: topGenres.length > 0 || listenedDurations.length > 0,
      preferredGenres: topGenres.map((entry) => entry.name),
      mostListenedGenre: topGenres[0]?.name || null,
      avgListenedStoryDuration: avgListenedDuration,
      avgCompletedStoryDuration: avgCompletedDuration,
      typicalDurationBucket: topDurationBucket,
    },
    patterns: {
      hasEnoughData: topTimeBuckets.length > 0 || topDayBuckets.length > 0 || sessionLengths.length > 0,
      favoriteListeningTime: topTimeBuckets[0]?.name || null,
      listeningTimeBuckets: topTimeBuckets,
      favoriteListeningDays: topDayBuckets.slice(0, 3).map((entry) => entry.name),
      mostActiveListeningDay: topDayBuckets[0]?.name || null,
      averageSessionLengthMinutes: averageSessionLength,
      recentSessions,
      likelyListeningContext: movement.value,
      movementContextSource: movement.source,
    },
  }
}

export async function GET(req: NextRequest) {
  try {
    if (!(await requireAdmin(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { admin } = clients()

    const [usersRes, subsRes, libraryRows, playEvents, stories, referrals, authUsers] = await Promise.all([
      admin.from('users').select('*').order('created_at', { ascending: false }),
      admin.from('subscriptions').select('*').order('created_at', { ascending: false }),
      safeSelect(admin, 'user_library', 'user_id,story_id,progress,completed,updated_at,created_at,last_played'),
      safeSelect(admin, 'play_events', 'user_id,story_id,started_at,ended_at,updated_at,seconds_played,progress_pct,stop_reason,genre,author,narrator,duration_mins'),
      safeSelect(admin, 'stories', 'id,title,genre,duration_mins'),
      safeSelect(admin, 'referrals', '*'),
      listAuthUsers(admin),
    ])

    if (usersRes.error) throw usersRes.error
    const users = usersRes.data || []
    const subscriptions = subsRes.data || []
    const storyById = new Map((stories || []).map((story: any) => [story.id, story]))
    const authById = new Map((authUsers || []).map((authUser: any) => [authUser.id, authUser]))

    const subByUser = new Map<string, any>()
    subscriptions.forEach((sub: any) => {
      const userId = sub.user_id || sub.metadata?.userId
      if (!userId) return
      const current = subByUser.get(userId)
      if (!current || dateMs(sub.created_at) > dateMs(current.created_at)) subByUser.set(userId, sub)
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
      const listening = buildListeningSummary(user.id, libraryRows, playEvents, storyById)
      const authUser = authById.get(user.id)
      const lastActive = [
        listening.recentListeningDate,
        user.last_active,
        user.last_login,
        user.updated_at,
        authUser?.last_sign_in_at,
        authUser?.updated_at,
        user.created_at,
      ]
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
          storiesStarted: listening.storiesStarted,
          storiesCompleted: listening.storiesCompleted,
          totalListenedMinutes: listening.totalListenedMinutes,
          recentListeningDate: listening.recentListeningDate,
          hasReliableEvents: listening.hasReliableEvents,
        },
        preferences: listening.preferences,
        listeningPatterns: listening.patterns,
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
