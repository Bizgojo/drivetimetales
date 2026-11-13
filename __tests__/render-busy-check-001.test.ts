import { readFileSync } from 'fs'
import { join } from 'path'

const dir = join(__dirname, '..', 'scripts/ec2-deploy')
describe('RENDER-BUSY-CHECK-001', () => {
  test('both scripts read the worker log file, never the journal', () => {
    for (const f of ['zero-downtime-deploy.sh', 'switch-workers-to-current.sh']) {
      const src = readFileSync(join(dir, f), 'utf8')
      expect(src).not.toContain('journalctl')
      expect(src).toContain('render-worker-idle.sh')
    }
  })
  test('the idle check reads the StandardOutput file from the unit and treats unreadable as busy', () => {
    const src = readFileSync(join(dir, 'render-worker-idle.sh'), 'utf8')
    expect(src).toContain("sed -n -E 's#^StandardOutput=(append|file):##p'")
    expect(src).toContain("grep -qE 'Picked up job|Calling render API'")
    expect(src).toMatch(/exit 2/)
  })
})
