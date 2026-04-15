import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
const EL_API_KEY = process.env.ELEVENLABS_API_KEY!

export async function POST(req: NextRequest) {
  const { dryRun = true } = await req.json().catch(() => ({ dryRun: true }))
  const elRes = await fetch('https://api.elevenlabs.io/v1/voices', { headers: { 'xi-api-key': EL_API_KEY } })
  const elData = await elRes.json()
  const allVoices = elData.voices || []
  const { data: narrators } = await supabase.from('narrator_voices').select('*')
  if (!narrators) return NextResponse.json({ error: 'No narrators' })
  const usedIds = new Set(narrators.map((n) => n.elevenlabs_voice_id))
  const nonAmerican = narrators.filter((n) => {
    const v = allVoices.find((v) => v.voice_id === n.elevenlabs_voice_id)
    const accent = (v?.labels?.accent || '').toLowerCase()
    return accent !== 'american' && accent !== 'american english'
  })
  const replacements = []
  for (const narrator of nonAmerican) {
    const currentVoice = allVoices.find((v) => v.voice_id === narrator.elevenlabs_voice_id)
    const currentAge = currentVoice?.labels?.age || 'middle_aged'
    const gender = narrator.gender
    const candidates = allVoices.filter((v) => {
      const labels = v.labels || {}
      const accent = (labels.accent || '').toLowerCase()
      const vGender = (labels.gender || '').toLowerCase()
      const isAmerican = accent === 'american' || accent === 'american english'
      const genderMatch = gender === 'neutral' || vGender === gender
      const notUsed = !usedIds.has(v.voice_id)
      const notBelleB = v.voice_id !== 'wewocdDkjSLm9ZwjO7TD'
      return isAmerican && genderMatch && notUsed && notBelleB
    })
    const sameAge = candidates.filter((v) => (v.labels?.age || '') === currentAge)
    const best = sameAge[0] || candidates[0]
    if (best) {
      replacements.push({ narrator: narrator.name, narrator_id: narrator.id, old_voice: currentVoice?.name, old_accent: currentVoice?.labels?.accent, new_voice: best.name, new_voice_id: best.voice_id, new_accent: best.labels?.accent, new_age: best.labels?.age })
      usedIds.add(best.voice_id)
    } else {
      replacements.push({ narrator: narrator.name, error: 'No replacement found', gender: gender, currentAge: currentAge })
    }
  }
  if (!dryRun) {
    for (const r of replacements) {
      if (r.new_voice_id) {
        await supabase.from('narrator_voices').update({ elevenlabs_voice_id: r.new_voice_id }).eq('id', r.narrator_id)
      }
    }
  }
  return NextResponse.json({ mode: dryRun ? 'DRY RUN' : 'APPLIED', replacements: replacements })
}
