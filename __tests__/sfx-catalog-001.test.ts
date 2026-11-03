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
  test('test mode never uses kept-library sounds (SFX-TEST-LICENSED-ONLY-001); production needs 3 approved takes', () => {
    const { catalog } = proposeTakesFromKeptLibrary(emptyCatalog(), library, names)
    expect(liveNames(catalog, 'test', names)).toEqual([])
    expect(liveNames(catalog, 'production', names)).toEqual([])
    catalog.entries['CR-01'].takes.forEach((t) => { t.status = 'approved' })
    // SOUNDSNAP-ONLY-001: approved old library sounds still never play
    expect(liveNames(catalog, 'production', names)).toEqual([])
    catalog.entries['CR-01'].takes.forEach((t) => { t.source = 'licensed' })
    expect(liveNames(catalog, 'production', names).map((n) => n.id)).toEqual(['CR-01'])
  })
  test('takes rotate by place, stable for the same place', () => {
    const { catalog } = proposeTakesFromKeptLibrary(emptyCatalog(), library, names)
    catalog.entries['CR-01'].takes.forEach((t) => { t.source = 'licensed' })
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
  const positions = [P(1, 'voice', 'NARRATOR', 'Rain on Lower Wacker.'), P(2, 'voice', 'NICK', "Drop it or I'll — Nick!"), P(3, 'voice', 'NARRATOR', 'He opens the trunk.'),
    P(4, 'silence', '', ''), P(5, 'voice', 'NARRATOR', 'Rain hammers the car roof.'), P(6, 'voice', 'NICK', 'Go.'),
    P(7, 'silence', '', ''), P(8, 'voice', 'NARRATOR', 'Still in the car, rain on the roof.'),
    P(9, 'silence', '', ''), P(10, 'voice', 'NARRATOR', 'Back on the street.')]
  const lines = soundLines(positions)
  const flagged = flagSoundLines(lines)
  const catalog = SFX_CATALOG_NAMES.filter((n) => ['CR-02', 'ALL-37', 'ALL-21'].includes(n.id))

  test('only catalog IDs play; an unknown ID is skipped and recorded as wanted — no backup', () => {
    const raw = {
      backgrounds: [{ line: 5, sound: 'ALL-37' }],
      decisions: [
        { line: 1, verdict: 'skip', reason: 'covered by background' },
        { line: 2, verdict: 'play', reason: 'shot', sound: 'CR-02', afterWords: "or I'll" },
        { line: 3, verdict: 'play', reason: 'trunk', sound: 'XX-99', wanted: 'car trunk opening' },
      ],
    }
    const { cues, decisions, wanted } = validateSoundMap(raw, { lines, flagged, scriptCueIndices: [], ceiling: 40, catalog })
    expect(cues.map((c) => c.catalogId).sort()).toEqual(['ALL-37', 'CR-02'])
    expect(cues.find((c) => c.catalogId === 'CR-02')).toMatchObject({ cue: 'Pistol, single shot, outdoor', kind: 'spot', afterWords: "or I'll" })
    expect(cues.find((c) => c.catalogId === 'ALL-37')?.kind).toBe('background')
    expect(decisions.find((d) => d.line === 3)?.verdict).toBe('skip')
    expect(wanted).toEqual([{ line: 3, wanted: 'car trunk opening' }])
  })
  test('a spot cannot be used as a scene background', () => {
    const { cues } = validateSoundMap({ backgrounds: [{ line: 5, sound: 'ALL-21' }] }, { lines, flagged, scriptCueIndices: [], ceiling: 40, catalog })
    expect(cues).toHaveLength(0)
  })
  test('BG-SCENE-SETTER-001: no background at the story start; none when the place is the same as the scene before', () => {
    const cat = SFX_CATALOG_NAMES.filter((n) => ['ALL-37', 'CR-27'].includes(n.id))
    const raw = { backgrounds: [{ line: 8, sound: 'ALL-37' }, { line: 1, sound: 'CR-27' }, { line: 5, sound: 'ALL-37' }] }
    const { cues, rejected } = validateSoundMap(raw, { lines, flagged, scriptCueIndices: [], ceiling: 40, catalog: cat })
    expect(cues.map((c) => `${c.beforeIndex}:${c.catalogId}`)).toEqual(['5:ALL-37'])
    expect(rejected.map((r) => r.reason)).toEqual(expect.arrayContaining(['no background at the start of the story']))
  })
  test('BG-SPACING-001: a story with no scene breaks still gets spaced backgrounds, never at the start or back-to-back', () => {
    const { BG_START_LINES, BG_GAP_LINES } = require('@/lib/sfxSoundMap')
    const long = soundLines(Array.from({ length: 80 }, (_, i) => P(i + 1, 'voice', 'NARRATOR', `Line ${i + 1}.`)))
    const cat = SFX_CATALOG_NAMES.filter((n) => ['ALL-37', 'CR-28', 'CR-27'].includes(n.id))
    const raw = { backgrounds: [
      { line: 2, sound: 'CR-28' },                                  // start of story → no
      { line: BG_START_LINES + 4, sound: 'CR-28' },                 // ok
      { line: BG_START_LINES + 10, sound: 'CR-27' },                // too close → no
      { line: BG_START_LINES + 4 + BG_GAP_LINES, sound: 'ALL-37' }, // ok
      { line: BG_START_LINES + 4 + 2 * BG_GAP_LINES, sound: 'ALL-37' }, // same place again → no
    ] }
    const { cues, rejected } = validateSoundMap(raw, { lines: long, flagged: [], scriptCueIndices: [], ceiling: 40, catalog: cat })
    expect(cues.map((c) => `${c.beforeIndex}:${c.catalogId}`)).toEqual([`${BG_START_LINES + 4}:CR-28`, `${BG_START_LINES + 4 + BG_GAP_LINES}:ALL-37`])
    expect(rejected.map((r) => r.reason).sort()).toEqual(['no background at the start of the story', 'same place as the scene before', 'too close to the last background'])
  })
  test('BG-SCENE-SETTER-001: prompt says short scene-setter, never in the first scene', () => {
    const p = buildSoundMapPrompt({ lines, flagged, genre: 'Crime', scriptCues: [], ceiling: 40, catalog })
    expect(p).toMatch(/short scene-setter/)
    expect(p).toMatch(/Never in the first scene of the story/)
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
  test('BG-SCENE-SETTER-001: with scene-setter options a background lasts ~10 s, not the whole scene', () => {
    const { sceneSetterBedOptions, sfxV2Options, mixV3BedOptions, SCENE_SETTER_SEC } = require('@/lib/sfxLayeredMix')
    const items: any[] = [{ kind: 'sfx', idx: 0.5, path: '/rain', dur: 60, cue: 'Rain, heavy, on a roof', role: 'bed' }]
    for (let i = 1; i <= 12; i++) items.push({ kind: 'voice', idx: i, path: `/${i}`, dur: 8 })
    const long = planLayeredBody(items, { ...sfxV2Options(), ...mixV3BedOptions() })
    const short = planLayeredBody(items, { ...sfxV2Options(), ...mixV3BedOptions(), ...sceneSetterBedOptions() })
    expect(long.sfx[0].length).toBeGreaterThan(60)
    expect(short.sfx[0].length).toBeCloseTo(SCENE_SETTER_SEC, 5)
    expect(short.sfx[0].fadeOut).toBe(3)
  })
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
    expect(sfxSoundAgreementRule({ SFX_WRITER_RULE: 'on' })).toMatch(/NAMED or REACTED TO/)
    const rule = sfxSoundAgreementRule({ SFX_V2: 'on' })
    expect(rule).toMatch(/NAMED or REACTED TO/)
    expect(rule).toMatch(/Never just describe a sound/)
    expect(rule).toMatch(/Use ONLY sounds from the SOUND CATALOG/)
    expect(rule).toContain('Pistol, single shot, indoor')
  })
})

