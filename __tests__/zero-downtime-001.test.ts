/** ZERO-DOWNTIME-001 (Marc 2026-11-02): deploys build in an idle slot and switch only when healthy. */
import { execFileSync } from 'child_process'
import { readFileSync } from 'fs'
import { join } from 'path'

const dir = join(__dirname, '../scripts/ec2-deploy')
const sh = readFileSync(join(dir, 'zero-downtime-deploy.sh'), 'utf8')

test('script parses', () => { execFileSync('bash', ['-n', join(dir, 'zero-downtime-deploy.sh')]) })
test('builds in the idle slot, health-checks the exact build, then switches Caddy, then drains the old', () => {
  const i = (s: string) => { const n = sh.indexOf(s); expect(n).toBeGreaterThan(-1); return n }
  expect(i('npm run build')).toBeLessThan(i('systemctl restart "endlesstales-webapp@$TARGET.service"'))
  expect(i('/api/version')).toBeLessThan(i('systemctl reload caddy'))
  expect(i('systemctl reload caddy')).toBeLessThan(i('sudo systemctl stop "$OLD_UNIT"'))
  expect(sh).toContain('live app untouched')
})
test('version in the build matches what the script checks (12-char sha)', () => {
  expect(readFileSync(join(__dirname, '../next.config.js'), 'utf8')).toContain("git rev-parse --short=12 HEAD")
  expect(sh).toContain('rev-parse --short=12 HEAD')
})
test('slot service runs next on its own port from its own folder', () => {
  const unit = readFileSync(join(dir, 'endlesstales-webapp@.service'), 'utf8')
  expect(unit).toContain('WorkingDirectory=/home/ubuntu/et-slot-%i')
  expect(unit).toContain('next start -p %i')
})
