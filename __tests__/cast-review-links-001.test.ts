/** CAST-REVIEW-LINKS-001 (Marc 2026-11-01): audition clips saved with links; one review per story. */
import { readFileSync } from 'fs'
import { join } from 'path'
import { castReviewClipPath, castReviewHeader } from '@/lib/castReview'

test('clip path per series, numbered within the story', () => {
  expect(castReviewClipPath('s1', 3, 'NOLAN ASHFORD')).toBe('asc3/series/s1/cast-review/03-NOLAN-ASHFORD.mp3')
})
test('the review header names the story and how many voices', () => {
  expect(castReviewHeader('The Last Well', 9)).toMatch(/VOICES READY — The Last Well\n9 character voices/)
})
test('clips are made once, saved, and their links kept on the review', () => {
  const src = readFileSync(join(__dirname, '../app/api/admin/production-jobs/run-next/route.ts'), 'utf8')
  expect(src).toContain('const clipPath = castReviewClipPath(seriesId, i + 1, item.name)')
  expect(src).toContain('sendCastReview({ seriesTitle, narratorName: first.narrator_voice_name || null, items, clips })')
  expect(src).toContain("clipUrl: review.clipUrls[i.name]")
})
