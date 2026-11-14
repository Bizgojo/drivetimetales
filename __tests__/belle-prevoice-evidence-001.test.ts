import fs from 'fs'
import path from 'path'
import { stampPackageEvidence, hasEarnedPackageEvidence } from '@/lib/packageEvidence'
import { hashScript } from '@/lib/continuityPin'
import { repinAfterPatch } from '@/lib/seriesPatch'

describe('BELLE-PREVOICE-EVIDENCE-001', () => {
  const eps = [
    { id: 'a', script: 'EP1 [BELLE OUTRO] long outro', script_json: {} },
    { id: 'b', script: 'EP2', script_json: { series_generation: { continuity_pins_used: { a: hashScript('EP1 [BELLE OUTRO] long outro') } } } },
  ]
  test('re-stamping the shortened episode keeps the earned verdict', () => {
    const report: any = stampPackageEvidence({ pass: true }, { jobId: 'j', seriesId: 's', episodes: eps, kind: 'series-package-validator', note: 't' })
    const shortened = [{ ...eps[0], script: 'EP1 [BELLE OUTRO] short' }, eps[1]]
    expect(hasEarnedPackageEvidence(report, { jobId: 'j', seriesId: 's', episodes: shortened })).toBe(false)
    report.evidence.episodeHashes.a = hashScript('EP1 [BELLE OUTRO] short')
    expect(hasEarnedPackageEvidence(report, { jobId: 'j', seriesId: 's', episodes: shortened })).toBe(true)
  })
  test('later episodes are re-pinned to the shortened script', () => {
    const out = repinAfterPatch(eps, new Map([['a', 'EP1 [BELLE OUTRO] short']]))
    expect(out.get('b').series_generation.continuity_pins_used.a).toBe(hashScript('EP1 [BELLE OUTRO] short'))
  })
  test('run-next wires both after the Belle save', () => {
    const src = fs.readFileSync(path.join(process.cwd(), 'app/api/admin/production-jobs/run-next/route.ts'), 'utf8')
    const at = src.indexOf('BELLE-PREVOICE-EVIDENCE-001 (Widow')
    expect(at).toBeGreaterThan(0)
    const block = src.slice(at, at + 1600)
    expect(block).toContain('repinAfterPatch(preflightEpisodes, new Map([[String(storyId), fixed]]))')
    expect(block).toContain('evidence.episodeHashes[String(storyId)] = hashScript(fixed)')
  })
})
