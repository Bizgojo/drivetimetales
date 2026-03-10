import { NextRequest, NextResponse } from 'next/server'
import { execFile } from 'child_process'
import { promisify } from 'util'
import path from 'path'

const execFileAsync = promisify(execFile)

export async function POST(req: NextRequest) {
  try {
    const { storyId, sunoPrompt, title } = await req.json()

    if (!storyId || !sunoPrompt) {
      return NextResponse.json({ success: false, error: 'MISSING_PARAMS', message: 'storyId and sunoPrompt required' }, { status: 400 })
    }

    const scriptPath = path.join(process.cwd(), 'scripts', 'suno-generate.js')

    console.log(`🎵 Starting Suno Playwright generation for story ${storyId}`)

    const { stdout, stderr } = await execFileAsync(
      'node',
      [scriptPath, sunoPrompt, title || 'Background Music', storyId],
      { timeout: 300000 } // 5 min timeout
    )

    console.log('Suno stdout:', stdout.slice(-500))
    if (stderr) console.log('Suno stderr:', stderr.slice(-200))

    // Extract the result URL from stdout
    const urlMatch = stdout.match(/RESULT_URL:(.+)/)
    if (!urlMatch) {
      return NextResponse.json({
        success: false,
        error: 'NO_URL',
        message: stderr || stdout.slice(-300) || 'Suno generation failed — no URL returned',
      }, { status: 500 })
    }

    const musicUrl = urlMatch[1].trim()
    return NextResponse.json({ success: true, musicUrl })

  } catch (err: any) {
    console.error('generate-music error:', err)

    // Check for Firefox session expired
    if (err.message?.includes('Firefox profile not found') || err.message?.includes('cookies.sqlite')) {
      return NextResponse.json({
        success: false,
        error: 'FIREFOX_SESSION_EXPIRED',
        message: 'Firefox Suno session expired. Open suno.com in Firefox to re-authenticate.',
      }, { status: 401 })
    }

    return NextResponse.json({
      success: false,
      error: 'INTERNAL',
      message: err.message || 'Unknown error',
    }, { status: 500 })
  }
}
