/**
 * scripts/cfo-report/elevenlabs.ts
 * Fetches ElevenLabs subscription usage: characters used/limit + pipeline buffer.
 *
 * Endpoint: GET https://api.elevenlabs.io/v1/user/subscription
 * Credentials: ELEVENLABS_API_KEY
 *
 * Pipeline buffer: 132,000 characters needed for current Hal pipeline
 * (adjust PIPELINE_CHARS_NEEDED as pipeline grows)
 */

const EL_BASE = 'https://api.elevenlabs.io/v1'

// Characters reserved for the active production pipeline
// Adjust this constant as episodes are queued
const PIPELINE_CHARS_NEEDED = 132_000

export interface ElevenLabsData {
  creditsUsed: number
  creditsTotal: number
  pctUsed: number
  remaining: number
  pipelineNeeded: number
  surplus: number
  tier: string
  stale: false
  fetchedAt: string
}

export interface ElevenLabsStale {
  stale: true
  reason: string
}

export async function fetchElevenLabsData(): Promise<ElevenLabsData | ElevenLabsStale> {
  const apiKey = process.env.ELEVENLABS_API_KEY
  if (!apiKey) {
    return { stale: true, reason: 'ELEVENLABS_API_KEY not set' }
  }

  try {
    const res = await fetch(`${EL_BASE}/user/subscription`, {
      headers: {
        'xi-api-key': apiKey,
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
    })

    if (!res.ok) {
      const txt = await res.text()
      throw new Error(`ElevenLabs API error ${res.status}: ${txt.slice(0, 300)}`)
    }

    const data = await res.json() as {
      character_count?: number
      character_limit?: number
      tier?: string
      status?: string
    }

    const creditsUsed = data.character_count ?? 0
    const creditsTotal = data.character_limit ?? 0
    const pctUsed = creditsTotal > 0 ? (creditsUsed / creditsTotal) * 100 : 0
    const remaining = Math.max(0, creditsTotal - creditsUsed)
    const surplus = remaining - PIPELINE_CHARS_NEEDED

    return {
      creditsUsed,
      creditsTotal,
      pctUsed: Math.round(pctUsed * 10) / 10,
      remaining,
      pipelineNeeded: PIPELINE_CHARS_NEEDED,
      surplus,
      tier: data.tier || data.status || 'unknown',
      stale: false,
      fetchedAt: new Date().toISOString(),
    }
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err)
    console.error('[cfo/elevenlabs] Fetch failed:', reason)
    return { stale: true, reason }
  }
}

// CLI entry point
if (require.main === module) {
  ;(async () => {
    const result = await fetchElevenLabsData()
    console.log(JSON.stringify(result, null, 2))
  })()
}
