import { NextResponse } from 'next/server'

export async function POST(req: Request) {
  const { gender, age, accent } = await req.json()
  const key = process.env.ELEVENLABS_API_KEY
  if (!key) return NextResponse.json({ error: 'No EL key' }, { status: 500 })

  const params = new URLSearchParams({ page_size: '5', use_cases: 'characters' })
  if (gender && gender !== 'unknown') params.set('gender', gender)
  if (age) params.set('age', age)
  if (accent) params.set('accent', accent)

  try {
    const resp = await fetch(`https://api.elevenlabs.io/v1/shared-voices?${params}`, {
      headers: { 'xi-api-key': key }
    })
    const data = await resp.json()
    const voices = (data.voices || []).map((v: any) => ({
      voice_id: v.voice_id,
      name: v.name,
      gender: v.labels?.gender,
      age: v.labels?.age,
      accent: v.labels?.accent,
    }))
    return NextResponse.json({ voices })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
