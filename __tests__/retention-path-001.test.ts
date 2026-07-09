/**
 * RETENTION-PATH-001 — trial-retention path regression tests
 *
 * 1. Welcome email: prominent app-link button + iPhone/Android install steps
 * 2. Day-1 install email: same guarantees, install-dedicated copy
 * 3. installReoffer lib: request/consume semantics + standalone no-op
 */
import { renderWelcomeEmail, renderDay1InstallEmail, APP_HOME_URL } from '@/lib/emails/retentionTemplates'

describe('RETENTION-PATH-001 email templates', () => {
  const templates = [
    ['welcome', renderWelcomeEmail('Marc')],
    ['day1', renderDay1InstallEmail('Marc')],
  ] as const

  test.each(templates)('%s email contains prominent app link button', (_name, t) => {
    expect(t.html).toContain(APP_HOME_URL)
    // Button style: solid orange, bold — the "find the app again" affordance
    expect(t.html).toMatch(new RegExp(`<a href="${APP_HOME_URL}"[^>]*background:#f97316`))
  })

  test.each(templates)('%s email contains iPhone home-screen install steps', (_name, t) => {
    expect(t.html).toContain('iPhone')
    expect(t.html).toContain('Safari')
    expect(t.html).toContain('Share')
    expect(t.html).toContain('Add to Home Screen')
  })

  test.each(templates)('%s email contains Android home-screen install steps', (_name, t) => {
    expect(t.html).toContain('Android')
    expect(t.html).toContain('Chrome')
    expect(t.html).toMatch(/Add to Home Screen|Install app/)
  })

  test('welcome email greets by name and keeps trial framing', () => {
    const t = renderWelcomeEmail('Marc')
    expect(t.subject).toContain('Welcome')
    expect(t.html).toContain('Welcome, Marc')
    expect(t.html).toContain('free trial')
  })

  test('day1 email tolerates missing name', () => {
    const t = renderDay1InstallEmail('')
    expect(t.html).toContain('Hey there')
  })
})

describe('RETENTION-PATH-001 install re-offer lib', () => {
  let store: Record<string, string>
  let dispatched: string[]
  let standalone: boolean

  beforeEach(() => {
    jest.resetModules()
    store = {}
    dispatched = []
    standalone = false
    ;(global as any).window = {
      navigator: {},
      matchMedia: () => ({ matches: standalone }),
      dispatchEvent: (e: { type: string }) => { dispatched.push(e.type); return true },
    }
    ;(global as any).localStorage = {
      getItem: (k: string) => (k in store ? store[k] : null),
      setItem: (k: string, v: string) => { store[k] = String(v) },
      removeItem: (k: string) => { delete store[k] },
    }
    ;(global as any).Event = class { type: string; constructor(type: string) { this.type = type } }
  })

  afterEach(() => {
    delete (global as any).window
    delete (global as any).localStorage
  })

  function lib() {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('@/lib/installReoffer')
  }

  test('requestInstallReoffer sets flag and dispatches event', () => {
    const { requestInstallReoffer, INSTALL_REOFFER_KEY, INSTALL_REOFFER_EVENT } = lib()
    requestInstallReoffer()
    expect(store[INSTALL_REOFFER_KEY]).toBeDefined()
    expect(dispatched).toContain(INSTALL_REOFFER_EVENT)
  })

  test('consumeInstallReoffer returns true once, then false (max one banner per completion)', () => {
    const { requestInstallReoffer, consumeInstallReoffer } = lib()
    requestInstallReoffer()
    expect(consumeInstallReoffer()).toBe(true)
    expect(consumeInstallReoffer()).toBe(false)
  })

  test('requestInstallReoffer is a no-op when app is installed (standalone)', () => {
    standalone = true
    const { requestInstallReoffer, INSTALL_REOFFER_KEY } = lib()
    requestInstallReoffer()
    expect(store[INSTALL_REOFFER_KEY]).toBeUndefined()
    expect(dispatched).toHaveLength(0)
  })

  test('consumeInstallReoffer is false with no pending flag', () => {
    const { consumeInstallReoffer } = lib()
    expect(consumeInstallReoffer()).toBe(false)
  })
})
