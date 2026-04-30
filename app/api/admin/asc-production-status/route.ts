import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import os from 'os'
import path from 'path'

export const runtime = 'nodejs'

function getJobDir() {
  if (process.env.VERCEL || process.env.NODE_ENV === 'production') {
    return path.join(os.tmpdir(), 'drivetimetales_jobs')
  }

  return path.join(os.homedir(), '.drivetimetales_jobs')
}

export async function GET(req: NextRequest) {
  try {
    const jobId = req.nextUrl.searchParams.get('jobId')
    if (!jobId) {
      return NextResponse.json({ success: false, error: 'jobId required' }, { status: 400 })
    }

    const jobPath = path.join(getJobDir(), `${jobId}.json`)
    if (!fs.existsSync(jobPath)) {
      return NextResponse.json({ success: false, error: 'job not found' }, { status: 404 })
    }

    const data = JSON.parse(fs.readFileSync(jobPath, 'utf8'))
    return NextResponse.json({ success: true, job: data })
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || 'Failed to load job status' },
      { status: 500 }
    )
  }
}