describe('SFX-SOUNDSNAP-001 licensed takes', () => {
  const { addLicensedTakes, catalogIdFromLibraryId } = require('@/lib/sfxCatalog')
  const lic = (id: string, status?: 'approved' | 'rejected'): SfxLibraryEntry => ({ id, path: `sfx-library/${id}.mp3`, name: id, tags: [], source: 'soundsnap', ...(status ? { status } : {}) })
  test('folder name decides the catalog name', () => {
    expect(catalogIdFromLibraryId('soundsnap/all-01-door-wood-open-01')).toBe('ALL-01')
    expect(catalogIdFromLibraryId('soundsnap/cr-1/pistol')).toBe('CR-01')
    expect(catalogIdFromLibraryId('soundsnap/xx-99-nothing')).toBeNull()
    expect(catalogIdFromLibraryId('sonniss/door-open')).toBeNull()
  })
  test('licensed sounds become candidates, usable in TEST, and push out kept-library candidates', () => {
    const names = SFX_CATALOG_NAMES.filter((n) => n.id === 'CR-01')
    const start = proposeTakesFromKeptLibrary(emptyCatalog(), [kept('a', 'pistol shot close indoor 1'), kept('b', 'pistol shot close indoor 2'), kept('c', 'pistol shot close indoor 3')], names).catalog
    const { catalog, added } = addLicensedTakes(start, [lic('soundsnap/cr-01-shot-a'), lic('soundsnap/cr-01-shot-b'), lic('soundsnap/cr-01-bad', 'rejected')], names)
    expect(added).toBe(2)
    const takes = catalog.entries['CR-01'].takes
    expect(takes).toHaveLength(3)
    expect(takes.filter((t: any) => t.source === 'licensed').map((t: any) => t.libraryId)).toEqual(['soundsnap/cr-01-shot-a', 'soundsnap/cr-01-shot-b'])
    // test mixes hear only the 2 licensed takes, not the kept-library one left over
    expect(liveNames(catalog, 'test', names)[0].takes.map((t: any) => t.libraryId)).toEqual(['soundsnap/cr-01-shot-a', 'soundsnap/cr-01-shot-b'])
    expect(liveNames(catalog, 'production', names)).toEqual([])
  })
  test('approved and discarded takes are kept; a discarded sound never returns', () => {
    const names = SFX_CATALOG_NAMES.filter((n) => n.id === 'CR-01')
    const start: CatalogFile = { ...emptyCatalog(), entries: { 'CR-01': { takes: [
      { libraryId: 'soundsnap/cr-01-x', path: 'x', name: 'x', source: 'licensed', status: 'discarded' },
      { libraryId: 'soundsnap/cr-01-y', path: 'y', name: 'y', source: 'licensed', status: 'approved' },
    ] } } }
    const { catalog } = addLicensedTakes(start, [lic('soundsnap/cr-01-x'), lic('soundsnap/cr-01-z')], names)
    expect(catalog.entries['CR-01'].takes.map((t: any) => `${t.libraryId}:${t.status}`)).toEqual(['soundsnap/cr-01-x:discarded', 'soundsnap/cr-01-y:approved', 'soundsnap/cr-01-z:candidate'])
  })
  test('a TEST mix turns effects on for itself only', () => {
    const src = require('fs').readFileSync(require('path').join(__dirname, '../scripts/sfx-preview.ts'), 'utf8')
    expect(src).toContain("process.env.SFX_OFF = 'off'")
  })
})

