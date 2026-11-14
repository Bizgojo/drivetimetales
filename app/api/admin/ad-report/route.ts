// app/api/admin/ad-report/route.ts — AD-REPORT-001 data source for /admin/ad-report.
//
// Per ad (utm_campaign / utm_term / utm_content = Meta campaign, ad set and ad
// ids): signups and how far those listeners went — 60 seconds, Episode 1
// finished, Episode 3 reached, series finished, trial, paid. Aggregation is in
// lib/adReport.ts (pure, unit-tested). Read-only; test accounts excluded.
//
// AUTH: same admin check as /api/admin/listen-report (Bearer token or Supabase
// session cookie, email allowlist). Reads use the service role server-side.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { buildAdReport, AdPlayRow, AdUserRow } from '@/lib/adReport'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ADMIN_EMAILS = new Set([
  'marc@endless-tales.com',
  'hello.endlesstales@gmail.com',
  'williampostlewaite@icloud.com',
  'm.postlewaite@gmail.com',
])

const PAGE = 1000
const MAX_USERS = 20000
const ID_CHUNK = 200

function clients() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !anon || !service) throw new Error('Missing Supabase environment')
  return { auth: createClient(url, anon), admin: createClient(url, service, { auth: { persistSession: false } }) }
}

async function requireAdmin(req: NextRequest) {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
  if (token) {
    const { auth } = clients()
    const { data, error } = await auth.auth.getUser(token)
    if (!error && data.user?.email && ADMIN_EMAILS.has(data.user.email.toLowerCase())) return true
  }
  const cookieStore = cookies()
  const authClient = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} },
  })
  const { data: { user } } = await authClient.auth.getUser()
  const email = (user?.email || '').toLowerCase()
  return Boolean(email && ADMIN_EMAILS.has(email))
}

function chunks<T>(list: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size))
  return out
}

export async function GET(req: NextRequest) {
  try {
    if (!(await requireAdmin(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { admin } = clients()
    const daysParam = Number(new URL(req.url).searchParams.get('days') || 30)
    const days = Number.isFinite(daysParam) && daysParam > 0 ? Math.min(daysParam, 3650) : 30
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()

    // 1. Signups in the window.
    const users: AdUserRow[] = []
    for (let from = 0; from < MAX_USERS; from += PAGE) {
      const { data, error } = await admin
        .from('users')
        .select('id,created_at,utm_source,utm_medium,utm_campaign,utm_term,utm_content,trial_started_at,first_paid_date,is_test_account')
        .gte('created_at', since)
        .order('created_at', { ascending: true })
        .range(from, from + PAGE - 1)
      if (error) throw new Error(`users: ${error.message}`)
      users.push(...((data || []) as AdUserRow[]))
      if (!data || data.length < PAGE) break
    }
    const realIds = users.filter((u) => u.is_test_account !== true).map((u) => u.id)

    // 2. Their plays.
    const rawPlays: Array<{ user_id: string; story_id: string | null; series_id: string | null; seconds_played: number | null; progress_pct: number | null }> = []
    for (const ids of chunks(realIds, ID_CHUNK)) {
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await admin
          .from('play_events')
          .select('user_id,story_id,series_id,seconds_played,progress_pct')
          .in('user_id', ids)
          .range(from, from + PAGE - 1)
        if (error) throw new Error(`play_events: ${error.message}`)
        rawPlays.push(...((data || []) as any[]))
        if (!data || data.length < PAGE) break
      }
    }

    // 3. Episode numbers and series sizes/titles.
    const storyIds = Array.from(new Set(rawPlays.map((p) => p.story_id).filter(Boolean) as string[]))
    const episodeOf: Record<string, { n: number | null; series: string | null }> = {}
    for (const ids of chunks(storyIds, ID_CHUNK)) {
      const { data, error } = await admin.from('stories').select('id,episode_number,series_id').in('id', ids)
      if (error) throw new Error(`stories: ${error.message}`)
      for (const s of (data || []) as any[]) episodeOf[s.id] = { n: s.episode_number ?? null, series: s.series_id ?? null }
    }
    const plays: AdPlayRow[] = rawPlays.map((p) => {
      const ep = p.story_id ? episodeOf[p.story_id] : undefined
      return { user_id: p.user_id, series_id: p.series_id || ep?.series || null, episode_number: ep?.n ?? null, seconds_played: p.seconds_played, progress_pct: p.progress_pct }
    })
    const seriesIds = Array.from(new Set(plays.map((p) => p.series_id).filter(Boolean) as string[]))
    const seriesEpisodes: Record<string, number> = {}
    const seriesTitles: Record<string, string> = {}
    for (const ids of chunks(seriesIds, ID_CHUNK)) {
      const { data, error } = await admin.from('series').select('id,title,total_episodes').in('id', ids)
      if (error) throw new Error(`series: ${error.message}`)
      for (const s of (data || []) as any[]) {
        seriesEpisodes[s.id] = Number(s.total_episodes || 0)
        if (s.title) seriesTitles[s.id] = String(s.title)
      }
    }

    const rows = buildAdReport(users, plays, seriesEpisodes, seriesTitles)
    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      days,
      since,
      truncated: users.length >= MAX_USERS,
      signups: realIds.length,
      rows,
    })
  } catch (e: any) {
    console.error('[ad-report]', e?.message || e)
    return NextResponse.json({ error: e?.message || 'ad report failed' }, { status: 500 })
  }
}
