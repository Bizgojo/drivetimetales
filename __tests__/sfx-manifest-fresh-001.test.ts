import { readFileSync } from 'fs'
import { join } from 'path'
import { downloadFreshText } from '@/lib/storage/freshText'

// SFX-MANIFEST-FRESH-001 (Nov 11 2026): SDK reads of the SFX manifest/catalog were ~30 min stale.
function fakeDb(sdkText: string | null) {
  return {
    storage: { from: () => ({
      getPublicUrl: (p: string) => ({ data: { publicUrl: `https://x.supabase.co/storage/v1/object/public/audio/${p}` } }),
      download: async () => ({ data: sdkText === null ? null : { text: async () => sdkText } }),
    }) },
  } as any
}

describe('SFX-MANIFEST-FRESH-001', () => {
  it('reads the public URL with a cache-buster and no-store', async () => {
    let seen = ''; let init: any
    const f = (async (url: string, i: any) => { seen = url; init = i; return new Response('{"fresh":true}', { status: 200 }) }) as any
    expect(await downloadFreshText(fakeDb('{"stale":true}'), 'sfx-library/manifest.json', f)).toBe('{"fresh":true}')
    expect(seen).toMatch(/manifest\.json\?cb=\d+$/)
    expect(init.cache).toBe('no-store')
  })
  it('a missing file is null; a network error falls back to the SDK read', async () => {
    expect(await downloadFreshText(fakeDb('x'), 'a.json', (async () => new Response('', { status: 404 })) as any)).toBeNull()
    expect(await downloadFreshText(fakeDb('{"sdk":1}'), 'a.json', (async () => { throw new Error('net') }) as any)).toBe('{"sdk":1}')
  })
  it('the catalog and every manifest reader use the fresh read', () => {
    for (const f of ['lib/sfxCatalog.ts', 'scripts/sfx-catalog-build.ts', 'scripts/sfx-library-ingest.ts', 'scripts/sfx-library-prefilter.ts', 'scripts/sfx-remix.ts']) {
      const src = readFileSync(join(__dirname, '..', f), 'utf8')
      expect(src).toMatch(/downloadFreshText\(db, SFX_(LIBRARY_MANIFEST|CATALOG_FILE)\)/)
      expect(src).not.toMatch(/download\(SFX_(LIBRARY_MANIFEST|CATALOG_FILE)\)/)
    }
  })
})
