import { SFX_CATALOG_NAMES } from '@/lib/sfxCatalogNames'
import { liveNames, proposeTakesFromKeptLibrary, pickCatalogTake, catalogPlannerEnabled, emptyCatalog, type CatalogFile } from '@/lib/sfxCatalog'
import { soundLines, flagSoundLines, validateSoundMap, buildSoundMapPrompt, sfxSoundAgreementRule } from '@/lib/sfxSoundMap'
import { planLayeredBody } from '@/lib/sfxLayeredMix'
import { buildSfxReport } from '@/lib/sfxReport'
import { sfxWords, type SfxLibraryEntry } from '@/lib/sfxLibrary'

const kept = (id: string, name: string): SfxLibraryEntry => ({ id, path: `sfx-library/${id}.mp3`, name, tags: sfxWords(name), status: 'approved' })

describe('SFX-CATALOG-001 names', () => {
  test('166 names, unique IDs and names, every one spot or background', () => {
    expect(SFX_CATALOG_NAMES).toHaveLength(166)
    expect(new Set(SFX_CATALOG_NAMES.map((n) => n.id)).size).toBe(166)
    expect(new Set(SFX_CATALOG_NAMES.map((n) => n.name)).size).toBe(166)
    expect(SFX_CATALOG_NAMES.every((n) => n.kind === 'spot' || n.kind === 'background')).toBe(true)
  })
})

describe('SFX-CATALOG-001 takes', () => {
  const names = SFX_CATALOG_NAMES.filter((n) => ['CR-01', 'CR-29', 'WE-02'].includes(n.id))
  const library = [
    kept('a', 'pistol shot close indoor 1'), kept('b', 'pistol shot close indoor 2'), kept('c', 'pistol shot close indoor 3'), kept('d', 'pistol shot close indoor 4'),
    kept('e', 'bar crowd murmur 1'),
  ]
  test('up to 3 takes proposed from kept sounds; names with no match stay empty', () => {
    const { catalog, empty } = proposeTakesFromKeptLibrary(emptyCatalog(), library, names)
    expect(catalog.entries['CR-01'].takes).toHaveLength(3)
    expect(catalog.entries['CR-29'].takes.map((t) => t.libraryId)).toEqual(['e'])
    expect(empty).toEqual(['WE-02'])
  })
  test('reviewed names are never re-proposed; discarded takes never come back', () => {
    const reviewed: CatalogFile = { ...emptyCatalog(), entries: { 'CR-01': { takes: [{ libraryId: 'a', path: 'x', name: 'x', source: 'kept-library', status: 'discarded' }] } } }
    const { catalog } = proposeTakesFromKeptLibrary(reviewed, library, names)
    expect(catalog.entries['CR-01'].takes).toEqual(reviewed.entries['CR-01'].takes)
  })
  test('test mode uses kept-library candidates; production needs 3 approved takes', () => {
    const { catalog } = proposeTakesFromKeptLibrary(emptyCatalog(), library, names)
    expect(liveNames(catalog, 'test', names).map((n) => n.id)).toEqual(['CR-01', 'CR-29'])
    expect(liveNames(catalog, 'production', names)).toEqual([])
    catalog.entries['CR-01'].takes.forEach((t) => { t.status = 'approved' })
    expect(liveNames(catalog, 'production', names).map((n) => n.id)).toEqual(['CR-01'])
  })
  test('takes rotate by place, stable for the same place', () => {
    const { catalog } = proposeTakesFromKeptLibrary(emptyCatalog(), library, names)
    const live = liveNames(catalog, 'test', names)[0]
    const picks = new Set(Array.from({ length: 12 }, (_, i) => pickCatalogTake(live, `s:${i}`).libraryId))
    expect(picks.size).toBeGreaterThan(1)
    expect(pickCatalogTake(live, 's:3').libraryId).toBe(pickCatalogTake(live, 's:3').libraryId)
  })
  test('planner is test-only (v4) unless SFX_PLANNER=catalog', () => {
    expect(catalogPlannerEnabled('v4', {})).toBe(true)
    expect(catalogPlannerEnabled('v3', {})).toBe(false)
    expect(catalogPlannerEnabled(null, {})).toBe(false)
    expect(catalogPlannerEnabled(null, { SFX_PLANNER: 'catalog' })).toBe(true)
  })
})

