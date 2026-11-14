import fs from 'fs'
import path from 'path'
import { progressStop, recordPatch, emptyProgress, quotedLine, MAX_SERIES_READS, progressStopSummary } from '@/lib/seriesProgress'

const driveway = `[continuity] "NARRATOR: She means Keller. Keller, who took the recorder and the receipt and the photographs from my hands forty-five minutes ago in Margaret Hale's driveway." — Keller was never there.`
const keller = `[continuity] "KELLER: Rosa mentioned a receipt to me last week. Said she'd overheard something before the drugging." — impossible timing.`

describe('SERIES-PROGRESS-STOP-001 (decision 152)', () => {
  test('quoted line drops the speaker label and punctuation', () => {
    expect(quotedLine(keller)).toBe("rosa mentioned a receipt to me last week said she'd overheard something before the drugging")
  })
  test('new blockers in untouched lines are progress', () => {
    const progress = recordPatch(emptyProgress(), { issues: [{ episode: 5, problem: driveway }], edits: [{ episode: 5, replace: "NARRATOR: She means Keller, who took the recorder forty-five minutes ago at his office." }] })
    expect(progressStop({ blockerReads: 3, issues: [{ episode: 2, problem: keller }], progress })).toEqual({ stop: false, reason: null })
  })
  test('a fixed blocker that comes back stops the series', () => {
    const progress = recordPatch(emptyProgress(), { issues: [{ episode: 5, problem: driveway }], edits: [] })
    const r = progressStop({ blockerReads: 2, issues: [{ episode: 5, problem: driveway }], progress })
    expect(r.stop).toBe(true)
    expect(r.reason).toContain('came back')
  })
  test('a blocker quoting a line a fix wrote stops the series', () => {
    const progress = recordPatch(emptyProgress(), { issues: [], edits: [{ episode: 6, replace: 'NINA: And a date in the upper corner: Wednesday morning, after the crash.' }] })
    const r = progressStop({ blockerReads: 2, issues: [{ episode: 6, problem: `[continuity] "And a date in the upper corner: Wednesday morning, after the crash" — contradicts the letter.` }], progress })
    expect(r.stop).toBe(true)
    expect(r.reason).toContain('fix made a new blocker')
  })
  test('same line in another episode is not a match', () => {
    const progress = recordPatch(emptyProgress(), { issues: [{ episode: 5, problem: driveway }], edits: [] })
    expect(progressStop({ blockerReads: 2, issues: [{ episode: 4, problem: driveway }], progress }).stop).toBe(false)
  })
  test('ceiling of 6 reads', () => {
    expect(MAX_SERIES_READS).toBe(6)
    expect(progressStop({ blockerReads: 5, issues: [{ episode: 2, problem: keller }], progress: emptyProgress() }).stop).toBe(false)
    expect(progressStop({ blockerReads: 6, issues: [{ episode: 2, problem: keller }], progress: emptyProgress() }).stop).toBe(true)
  })
  test('summary keeps the hard-stop marker the job runner looks for', () => {
    expect(progressStopSummary('6 series reads').startsWith('SERIES-HARD-STOP-001')).toBe(true)
  })
  test('run-next records patches and carries progress', () => {
    const src = fs.readFileSync(path.join(process.cwd(), 'app/api/admin/production-jobs/run-next/route.ts'), 'utf8')
    expect(src).toContain('seriesProgress: recordPatch(readProgress(')
    expect(src).toContain('seriesProgress: readProgress((continuityState as any).seriesProgress)')
    expect(src).toContain('progressStop({ blockerReads, issues: geminiVerdict.issues')
  })
})
