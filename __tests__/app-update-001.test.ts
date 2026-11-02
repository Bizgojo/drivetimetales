/** APP-UPDATE-001 (Marc 2026-11-01): open apps move to a new release on their own. */
import { readFileSync } from 'fs'
import { join } from 'path'
import { decideUpdate } from '@/lib/appUpdate'

const base = { current: 'v1', server: 'v2', playing: false, trigger: 'open' as const, adminPage: false, alreadyReloadedFor: null }

test('same version or no answer → nothing', () => {
  expect(decideUpdate({ ...base, server: 'v1' })).toBe('none')
  expect(decideUpdate({ ...base, server: '' })).toBe('none')
  expect(decideUpdate({ ...base, current: '' })).toBe('none')
})
test('new version on open or return with nothing playing → reload', () => {
  expect(decideUpdate(base)).toBe('reload')
  expect(decideUpdate({ ...base, trigger: 'return' })).toBe('reload')
})
test('never interrupts a story, an admin page, or the middle of browsing', () => {
  expect(decideUpdate({ ...base, playing: true })).toBe('banner')
  expect(decideUpdate({ ...base, adminPage: true })).toBe('banner')
  expect(decideUpdate({ ...base, trigger: 'timer' })).toBe('banner')
})
test('no reload loop for the same server version', () => {
  expect(decideUpdate({ ...base, alreadyReloadedFor: 'v2' })).toBe('banner')
  expect(decideUpdate({ ...base, server: 'v3', alreadyReloadedFor: 'v2' })).toBe('reload')
})
test('wired: version per build, endpoint, root layout', () => {
  const root = join(__dirname, '..')
  expect(readFileSync(join(root, 'next.config.js'), 'utf8')).toContain('NEXT_PUBLIC_APP_VERSION: appVersion()')
  expect(readFileSync(join(root, 'app/api/version/route.ts'), 'utf8')).toContain("export const dynamic = 'force-dynamic'")
  expect(readFileSync(join(root, 'app/layout.tsx'), 'utf8')).toContain('<AppUpdater />')
})
