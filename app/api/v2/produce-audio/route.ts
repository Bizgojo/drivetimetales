import { NextResponse } from 'next/server'
import { promises as fs } from 'fs'
import path from 'path'
import { spawn } from 'child_process'

export const runtime = 'nodejs'

function slugify(input: string) {
  return (input || 'untitled')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
}

export async function POST(req: Request) {

  // ADMIN_ASC_HANDOFF_ONLY
  // Do not launch standalone ASC from the API route.
  // Return handoff data for the Admin ASC page instead.
  try {
    const body = await req.json()

    return NextResponse.json({
      success: true,
      adminAsc: true,
      storyId: body?.storyId || '',
      handoffPath: body?.handoffPath || '',
      message: 'Admin ASC handoff prepared'
    })
  } catch (e) {
    return NextResponse.json({
      success: true,
      adminAsc: true,
      storyId: '',
      handoffPath: '',
      message: 'Admin ASC handoff prepared'
    })
  }


  try {
    const body = await req.json()
    const storyId = String(body.storyId || '').trim()
    const title = String(body.title || 'Untitled Story').trim()
    const script = String(body.script || '').trim()

    if (!storyId) {
      return NextResponse.json({ success: false, error: 'storyId is required' }, { status: 400 })
    }

    if (!script) {
      return NextResponse.json({ success: false, error: 'script is required' }, { status: 400 })
    }

    const handoffDir = path.join(process.env.HOME || '', 'Projects', 'ASC', 'Handoff')
    await fs.mkdir(handoffDir, { recursive: true })

    const safeTitle = slugify(title)
    const filename = `${safeTitle}__${storyId}.md`
    const handoffPath = path.join(handoffDir, filename)

    const payload = [
      `TITLE: ${title}`,
      `STORY_ID: ${storyId}`,
      `CREATED_AT: ${new Date().toISOString()}`,
      ``,
      `---`,
      `VALIDATED SCRIPT HANDOFF FOR ASC`,
      `---`,
      ``,
      script,
      ``
    ].join('\n')

    await fs.writeFile(handoffPath, payload, 'utf8')

    const launcher = path.join(process.env.HOME || '', 'Projects', 'ASC', 'launch_asc.command')

    const child = spawn('open', [launcher], {
      detached: true,
      stdio: 'ignore'
    })
    child.unref()

    return NextResponse.json({
      success: true,
      handoffPath,
      launched: true,
      nextStatus: 'audio_pending'
    })
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}
