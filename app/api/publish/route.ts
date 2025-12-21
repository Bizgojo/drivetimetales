import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'

// R2 Client
const r2Client = new S3Client({
  region: 'auto',
  endpoint: process.env.R2_ENDPOINT!,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
})

const BUCKET_NAME = process.env.R2_BUCKET_NAME!

/**
 * POST /api/publish
 * 
 * Publish a story from Audio Drama Maker to Drive Time Tales
 * 
 * Expects multipart form data with:
 * - metadata: JSON string with story details
 * - audio: MP3 file (full story)
 * - sample: MP3 file (optional, 2-minute sample)
 */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    
    // Get metadata
    const metadataStr = formData.get('metadata') as string
    if (!metadataStr) {
      return NextResponse.json({ error: 'Missing metadata' }, { status: 400 })
    }
    
    let metadata
    try {
      metadata = JSON.parse(metadataStr)
    } catch {
      return NextResponse.json({ error: 'Invalid metadata JSON' }, { status: 400 })
    }
    
    // Validate required fields
    const required = ['title', 'author', 'genre', 'duration_mins']
    for (const field of required) {
      if (!metadata[field]) {
        return NextResponse.json({ error: `Missing required field: ${field}` }, { status: 400 })
      }
    }
    
    // Get audio files
    const audioFile = formData.get('audio') as File
    const sampleFile = formData.get('sample') as File | null
    
    if (!audioFile) {
      return NextResponse.json({ error: 'Missing audio file' }, { status: 400 })
    }
    
    // Generate slug from title
    const slug = metadata.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
    const timestamp = Date.now()
    
    // Upload full audio
    const audioKey = `audio/${slug}-${timestamp}.mp3`
    const audioBuffer = Buffer.from(await audioFile.arrayBuffer())
    
    await r2Client.send(
      new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: audioKey,
        Body: audioBuffer,
        ContentType: 'audio/mpeg',
      })
    )
    
    // Upload sample if provided
    let sampleKey = null
    if (sampleFile) {
      sampleKey = `samples/${slug}-sample-${timestamp}.mp3`
      const sampleBuffer = Buffer.from(await sampleFile.arrayBuffer())
      
      await r2Client.send(
        new PutObjectCommand({
          Bucket: BUCKET_NAME,
          Key: sampleKey,
          Body: sampleBuffer,
          ContentType: 'audio/mpeg',
        })
      )
    }
    
    // Calculate duration label
    const durationMins = metadata.duration_mins
    let durationLabel = `${durationMins} min`
    if (durationMins >= 60) {
      const hours = Math.floor(durationMins / 60)
      const mins = durationMins % 60
      if (mins === 0) {
        durationLabel = hours === 1 ? '1 hr' : `${hours} hr`
      } else {
        durationLabel = `${hours} hr ${mins} min`
      }
    }
    
    // Calculate credits (roughly 1 credit per 15 mins, min 2)
    const credits = metadata.credits || Math.max(2, Math.ceil(durationMins / 15))
    
    // Insert into database
    const supabase = createServerClient()
    
    const { data, error } = await supabase
      .from('stories')
      .insert([{
        title: metadata.title,
        author: metadata.author,
        genre: metadata.genre,
        description: metadata.description || null,
        duration_mins: durationMins,
        duration_label: durationLabel,
        credits: credits,
        color: metadata.color || generateRandomColor(),
        promo_text: metadata.promo_text || null,
        is_new: true,
        is_featured: metadata.is_featured || false,
        audio_url: audioKey,
        sample_url: sampleKey,
      }])
      .select()
      .single()
    
    if (error) {
      console.error('Database error:', error)
      return NextResponse.json({ error: 'Failed to create story in database' }, { status: 500 })
    }
    
    return NextResponse.json({
      success: true,
      story: data,
      audio_url: `${process.env.R2_PUBLIC_URL}/${audioKey}`,
      sample_url: sampleKey ? `${process.env.R2_PUBLIC_URL}/${sampleKey}` : null,
    }, { status: 201 })
    
  } catch (error) {
    console.error('Publish API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// Generate a random gradient color for story cards
function generateRandomColor(): string {
  const colors = [
    'from-purple-600 to-purple-900',
    'from-orange-600 to-orange-900',
    'from-cyan-600 to-cyan-900',
    'from-red-600 to-red-900',
    'from-yellow-600 to-yellow-900',
    'from-pink-600 to-pink-900',
    'from-slate-600 to-slate-800',
    'from-teal-600 to-teal-900',
    'from-amber-700 to-amber-900',
    'from-emerald-700 to-emerald-900',
    'from-indigo-700 to-indigo-900',
    'from-rose-700 to-rose-900',
  ]
  return colors[Math.floor(Math.random() * colors.length)]
}
