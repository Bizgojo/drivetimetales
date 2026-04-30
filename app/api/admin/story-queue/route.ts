import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

const DATA_DIR = path.join(process.cwd(), '.admin-data')
const DATA_FILE = path.join(DATA_DIR, 'story-queue.json')

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
}

function ensureQueueFile(operation: string) {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true })
    if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, '[]', 'utf8')
  } catch (err) {
    console.error(`[story-queue] ${operation}: failed to ensure queue file`, err)
    throw new Error('Failed to initialize story queue storage')
  }
}

function readItems(operation: string): QueueItem[] {
  ensureQueueFile(operation)
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf8')
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch (err) {
    console.error(`[story-queue] ${operation}: failed to read or parse queue file`, err)
    throw new Error('Failed to read story queue storage')
  }
}

function writeItems(items: QueueItem[], operation: string) {
  ensureQueueFile(operation)
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(items, null, 2), 'utf8')
  } catch (err) {
    console.error(`[story-queue] ${operation}: failed to write queue file`, err)
    throw new Error('Failed to write story queue storage')
  }
}

export async function GET(req: NextRequest) {
  try {
    const items = readItems('GET')
    const id = req.nextUrl.searchParams.get('id')
    if (id) {
      const item = items.find((x) => x.id === id) || null
      return NextResponse.json({ item })
    }
    return NextResponse.json({ items })
  } catch (err: any) {
    console.error('[story-queue] GET failed:', err)
    return NextResponse.json({ error: err?.message || 'Failed to load queue items' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const items = readItems('POST')
    const now = new Date().toISOString()

    const item: QueueItem = {
      id: body.id || `queue_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      storyId: body.storyId || '',
      title: body.title || 'Untitled Story Idea',
      premise: body.premise || '',
      setting: body.setting || '',
      primaryGenre: body.primaryGenre || '',
      secondaryGenre: body.secondaryGenre || '',
      tertiaryGenre: body.tertiaryGenre || '',
      duration: body.duration || '15 min',
      authorTarget: body.authorTarget || '',
      notes: body.notes || '',
      status: body.status || 'queued',
      createdAt: body.createdAt || now,
      updatedAt: now,
    }

    items.unshift(item)
    writeItems(items, 'POST')

    return NextResponse.json({ success: true, item })
  } catch (err: any) {
    console.error('[story-queue] POST failed:', err)
    return NextResponse.json({ error: err?.message || 'Failed to create queue item' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json()
    const items = readItems('PATCH')

    const idx = items.findIndex((x) => x.id === body.id)
    if (idx === -1) {
      return NextResponse.json({ error: 'Queue item not found' }, { status: 404 })
    }

    items[idx] = {
      ...items[idx],
      ...body,
      id: items[idx].id,
      updatedAt: new Date().toISOString(),
    }

    writeItems(items, 'PATCH')
    return NextResponse.json({ success: true, item: items[idx] })
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

    const items = readItems('DELETE')
    const filtered = items.filter((x) => x.id !== id)
    writeItems(filtered, 'DELETE')

    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error('[story-queue] DELETE failed:', err)
    return NextResponse.json({ error: err?.message || 'Failed to delete queue item' }, { status: 500 })
  }
}
