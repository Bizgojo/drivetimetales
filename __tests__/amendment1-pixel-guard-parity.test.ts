// __tests__/amendment1-pixel-guard-parity.test.ts — Amendment 1 Gap 8.4b
//
// Pins TikTok/Meta guard parity: both inline pixel predicates must check
// localStorage et_test_account, and lib/tracking/client.ts
// isTestSessionClient must treat that flag as a test session.
import * as fs from 'fs'
import * as path from 'path'
import { isTestSessionClient } from '@/lib/tracking/client'

const COMPONENTS_DIR = path.join(process.cwd(), 'components')

function readComponent(name: string): string {
  return fs.readFileSync(path.join(COMPONENTS_DIR, name), 'utf8')
}

describe('Amendment 1 Gap 8.4b — pixel guard parity (Meta vs TikTok)', () => {
  it('MetaPixel checks localStorage et_test_account', () => {
    expect(readComponent('MetaPixel.tsx')).toContain(
      "localStorage.getItem('et_test_account') === '1'"
    )
  })

  it('TikTokPixel checks localStorage et_test_account (parity with Meta)', () => {
    expect(readComponent('TikTokPixel.tsx')).toContain(
      "localStorage.getItem('et_test_account') === '1'"
    )
  })
})

describe('isTestSessionClient — localStorage et_test_account flag', () => {
  const store: Record<string, string> = {}
  const g = globalThis as any
  const savedWindow = g.window
  const savedDocument = g.document

  beforeEach(() => {
    for (const k of Object.keys(store)) delete store[k]
    g.window = {
      location: { search: '' },
      sessionStorage: { getItem: () => null, setItem: () => {} },
      localStorage: {
        getItem: (k: string) => (k in store ? store[k] : null),
        setItem: (k: string, v: string) => {
          store[k] = v
        },
        removeItem: (k: string) => {
          delete store[k]
        },
      },
    }
    g.document = { cookie: '' }
  })

  afterEach(() => {
    g.window = savedWindow
    g.document = savedDocument
  })

  it("returns true when localStorage et_test_account === '1'", () => {
    store['et_test_account'] = '1'
    expect(isTestSessionClient()).toBe(true)
  })

  it('returns false with no flags set', () => {
    expect(isTestSessionClient()).toBe(false)
  })
})
