import { readFileSync } from 'fs'
import { join } from 'path'

describe('DEPLOY-SELF-CHECK-001', () => {
  const src = readFileSync(join(__dirname, '..', 'scripts/ec2-deploy/zero-downtime-deploy.sh'), 'utf8')
  test('the script compares itself with origin/main and runs that copy when different, before any deploy step', () => {
    const at = src.indexOf('DEPLOY-SELF-CHECK-001')
    expect(at).toBeGreaterThan(0)
    expect(src).toContain('git -C "$MAIN" show origin/main:scripts/ec2-deploy/zero-downtime-deploy.sh > "$FRESH"')
    expect(src).toContain('if ! cmp -s "$0" "$FRESH"; then')
    expect(src).toContain('ET_DEPLOY_SELF_CHECKED=1 exec bash "$FRESH" "$@"')
    expect(at).toBeLessThan(src.indexOf('ACTIVE="$(active_port)"'))
  })
  test('it stops if origin/main cannot be read', () => {
    expect(src).toContain('STOP: could not read the deploy script from origin/main')
  })
})
