import { readFileSync } from 'fs'
import { join } from 'path'

const dir = join(__dirname, '..', 'scripts/ec2-deploy')
describe('DEPLOY-WAIT-MIX-001', () => {
  const src = readFileSync(join(dir, 'zero-downtime-deploy.sh'), 'utf8')
  test('waits for any running ffmpeg before restarting workers or stopping the old slot', () => {
    const wait = src.indexOf('while pgrep -x ffmpeg > /dev/null 2>&1; do')
    expect(wait).toBeGreaterThan(0)
    expect(wait).toBeLessThan(src.indexOf('for unit in $WORKER_UNITS; do'))
    expect(wait).toBeLessThan(src.indexOf('sudo systemctl stop "$OLD_UNIT"'))
    expect(src).toContain('MIX_WAIT_MAX_SECONDS="${MIX_WAIT_MAX_SECONDS:-3600}"')
    expect(src).toMatch(/Workers NOT restarted and old slot \$ACTIVE NOT stopped[\s\S]*exit 3/)
  })
  test('the render-worker idle check treats a running ffmpeg as busy, whatever the log says', () => {
    const idle = readFileSync(join(dir, 'render-worker-idle.sh'), 'utf8')
    expect(idle.indexOf('pgrep -x ffmpeg')).toBeLessThan(idle.indexOf('LOGFILE='))
  })
})
