import { classifyTransientFailure } from '@/lib/transientFailure'
describe('RETRY-ELEVENLABS-5XX-001', () => {
  test('an ElevenLabs 500 service_unavailable is transient', () => {
    const err = 'Error: ElevenLabs error 500: {"detail":{"type":"service_unavailable","code":"service_unavailable","message":"Something went wrong. You have not been charged for this request.","status":"something_went_wrong"}}'
    expect(classifyTransientFailure(err)).toBe('provider_overloaded')
    expect(classifyTransientFailure('ElevenLabs TTS failed (503) upstream')).toBe('provider_overloaded')
  })
  test('ElevenLabs 400 stays permanent; 401 stays account-wide', () => {
    expect(classifyTransientFailure('ElevenLabs error 400: bad request')).toBeNull()
    expect(classifyTransientFailure('ElevenLabs error 401: invalid key')).toBe('elevenlabs_auth_or_quota')
  })
})