describe('SFX-SOUNDSNAP-001 script cues use the catalog', () => {
  const catalog = SFX_CATALOG_NAMES.filter((n) => ['ALL-05', 'CR-01'].includes(n.id))
  const lines = [
    { index: 1, scene: 0, speaker: 'NARRATOR', text: 'She waited by the window.' },
    { index: 3, scene: 0, speaker: 'TESS', text: 'Who is it?' },
    { index: 5, scene: 0, speaker: 'NARRATOR', text: 'Nobody answered.' },
  ] as any
  test('each script cue gets a catalog sound before the next line, or nothing', () => {
    const raw = { scriptCues: [{ cue: 2, sound: 'ALL-05' }, { cue: 4, sound: null, wanted: 'owl hoot' }, { cue: 9, sound: 'CR-01' }], decisions: [], backgrounds: [], extra: [] }
    const { cues, wanted } = validateSoundMap(raw, { lines, flagged: [], scriptCueIndices: [2, 4], ceiling: 10, catalog })
    expect(cues.map((c) => `${c.beforeIndex}:${c.catalogId}`)).toEqual(['3:ALL-05'])
    expect(wanted).toEqual([{ line: 4, wanted: 'owl hoot' }])
  })
  test('the catalog prompt asks for every script cue; old recordings are not used in catalog mode', () => {
    const prompt = buildSoundMapPrompt({ lines, flagged: [], genre: 'crime', scriptCues: [{ index: 2, text: 'knock at the door' }], ceiling: 10, catalog })
    expect(prompt).toContain('TASK 0')
    expect(prompt).toContain('SCRIPT SOUND CUES (cue number: what the script asks for): 2: knock at the door')
    const core = require('fs').readFileSync(require('path').join(__dirname, '../app/api/asc3/render-final-mix/core.ts'), 'utf8')
    expect(core).toContain('const parsedSfx = sfxIsDisabled || catalogSfxMode ? [] : files')
  })
})

