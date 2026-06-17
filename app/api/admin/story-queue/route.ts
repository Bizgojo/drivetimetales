import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

type QueueStatus = 'queued' | 'in_v2' | 'ready_for_asc' | 'published'

type QueueItem = {
  id: string
  storyId?: string
  title: string
  premise: string
  setting: string
  primaryGenre: string
  secondaryGenre: string
  tertiaryGenre: string
  duration: string
  authorTarget: string
  notes: string
  authorized: boolean
  bible?: string | null
  releasedToHal: boolean
  releasedToHalAt?: string | null
  status: QueueStatus
  createdAt: string
  updatedAt: string
  totalEpisodes?: number | null
}

type QueueRow = {
  id: string
  story_id: string | null
  title: string
  premise: string
  setting: string
  primary_genre: string
  secondary_genre: string
  tertiary_genre: string
  duration: string
  author_target: string
  notes: string
  authorized: boolean
  bible: string | null
  released_to_hal?: boolean | null
  released_to_hal_at?: string | null
  status: QueueStatus
  created_at: string
  updated_at: string
  total_episodes?: number | null
}

type BibleImportResult = {
  imported: number
  total: number
  skipped: Array<{ index: number; reason: string }>
}

function toItem(row: QueueRow): QueueItem {
  return {
    id: row.id,
    storyId: row.story_id || '',
    title: row.title,
    premise: row.premise,
    setting: row.setting,
    primaryGenre: row.primary_genre,
    secondaryGenre: row.secondary_genre,
    tertiaryGenre: row.tertiary_genre,
    duration: row.duration,
    authorTarget: row.author_target,
    notes: row.notes,
    authorized: row.authorized === true,
    bible: row.bible || null,
    releasedToHal: row.released_to_hal === true,
    releasedToHalAt: row.released_to_hal_at || null,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    totalEpisodes: row.total_episodes ?? null,
  }
}

function cleanString(value: unknown): string {
  return String(value || '').trim()
}

function storyIdValue(value: unknown): string | null {
  const clean = cleanString(value)
  return clean || null
}

function totalEpisodesForBible(bible: any): number {
  if (cleanString(bible?.type).toLowerCase() === 'standalone') return 1
  const count = Number(bible?.total_episodes)
  return Number.isFinite(count) && count > 0 ? Math.floor(count) : 1
}

function notesForBibleImport(bible: any, totalEpisodes: number): string {
  const type = totalEpisodes > 1 ? 'series' : 'standalone'
  const title = cleanString(bible?.title)

  return [
    'Bible Import:',
    `Type: ${type}`,
    'Let Claude create titles: false',
    `Story title: ${type === 'standalone' ? title : ''}`,
    `Series title: ${type === 'series' ? title : ''}`,
    `Total episodes: ${totalEpisodes}`,
  ].join('\n')
}

function createBibleRow(bible: any, index: number): QueueRow {
  const now = new Date().toISOString()
  const totalEpisodes = totalEpisodesForBible(bible)
  const targetLength = cleanString(bible?.target_length_min)

  return {
    id: `queue_${Date.now()}_${index}_${Math.random().toString(36).slice(2, 8)}`,
    story_id: null,
    title: cleanString(bible?.title),
    premise: cleanString(bible?.premise) || cleanString(bible?.logline),
    setting: cleanString(bible?.setting_rules),
    primary_genre: cleanString(bible?.genre),
    secondary_genre: '',
    tertiary_genre: '',
    duration: targetLength ? `${targetLength} min` : '15 min',
    author_target: '',
    notes: notesForBibleImport(bible, totalEpisodes),
    authorized: false,
    bible: JSON.stringify(bible),
    released_to_hal: false,
    released_to_hal_at: null,
    status: 'queued',
    created_at: now,
    updated_at: now,
    total_episodes: totalEpisodes,
  }
}

function normalizeBibleImport(source: any[]): { rows: QueueRow[]; result: BibleImportResult } {
  const skipped: BibleImportResult['skipped'] = []
  const rows: QueueRow[] = []

  source.forEach((bible: any, index: number) => {
    const title = cleanString(bible?.title)
    const genre = cleanString(bible?.genre)

    if (!title || !genre) {
      const missing = [
        !title ? 'title' : '',
        !genre ? 'genre' : '',
      ].filter(Boolean).join(' and ')
      skipped.push({ index: index + 1, reason: `Missing ${missing}` })
      return
    }

    rows.push(createBibleRow(bible, index))
  })

  return {
    rows,
    result: {
      imported: rows.length,
      total: source.length,
      skipped,
    },
  }
}

