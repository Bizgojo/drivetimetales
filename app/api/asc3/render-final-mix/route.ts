import { NextRequest, NextResponse } from 'next/server'
import { runRenderFinalMix } from './core'

export const maxDuration = 800
export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  let storyIdRaw: string | undefined
  try {
    const body = await req.json()
    storyIdRaw = body?.storyId
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 })
  }
  if (!storyIdRaw) return NextResponse.json({ success: false, error: 'storyId required' }, { status: 400 })
  const result = await runRenderFinalMix(String(storyIdRaw))
  return NextResponse.json(result, { status: result.success ? 200 : 500 })
}
