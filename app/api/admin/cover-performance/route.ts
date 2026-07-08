import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ADMIN_EMAILS = new Set([
  'marc@endless-tales.com',
  'hello.endlesstales@gmail.com',
  'williampostlewaite@icloud.com',
  'm.postlewaite@gmail.com',
])

// Minimum impressions before a TTR is shown — below this the cover is "collecting".
const DEFAULT_IMPRESSION_FLOOR = 100

const ATTRIBUTE_KEYS = ['palette', 'dominant_subject', 'face_visible', 'temperature'] as const

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

type BandRow = { story_id: string; page: string; position_band: string; impressions?: number; taps?: number }

export async function GET(req: NextRequest) {
  try {
    if (!(await requireAdmin(req))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const floorParam = Number(req.nextUrl.searchParams.get('floor'))
    const floor = Number.isFinite(floorParam) && floorParam > 0 ? Math.round(floorParam) : DEFAULT_IMPRESSION_FLOOR

    const { admin } = clients()

    const [impRes, tapRes, storiesRes] = await Promise.all([
      admin.from('cover_impression_bands').select('story_id, page, position_band, impressions').limit(20000),
      admin.from('cover_tap_bands').select('story_id, page, position_band, taps').limit(20000),
      admin.from('stories').select('id, title, genre, cover_url, cover_attributes').not('cover_url', 'is', null).limit(2000),
    ])

    if (impRes.error) throw new Error(`cover_impression_bands: ${impRes.error.message}`)
    if (tapRes.error) throw new Error(`cover_tap_bands: ${tapRes.error.message}`)
    if (storiesRes.error) throw new Error(`stories: ${storiesRes.error.message}`)

    const storyMeta = new Map(
      (storiesRes.data || []).map(s => [s.id, { title: s.title, genre: s.genre, cover_url: s.cover_url, cover_attributes: s.cover_attributes || null }])
    )

    // cell key: story|page|band
    type Cell = {
      story_id: string
      page: string
      position_band: string
      impressions: number
      taps: number
    }
    const cells = new Map<string, Cell>()
    const upsert = (row: BandRow) => {
      const key = `${row.story_id}|${row.page}|${row.position_band}`
      const cell = cells.get(key) || {
        story_id: row.story_id,
        page: row.page,
        position_band: row.position_band,
        impressions: 0,
        taps: 0,
      }
      cell.impressions += row.impressions || 0
      cell.taps += row.taps || 0
      cells.set(key, cell)
    }
    ;(impRes.data || []).forEach(upsert)
    ;(tapRes.data || []).forEach(upsert)

    const rows = Array.from(cells.values()).map(cell => {
      const meta = storyMeta.get(cell.story_id)
      const aboveFloor = cell.impressions >= floor
      return {
        ...cell,
        title: meta?.title || 'Unknown story',
        genre: meta?.genre || null,
        cover_url: meta?.cover_url || null,
        cover_attributes: meta?.cover_attributes || null,
        ttr: aboveFloor ? cell.taps / cell.impressions : null,
        collecting: !aboveFloor,
      }
    })

    rows.sort((a, b) => {
      if (a.page !== b.page) return a.page.localeCompare(b.page)
      if (a.position_band !== b.position_band) return a.position_band.localeCompare(b.position_band)
      return (b.ttr ?? -1) - (a.ttr ?? -1)
    })

    // Attribute rollups: total impressions/taps across stories grouped by each
    // attribute value ("what KIND of cover wins"). Floor applies to the group.
    const storyTotals = new Map<string, { impressions: number; taps: number }>()
    cells.forEach(cell => {
      const totals = storyTotals.get(cell.story_id) || { impressions: 0, taps: 0 }
      totals.impressions += cell.impressions
      totals.taps += cell.taps
      storyTotals.set(cell.story_id, totals)
    })

    const attributes: Record<string, Record<string, { impressions: number; taps: number; stories: number; ttr: number | null; collecting: boolean }>> = {}
    for (const key of ATTRIBUTE_KEYS) attributes[key] = {}

    storyTotals.forEach((totals, storyId) => {
      const attrs = storyMeta.get(storyId)?.cover_attributes as Record<string, unknown> | null
      if (!attrs) return
      for (const key of ATTRIBUTE_KEYS) {
        const raw = attrs[key]
        if (raw === undefined || raw === null) continue
        const value = String(raw)
        const bucket = attributes[key][value] || { impressions: 0, taps: 0, stories: 0, ttr: null, collecting: true }
        bucket.impressions += totals.impressions
        bucket.taps += totals.taps
        bucket.stories += 1
        attributes[key][value] = bucket
      }
    })

    for (const key of ATTRIBUTE_KEYS) {
      for (const value of Object.keys(attributes[key])) {
        const bucket = attributes[key][value]
        bucket.collecting = bucket.impressions < floor
        bucket.ttr = bucket.collecting ? null : bucket.taps / bucket.impressions
      }
    }

    const taggedStories = (storiesRes.data || []).filter(s => s.cover_attributes).length

    return NextResponse.json({
      floor,
      totalImpressions: rows.reduce((sum, r) => sum + r.impressions, 0),
      totalTaps: rows.reduce((sum, r) => sum + r.taps, 0),
      taggedStories,
      storiesWithCovers: (storiesRes.data || []).length,
      rows,
      attributes,
    })
  } catch (err) {
    console.error('[cover-performance] error:', err)
    return NextResponse.json({ error: String(err instanceof Error ? err.message : err) }, { status: 500 })
  }
}
