import { NextResponse } from 'next/server'
import musicLibrary from '@/lib/music-library.json'

export async function GET() {
  return NextResponse.json({ success: true, tracks: musicLibrary.tracks })
}
