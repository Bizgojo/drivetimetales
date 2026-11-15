import { detectNarrativeHookCategory } from '@/lib/narrativeHook'
describe('BELLE-INTRO-HOOK-PREVOICE-001', () => {
  const s = require('fs').readFileSync(require('path').join(process.cwd(), 'app/api/admin/production-jobs/run-next/route.ts'), 'utf8')
  test('the Mercy Island EP16 intro is the kind the word-based detector rejects', () => {
    const intro = 'In Episode Sixteen of "Mercy Island," "What Maeve Kept," Nora Vance needs answers that only one woman on the island can give — if she can find the courage to give them.'
    expect(detectNarrativeHookCategory(intro)).toBeNull()
  })
  test('run-next rewrites a hook-only intro failure before voicing, keeps it only if the detector passes, then re-checks', () => {
    const at = s.indexOf('BELLE-INTRO-HOOK-PREVOICE-001 (Mercy Island EP16')
    expect(at).toBeGreaterThan(0)
    const block = s.slice(at, at + 5000)
    expect(block).toContain("(report as any)?.code === 'BELLE_POSTREPAIR_CONFORMANCE_FAILED'")
    expect(block).toContain('if (introText && detectNarrativeHookCategory(check)) fixed = replaceBelleSection(epScript, \'intro\', introText)')
    expect(block).toContain(";({ responseOk, report } = await runGenerateVoicesPreflightRequest(origin, storyId))")
    expect(block).toContain('repinAfterPatch(preflightEpisodes')
  })
})
