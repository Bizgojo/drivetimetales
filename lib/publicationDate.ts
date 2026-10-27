/** Format the stored publication date without local timezone shifts. */
export function publicationMonth(value?: string | null): string {
  const match = value?.match(/^(\d{4})-(0[1-9]|1[0-2])-\d{2}(?:$|T)/)
  return match ? `${match[2]}/${match[1]}` : ''
}

export function latestPublication(values: Array<string | null | undefined>): string | null {
  return values.filter((value): value is string => !!publicationMonth(value)).sort().pop() || null
}
