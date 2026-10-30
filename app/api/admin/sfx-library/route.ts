/**
 * SFX-REVIEW-001 (Marc 2026-10-30): "is there a list of sounds in our new
 * sound database that I can hear and approve?" Admin-only.
 *   GET  → every library sound with its public URL, category and review status
 *   POST { updates: [{ id, status: 'approved' | 'rejected' | null }] }
 *        → writes the status into sfx-library/manifest.json
 * Only 'approved' sounds are used by the pipeline (lib/sfxLibrary.ts).
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { SFX_LIBRARY_MANIFEST, sfxCategory, type SfxLibraryManifest } from '@/lib/sfxLibrary'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ADMIN_EMAILS = new Set([
  'marc@endless-tales.com',
  'hello.endlesstales@gmail.com',
  'williampostlewaite@icloud.com',
  'm.postlewaite@gmail.com',
])

function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
}

async function isAdmin(): Promise<boolean> {
  const cookieStore = cookies()
  const authClient = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} },
  })
  const { data: { user } } = await authClient.auth.getUser()
  const email = (user?.email || '').toLowerCase()
  return Boolean(email && ADMIN_EMAILS.has(email))
}

async function readManifest(): Promise<SfxLibraryManifest> {
  const { data, error } = await admin().storage.from('audio').download(SFX_LIBRARY_MANIFEST)
  if (error || !data) return { version: 1, updatedAt: '', entries: [] }
  return JSON.parse(await data.text()) as SfxLibraryManifest
}

export async function GET() {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Admin only' }, { status: 403 })
  const manifest = await readManifest()
  const base = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/audio`
  return NextResponse.json({
    updatedAt: manifest.updatedAt,
    entries: manifest.entries.map((e) => ({
      id: e.id,
      name: e.name,
      durationSec: e.durationSec ?? null,
      source: e.source || null,
      category: sfxCategory(e),
      status: e.status || null,
      url: `${base}/${e.path}`,
    })),
  }, { headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(req: NextRequest) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Admin only' }, { status: 403 })
  const body = await req.json().catch(() => null)
  const updates = Array.isArray(body?.updates) ? body.updates : []
  if (!updates.length || updates.length > 500) return NextResponse.json({ error: 'updates: 1–500 items' }, { status: 400 })
  const manifest = await readManifest()
  const byId = new Map(manifest.entries.map((e) => [e.id, e]))
  const now = new Date().toISOString()
  let changed = 0
  for (const u of updates) {
    const entry = byId.get(String(u?.id || ''))
    const status = u?.status === 'approved' || u?.status === 'rejected' ? u.status : null
    if (!entry) continue
    if (status) { entry.status = status; entry.reviewedAt = now } else { delete entry.status; delete entry.reviewedAt }
    changed += 1
  }
  manifest.updatedAt = now
  const { error } = await admin().storage.from('audio').upload(SFX_LIBRARY_MANIFEST, Buffer.from(JSON.stringify(manifest, null, 1)), { contentType: 'application/json', upsert: true })
  if (error) return NextResponse.json({ error: `Could not save: ${error.message}` }, { status: 500 })
  return NextResponse.json({ ok: true, changed })
}
