// FINANCE-STATEMENT-001 — POST /api/admin/finance/sync: on-demand Mercury copy (last 45 days).
// Admin-only. Read-only against Mercury; upserts finance_transactions.
import { NextResponse } from 'next/server'
import { adminAccess } from '@/lib/admin-center/auth'
import { db } from '@/lib/admin-center/store'
import { syncMercury } from '@/lib/finance/mercury-sync'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

export async function POST(request: Request) {
  const denied = await adminAccess(request); if (denied) return denied
  const token = process.env.MERCURY_API_TOKEN
  if (!token) return NextResponse.json({ error: 'MERCURY_API_TOKEN is not set on the server. Ask Orion to add the read-only Mercury token.' }, { status: 503 })
  try {
    const since = new Date(Date.now() - 45 * 86400000).toISOString().slice(0, 10)
    const r = await syncMercury(db() as any, { token, since })
    return NextResponse.json({ success: true, message: `Synced ${r.written} Mercury transactions since ${since}.` })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Mercury sync failed' }, { status: 502 })
  }
}
