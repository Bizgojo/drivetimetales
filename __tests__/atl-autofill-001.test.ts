// ATL-AUTOFILL-001: iOS autofill semantics on auth forms (Marc rehearsal friction).
// The jest setup here is node-env ts-jest with no JSX/RTL infra, so these are
// focused source-level assertions on the auth page markup: every auth input
// must carry the autocomplete/name/inputMode/iOS-keyboard attributes that make
// Safari autofill cooperate, and the signin email+password inputs must live in
// ONE form (iOS credential autofill ignores formless / split inputs).
import { readFileSync } from 'fs'
import { join } from 'path'

const page = (p: string) => readFileSync(join(__dirname, '..', 'app', p), 'utf8')

// Attributes every email field needs so iOS stops capitalizing/correcting.
const IOS_EMAIL_ATTRS = [
  'inputMode="email"',
  'autoCapitalize="none"',
  'autoCorrect="off"',
  'spellCheck={false}',
]

describe('ATL-AUTOFILL-001: signin page', () => {
  const src = page('signin/page.tsx')

  it('email input is a named email field with credential-autofill semantics', () => {
    expect(src).toContain('type="email"')
    expect(src).toContain('name="email"')
    // Email-as-login: iOS keys credential autofill off autocomplete="username".
    expect(src).toContain('autoComplete="username"')
    expect(src).not.toContain('autoComplete="email"')
    for (const attr of IOS_EMAIL_ATTRS) expect(src).toContain(attr)
  })

  it('password input is named and marked current-password', () => {
    expect(src).toContain('name="password"')
    expect(src).toContain('autoComplete="current-password"')
  })

  it('email and password share a single form (no nested/split forms)', () => {
    const formOpens = src.match(/<form\b/g) || []
    expect(formOpens).toHaveLength(1)
    const formStart = src.indexOf('<form')
    const formEnd = src.indexOf('</form>')
    expect(formStart).toBeGreaterThan(-1)
    expect(formEnd).toBeGreaterThan(formStart)
    const formBody = src.slice(formStart, formEnd)
    expect(formBody).toContain('name="email"')
    expect(formBody).toContain('name="password"')
  })

  it('form submit dispatches to the same handlers (magic link vs password)', () => {
    expect(src).toContain('onSubmit={handleFormSubmit}')
    expect(src).toContain('e.preventDefault()')
    expect(src).toContain('handlePasswordSignIn(e)')
    expect(src).toContain('handleMagicLink()')
  })
})

describe('ATL-AUTOFILL-001: signup page', () => {
  const src = page('signup/page.tsx')

  it('name field uses given-name', () => {
    expect(src).toContain('name="firstName"')
    expect(src).toContain('autoComplete="given-name"')
  })

  it('email field has full iOS email semantics', () => {
    expect(src).toContain('name="email"')
    expect(src).toContain('autoComplete="email"')
    for (const attr of IOS_EMAIL_ATTRS) expect(src).toContain(attr)
  })

  it('password field is new-password', () => {
    expect(src).toContain('name="password"')
    expect(src).toContain('autoComplete="new-password"')
  })
})

describe('ATL-AUTOFILL-001: forgot-password page', () => {
  const src = page('forgot-password/page.tsx')

  it('email field has full iOS email semantics', () => {
    expect(src).toContain('name="email"')
    expect(src).toContain('autoComplete="email"')
    for (const attr of IOS_EMAIL_ATTRS) expect(src).toContain(attr)
  })
})

describe('ATL-AUTOFILL-001: reset-password page', () => {
  const src = page('reset-password/page.tsx')

  it('both password fields are named and new-password', () => {
    expect(src).toContain('name="new-password"')
    expect(src).toContain('name="confirm-password"')
    expect((src.match(/autoComplete="new-password"/g) || []).length).toBe(2)
  })
})

describe('ATL-AUTOFILL-001: auth/signup stub page', () => {
  const src = page('auth/signup/page.tsx')

  it('name/email/password fields carry autofill semantics', () => {
    expect(src).toContain('autoComplete="given-name"')
    expect(src).toContain('autoComplete="email"')
    expect(src).toContain('autoComplete="new-password"')
    for (const attr of IOS_EMAIL_ATTRS) expect(src).toContain(attr)
  })
})
