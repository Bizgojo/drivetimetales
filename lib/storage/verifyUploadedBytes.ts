/**
 * VERIFY-READ-001 — post-upload byte verification via the cache-busted public read.
 *
 * Defect (Creek Ep1, verified 2x ~10 min apart): after a successful same-key
 * upsert (`cacheControl: '31536000'`), the authenticated SDK download
 * (`supabase.storage.from('audio').download(path)`) returned the PREVIOUS
 * object bytes (size 14412112) while the cache-busted public CDN URL served
 * the fresh bytes (size 14403335) both times. Stored artifact correct;
 * verifier's read path stale. A single-shot authenticated read therefore
 * fails closed on a healthy upload.
 *
 * Correction: verify against the public URL with a per-attempt cache-buster
 * (`?v=<ts>-<attempt>` + `cache: no-store`), i.e. the same consistency the
 * upload confirms and playback consumes. Bounded retry rides out brief
 * origin propagation; a persistent mismatch still throws (guard stays blocking).
 */

import { createHash } from 'node:crypto'

export type FetchBytes = (url: string) => Promise<Buffer>
export type SleepFn = (ms: number) => Promise<void>

const defaultSleep: SleepFn = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function defaultFetchBytes(url: string): Promise<Buffer> {
  const res = await fetch(url, {
    cache: 'no-store',
    headers: { 'Cache-Control': 'no-cache' },
  })
  if (!res.ok) throw new Error(`Verification fetch failed ${res.status}: ${url}`)
  return Buffer.from(await res.arrayBuffer())
}

function sha12(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex').slice(0, 12)
}

export interface VerifyUploadedBytesOpts {
  maxAttempts?: number
  retryDelaysMs?: number[]
  sleep?: SleepFn
}

export async function verifyUploadedBytes(
  publicUrlBase: string,
  expected: Buffer,
  label: string,
  fetchBytes: FetchBytes = defaultFetchBytes,
  opts?: VerifyUploadedBytesOpts,
): Promise<void> {
  const maxAttempts = opts?.maxAttempts ?? 6
  // VERIFY-WAIT-001 (The Nanny Cam, Oct 29): same-key re-uploads kept reading the
  // previous object for longer than 2s (EP1/EP2 'story_body.mp3 size mismatch'),
  // failing whole render attempts. Wait up to ~35s before calling it a mismatch.
  const retryDelaysMs = opts?.retryDelaysMs ?? [1000, 3000, 6000, 10000, 15000]
  const sleep = opts?.sleep ?? defaultSleep
  const expectedHash = createHash('sha256').update(expected).digest('hex')

  let lastError: Error | null = null
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    // Fresh cache-buster per attempt so no intermediate cache can pin a stale copy.
    const sep = publicUrlBase.includes('?') ? '&' : '?'
    const url = `${publicUrlBase}${sep}v=${Date.now()}-${attempt}`
    let actual: Buffer
    try {
      actual = await fetchBytes(url)
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))
      if (attempt < maxAttempts) {
        console.warn(`  ${label} verification fetch attempt ${attempt}/${maxAttempts} failed (${lastError.message}); retrying`)
        await sleep(retryDelaysMs[attempt - 1] ?? 1500)
        continue
      }
      throw new Error(`${label} verification download failed: ${lastError.message}`)
    }
    if (actual.length !== expected.length) {
      lastError = new Error(`${label} size mismatch: got ${actual.length}, want ${expected.length}`)
    } else if (createHash('sha256').update(actual).digest('hex') !== expectedHash) {
      lastError = new Error(`${label} sha256 mismatch: got ${sha12(actual)}…, want ${sha12(expected)}…`)
    } else {
      return // byte-identical — verified
    }
    if (attempt < maxAttempts) {
      console.warn(`  ${label} verification attempt ${attempt}/${maxAttempts}: ${lastError.message}; retrying`)
      await sleep(retryDelaysMs[attempt - 1] ?? 1500)
    }
  }
  throw lastError!
}