describe('SFX-CATALOG-001 planner: catalog IDs or nothing', () => {
  const P = (index: number, kind: 'voice' | 'sfx' | 'silence', speaker: string, text: string) => ({ index, kind, speaker, text, isExpected: true, rawLineNumber: index } as any)
  const positions = [P(1, 'voice', 'NARRATOR', 'Rain on Lower Wacker.'), P(2, 'voice', 'NICK', "Drop it or I'll — Nick!"), P(3, 'voice', 'NARRATOR', 'He opens the trunk.')]
  const lines = soundLines(positions)
  const flagged = flagSoundLines(lines)
  const catalog = SFX_CATALOG_NAMES.filter((n) => ['CR-02', 'ALL-37', 'ALL-21'].includes(n.id))

  test('only catalog IDs play; an unknown ID is skipped and recorded as wanted — no backup', () => {
    const raw = {
      backgrounds: [{ line: 1, sound: 'ALL-37' }],
      decisions: [
        { line: 1, verdict: 'skip', reason: 'covered by background' },
        { line: 2, verdict: 'play', reason: 'shot', sound: 'CR-02', afterWords: "or I'll" },
        { line: 3, verdict: 'play', reason: 'trunk', sound: 'XX-99', wanted: 'car trunk opening' },
      ],
    }
    const { cues, decisions, wanted } = validateSoundMap(raw, { lines, flagged, scriptCueIndices: [], ceiling: 40, catalog })
    expect(cues.map((c) => c.catalogId)).toEqual(['ALL-37', 'CR-02'])
    expect(cues.find((c) => c.catalogId === 'CR-02')).toMatchObject({ cue: 'Pistol, single shot, outdoor', kind: 'spot', afterWords: "or I'll" })
    expect(cues.find((c) => c.catalogId === 'ALL-37')?.kind).toBe('background')
    expect(decisions.find((d) => d.line === 3)?.verdict).toBe('skip')
    expect(wanted).toEqual([{ line: 3, wanted: 'car trunk opening' }])
  })
  test('a spot cannot be used as a scene background', () => {
    const { cues } = validateSoundMap({ backgrounds: [{ line: 1, sound: 'ALL-21' }] }, { lines, flagged, scriptCueIndices: [], ceiling: 40, catalog })
    expect(cues).toHaveLength(0)
  })
  test('prompt lists the catalog and forbids near matches and backups', () => {
    const p = buildSoundMapPrompt({ lines, flagged, genre: 'Crime', scriptCues: [], ceiling: 40, catalog })
    expect(p).toContain('CR-02: Pistol, single shot, outdoor (spot)')
    expect(p).toMatch(/ONLY use sounds from the SOUND CATALOG/)
    expect(p).toMatch(/Never pick a near match/)
    expect(p).toMatch(/NO sound/)
  })
})

describe('SFX-CATALOG-001 mix + report', () => {
  test('catalog kind decides spot or background, not the words', () => {
    const plan = planLayeredBody([
      { kind: 'sfx', idx: 0.5, path: '/car', dur: 10, cue: 'Car interior, driving', role: 'bed' },
      { kind: 'voice', idx: 1, path: '/1', dur: 5 },
    ])
    expect(plan.sfx[0].role).toBe('bed')
  })
  test('report lists sounds wanted but not in the catalog', () => {
    const r = buildSfxReport('Test', [{ episodeNumber: 1, title: 'Lower Wacker', positions: [], scriptSources: {}, overlay: {
      storyId: 's', genre: '', createdAt: '', model: null, planner: 'catalog', cues: [], wanted: [{ line: 3, wanted: 'car trunk opening' }],
    } }])
    expect(r).toMatch(/SOUNDS WANTED BUT NOT IN THE CATALOG — 1 \(these moments got no sound\)/)
    expect(r).toMatch(/line 3: car trunk opening/)
  })
})

describe('SFX-NAMED-001 writer rule', () => {
  test('off by default; when on it requires named-or-reacted sounds from the catalog only', () => {
    expect(sfxSoundAgreementRule({})).toBe('')
    const rule = sfxSoundAgreementRule({ SFX_V2: 'on' })
    expect(rule).toMatch(/NAMED or REACTED TO/)
    expect(rule).toMatch(/Never just describe a sound/)
    expect(rule).toMatch(/Use ONLY sounds from the SOUND CATALOG/)
    expect(rule).toContain('Pistol, single shot, indoor')
  })
})
