/**
 * VOICE-AUDITION-001 — makes short audition clips: one line of a character's
 * real dialogue read by each candidate voice, so Marc can pick by ear before a
 * recast. Paid but tiny (one short ElevenLabs line per candidate). Writes only
 * to a local folder; no database or storage writes.
 *
 *   npx tsx scripts/voice-audition.ts <outDir> "<line text>" <label> <voiceId> [<label> <voiceId> ...]
 *
 * Needs ELEVENLABS_API_KEY in the env (never printed).
 */
import { mkdir, writeFile } from 'fs/promises'
import path from 'path'

async function main() {
  const [outDir, line, ...pairs] = process.argv.slice(2)
  if (!outDir || !line || pairs.length < 2 || pairs.length % 2) throw new Error('usage: voice-audition.ts <outDir> "<line>" <label> <voiceId> [...]')
  const key = process.env.ELEVENLABS_API_KEY
  if (!key) throw new Error('ELEVENLABS_API_KEY missing')
  await mkdir(outDir, { recursive: true })
  for (let i = 0; i < pairs.length; i += 2) {
    const label = pairs[i].replace(/[^A-Za-z0-9-]+/g, '-')
    const voiceId = pairs[i + 1]
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: 'POST',
      headers: { 'xi-api-key': key, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
      body: JSON.stringify({ text: line, model_id: 'eleven_multilingual_v2', voice_settings: { stability: 0.5, similarity_boost: 0.75, style: 0, use_speaker_boost: true } }),
    })
    if (!res.ok) { console.log(`${label}: ElevenLabs HTTP ${res.status}`); continue }
    const file = path.join(outDir, `${String(i / 2 + 1)}-${label}.mp3`)
    await writeFile(file, Buffer.from(await res.arrayBuffer()))
    console.log(`${label}: ${file}`)
  }
}

main().catch((err) => { console.error(err instanceof Error ? err.message : String(err)); process.exit(1) })
