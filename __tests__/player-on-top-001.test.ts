import fs from 'fs'
test('full player sits above page bars and below the header', () => {
  const pp = fs.readFileSync('components/player/PersistentPlayer.tsx', 'utf8')
  const lib = fs.readFileSync('app/library/page.tsx', 'utf8')
  const hdr = fs.readFileSync('components/AppHeader.tsx', 'utf8')
  const player = Number(pp.match(/top: 56, bottom: 0, left: 0, right: 0, zIndex: (\d+)/)![1])
  const genre = Number(lib.match(/aria-label="Story genres" style=\{\{ position: 'fixed'[^}]*zIndex: (\d+)/)![1])
  const header = Number(hdr.match(/<header style=\{\{[^}]*zIndex: (\d+)/)![1])
  expect(player).toBeGreaterThan(genre)
  expect(player).toBeGreaterThan(46)
  expect(player).toBeLessThan(header)
})
