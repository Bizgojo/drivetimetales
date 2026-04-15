import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
const EL_API_KEY = process.env.ELEVENLABS_API_KEY!

export async function POST(req: NextRequest) {
  const { data: narrators } = await supabase.from('narrator_voices').select('*')
  if (!narrators) return NextResponse.json({ error: 'No narrators found' })
  const elRes = await fetch('https://api.elevenlabs.io/v1/voices', {
    headers: { 'xi-api-key': EL_API_KEY }
  })
  const elData = await elRes.json()
  const voices = elData.voices || []
  const results = narrators.map((n) => {
    const elVoice = voices.find((v) => v.voice_id === n.elevenlabs_voice_id)
    const labels = elVoice?.labels || {}
    return {
      name: n.name,
      gender: n.gender,
      voice_id: n.elevenlabs_voice_id,
      el_name: elVoice?.name || 'NOT FOUND',
      accent: labels.accent || 'unknown',
      age: labels.age || 'unknown',
    }
  })
  const flagged = results.filter((r) => {
    const a = (r.accent || '').toLowerCase()
    return a !== 'american' && a !== 'american english'
  })
  return NextResponse.json({ total: results.length, flagged: flagged.length, all: results, non_american: flagged })
}
