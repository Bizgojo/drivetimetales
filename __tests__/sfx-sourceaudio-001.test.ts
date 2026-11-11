import { readFileSync } from 'fs'
import { join } from 'path'
import { SourceAudioClient, catalogSearchText, parseSearchTracks, pickCandidates, sourceAudioConfigFromEnv } from '@/lib/sourceAudio'
import { catalogIdFromLibraryId } from '@/lib/sfxCatalog'

// SFX-SOURCEAUDIO-001 (Marc, Nov 11, 2026; CANON-06 rules 2, 3, 6, 7, 15)
const sample = { tracks: [
  { 'SourceAudio ID': 11, Title: 'Door Wood Interior Close', Duration: 2.4, Filename: 'DOOR_close.wav' },
  { 'SourceAudio ID': 12, Title: 'House Ambience Long', Duration: 95 },
  { 'SourceAudio ID': 13, Title: 'Door Wood Close Hard', Duration: 1.1 },
  { 'SourceAudio ID': 14, Title: 'Door Slam Short', Duration: 0.1 },
  { 'SourceAudio ID': 0, Title: 'bad row' },
] }

describe('SFX-SOURCEAUDIO-001', () => {
  it('config needs both the token and the host, and strips https://', () => {
    expect(sourceAudioConfigFromEnv({})).toBeNull()
    expect(sourceAudioConfigFromEnv({ SOURCEAUDIO_API_TOKEN: 'x' })).toBeNull()
    expect(sourceAudioConfigFromEnv({ SOURCEAUDIO_API_TOKEN: 'x', SOURCEAUDIO_HOST: 'https://si.sourceaudio.com/' })).toEqual({ host: 'si.sourceaudio.com', token: 'x' })
  })

  it('catalog names become plain search words', () => {
    expect(catalogSearchText('Door, wood, opens')).toBe('door wood opens')
    expect(catalogSearchText('Door, lock or deadbolt turns')).toBe('door lock deadbolt turns')
  })

  it('parses SourceAudio search rows and drops rows without an id', () => {
    const t = parseSearchTracks(sample)
    expect(t.map((x) => x.id)).toEqual([11, 12, 13, 14])
    expect(t[0]).toMatchObject({ title: 'Door Wood Interior Close', durationSec: 2.4 })
  })

  it('spot picks short sounds in relevance order; background picks long ones; skips tried ones', () => {
    const t = parseSearchTracks(sample)
    expect(pickCandidates(t, 'spot', 3).map((x) => x.id)).toEqual([11, 13])
    expect(pickCandidates(t, 'background', 3).map((x) => x.id)).toEqual([12])
    expect(pickCandidates(t, 'spot', 3, new Set([11])).map((x) => x.id)).toEqual([13])
  })

  it('client paces requests, never overlaps, stops at the session cap, and sends the token', async () => {
    const urls: string[] = []
    const sleeps: number[] = []
    let clock = 1000
    const fetchImpl: any = async (u: string) => { urls.push(u); return { ok: true, json: async () => sample, headers: { get: () => 'audio/wav' }, arrayBuffer: async () => new ArrayBuffer(8) } }
    const c = new SourceAudioClient({ host: 'si.sourceaudio.com', token: 'TKN', minGapMs: 4000, maxRequests: 2 }, fetchImpl, async (ms) => { sleeps.push(ms); clock += ms }, () => clock)
    await c.search('door wood opens')
    await c.download(11)
    expect(sleeps).toEqual([4000])
    expect(urls[0]).toMatch(/^https:\/\/si\.sourceaudio\.com\/api\/tracks\/search\?s=door\+wood\+opens&show=25&token=TKN$/)
    expect(urls[1]).toMatch(/\/api\/tracks\/download\?track_id=11&format=wav&token=TKN$/)
    await expect(c.search('x')).rejects.toThrow(/session cap of 2/)
  })

  it('a download that returns JSON/HTML instead of audio is an error', async () => {
    const fetchImpl: any = async () => ({ ok: true, headers: { get: () => 'application/json' }, arrayBuffer: async () => new ArrayBuffer(8) })
    const c = new SourceAudioClient({ host: 'h', token: 't', minGapMs: 0 }, fetchImpl, async () => {}, () => 0)
    await expect(c.download(5)).rejects.toThrow(/not audio/)
  })

  it('downloaded folders map to catalog names; Sound Ideas counts as licensed in catalog build', () => {
    expect(catalogIdFromLibraryId('soundideas/all-02-si-11-door-wood-interior-close')).toBe('ALL-02') // what ingest writes (slugified path)
    const build = readFileSync(join(__dirname, '..', 'scripts/sfx-catalog-build.ts'), 'utf8')
    expect(build).toMatch(/e\.source === 'soundsnap' \|\| e\.source === 'soundideas'/)
    const ingest = readFileSync(join(__dirname, '..', 'scripts/sfx-library-ingest.ts'), 'utf8')
    expect(ingest).toMatch(/source === 'soundideas' \? 'Sound Ideas Complete Access license/)
  })
})
