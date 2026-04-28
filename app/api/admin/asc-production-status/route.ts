import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import os from 'os'
import path from 'path'

export const runtime = 'nodejs'

const JOB_DIR = path.join(os.homedir(), '.drivetimetales_jobs')

export async function GET(req: NextRequest) {
  try {
    const jobId = req.nextUrl.searchParams.get('jobId')
    if (!jobId) {
      return NextResponse.json({ success: false, error: 'jobId required' }, { status: 400 })
    }

    const jobPath = path.join(JOB_DIR, `${jobId}.json`)
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
