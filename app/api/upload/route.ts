import { NextRequest, NextResponse } from 'next/server'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

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

// POST /api/upload - Get a presigned URL for uploading
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { filename, contentType, folder } = body
    
    if (!filename) {
      return NextResponse.json({ error: 'Filename is required' }, { status: 400 })
    }
    
    // Determine folder
    const folderPath = folder || 'audio'
    const key = `${folderPath}/${filename}`
    
    // Generate presigned URL for upload (valid for 1 hour)
    const command = new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      ContentType: contentType || 'audio/mpeg',
    })
    
    const presignedUrl = await getSignedUrl(r2Client, command, { expiresIn: 3600 })
    
    // Return the presigned URL and the final key
    return NextResponse.json({
      uploadUrl: presignedUrl,
      key: key,
      publicUrl: `${process.env.R2_PUBLIC_URL}/${key}`,
    })
  } catch (error) {
    console.error('Upload API error:', error)
    return NextResponse.json({ error: 'Failed to generate upload URL' }, { status: 500 })
  }
}

// PUT /api/upload - Direct upload (for smaller files)
export async function PUT(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File
    const folder = formData.get('folder') as string || 'audio'
    const customName = formData.get('filename') as string
    
    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }
    
    // Generate filename
    const filename = customName || `${Date.now()}-${file.name}`
    const key = `${folder}/${filename}`
    
    // Read file as buffer
    const buffer = Buffer.from(await file.arrayBuffer())
    
    // Upload to R2
    await r2Client.send(
      new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: key,
        Body: buffer,
        ContentType: file.type || 'audio/mpeg',
      })
    )
    
    return NextResponse.json({
      success: true,
      key: key,
      publicUrl: `${process.env.R2_PUBLIC_URL}/${key}`,
    })
  } catch (error) {
    console.error('Upload PUT error:', error)
    return NextResponse.json({ error: 'Failed to upload file' }, { status: 500 })
  }
}
