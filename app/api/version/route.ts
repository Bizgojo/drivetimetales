// APP-UPDATE-001: the version of the build this server is running.
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  return NextResponse.json(
    { version: process.env.NEXT_PUBLIC_APP_VERSION || '' },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
