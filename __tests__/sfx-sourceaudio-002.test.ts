import { readFileSync } from 'fs'
import { join } from 'path'
import { catalogSearchFallbacks, pickCandidates } from '@/lib/sourceAudio'

// SFX-SOURCEAUDIO-002 (Don't Go Home EP1 preview, Nov 11 2026)
describe('SFX-SOURCEAUDIO-002', () => {
  it('ALL-17 "Cell phone, text alert" gets simpler fallback searches', () => {
    expect(catalogSearchFallbacks('Cell phone, text alert')).toEqual(['text alert', 'cell phone'])
    expect(catalogSearchFallbacks('Door, wood, closes')).toEqual(['wood closes', 'door', 'wood'])
    expect(catalogSearchFallbacks('Thunder')).toEqual([])
  })
  it('prefers different titles before repeat takes of one asset', () => {
    const t = (id: number, title: string) => ({ id, title, description: '', durationSec: 1, filename: '', album: '' }) as any
    const picks = pickCandidates([t(1, 'Wood Doors'), t(2, 'Wood Doors'), t(3, 'Wood Doors'), t(4, 'Door Close Oak')], 'spot', 3)
    expect(picks.map((p) => p.id)).toEqual([1, 4, 2])
  })
  it('the fetch script uses the fallbacks and a --search override for one name', () => {
    const src = readFileSync(join(__dirname, '..', 'scripts/sfx-sourceaudio-fetch.ts'), 'utf8')
    expect(src).toMatch(/catalogSearchFallbacks\(n\.name\)/)
    expect(src).toMatch(/ids\.length === 1 && arg\('search'\)/)
  })
})
