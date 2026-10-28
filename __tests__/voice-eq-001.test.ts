import { readFileSync } from 'fs'
import { join } from 'path'
import { NICK_BRENNAN_VOICE_ID, THOMAS_VOICE_ID, isReservedHeroVoice, voicePostEqFilter } from '@/lib/voiceEq'
import { isReservedAuthor, selectableAuthors } from '@/lib/reservedTalent'

// NICK-VOICE-001: Marc chose Vince Caulfield's voice for Nick Brennan (2026-10-28).
const src = readFileSync(join(__dirname, '..', 'app/api/admin/generate-voices/route.ts'), 'utf8')
const runNext = readFileSync(join(__dirname, '..', 'app/api/admin/production-jobs/run-next/route.ts'), 'utf8')

describe('NICK-VOICE-001 (supersedes the Thomas bass lift)', () => {
  test("Nick's voice is reserved; Thomas is a normal voice with no EQ", () => {
    expect(isReservedHeroVoice(NICK_BRENNAN_VOICE_ID)).toBe(true)
    expect(isReservedHeroVoice(THOMAS_VOICE_ID)).toBe(false)
    expect(voicePostEqFilter(THOMAS_VOICE_ID)).toBeNull()
  })
  test('auto-cast scoring and the gender fallback skip reserved voices', () => {
    expect(src).toMatch(/\.filter\(v => !isReservedHeroVoice\(v\.voice_id\)\)/)
    expect(src).toMatch(/!isReservedHeroVoice\(v\.voice_id\) &&\n/)
  })
  test('the per-voice EQ hook stays in place before loudness normalization', () => {
    expect(src).toMatch(/const eqFilter = voicePostEqFilter\(voiceId\)\n\s*const preBuf = eqFilter \? await applyVoicePostEq\(filteredBuf, eqFilter\) : filteredBuf\n\s*return normalizeSpokenBuffer\(preBuf, inputText, prefix\)/)
  })
  test('Jack Malone is used only when requested by name', () => {
    const pool = [{ name: 'Jack Malone' }, { name: 'Nadia Cross' }, { name: 'Roman Steele' }]
    expect(isReservedAuthor('Jack Malone')).toBe(true)
    expect(selectableAuthors(pool, '').map((a) => a.name)).toEqual(['Nadia Cross', 'Roman Steele'])
    expect(selectableAuthors(pool, 'Jack Malone').map((a) => a.name)).toEqual(['Jack Malone', 'Nadia Cross', 'Roman Steele'])
    expect(runNext).toMatch(/const authors = selectableAuthors\(\(data \|\| \[\]\) as AuthorRow\[\], requestedAuthor\)/)
  })
})
