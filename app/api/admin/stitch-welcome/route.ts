import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { exec } from 'child_process'
import { promisify } from 'util'
import fs from 'fs'
import path from 'path'
import os from 'os'

const execAsync = promisify(exec)
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
const BASE = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/audio`
const BELLE_B_ID = 'KWDD3Wyq30ZF5NEL01EJ'

export const runtime = 'nodejs'
export const maxDuration = 30

async function downloadFile(url: string, dest: string) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Failed to download ${url}: ${res.status}`)
  const buf = Buffer.from(await res.arrayBuffer())
  fs.writeFileSync(dest, buf)
}

export async function POST(req: NextRequest) {
  const { firstName } = await req.json()
  if (!firstName) return NextResponse.json({ error: 'firstName required' }, { status: 400 })

  const safeName = firstName.toLowerCase().replace(/[^a-z0-9]/g, '-')
  const stitchedPath = `welcome/stitched_${safeName}.mp3`
  const stitchedUrl = `${BASE}/${stitchedPath}`

  // Return cached if exists
  const testRes = await fetch(stitchedUrl, { method: 'HEAD' })
  if (testRes.ok) return NextResponse.json({ url: stitchedUrl })

  const tmpDir = os.tmpdir()
  const fileA = path.join(tmpDir, `welcome_a_${Date.now()}.mp3`)
  const fileN = path.join(tmpDir, `welcome_n_${Date.now()}.mp3`)
  const fileB = path.join(tmpDir, `welcome_b_${Date.now()}.mp3`)
  const fileOut = path.join(tmpDir, `welcome_out_${Date.now()}.mp3`)
  const listFile = path.join(tmpDir, `welcome_list_${Date.now()}.txt`)

  try {
    // Download all three parts
    await downloadFile(`${BASE}/welcome/welcome_A.mp3`, fileA)
    await downloadFile(`${BASE}/names/${safeName}_${BELLE_B_ID}.mp3`, fileN)
    await downloadFile(`${BASE}/welcome/welcome_B.mp3`, fileB)

    // Write ffmpeg concat list
    fs.writeFileSync(listFile, `file '${fileA}'\nfile '${fileN}'\nfile '${fileB}'\n`)

    // Concatenate seamlessly
    await execAsync(`ffmpeg -y -f concat -safe 0 -i "${listFile}" -c:a libmp3lame -q:a 2 "${fileOut}"`)

    // Upload stitched file
    const buf = fs.readFileSync(fileOut)
    const { error } = await supabase.storage.from('audio').upload(stitchedPath, buf, { contentType: 'audio/mpeg', upsert: true })
    if (error) throw new Error(error.message)

    return NextResponse.json({ url: stitchedUrl })
  } finally {
    // Cleanup temp files
    [fileA, fileN, fileB, fileOut, listFile].forEach(f => { try { fs.unlinkSync(f) } catch {} })
  }
}
