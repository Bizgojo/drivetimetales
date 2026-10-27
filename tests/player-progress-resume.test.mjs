import test from 'node:test'
import assert from 'node:assert/strict'
import { getLocalPlayerProgress, saveLocalPlayerProgress, mergePlayerProgress } from '../lib/playerProgress.ts'

const data = new Map()
globalThis.window = { localStorage: {
  getItem: key => data.get(key) ?? null,
  setItem: (key, value) => data.set(key, value),
} }
const local = (progress, updatedAt, completed = false) => ({ storyId: 'story', progress, updatedAt, completed, durationSecs: 600 })

test('a rewind replaces the locally saved position', () => {
  saveLocalPlayerProgress('rewind', 246, { userId: 'listener' })
  saveLocalPlayerProgress('rewind', 231, { userId: 'listener' })
  assert.equal(getLocalPlayerProgress('rewind', 'listener').progress, 231)
})
test('newer local rewind wins over an older server position', () => {
  assert.equal(mergePlayerProgress({ progress: 246, last_played: '2026-10-26T19:00:00Z' }, local(231, '2026-10-26T19:01:00Z')).progress, 231)
})
test('newer server rewind from another device wins over local progress', () => {
  assert.equal(mergePlayerProgress({ progress: 180, last_played: '2026-10-26T19:02:00Z' }, local(231, '2026-10-26T19:01:00Z')).progress, 180)
})
test('a seek to zero survives storage and merging', () => {
  saveLocalPlayerProgress('zero', 200)
  saveLocalPlayerProgress('zero', 0)
  assert.equal(getLocalPlayerProgress('zero').progress, 0)
  assert.equal(mergePlayerProgress({ progress: 200 }, getLocalPlayerProgress('zero')).progress, 0)
})
test('earned completion remains sticky after seeking backward', () => {
  saveLocalPlayerProgress('finished', 600, { completed: true })
  saveLocalPlayerProgress('finished', 100)
  assert.equal(getLocalPlayerProgress('finished').completed, true)
  assert.equal(mergePlayerProgress({ progress: 600, completed: true }, local(100, '2026-10-26T19:01:00Z')).completed, true)
})
