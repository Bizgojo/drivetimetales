// Shared large-doc fixture for CAS tests (NOT a test file — no .test. suffix so jest never runs it standalone).

export function placeholder(): void {}

// --- Production-shaped large document (26KB class, Creek Ep3 size) -------
export function buildLargeDoc(seed: string, rawBytes = 17000): any {
  return {
    raw_script: `${seed}\n` + 'x'.repeat(rawBytes),
    series_generation: {
      model: 'm',
      summary: 's'.repeat(2000),
      episode_number: 3,
      generated_title: 't',
      continuity_pins_used: {
        'f7bf1126-6ad0-47f6-9e83-a82a99608df8': 'a'.repeat(64),
        'a10d725a-6e6a-4885-a854-5c4730a5d1e4': 'b'.repeat(64),
      },
      continuity_pin_recovery: { at: '2026-10-22', action: 'c8' },
      belle_repair_audit: [{ action: 'seeded', jobId: 'other-job' }],
    },
  }
}

