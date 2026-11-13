import { readFileSync } from 'fs'
import { join } from 'path'

const dir = join(__dirname, '..', 'scripts/ec2-deploy')
const read = (f: string) => readFileSync(join(dir, f), 'utf8')

describe('WORKER-CURRENT-001', () => {
  test('worker units run from the live-slot link, not the never-updated main folder', () => {
    for (const f of ['endlesstales-poolworker.service', 'endlesstales-renderworker.service', 'endlesstales-runnext.service', 'endlesstales-progress-alarm.service']) {
      const unit = read(f)
      expect(unit).toMatch(/^WorkingDirectory=\/home\/ubuntu\/et-current$/m)
      expect(unit).toMatch(/^ExecStart=.*\/home\/ubuntu\/et-current\//m)
      expect(unit).not.toMatch(/^ExecStart=.*\/home\/ubuntu\/drivetimetales\//m)
    }
  })
  test('each deploy points the link at the new slot after the Caddy switch, then restarts the workers', () => {
    const s = read('zero-downtime-deploy.sh')
    const flip = s.indexOf('sudo systemctl reload caddy')
    const link = s.indexOf('ln -sfn "$SLOT" "$CURRENT_LINK"')
    expect(link).toBeGreaterThan(flip)
    expect(s.indexOf('sudo systemctl restart "$unit"')).toBeGreaterThan(link)
    expect(s).toContain('render worker is busy — NOT restarted')
  })
  test('the one-time switch is a dry run unless --apply, and backs up unit files', () => {
    const s = read('switch-workers-to-current.sh')
    expect(s).toContain('[ "${1:-}" = "--apply" ] && APPLY=1')
    expect(s).toContain('sudo cp -p "$path" "$path.bak-$STAMP"')
    expect(s).not.toMatch(/git -C "\$OLD"|crontab -/)
  })
})