describe('SFX-REPLACE-001 discard then add new licensed takes', () => {
  const { addLicensedTakes, discardTakes } = require('@/lib/sfxCatalog')
  const lic = (id: string): SfxLibraryEntry => ({ id, path: `sfx-library/${id}.mp3`, name: id, tags: [], source: 'soundsnap' })
  const names = SFX_CATALOG_NAMES.filter((n) => n.id === 'CR-02')
  const tails = ['soundsnap/cr-02/300723-cz75-tail-100m-ste-01', 'soundsnap/cr-02/300729-cz75-tail-20m-03', 'soundsnap/cr-02/300740-cz75-tail-25m-d-03']
  const close = ['soundsnap/cr-02/339015-pistol-ruger-44-magnum-single-shot-close-perspective-processed', 'soundsnap/cr-02/339035-pistol-springfield-xd45-single-shot-close-perspective-processed']
  test('full name: new sounds are turned away until the old ones are discarded', () => {
    const full = addLicensedTakes(emptyCatalog(), tails.map(lic), names).catalog
    expect(addLicensedTakes(full, [...tails, ...close].map(lic), names).added).toBe(0)
    const { catalog: cleared, discarded } = discardTakes(full, ['cz75-tail'])
    expect(discarded).toHaveLength(3)
    const { catalog } = addLicensedTakes(cleared, [...tails, ...close].map(lic), names)
    expect(liveNames(catalog, 'test', names)[0].takes.map((t: any) => t.libraryId)).toEqual(close)
    // running the discard again changes nothing and never drops the new ones
    const again = discardTakes(catalog, ['cz75-tail'])
    expect(again.discarded).toEqual([])
    expect(liveNames(again.catalog, 'test', names)[0].takes).toHaveLength(2)
  })
  test('no words = no change', () => {
    const full = addLicensedTakes(emptyCatalog(), tails.map(lic), names).catalog
    expect(discardTakes(full, []).discarded).toEqual([])
    expect(discardTakes(full, ['', ' ']).catalog).toBe(full)
  })
})

describe('SOUNDSNAP-ONLY-001', () => {
  const { soundsnapOnly } = require('@/lib/sfxSwitch')
  test('on by default; SFX_SOUNDSNAP_ONLY=off turns it off', () => {
    expect(soundsnapOnly({})).toBe(true)
    expect(soundsnapOnly({ SFX_SOUNDSNAP_ONLY: 'off' })).toBe(false)
  })
  test('production uses only approved Soundsnap takes — an approved old library sound never plays', () => {
    const names = SFX_CATALOG_NAMES.filter((n) => n.id === 'CR-01')
    const take = (id: string, source: 'licensed' | 'kept-library') => ({ libraryId: id, path: id, name: id, source, status: 'approved' as const })
    const old: CatalogFile = { ...emptyCatalog(), entries: { 'CR-01': { takes: [take('a', 'kept-library'), take('b', 'kept-library'), take('c', 'kept-library')] } } }
    expect(liveNames(old, 'production', names)).toEqual([])
    const lic: CatalogFile = { ...emptyCatalog(), entries: { 'CR-01': { takes: [take('a', 'licensed'), take('b', 'licensed'), take('c', 'licensed')] } } }
    expect(liveNames(lic, 'production', names)).toHaveLength(1)
  })
  test('report: in catalog mode the script cue is "not played", never counted as AI-made', () => {
    const P2 = (index: number, kind: any, text: string) => ({ index, kind, speaker: 'NARRATOR', text, isExpected: true, rawLineNumber: index } as any)
    const r = buildSfxReport('T', [{ episodeNumber: 1, title: 'X', positions: [P2(5, 'sfx', 'rapid gunfire'), P2(6, 'voice', 'Three shots.')], scriptSources: {}, overlay: {
      storyId: 's', genre: '', createdAt: '', model: null, planner: 'catalog', cues: [],
    } }])
    expect(r).toMatch(/line 5 \(script cue\).*not played/)
    expect(r).not.toMatch(/AI-made \(no kept sound fit\)/)
    expect(r).toMatch(/0 were AI-made/)
  })
})
