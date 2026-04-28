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
    const seriesId = String(body.seriesId || '').trim()
    const title = String(body.title || '').trim()
    const episodes = Array.isArray(body.episodes) ? body.episodes : []

    if (!seriesId) {
      return NextResponse.json({ success: false, error: 'seriesId required' }, { status: 400 })
    }
    if (!title) {
      return NextResponse.json({ success: false, error: 'title required' }, { status: 400 })
    }
    if (!episodes.length) {
      return NextResponse.json({ success: false, error: 'episodes required' }, { status: 400 })
    }

    ensureJobDir()

    const packageJobId = `ascpkg_${Date.now()}`
    const packageJobPath = path.join(JOB_DIR, `${packageJobId}.json`)
    const jobs = []
    const preparedEpisodes = []

    for (let index = 0; index < episodes.length; index += 1) {
      const episode = episodes[index]
      const storyId = String(episode.storyId || '').trim()
      const episodeTitle = String(episode.title || '').trim()
      const script = String(episode.script || '').trim()
      const episodeNumber = Number(episode.episodeNumber || index + 1)

      if (!storyId || !episodeTitle || !script) {
        return NextResponse.json({
          success: false,
          error: `Episode ${episodeNumber} missing storyId, title, or script`,
          failedEpisode: episodeNumber,
        }, { status: 400 })
      }

      const jobId = `${packageJobId}_${String(index + 1).padStart(2, '0')}`
      preparedEpisodes.push({
        jobId,
        storyId,
        title: episodeTitle,
        queueId: String(episode.queueId || ''),
        script,
        packageSeriesId: seriesId,
        packageTitle: title,
        packageEpisodeNumber: episodeNumber,
        packageEpisodeCount: episodes.length,
      })

      fs.writeFileSync(path.join(JOB_DIR, `${jobId}.json`), JSON.stringify({
        jobId,
        storyId,
        title: episodeTitle,
        queueId: String(episode.queueId || ''),
        script,
        packageSeriesId: seriesId,
        packageTitle: title,
        packageEpisodeNumber: episodeNumber,
        packageEpisodeCount: episodes.length,
        status: 'queued',
        phase: 'queued',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }, null, 2), 'utf8')

      jobs.push({
        jobId,
        storyId,
        title: episodeTitle,
        episodeNumber,
        status: 'queued',
        phase: 'queued',
      })
    }

    const now = new Date().toISOString()
    fs.writeFileSync(packageJobPath, JSON.stringify({
      packageJobId,
      seriesId,
      title,
      episodes: preparedEpisodes,
      jobs,
      status: 'queued',
      phase: 'queued',
      createdAt: now,
      updatedAt: now,
    }, null, 2), 'utf8')

    const runner = path.join(process.cwd(), 'scripts', 'run_asc_package_job.py')
    const child = spawn('python3', [runner, packageJobId], {
      detached: true,
      stdio: 'ignore',
    })
    child.unref()

    return NextResponse.json({
      success: true,
      packageJobId,
      seriesId,
      title,
      jobs,
      status: 'queued',
      phase: 'queued',
      message: `Queued package ASC production job for ${jobs.length} episodes`,
    })
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || 'Failed to start package ASC production' },
      { status: 500 }
    )
  }
}
