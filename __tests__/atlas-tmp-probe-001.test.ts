/**
 * ATLAS-TMP-PROBE-001 (Marc GO 2026-10-06)
 *
 * Pre-fetch /tmp probe: before the series_render_final_mix fetch stage the
 * render path logs numeric free MB + et-mix-* dir names/sizes + a peak
 * estimate placeholder. This test covers the probe formatter (pure).
 */

import {
  formatTmpPrefetchProbe,
  probeTmpBeforeFetch,
  type TmpPrefetchProbe,
} from '@/lib/tmpSpace'

describe('formatTmpPrefetchProbe — log line carries numeric free + dir listing', () => {
  test('embeds numeric free MB, dir count, names, sizes, and peak estimate', () => {
    const probe: TmpPrefetchProbe = {
      stage: 'pre-fetch',
      freeMb: 412,
      etMixDirs: [
        { name: 'et-mix-abc123', sizeBytes: 12 * 1024 * 1024 },
        { name: 'et-mix-def456', sizeBytes: 512 * 1024 },
      ],
      peakEstimateBytes: 200 * 1024 * 1024,
      peakEstimateNote: null,
    }
    const line = formatTmpPrefetchProbe(probe)
    expect(line).toContain('[tmp-probe]')
    expect(line).toContain('pre-fetch')
    expect(line).toContain('free_mb=412')
    expect(line).toContain('et_mix_dirs=2')
    expect(line).toContain('et-mix-abc123(12.0MB)')
    expect(line).toContain('et-mix-def456(0.5MB)')
    expect(line).toContain('peak_estimate=200.0MB')
  })

  test('empty /tmp and placeholder estimate still render explicit sentinels', () => {
    const probe: TmpPrefetchProbe = {
      stage: 'pre-fetch',
      freeMb: null,
      etMixDirs: [],
      peakEstimateBytes: null,
      peakEstimateNote: 'placeholder — segment sizes unknown pre-fetch',
    }
    const line = formatTmpPrefetchProbe(probe)
    expect(line).toContain('free_mb=unknown')
    expect(line).toContain('et_mix_dirs=0')
    expect(line).toContain('none')
    expect(line).toContain('peak_estimate=unknown(placeholder — segment sizes unknown pre-fetch)')
  })

  test('unstatable dir renders unknown size without dropping the name', () => {
    const probe: TmpPrefetchProbe = {
      stage: 'avfm pre-fetch',
      freeMb: 7,
      etMixDirs: [{ name: 'et-mix-stale', sizeBytes: null }],
      peakEstimateBytes: null,
      peakEstimateNote: 'placeholder',
    }
    const line = formatTmpPrefetchProbe(probe)
    expect(line).toContain('free_mb=7')
    expect(line).toContain('et-mix-stale(unknown)')
  })
})

describe('probeTmpBeforeFetch — never throws, filters to et-mix-*', () => {
  const stubFs = (entries: string[], sizes: Record<string, number | null> = {}) => ({
    readdir: () => entries,
    dirSizeBytes: (p: string) => {
      const name = p.split('/').pop() as string
      if (!(name in sizes)) return null
      const v = sizes[name]
      if (v === -1) throw new Error('stat boom')
      return v
    },
  })

  test('lists only et-mix-* entries with sizes', () => {
    const probe = probeTmpBeforeFetch('pre-fetch', {
      dir: '/tmp',
      fs: stubFs(['et-mix-a', 'et-mix-b', 'other-dir', 'file.txt'], {
        'et-mix-a': 1024,
        'et-mix-b': 2048,
      }),
    })
    expect(probe.stage).toBe('pre-fetch')
    expect(probe.etMixDirs.map((e) => e.name)).toEqual(['et-mix-a', 'et-mix-b'])
    expect(probe.etMixDirs.map((e) => e.sizeBytes)).toEqual([1024, 2048])
    expect(probe.peakEstimateBytes).toBeNull()
    expect(probe.peakEstimateNote).toMatch(/placeholder/)
  })

  test('per-dir stat failure degrades to null size, keeps the name', () => {
    const probe = probeTmpBeforeFetch('pre-fetch', {
      dir: '/tmp',
      fs: stubFs(['et-mix-bad'], { 'et-mix-bad': -1 }),
    })
    expect(probe.etMixDirs).toEqual([{ name: 'et-mix-bad', sizeBytes: null }])
  })

  test('readdir failure yields an empty listing, not a throw', () => {
    const probe = probeTmpBeforeFetch('pre-fetch', {
      dir: '/tmp',
      fs: {
        readdir: () => {
          throw new Error('readdir boom')
        },
        dirSizeBytes: () => 1,
      },
    })
    expect(probe.etMixDirs).toEqual([])
  })

  test('explicit peak estimate passes through with its note', () => {
    const probe = probeTmpBeforeFetch('pre-fetch', {
      dir: '/tmp',
      fs: stubFs([]),
      peakEstimateBytes: 50 * 1024 * 1024,
      peakEstimateNote: 'staged inputs x2 (concat working copy)',
    })
    expect(probe.peakEstimateBytes).toBe(50 * 1024 * 1024)
    expect(formatTmpPrefetchProbe(probe)).toContain('peak_estimate=50.0MB')
  })
})
