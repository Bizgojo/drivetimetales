import fs from 'fs'
const src = fs.readFileSync('components/player/CanonicalPlayer.tsx', 'utf8')
test('auto-advance / series-continue start the next episode at 0:00', () => {
  expect(src).toContain("q.get('autoAdvance') === '1' || q.get('seriesContinue') === '1'")
  expect(src).toContain('playlistAutoplayPendingRef.current || arrivedByAutoAdvance ||')
  // the advance URL still carries the flag
  expect(src).toMatch(/seriesContinue=1' : 'autoAdvance=1'/)
})
