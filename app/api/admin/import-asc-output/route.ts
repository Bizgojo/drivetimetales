import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { spawnSync } from 'child_process'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const MAX_UPLOAD_MB = 45

function slugify(input: string) {
  return input.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

function normalizeTitle(input: string) {
  return input.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

async function uploadFile(localPath: string, bucket: string, objectPath: string, contentType: string) {
  const fileBuffer = fs.readFileSync(localPath)
  const { error } = await supabase.storage.from(bucket).upload(objectPath, fileBuffer, {
    contentType,
    upsert: true,
  })
  if (error) throw new Error(error.message)

  const { data } = supabase.storage.from(bucket).getPublicUrl(objectPath)
  return data.publicUrl
}

function ensureDeliveryMp3(sourcePath: string) {
  const stat = fs.statSync(sourcePath)
  const sizeMb = stat.size / (1024 * 1024)

  if (sizeMb <= MAX_UPLOAD_MB) {
    return {
      path: sourcePath,
      wasTranscoded: false,
      sizeMb: Number(sizeMb.toFixed(2)),
    }
  }

  const dir = path.dirname(sourcePath)
  const base = path.basename(sourcePath, path.extname(sourcePath))
  const deliveryPath = path.join(dir, `${base}_delivery_96k.mp3`)

  const ffmpeg = spawnSync('ffmpeg', [
    '-y',
    '-i', sourcePath,
    '-vn',
    '-ac', '1',
    '-b:a', '96k',
    '-ar', '44100',
    deliveryPath,
  ], { encoding: 'utf8' })

  if (ffmpeg.status !== 0 || !fs.existsSync(deliveryPath)) {
    throw new Error(
      `Final mix is ${sizeMb.toFixed(2)} MB and exceeds upload limit. ` +
      `Also failed to create delivery copy via ffmpeg. stderr: ${ffmpeg.stderr || 'unknown'}`
    )
  }

  const outStat = fs.statSync(deliveryPath)
  return {
    path: deliveryPath,
    wasTranscoded: true,
    sizeMb: Number((outStat.size / (1024 * 1024)).toFixed(2)),
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const title = String(body.title || '').trim()
    if (!title) {
      return NextResponse.json({ success: false, error: 'title required' }, { status: 400 })
    }

    const ascPipelinePath = path.join(os.homedir(), '.asc_pipeline_state.json')
    const headlessPipelinePath = path.join(os.homedir(), '.dtt_headless_pipeline_state.json')

    const candidates = [ascPipelinePath, headlessPipelinePath]
      .filter((p) => fs.existsSync(p))
      .map((p) => ({ path: p, data: JSON.parse(fs.readFileSync(p, 'utf8')) }))

    if (candidates.length === 0) {
      return NextResponse.json({ success: false, error: 'ASC pipeline state not found' }, { status: 404 })
    }

    const normalizedTitle = title.trim().toLowerCase()
    const matching = candidates.find((c) =>
      String(c.data?.story_title || '').trim().toLowerCase() === normalizedTitle
    )

    const selected = matching || candidates[0]
    const pipelinePath = selected.path
    const pipeline = selected.data
    const finalMix = pipeline.final_mix || ''
    const coverFile = pipeline.cover_file || ''
    const storyTitle = String(pipeline.story_title || '').trim()

    if (!storyTitle) {
      return NextResponse.json({ success: false, error: 'ASC pipeline story_title missing' }, { status: 400 })
    }

    if (normalizeTitle(storyTitle) !== normalizeTitle(title)) {
      return NextResponse.json(
        {
          success: false,
          error: `ASC pipeline state is for "${storyTitle}", not "${title}". Run the ASC pipeline for the current story first.`,
        },
        { status: 400 }
      )
    }

    if (!finalMix || !fs.existsSync(finalMix)) {
      return NextResponse.json({ success: false, error: 'Final mix not found in ASC pipeline state' }, { status: 400 })
    }

    const storySlug = slugify(storyTitle)
    const delivery = ensureDeliveryMp3(finalMix)

    const audio_url = await uploadFile(
      delivery.path,
      'audio',
      `asc/${storySlug}/final.mp3`,
      'audio/mpeg'
    )

    let cover_url = ''
    if (coverFile && fs.existsSync(coverFile)) {
      cover_url = await uploadFile(
        coverFile,
        'audio',
        `asc/${storySlug}/cover.jpg`,
        'image/jpeg'
      )
    }

    return NextResponse.json({
      success: true,
      title: storyTitle,
      audio_url,
      cover_url,
      final_mix: finalMix,
      uploaded_audio_path: delivery.path,
      audio_size_mb: delivery.sizeMb,
      transcoded_for_delivery: delivery.wasTranscoded,
      cover_file: coverFile || '',
      source: pipelinePath,
    })
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || 'Failed to import ASC output' },
      { status: 500 }
    )
  }
}
