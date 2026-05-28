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
  status: QueueStatus
  created_at: string
  updated_at: string
  total_episodes?: number | null
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
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    totalEpisodes: row.total_episodes ?? null,
  }
}

function storyIdValue(value: unknown): string | null {
  const clean = String(value || '').trim()
  return clean || null
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
    const body = await req.json()
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
