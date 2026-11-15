// app/api/admin/credits/route.ts — CREDITS-WATCH-001.
// GET: the latest saved credit check. GET ?refresh=1: check every service now.
// AUTH: admin session (same allowlist as /admin/ai-spending) or the internal key header.

import { NextRequest, NextResponse } from 'next/server'
import { authorized, client } from '@/lib/ai-spending/auth'
import { readCreditSnapshot, runCreditsWatch } from '@/lib/creditsWatchRun'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

function internalOk(req: NextRequest): boolean {
  const want = String(process.env.ADMIN_INTERNAL_TOKEN || '').trim()
  const got = String(req.headers.get('x-et-internal-key') || '').trim()
  return Boolean(want && got && want === got)
}

export async function GET(req: NextRequest) {
  try {
    if (!internalOk(req) && !(await authorized())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const db = client()
    const refresh = new URL(req.url).searchParams.get('refresh') === '1'
    const snapshot = refresh ? (await runCreditsWatch(db, { force: true })).snapshot : await readCreditSnapshot(db)
    return NextResponse.json({ success: true, snapshot }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'credits check failed' }, { status: 500 })
  }
}
