/**
 * SFX-WORD-001 (Marc 2026-10-31): put an effect on the exact spoken word, not
 * only between lines. ElevenLabs forced alignment returns the start and end of
 * every word in a recorded line; the effect lands the moment the voice
 * finishes the words the sound designer named ("Drop it or I'll" → the shot).
 *
 * Pure matching here (unit-tested); the network call takes its key and file
 * as parameters. Alignments are cached in storage so each line is aligned once:
 *   asc3/<storyId>/align/segment_NNNN.json
 */

export type AlignedWord = { text: string; start: number; end: number; loss?: number }

const norm = (w: string) => String(w || '').toLowerCase().replace(/[’']/g, "'").replace(/[^a-z0-9']+/g, '')

/** Tokens of a phrase, normalized the same way as aligned words. */
export function phraseTokens(phrase: string): string[] {
  return String(phrase || '').split(/\s+/).map(norm).filter(Boolean)
}

/**
 * Seconds (from the start of the line's audio) at which the given words END.
 * Matches the whole phrase in order; if the phrase occurs more than once the
 * first occurrence wins. Returns null when the phrase is not found, so the
 * caller falls back to placing the effect before the line.
 */
export function wordEndTime(words: AlignedWord[], afterWords: string): number | null {
  const want = phraseTokens(afterWords)
  if (!want.length) return null
  const have = words.map((w) => norm(w.text))
  // Aligned "words" can carry punctuation or be empty; skip empties while matching.
  const idx: number[] = []
  have.forEach((t, i) => { if (t) idx.push(i) })
  for (let s = 0; s + want.length <= idx.length; s += 1) {
    let ok = true
    for (let k = 0; k < want.length; k += 1) {
      if (have[idx[s + k]] !== want[k]) { ok = false; break }
    }
    if (ok) {
      const last = words[idx[s + want.length - 1]]
      return Number.isFinite(last.end) ? last.end : null
    }
  }
  return null
}

export function alignCachePath(storyId: string, segmentNumber: number): string {
  return `asc3/${storyId}/align/segment_${String(segmentNumber).padStart(4, '0')}.json`
}

/** POST /v1/forced-alignment with the line's audio and its text. */
export async function forcedAlign(params: { audio: Buffer; text: string; elevenLabsKey: string; fileName?: string }): Promise<AlignedWord[]> {
  const form = new FormData()
  form.append('file', new Blob([new Uint8Array(params.audio)], { type: 'audio/mpeg' }), params.fileName || 'line.mp3')
  form.append('text', params.text)
  const res = await fetch('https://api.elevenlabs.io/v1/forced-alignment', {
    method: 'POST',
    headers: { 'xi-api-key': params.elevenLabsKey },
    body: form,
  })
  if (!res.ok) throw new Error(`forced alignment HTTP ${res.status}`)
  const body: any = await res.json()
  const words = Array.isArray(body?.words) ? body.words : []
  return words.map((w: any) => ({ text: String(w?.text ?? ''), start: Number(w?.start), end: Number(w?.end), loss: Number(w?.loss) }))
}

type Store = {
  storage: {
    from: (bucket: string) => {
      download: (path: string) => Promise<{ data: Blob | null; error: unknown }>
      upload: (path: string, body: Buffer, opts: Record<string, unknown>) => Promise<{ error: unknown }>
    }
  }
}

/** Cached alignment for one recorded line (aligned once, then reused). */
export async function alignedWordsForSegment(params: {
  db: Store
  storyId: string
  segmentNumber: number
  audio: Buffer
  text: string
  elevenLabsKey: string
}): Promise<AlignedWord[]> {
  const cachePath = alignCachePath(params.storyId, params.segmentNumber)
  const cached = await params.db.storage.from('audio').download(cachePath).catch(() => ({ data: null, error: true }))
  if (cached?.data) {
    try {
      const parsed = JSON.parse(await (cached.data as Blob).text())
      if (parsed?.text === params.text && Array.isArray(parsed?.words)) return parsed.words as AlignedWord[]
    } catch { /* re-align */ }
  }
  const words = await forcedAlign({ audio: params.audio, text: params.text, elevenLabsKey: params.elevenLabsKey })
  await params.db.storage.from('audio').upload(cachePath, Buffer.from(JSON.stringify({ text: params.text, words, at: new Date().toISOString() })), { contentType: 'application/json', upsert: true })
  return words
}
