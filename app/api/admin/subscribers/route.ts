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
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
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

async function safeSelect(admin: any, table: string, select: string, options: { orderBy?: string; ascending?: boolean; limit?: number } = {}) {
  let query = admin.from(table).select(select)
  if (options.orderBy) query = query.order(options.orderBy, { ascending: options.ascending ?? false })
  query = query.limit(options.limit || 10000)
  const { data, error } = await query
  if (error) {
    console.warn(`[admin/subscribers] ${table} unavailable:`, error.message)
    return []
  }
  return data || []
}

async function safeSelectWithOrderFallback(admin: any, table: string, select: string, orderCandidates: string[], limit = 10000) {
  for (const orderBy of orderCandidates) {
    let query = admin.from(table).select(select).order(orderBy, { ascending: false }).limit(limit)
    const { data, error } = await query
    if (!error) return data || []
    console.warn(`[admin/subscribers] ${table} order by ${orderBy} unavailable:`, error.message)
  }
  return safeSelect(admin, table, select, { limit })
}

async function loadTravelInsightPreferences(admin: any) {
  const { data, error } = await admin
    .from('user_travel_insights_preferences')
    .select('user_id,mode,updated_at')
    .limit(50000)
  if (error) {
    console.warn('[admin/subscribers] user_travel_insights_preferences unavailable:', error.message)
    return { rows: [], available: false }
  }
  return { rows: data || [], available: true }
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

function valueFrom(row: any, keys: string[]) {
  for (const key of keys) {
    if (row?.[key] !== undefined && row?.[key] !== null && row?.[key] !== '') return row[key]
    if (row?.properties?.[key] !== undefined && row?.properties?.[key] !== null && row?.properties?.[key] !== '') return row.properties[key]
    if (row?.payload?.[key] !== undefined && row?.payload?.[key] !== null && row?.payload?.[key] !== '') return row.payload[key]
    if (row?.metadata?.[key] !== undefined && row?.metadata?.[key] !== null && row?.metadata?.[key] !== '') return row.metadata[key]
  }
  return null
}

function numberFrom(row: any, keys: string[]) {
  const value = valueFrom(row, keys)
  const num = Number(value)
  return Number.isFinite(num) ? num : 0
}

function stringFrom(row: any, keys: string[]) {
  const value = valueFrom(row, keys)
  return value === null || value === undefined ? '' : String(value).trim()
}

function dateFrom(row: any, keys: string[]) {
  return dateMs(valueFrom(row, keys))
}

function normalizePlayEvent(event: any) {
  const storyId = stringFrom(event, ['story_id', 'storyId', 'episode_id', 'episodeId', 'content_id', 'contentId'])
  const seconds = Math.max(0, numberFrom(event, [
    'seconds_played',
    'listened_seconds',
    'listen_seconds',
    'played_seconds',
    'elapsed_seconds',
    'session_seconds',
    'duration_played_seconds',
  ]))
  const fallbackProgressSeconds = Math.max(0, numberFrom(event, [
    'progress_seconds',
    'position_seconds',
    'current_time',
    'currentTime',
    'playhead_seconds',
  ]))
  const startedMs = dateFrom(event, ['started_at', 'start_time', 'startedAt', 'created_at', 'timestamp', 'occurred_at', 'event_time'])
  const endedMs = dateFrom(event, ['ended_at', 'end_time', 'endedAt', 'updated_at'])
  const progressPct = Math.max(0, numberFrom(event, ['progress_pct', 'progress_percent', 'completion_pct', 'percent_complete']))
  const stopReason = stringFrom(event, ['stop_reason', 'stopReason', 'reason'])
  const eventType = stringFrom(event, ['event_type', 'type', 'name'])
  return {
    raw: event,
    userId: stringFrom(event, ['user_id', 'userId', 'subscriber_id', 'subscriberId']),
    storyId,
    seconds: seconds || fallbackProgressSeconds,
    progressSeconds: fallbackProgressSeconds,
    progressPct,
    startedMs,
    endedMs,
    updatedMs: dateFrom(event, ['updated_at', 'updatedAt']),
    createdMs: dateFrom(event, ['created_at', 'createdAt']),
    genre: stringFrom(event, ['genre']),
    author: stringFrom(event, ['author']),
    narrator: stringFrom(event, ['narrator', 'narrator_voice_name', 'narratorVoiceName']),
    durationMins: numberFrom(event, ['duration_mins', 'durationMinutes', 'story_duration_mins']),
    durationSeconds: numberFrom(event, ['duration_seconds', 'durationSeconds', 'total_duration', 'totalDuration']),
    stopReason,
    eventType,
    sessionId: stringFrom(event, ['session_id', 'sessionId']),
  }
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
    .map((event) => String(valueFrom(event, ['movement_context', 'travel_context', 'motion_context']) || '').trim().toLowerCase())
    .filter(Boolean)
  if (!contexts.length) return { value: 'Not collected', source: 'Movement/travel context is not collected by default.' }
  if (contexts.includes('possibly_driving') || contexts.includes('travel') || contexts.includes('traveling') || contexts.includes('possibly_traveling')) {
    return { value: 'possibly traveling', source: 'Coarse opt-in movement signal' }
  }
  if (contexts.includes('stationary')) return { value: 'stationary', source: 'Coarse opt-in movement signal' }
  return { value: 'unknown', source: 'Coarse movement signal unavailable' }
}

function travelInsightsLabel(mode: string | null | undefined) {
  if (mode === 'always') return 'Always'
  if (mode === 'never') return 'Never'
  if (mode === 'while_using') return 'Only While Using This App'
  return 'Not set'
}

function buildListeningSummary(userId: string, libraryRows: any[], playEvents: any[], storyById: Map<string, any>) {
  const normalizedUserId = String(userId || '').toLowerCase()
  const userLibrary = libraryRows.filter((row) => String(row.user_id || '').toLowerCase() === normalizedUserId)
  const userEvents = playEvents
    .map(normalizePlayEvent)
    .filter((row) => row.userId.toLowerCase() === normalizedUserId)
  const storyIds = new Set<string>()
  const completedStoryIds = new Set<string>()
  const genreWeights = new Map<string, number>()
  const durationWeights = new Map<string, number>()
  const completedDurationByStory = new Map<string, number>()
  const listenedDurations: number[] = []
  const timeBuckets = new Map<string, number>()
  const dayBuckets = new Map<string, number>()
  const sessionLengths: number[] = []
  const eventStoryIds = new Set<string>()

  let totalSecondsFromEvents = 0
  for (const event of userEvents) {
    const storyId = event.storyId
    if (storyId) {
      storyIds.add(storyId)
      eventStoryIds.add(storyId)
    }
    const seconds = Math.max(0, event.seconds)
    totalSecondsFromEvents += seconds
    if (seconds > 0) sessionLengths.push(seconds)
    const startedAt = event.startedMs || event.createdMs || event.updatedMs
    if (startedAt) {
      const startedDate = new Date(startedAt)
      const bucket = timeBucket(startedDate)
      timeBuckets.set(bucket, (timeBuckets.get(bucket) || 0) + Math.max(1, seconds / 60))
      const day = dayName(startedDate.getDay())
      dayBuckets.set(day, (dayBuckets.get(day) || 0) + Math.max(1, seconds / 60))
    }
    const story = storyId ? storyById.get(storyId) : null
    const genre = String(event.genre || story?.genre || '').trim()
    const duration = Number(event.durationMins || (event.durationSeconds ? event.durationSeconds / 60 : 0) || story?.duration_mins || 0)
    const weight = seconds > 0 ? seconds / 60 : 1
    if (genre) genreWeights.set(genre, (genreWeights.get(genre) || 0) + weight)
    if (duration > 0) {
      listenedDurations.push(duration)
      const bucket = durationBucket(duration)
      if (bucket) durationWeights.set(bucket, (durationWeights.get(bucket) || 0) + weight)
    }
    const completedEvent = event.stopReason === 'completed'
      || event.eventType === 'completed'
      || event.eventType === 'story_completed'
      || event.eventType === 'playback_completed'
      || event.progressPct >= 95
    if (completedEvent) {
      if (storyId) {
        completedStoryIds.add(storyId)
        if (duration > 0) completedDurationByStory.set(storyId, duration)
      }
    }
  }

  let fallbackProgressSeconds = 0
  for (const row of userLibrary) {
    const storyId = String(row.story_id || '')
    const progress = Math.max(0, Number(row.progress || 0))
    const hasLibraryActivity = progress > 0 || row.completed || row.last_played
    if (storyId && hasLibraryActivity) storyIds.add(storyId)
    const story = storyId ? storyById.get(storyId) : null
    const duration = Number(story?.duration_mins || 0)
    if (!eventStoryIds.has(storyId)) {
      fallbackProgressSeconds += duration > 0 ? Math.min(progress, duration * 60) : progress
    }
    if (row.completed) {
      if (storyId) {
        completedStoryIds.add(storyId)
        if (duration > 0) completedDurationByStory.set(storyId, duration)
      }
    }
    if (!eventStoryIds.has(storyId)) {
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
    ...userEvents.flatMap((event) => [event.endedMs, event.startedMs, event.updatedMs, event.createdMs]),
    ...userLibrary.flatMap((row) => [row.last_played, row.updated_at, row.created_at]),
  ].map(dateMs).filter(Boolean).sort((a, b) => b - a)[0] || 0

  const topGenres = topEntries(genreWeights)
  const topDurationBucket = topEntries(durationWeights, 1)[0]?.name || null
  const topTimeBuckets = topEntries(timeBuckets)
  const topDayBuckets = topEntries(dayBuckets)
  const avgListenedDuration = listenedDurations.length
    ? Math.round(listenedDurations.reduce((sum, value) => sum + value, 0) / listenedDurations.length)
    : null
  const completedDurations = [...completedDurationByStory.values()]
  const avgCompletedDuration = completedDurations.length
    ? Math.round(completedDurations.reduce((sum, value) => sum + value, 0) / completedDurations.length)
    : null
  const averageSessionLength = sessionLengths.length
    ? Math.round(sessionLengths.reduce((sum, value) => sum + value, 0) / sessionLengths.length / 60)
    : null
  const recentSessions = userEvents
    .slice()
    .sort((a, b) => (b.startedMs || b.createdMs || b.endedMs || 0) - (a.startedMs || a.createdMs || a.endedMs || 0))
    .slice(0, 5)
    .map((event) => ({
      storyId: event.storyId || null,
      storyTitle: event.storyId ? storyById.get(event.storyId)?.title || null : null,
      startedAt: event.startedMs ? new Date(event.startedMs).toISOString() : null,
      endedAt: event.endedMs ? new Date(event.endedMs).toISOString() : null,
      secondsPlayed: Math.max(0, event.seconds),
      stopReason: event.stopReason || event.eventType || null,
    }))
  const movement = movementContext(userEvents)

  return {
    storiesStarted: storyIds.size,
    storiesCompleted: completedStoryIds.size,
    totalListenedMinutes: Math.round((totalSecondsFromEvents + fallbackProgressSeconds) / 60),
    recentListeningDate: recentListeningMs ? new Date(recentListeningMs).toISOString() : null,
    hasReliableEvents: userEvents.some((event) => event.seconds > 0 || event.progressSeconds > 0 || event.endedMs || event.startedMs || event.createdMs),
    eventCount: userEvents.length,
    libraryActivityCount: userLibrary.filter((row) => Number(row.progress || 0) > 0 || row.completed || row.last_played).length,
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

    const [usersRes, subsRes, libraryRows, playEvents, stories, referrals, authUsers, travelPreferencesResult] = await Promise.all([
      admin.from('users').select('*').order('created_at', { ascending: false }),
      admin.from('subscriptions').select('*').order('created_at', { ascending: false }),
      safeSelect(admin, 'user_library', 'user_id,story_id,progress,completed,updated_at,created_at,last_played', { orderBy: 'updated_at', limit: 50000 }),
      safeSelectWithOrderFallback(admin, 'play_events', '*', ['started_at', 'created_at', 'timestamp', 'occurred_at', 'updated_at'], 50000),
      safeSelect(admin, 'stories', 'id,title,genre,duration_mins'),
      safeSelect(admin, 'referrals', '*'),
      listAuthUsers(admin),
      loadTravelInsightPreferences(admin),
    ])

    if (usersRes.error) throw usersRes.error
    const users = usersRes.data || []
    const subscriptions = subsRes.data || []
    const storyById = new Map((stories || []).map((story: any) => [story.id, story]))
    const authById = new Map((authUsers || []).map((authUser: any) => [authUser.id, authUser]))
    const travelPreferenceByUser = new Map((travelPreferencesResult.rows || []).map((row: any) => [row.user_id, row]))

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
      const travelPreference = travelPreferenceByUser.get(user.id)
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
          eventCount: listening.eventCount,
          libraryActivityCount: listening.libraryActivityCount,
        },
        preferences: listening.preferences,
        listeningPatterns: {
          ...listening.patterns,
          travelInsightsSetting: travelPreferencesResult.available
            ? travelInsightsLabel(travelPreference?.mode)
            : 'Not synced',
          travelInsightsMode: travelPreference?.mode || null,
          travelInsightsSource: travelPreference
            ? 'Server synced'
            : travelPreferencesResult.available
              ? 'Not set server-side'
              : 'Not synced - server preference table unavailable',
          travelInsightsUpdatedAt: travelPreference?.updated_at || null,
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
