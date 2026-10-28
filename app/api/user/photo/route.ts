import { hasValidRequestOrigin } from '@/lib/requestOrigin'
import { NextRequest, NextResponse } from 'next/server'
import sharp from 'sharp'
import { randomUUID } from 'crypto'
import { accountUser, accountAdmin } from '@/lib/server/accountUser'
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const bucket = 'org-state'
export async function GET() {
  const user = await accountUser()
  if (!user) return new NextResponse(null, { status: 401 })
  const file = user.user_metadata?.et_photo
  if (typeof file !== 'string' || !/^[a-f0-9-]+\.jpg$/.test(file)) return new NextResponse(null, { status: 404 })
  const { data, error } = await accountAdmin().storage.from(bucket).download(`account-photos/${user.id}/${file}`)
  if (error || !data) return new NextResponse(null, { status: 404 })
  return new NextResponse(await data.arrayBuffer(), { headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } })
}
export async function POST(req: NextRequest) {
  if (!hasValidRequestOrigin(req)) return NextResponse.json({ error: 'Invalid request origin' }, { status: 403 });
  const user = await accountUser()
  if (!user) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 })
  try {
    if (Number(req.headers.get('content-length') || 0) > 2_000_000) return NextResponse.json({ error: 'Photo is too large.' }, { status: 413 })
    const file = (await req.formData()).get('photo')
    if (!(file instanceof File) || file.size > 1_000_000) return NextResponse.json({ error: 'Choose a smaller photo.' }, { status: 400 })
    const jpg = await sharp(Buffer.from(await file.arrayBuffer()), { limitInputPixels: 16_000_000 }).rotate().resize(256, 256, { fit: 'cover' }).jpeg({ quality: 85 }).toBuffer()
    const filename = `${randomUUID()}.jpg`
    const admin = accountAdmin()
    const path = `account-photos/${user.id}/${filename}`
    const { error: uploadError } = await admin.storage.from(bucket).upload(path, jpg, { contentType: 'image/jpeg', upsert: false })
    if (uploadError) throw uploadError
    const { error } = await admin.auth.admin.updateUserById(user.id, { user_metadata: { ...user.user_metadata, et_photo: filename } })
    if (error) { await admin.storage.from(bucket).remove([path]); throw error }
    const old = user.user_metadata?.et_photo
    if (typeof old === 'string' && /^[a-f0-9-]+\.jpg$/.test(old)) await admin.storage.from(bucket).remove([`account-photos/${user.id}/${old}`])
    return NextResponse.json({ filename })
  } catch { return NextResponse.json({ error: 'Could not save this photo. Try a JPEG or PNG image.' }, { status: 400 }) }
}