function createRow(body: any): QueueRow {
  const now = new Date().toISOString()
  const rawEpisodes = body.totalEpisodes ?? body.total_episodes
  const totalEpisodes = rawEpisodes !== undefined && rawEpisodes !== null
    ? (Number.isFinite(Number(rawEpisodes)) ? Math.floor(Number(rawEpisodes)) : null)
    : null
  return {
    id: body.id || `queue_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    story_id: storyIdValue(body.storyId),
    title: body.title || 'Untitled Story Idea',
    premise: body.premise || '',
    setting: body.setting || '',
    primary_genre: body.primaryGenre || '',
    secondary_genre: body.secondaryGenre || '',
    tertiary_genre: body.tertiaryGenre || '',
    duration: body.duration || '15 min',
    author_target: body.authorTarget || '',
    notes: body.notes || '',
    authorized: body.authorized === true,
    bible: body.bible || null,
    status: body.status || 'queued',
    created_at: body.createdAt || now,
    updated_at: now,
    total_episodes: totalEpisodes,
  }
}

function patchRow(body: any): Partial<QueueRow> {
  const patch: Partial<QueueRow> = {
    updated_at: new Date().toISOString(),
  }

  if ('storyId' in body) patch.story_id = storyIdValue(body.storyId)
  if ('title' in body) patch.title = body.title || 'Untitled Story Idea'
  if ('premise' in body) patch.premise = body.premise || ''
  if ('setting' in body) patch.setting = body.setting || ''
  if ('primaryGenre' in body) patch.primary_genre = body.primaryGenre || ''
  if ('secondaryGenre' in body) patch.secondary_genre = body.secondaryGenre || ''
  if ('tertiaryGenre' in body) patch.tertiary_genre = body.tertiaryGenre || ''
  if ('duration' in body) patch.duration = body.duration || '15 min'
  if ('authorTarget' in body) patch.author_target = body.authorTarget || ''
  if ('notes' in body) patch.notes = body.notes || ''
  if ('authorized' in body) patch.authorized = body.authorized === true
  if ('bible' in body) patch.bible = body.bible || null
  if ('releasedToHal' in body || 'released_to_hal' in body) patch.released_to_hal = (body.releasedToHal ?? body.released_to_hal) === true
  if ('releasedToHalAt' in body || 'released_to_hal_at' in body) {
    const releasedAt = body.releasedToHalAt ?? body.released_to_hal_at
    patch.released_to_hal_at = releasedAt ? String(releasedAt) : null
  }
  if ('status' in body) patch.status = body.status || 'queued'
  if ('totalEpisodes' in body || 'total_episodes' in body) {
    const rawEpisodes = body.totalEpisodes ?? body.total_episodes
    patch.total_episodes = rawEpisodes !== undefined && rawEpisodes !== null
      ? (Number.isFinite(Number(rawEpisodes)) ? Math.floor(Number(rawEpisodes)) : null)
      : null
  }

  return patch
}

export async function GET(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get('id')

    if (id) {
      const { data, error } = await supabase
        .from('story_queue_items')
        .select('*')
        .eq('id', id)
        .maybeSingle()

      if (error) throw error
      return NextResponse.json({ item: data ? toItem(data as QueueRow) : null })
    }

    const { data, error } = await supabase
      .from('story_queue_items')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) throw error
    return NextResponse.json({ items: (data || []).map((row) => toItem(row as QueueRow)) })
  } catch (err: any) {
    console.error('[story-queue] GET failed:', err)
    return NextResponse.json({ error: err?.message || 'Failed to load queue items' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    let body: any
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
    }

    if (body?.action === 'importBibles' || Array.isArray(body) || Array.isArray(body?.bibles)) {
      const bibles = Array.isArray(body) ? body : Array.isArray(body.bibles) ? body.bibles : []
      const { rows, result } = normalizeBibleImport(bibles)

      if (!result.total) {
        return NextResponse.json({ error: 'No bibles found to import' }, { status: 400 })
      }

      if (!rows.length) {
        return NextResponse.json({ success: true, items: [], result })
      }

      const { data, error } = await supabase
        .from('story_queue_items')
        .insert(rows)
        .select('*')

      if (error) throw error
      return NextResponse.json({
        success: true,
        items: (data || []).map((row) => toItem(row as QueueRow)),
        result,
      })
    }

    const row = createRow(body)

    const { data, error } = await supabase
      .from('story_queue_items')
      .insert(row)
      .select('*')
      .single()

    if (error) throw error
    return NextResponse.json({ success: true, item: toItem(data as QueueRow) })
  } catch (err: any) {
    console.error('[story-queue] POST failed:', err)
    return NextResponse.json({ error: err?.message || 'Failed to create queue item' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json()
    const id = String(body.id || '').trim()

    if (!id) {
      return NextResponse.json({ error: 'Missing id' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('story_queue_items')
      .update(patchRow(body))
      .eq('id', id)
      .select('*')
      .maybeSingle()

    if (error) throw error
    if (!data) {
      return NextResponse.json({ error: 'Queue item not found' }, { status: 404 })
    }

    return NextResponse.json({ success: true, item: toItem(data as QueueRow) })
  } catch (err: any) {
    console.error('[story-queue] PATCH failed:', err)
    return NextResponse.json({ error: err?.message || 'Failed to update queue item' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get('id')
    if (!id) {
      return NextResponse.json({ error: 'Missing id' }, { status: 400 })
    }

    const { error } = await supabase
      .from('story_queue_items')
      .delete()
      .eq('id', id)

    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error('[story-queue] DELETE failed:', err)
    return NextResponse.json({ error: err?.message || 'Failed to delete queue item' }, { status: 500 })
  }
}
