// POST /api/admin/marketing/approvals/[campaignId]/test
// Spec Sec 5 + 6: run the six checks against the current version hash and
// persist the run. Body: { version_hash, destination_url, video_url?,
// preview_base_url?, owner_tested_personally? }

import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

import { requireAdminEmail } from '@/lib/marketing/adminAuth'
import { runAdTests } from '@/lib/marketing/adTests'
import { saveTestRun } from '@/lib/marketing/approvalsStore'
import { randomUUID } from 'crypto'

function noStore(data: unknown, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' },
  })
}

export async function POST(
  req: NextRequest,
  { params }: { params: { campaignId: string } }
) {
  const admin = await requireAdminEmail()
  if (typeof admin !== 'string') return admin
  const { campaignId } = params

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return noStore({ success: false, error: 'Invalid JSON body' }, 400)
  }
  const versionHash = String(body.version_hash || '')
  const destinationUrl = String(body.destination_url || '')
  if (!versionHash || !destinationUrl) {
    return noStore({ success: false, error: 'version_hash + destination_url required' }, 400)
  }

  const runId = randomUUID()
  const previewBaseUrl =
    String(body.preview_base_url || '') ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '')

  const out = await runAdTests({
    runId,
    destinationUrl,
    previewBaseUrl,
    videoUrl: typeof body.video_url === 'string' ? body.video_url : null,
  })

  await saveTestRun({
    runId,
    campaignId,
    versionHash,
    results: out.results,
    ownerTestedPersonally: body.owner_tested_personally === true,
    screenshots: out.screenshots,
  })

  return noStore({
    success: true,
    campaignId,
    run_id: runId,
    version_hash: versionHash,
    tested_by: admin,
    // Spec Sec 6.3: card labels that signup+checkout ran on the preview
    // deployment (Stripe test mode), not production.
    ran_on_preview_deployment: previewBaseUrl || null,
    results: out.results,
    details: out.details,
  })
}
