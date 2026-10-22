/**
 * VERIFY-READ-001 — regression test for the Creek Ep1 stale-read defect.
 *
 * Demonstrated failure: `series_render_final_mix` failed in verifyUploadedBytes
 * on story_body_with_outro.mp3 with `size mismatch: got 14412112, want 14403335`
 * twice ~10 min apart. Upload succeeded; the cache-busted public URL served the
 * fresh bytes both times; the authenticated SDK download returned the old bytes.
 * Stored artifact correct; verifier's read path stale.
 */

import { verifyUploadedBytes } from '@/lib/storage/verifyUploadedBytes'

const noSleep = async (_ms: number) => {}

function buf(size: number, fill: number): Buffer {
  return Buffer.alloc(size, fill)
}

describe('verifyUploadedBytes — VERIFY-READ-001 stale-read correction', () => {
  test('accepts the fresh artifact when the first read is stale and the retry is fresh', async () => {
    const stale = buf(14412112 % 100000, 0xaa); // old bytes, wrong size
    const fresh = buf(1024, 0x33); // the uploaded bytes
    const calls: string[] = []
    const fetchBytes = async (url: string): Promise<Buffer> => {
      calls.push(url)
      return calls.length === 1 ? stale : fresh
    }
    await expect(
      verifyUploadedBytes('https://cdn.example/audio/story_body_with_outro.mp3', fresh, 'story_body_with_outro.mp3', fetchBytes, { sleep: noSleep }),
    ).resolves.toBeUndefined()
    expect(calls.length).toBe(2)
  });

  test('still rejects a genuine persistent size mismatch (guard stays blocking)', async () => {
    const expected = buf(14403335 % 100000, 0x33)
    const wrong = buf(14412112 % 100000, 0xaa)
    const fetchBytes = async (_url: string): Promise<Buffer> => wrong
    await expect(
      verifyUploadedBytes('https://cdn.example/audio/story_body_with_outro.mp3', expected, 'story_body_with_outro.mp3', fetchBytes, { sleep: noSleep }),
    ).rejects.toThrow(/size mismatch: got \d+, want \d+/)
  });

  test('still rejects same-size content corruption (sha256 mismatch)', async () => {
    const expected = buf(1024, 0x33)
    const corrupt = buf(1024, 0x34)
    const fetchBytes = async (_url: string): Promise<Buffer> => corrupt
    await expect(
      verifyUploadedBytes('https://cdn.example/audio/x.mp3', expected, 'x.mp3', fetchBytes, { sleep: noSleep }),
    ).rejects.toThrow(/sha256 mismatch/)
  });

  test('every verification read carries a per-attempt cache-buster', async () => {
    const expected = buf(16, 0x01)
    const seen: string[] = []
    const fetchBytes = async (url: string): Promise<Buffer> => {
      seen.push(url)
      return expected
    }
    await verifyUploadedBytes('https://cdn.example/audio/x.mp3', expected, 'x.mp3', fetchBytes, { sleep: noSleep })
    expect(seen.length).toBe(1)
    expect(seen[0]).toMatch(/\bv=\d+-1$/)
  });

  test('persistent fetch errors still throw (no silent pass)', async () => {
    const fetchBytes = async (_url: string): Promise<Buffer> => {
      throw new Error('socket hang up')
    }
    await expect(
      verifyUploadedBytes('https://cdn.example/audio/x.mp3', buf(16, 0x01), 'x.mp3', fetchBytes, { sleep: noSleep, retryDelaysMs: [] }),
    ).rejects.toThrow(/verification download failed: socket hang up/)
  });
});
