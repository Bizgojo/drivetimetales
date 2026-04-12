import { NextResponse } from 'next/server'

// This route is no longer used for character voice assignment.
// Character voices are now assigned locally from My Voices pool in generate-voices/route.ts
// Kept for potential future use.

export async function POST(req: Request) {
  const { gender, age, accent, tones } = await req.json()
  const key = process.env.ELEVENLABS_API_KEY
  if (!key) return NextResponse.json({ error: 'No EL key' }, { status: 500 })

  try {
    const res = await fetch('https://api.elevenlabs.io/v1/voices', {
      headers: { 'xi-api-key': key }
    })
    const data = await res.json()
    const all = (data.voices || []).filter((v: any) =>
      v.category !== 'generated' &&
      (!v.labels?.language || v.labels.language === 'en')
    )
    // Filter by gender (hard requirement)
    const genderFiltered = gender
      ? all.filter((v: any) => v.labels?.gender?.toLowerCase() === gender.toLowerCase())
      : all
    // Score by age, accent, tones
    const scored = genderFiltered.map((v: any) => {
      let score = 0
      if (age && v.labels?.age === age) score += 20
      if (accent && v.labels?.accent?.toLowerCase() === accent.toLowerCase()) score += 15
      const desc = (v.labels?.descriptive || '').toLowerCase()
      for (const tone of (tones || [])) {
        if (desc.includes(tone.toLowerCase())) score += 10
      }
      return { voice_id: v.voice_id, name: v.name, score,
        gender: v.labels?.gender, age: v.labels?.age,
        accent: v.labels?.accent, descriptive: v.labels?.descriptive }
    }).sort((a: any, b: any) => b.score - a.score).slice(0, 10)

    return NextResponse.json({ voices: scored })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
