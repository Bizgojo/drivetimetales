import { speakableText } from '@/lib/speakableText'
import { parseSegments, segName, backupProblems } from '../scripts/rerecord-lines'
import fs from 'fs'
import path from 'path'

describe('TRAILING-DASH-001 a final dash is voiced as a pause', () => {
  it('the two Sunset Ep 8 lines Marc heard garble', () => {
    expect(speakableText('He was also, it turned out, unable to keep a secret that large —')).toBe('He was also, it turned out, unable to keep a secret that large…')
    expect(speakableText('And Aiden — who could notice everything, who could fill every room —')).toBe('And Aiden — who could notice everything, who could fill every room…')
  })
  it('only the final dash changes; inner dashes and normal lines stay', () => {
    expect(speakableText('Not officially — nothing was official.')).toBe('Not officially — nothing was official.')
    expect(speakableText('I didn’t even know I --')).toBe('I didn’t even know I…')
    expect(speakableText('Wait –')).toBe('Wait…')
  })
  it('wordless text is left alone', () => {
    expect(speakableText('—')).toBe('—')
  })
  it('generate-voices sends speakableText to the voice', () => {
    const gv = fs.readFileSync(path.join(__dirname, '../app/api/admin/generate-voices/route.ts'), 'utf8')
    expect(gv).toMatch(/text: speakableText\(inputText\)/)
  })
})

describe('SAFE-RERECORD-001 re-record tool', () => {
  it('parses segment lists', () => {
    expect(parseSegments('134, 101,134')).toEqual([134, 101])
    expect(() => parseSegments('12,x')).toThrow()
    expect(segName(7)).toBe('segment_0007.mp3')
  })
  it('a missing or wrong-size backup file is a problem', () => {
    const planned = [{ name: 'segment_0134.mp3', size: 240161 }, { name: 'final_mix.mp3', size: 26183515 }]
    expect(backupProblems(planned, new Map([['segment_0134.mp3', 240161], ['final_mix.mp3', 26183515]]))).toEqual([])
    expect(backupProblems(planned, new Map([['segment_0134.mp3', 240161]]))).toHaveLength(1)
    expect(backupProblems(planned, new Map([['segment_0134.mp3', 1], ['final_mix.mp3', 26183515]]))[0]).toMatch(/expected 240161/)
  })
  it('backup is verified before any re-record call', () => {
    const src = fs.readFileSync(path.join(__dirname, '../scripts/rerecord-lines.ts'), 'utf8')
    expect(src.indexOf('BACKUP VERIFY FAILED')).toBeGreaterThan(0)
    expect(src.indexOf('BACKUP VERIFY FAILED')).toBeLessThan(src.indexOf('/api/admin/generate-voices'))
  })
})
