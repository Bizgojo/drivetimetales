/** Signup identity only: never use a submitted credit name or email alias. */
export function signupName(profile: { first_name?: unknown; last_name?: unknown } | null | undefined, metadata: Record<string, unknown> = {}): string {
  const clean = (value: unknown) => typeof value === 'string' ? value.trim() : ''
  const registered = [clean(profile?.first_name), clean(profile?.last_name)].filter(Boolean).join(' ')
  if (registered) return registered
  return [clean(metadata.first_name), clean(metadata.last_name)].filter(Boolean).join(' ') || clean(metadata.full_name) || clean(metadata.name)
}
