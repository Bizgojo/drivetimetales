import { NextRequest, NextResponse } from 'next/server'
import { spawnSync } from 'child_process'
import path from 'path'

export const runtime = 'nodejs'
export const maxDuration = 600 // 10 min

export async function POST(req: NextRequest) {
  try {
    const { storyId } = await req.json()
    if (!storyId) return NextResponse.json({ success: false, error: 'storyId required' }, { status: 400 })

    const scriptPath = path.join(process.cwd(), 'scripts/render-story-mix.js')

    console.log(`🎬 Starting local render for story ${storyId}`)
    const result = spawnSync('node', [scriptPath, storyId], {
      timeout: 600_000,
      encoding: 'utf8',
    })

    if (result.status !== 0) {
      const errMsg = (result.stderr || '').slice(-800)
      console.error('Render failed:', errMsg)
      return NextResponse.json({ success: false, error: errMsg }, { status: 500 })
    }

    const output = (result.stdout || '').trim()
    console.log('Render output:', output.slice(-200))

    // Extract the uploaded URL from the script output
    const urlMatch = output.match(/https:\/\/[^\s]+final_mix[^\s]+\.mp3/)
    const finalMixUrl = urlMatch ? urlMatch[0] : null

    return NextResponse.json({ success: true, finalMixUrl, output: output.slice(-500) })
  } catch (err: any) {
    console.error('render-local error:', err)
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}
