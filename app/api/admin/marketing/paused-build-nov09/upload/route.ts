// POST /api/admin/marketing/paused-build-nov09/upload
// Uploads ONE Hal-captioned mp4 (hook1..hook6) to the Meta ad video library.
// Inert: no ad object, no spend, unpublished. Returns the video ID for wiring
// into the PAUSED build via POST ../paused-build-nov09.
// Refuses: non-hook1..6 hook, non-mp4, >100MB, missing confirmPaused.

import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { requireAdminEmail } from '@/lib/marketing/adminAuth'
import { metaAdsConfigured, uploadPausedVideo } from '@/lib/marketing/metaAds'
import { HOOK_CREATIVES } from '@/lib/marketing/pausedBuildNov09'

const HOOKS = new Set(HOOK_CREATIVES.map((h) => h.hook))
const MAX_BYTES = 100 * 1024 * 1024

function noStore(data: unknown, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' },
  })
}

export async function POST(req: NextRequest) {
  const admin = await requireAdminEmail()
  if (typeof admin !== 'string') return admin

  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return noStore({ success: false, error: 'multipart form with file + hook required' }, 400)
  }
  if (form.get('confirmPaused') !== 'true') {
    return noStore({ success: false, error: 'REFUSED: confirmPaused must be true.' }, 400)
  }
  const hook = String(form.get('hook') || '')
  if (!HOOKS.has(hook)) {
    return noStore({ success: false, error: 'REFUSED: hook must be hook1..hook6.' }, 400)
  }
  const file = form.get('file')
  if (!(file instanceof Blob)) return noStore({ success: false, error: 'file (mp4) required' }, 400)
  const filename = (file as any).name ? String((file as any).name) : `${hook}.mp4`
  if (!/\.mp4$/i.test(filename)) return noStore({ success: false, error: 'REFUSED: mp4 only.' }, 400)
  if (file.size > MAX_BYTES || file.size === 0) {
    return noStore({ success: false, error: 'REFUSED: empty or >100MB file.' }, 400)
  }

  if (!metaAdsConfigured()) {
    return noStore({ success: false, error: 'META_ADS_MANAGEMENT_TOKEN not configured' }, 503)
  }
  try {
    const videoId = await uploadPausedVideo(await file.arrayBuffer(), filename)
    return noStore({ success: true, hook, video_id: videoId, filename, bytes: file.size })
  } catch (err: any) {
    return noStore({ success: false, error: String(err?.message || err).slice(0, 300) }, 502)
  }
}
