import { sendTelegramAlert, telegramAlertText } from '@/lib/pipeline-runner/notify'
import type { RunnerEvent } from '@/lib/pipeline-runner/types'

const event: RunnerEvent = {
  at: '2026-11-12T15:30:00Z', source: 'progress-alarm', event: 'failure', jobId: 'fe4c8778-31d2-4030', step: 'score_validate_package',
  needs_marc: true, message: '[progress-alarm] FAILED job fe4c8778 at step "score_validate_package": series story read failed.',
}

describe('ALERTS-TELEGRAM-001', () => {
  test('message is plain and names the job and step', () => {
    const t = telegramAlertText(event)
    expect(t).toMatch(/^ENDLESS TALES ALERT \(needs Marc\)/)
    expect(t).toContain('FAILED job fe4c8778')
    expect(t).toContain('step score_validate_package')
  })
  test('sends to the configured chat', async () => {
    const calls: any[] = []
    const fake = (async (url: any, init: any) => { calls.push({ url, body: JSON.parse(init.body) }); return { ok: true, status: 200 } }) as any
    const ok = await sendTelegramAlert(event, { TELEGRAM_ALERT_BOT_TOKEN: 'T', TELEGRAM_ALERT_CHAT_ID: '123' }, fake)
    expect(ok).toBe(true)
    expect(calls[0].url).toBe('https://api.telegram.org/botT/sendMessage')
    expect(calls[0].body.chat_id).toBe('123')
  })
  test('does nothing without settings, never throws', async () => {
    const fake = (async () => { throw new Error('should not be called') }) as any
    await expect(sendTelegramAlert(event, {}, fake)).resolves.toBe(false)
    const boom = (async () => { throw new Error('network') }) as any
    await expect(sendTelegramAlert(event, { TELEGRAM_ALERT_BOT_TOKEN: 'T', TELEGRAM_ALERT_CHAT_ID: '1' }, boom)).resolves.toBe(false)
  })
})
