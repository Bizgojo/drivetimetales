import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { spawn } from 'child_process'

export const runtime = 'nodejs'

const JOB_DIR = path.join(os.homedir(), '.drivetimetales_jobs')

function ensureJobDir() {
  fs.mkdirSync(JOB_DIR, { recursive: true })
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    const storyId = String(body.storyId || '').trim()
    const title = String(body.title || '').trim()
    const script = String(body.script || '').trim()
    const queueId = String(body.queueId || '').trim()

    if (!storyId) {
      return NextResponse.json({ success: false, error: 'storyId required' }, { status: 400 })
    }
    if (!title) {
      return NextResponse.json({ success: false, error: 'title required' }, { status: 400 })
    }
    if (!script) {
      return NextResponse.json({ success: false, error: 'script required' }, { status: 400 })
    }

    ensureJobDir()
    const jobId = `ascjob_${Date.now()}`
    const jobPath = path.join(JOB_DIR, `${jobId}.json`)

    const payload = {
      jobId,
      storyId,
      title,
      queueId,
      script,
      status: 'queued',
      phase: 'queued',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }

    fs.writeFileSync(jobPath, JSON.stringify(payload, null, 2), 'utf8')

    const runner = path.join(process.cwd(), 'scripts', 'run_asc_job.py')
    const child = spawn('python3', [runner, jobId], {
      detached: true,
      stdio: 'ignore',
    })
    child.unref()

    return NextResponse.json({
      success: true,
      jobId,
      status: 'queued',
      phase: 'queued',
      message: 'Headless ASC production job queued',
    })
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || 'Failed to start headless ASC production' },
      { status: 500 }
    )
  }
}
