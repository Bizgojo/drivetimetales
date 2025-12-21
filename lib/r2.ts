import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

// R2 Client Configuration
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
 * Upload audio file to R2
 */
export async function uploadAudio(
  file: Buffer,
  fileName: string,
  contentType: string = 'audio/mpeg'
): Promise<string> {
  const key = `audio/${fileName}`
  
  await r2Client.send(
    new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      Body: file,
      ContentType: contentType,
    })
  )
  
  return key
}

/**
 * Upload sample audio to R2
 */
export async function uploadSample(
  file: Buffer,
  fileName: string,
  contentType: string = 'audio/mpeg'
): Promise<string> {
  const key = `samples/${fileName}`
  
  await r2Client.send(
    new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      Body: file,
      ContentType: contentType,
    })
  )
  
  return key
}

/**
 * Upload promo audio to R2
 */
export async function uploadPromo(
  file: Buffer,
  fileName: string,
  contentType: string = 'audio/mpeg'
): Promise<string> {
  const key = `promos/${fileName}`
  
  await r2Client.send(
    new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      Body: file,
      ContentType: contentType,
    })
  )
  
  return key
}

/**
 * Get a signed URL for private audio access (expires in 1 hour)
 */
export async function getSignedAudioUrl(key: string, expiresIn: number = 3600): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
  })
  
  return await getSignedUrl(r2Client, command, { expiresIn })
}

/**
 * Delete audio file from R2
 */
export async function deleteAudio(key: string): Promise<void> {
  await r2Client.send(
    new DeleteObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
    })
  )
}

/**
 * Generate the public URL for an audio file
 * (Only works if bucket has public access enabled)
 */
export function getPublicUrl(key: string): string {
  const publicUrl = process.env.R2_PUBLIC_URL
  if (publicUrl) {
    return `${publicUrl}/${key}`
  }
  // Fallback to signed URL approach
  return ''
}

/**
 * Generate a unique filename for uploads
 */
export function generateAudioFilename(title: string, type: 'full' | 'sample' | 'promo' = 'full'): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  const timestamp = Date.now()
  return `${slug}-${type}-${timestamp}.mp3`
}
