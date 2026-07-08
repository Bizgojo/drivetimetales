/**
 * repair-queue cron — DECOMMISSIONED 2026-07-08 per Marc Ruling 1
 *
 * Stories that fail review go to cold storage. No repairs.
 * Hal writes new scripts only. Production never pauses for repairs.
 *
 * This file is kept so existing references do not break, but
 * the cron entry has been removed from vercel.json and this
 * handler will never be invoked by the scheduler.
 */

import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function GET() {
  console.log('[repair-queue-cron] DECOMMISSIONED 2026-07-08 — Marc Ruling 1: no repairs, cold storage only')
  return NextResponse.json(
    {
      decommissioned: true,
      policy: 'Stories that fail review go to cold storage. No repair workflow.',
    },
    { status: 410 },
  )
}

export async function POST() {
  return GET()
}
