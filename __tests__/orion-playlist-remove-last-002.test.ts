import fs from 'fs'
import path from 'path'

// UX-PLAYLIST-002 (2026-07-15, Marc walk #2 iPhone leg): tapping "✓ Remove" on
// the LAST playlist item on /library did nothing. Mechanism: the empty-playlist
// persist branch called clearActivePlaylist() — which clears only the UNSCOPED
// localStorage keys and then dispatches et_playlist_cleared/et_playlist_saved.
// The library's syncPlaylist listener answers those events by rehydrating from
// the USER-SCOPED key (et_current_playlist_<uid>), which was never removed —
// silently resurrecting the removed item. These pins hold the fix: the
// user-scoped key is removed BEFORE clearActivePlaylist() fires its events.

const LIBRARY = fs.readFileSync(
  path.join(__dirname, '..', 'app', 'library', 'page.tsx'),
  'utf8'
)

describe('UX-PLAYLIST-002: removing the last playlist item must stick', () => {
  it('uses a user-scoped playlist key on /library', () => {
    expect(LIBRARY).toMatch(/et_current_playlist_\$\{user\.id\}/)
  })

  it('empty-playlist persist removes the user-scoped key, not just the unscoped keys', () => {
    expect(LIBRARY).toMatch(/localStorage\.removeItem\(playlistKey\)\s*\n\s*clearActivePlaylist\(\)/)
  })

  it('removes the scoped key BEFORE clearActivePlaylist dispatches rehydration events', () => {
    const removeIdx = LIBRARY.indexOf('localStorage.removeItem(playlistKey)')
    const clearIdx = LIBRARY.indexOf('clearActivePlaylist()', removeIdx)
    expect(removeIdx).toBeGreaterThan(-1)
    expect(clearIdx).toBeGreaterThan(removeIdx)
  })

  it('non-empty persist still writes the scoped key (removal of one-of-many unaffected)', () => {
    expect(LIBRARY).toMatch(/if \(playlist\.length > 0\) localStorage\.setItem\(playlistKey, JSON\.stringify\(playlist\)\)/)
  })
})
