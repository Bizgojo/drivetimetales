// app/api/admin/analytics/signups/route.ts — Bell Campaign: Signups & Behaviour by Arm
//
// Source: users LEFT JOIN user_library ON user_library.user_id = users.id
//
// User filter:
//   - signup_source = 'bell-invitation'
//   - listen_arm IN (1, 2, 3)  ← stored as integers in the users table
//   - is_test_account IS DISTINCT FROM true  (null passes, false passes, true excluded)
//
// IMPORTANT: users.listen_arm stores INTEGER arm numbers (1, 2, 3), not strings
// like 'bell-arm1'. The display layer maps 1→'Arm 1 (bell-arm1)', etc.
//
// EP2 story ID (759dc525-185c-450f-b249-17e4a525ba60) was identified by querying
// stories WHERE title ILIKE '%Bell Beneath Falls Park%Episode 2%' on 2026-08-13.
// If the story is replaced or the ID changes, update EP2_STORY_ID below.
//
// AUTH: same requireAdmin pattern as listen-report/route.ts.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

const ADMIN_EMAILS = new Set([
  'marc@endless-tales.com',
  'hello.endlesstales@gmail.com',
  'williampostlewaite@icloud.com',
  'm.postlewaite@gmail.com',
])

// EP2: "The Bell Beneath Falls Park — Episode 2: The Seventh Token"
// Found by: SELECT id, title FROM stories WHERE title ILIKE '%seventh token%' (2026-08-13)
const EP2_STORY_ID = '759dc525-185c-450f-b249-17e4a525ba60'

// Bell arm integer keys (users.listen_arm column stores integers, not strings)
const BELL_ARM_INTS = [1, 2, 3] as const
type ArmInt = 1 | 2 | 3

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function clients() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !anon || !service) throw new Error('Missing Supabase environment variables')
  return {
    auth: createClient(url, anon),
    admin: createClient(url, service, { auth: { persistSession: false } }),
  }
}

async function requireAdmin(req: NextRequest): Promise<boolean> {
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
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  )
  const { data: { user } } = await authClient.auth.getUser()
  const email = (user?.email || '').toLowerCase()
  return Boolean(email && ADMIN_EMAILS.has(email))
}

export type SignupsArmData = {
  signups: number
  played: number          // users with at least one user_library row where progress > 0
  completedEP2: number    // users with user_library row for EP2 where completed = true
  avgStoriesStarted: number | null   // avg distinct story_ids with progress > 0 per user
  avgStoriesCompleted: number | null // avg distinct story_ids with completed = true per user
}

export type SignupsResponse = {
  generatedAt: string
  ep2StoryId: string
  arms: Record<ArmInt, SignupsArmData>
}

export async function GET(req: NextRequest) {
  try {
    if (!(await requireAdmin(req))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { admin } = clients()

    // Fetch bell-invitation users
    const { data: rawUsers, error: usersErr } = await admin
      .from('users')
      .select('id, listen_arm, is_test_account')
      .eq('signup_source', 'bell-invitation')
      .in('listen_arm', [...BELL_ARM_INTS])

    if (usersErr) {
      console.error('[analytics/signups] users read error:', usersErr.message)
      return NextResponse.json({ error: usersErr.message }, { status: 500 })
    }

    // Apply is_test_account IS DISTINCT FROM true filter (null passes, false passes, true excluded)
    const users = (rawUsers || []).filter(u => u.is_test_account !== true)

    const userIds = users.map(u => u.id)

    // Fetch user_library rows for these users (all progress > 0 and all completed rows)
    let libraryRows: Array<{ user_id: string; story_id: string; progress: number; completed: boolean }> = []
    if (userIds.length > 0) {
      const { data: libData, error: libErr } = await admin
        .from('user_library')
        .select('user_id, story_id, progress, completed')
        .in('user_id', userIds)

      if (libErr) {
        console.error('[analytics/signups] user_library read error:', libErr.message)
        // Continue with empty library — don't fail the whole report
      } else {
        libraryRows = libData || []
      }
    }

    // Index library rows by user_id
    const libByUser = new Map<string, Array<{ story_id: string; progress: number; completed: boolean }>>()
    for (const row of libraryRows) {
      if (!libByUser.has(row.user_id)) libByUser.set(row.user_id, [])
      libByUser.get(row.user_id)!.push({ story_id: row.story_id, progress: row.progress, completed: row.completed })
    }

    // Compute per-arm metrics
    const initialArm = (): SignupsArmData => ({
      signups: 0,
      played: 0,
      completedEP2: 0,
      avgStoriesStarted: null,
      avgStoriesCompleted: null,
    })

    const armAccum: Record<ArmInt, { data: SignupsArmData; storiesStartedSums: number[]; storiesCompletedSums: number[] }> = {
      1: { data: initialArm(), storiesStartedSums: [], storiesCompletedSums: [] },
      2: { data: initialArm(), storiesStartedSums: [], storiesCompletedSums: [] },
      3: { data: initialArm(), storiesStartedSums: [], storiesCompletedSums: [] },
    }

    for (const user of users) {
      const arm = user.listen_arm as ArmInt
      if (!BELL_ARM_INTS.includes(arm)) continue

      const acc = armAccum[arm]
      acc.data.signups++

      const lib = libByUser.get(user.id) || []
      const started = lib.filter(r => r.progress > 0)
      const completed = lib.filter(r => r.completed === true)

      if (started.length > 0) acc.data.played++

      const completedEP2 = lib.some(r => r.story_id === EP2_STORY_ID && r.completed === true)
      if (completedEP2) acc.data.completedEP2++

      // Count distinct story_ids
      const startedStories = new Set(started.map(r => r.story_id)).size
      const completedStories = new Set(completed.map(r => r.story_id)).size
      acc.storiesStartedSums.push(startedStories)
      acc.storiesCompletedSums.push(completedStories)
    }

    // Finalise averages
    const arms = {} as Record<ArmInt, SignupsArmData>
    for (const arm of BELL_ARM_INTS) {
      const acc = armAccum[arm]
      const n = acc.data.signups
      acc.data.avgStoriesStarted = n > 0
        ? acc.storiesStartedSums.reduce((a, b) => a + b, 0) / n
        : null
      acc.data.avgStoriesCompleted = n > 0
        ? acc.storiesCompletedSums.reduce((a, b) => a + b, 0) / n
        : null
      arms[arm] = acc.data
    }

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      ep2StoryId: EP2_STORY_ID,
      arms,
    } satisfies SignupsResponse)
  } catch (err) {
    console.error('[analytics/signups] failed:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Signups report failed' },
      { status: 500 }
    )
  }
}
