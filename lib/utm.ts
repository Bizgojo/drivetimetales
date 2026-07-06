// lib/utm.ts
// UTM parameter capture and retrieval.
// captureUtmFromUrl: called on every page load. Reads UTM params from URL,
//   stores to localStorage if any are present. Idempotent — does not
//   overwrite existing stored UTM unless new UTM params are explicitly
//   present in the current URL (last-touch attribution within session).
// readStoredUtm: called at signup. Returns whatever is in localStorage,
//   or empty object if nothing stored.

const STORAGE_KEY = 'et_utm'

export interface StoredUtm {
  source: string | null
  medium: string | null
  campaign: string | null
  captured_at: number | null
}

export interface SignupAttribution {
  utm_source: string | null
  utm_medium: string | null
  utm_campaign: string | null
  utm_captured_at: string | null
  promo_code: string | null
}

export function normalizePromoCode(code: string | null | undefined): string | null {
  if (!code) return null
  const normalized = code.trim().toUpperCase().replace(/\s+/g, '').replace(/\+/g, '')
  return normalized || null
}

export function captureUtmFromUrl(): void {
  if (typeof window === 'undefined') return
  try {
    const urlParams = new URLSearchParams(window.location.search)
    const source = urlParams.get('utm_source')
    const medium = urlParams.get('utm_medium')
    const campaign = urlParams.get('utm_campaign')

    // Only write if at least one UTM param is present in the current URL.
    // This means a normal page navigation without UTM does not clobber
    // an earlier captured UTM (which is what we want — last-touch with
    // a UTM still wins, but a non-UTM page load is a no-op).
    if (!source && !medium && !campaign) return

    const utm: StoredUtm = {
      source: source,
      medium: medium,
      campaign: campaign,
      captured_at: Date.now(),
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(utm))
  } catch (err) {
    // localStorage can throw in incognito or when full. Swallow — we
    // never want UTM capture to break the page.
    console.warn('[utm] capture failed:', err)
  }
}

export function readStoredUtm(): StoredUtm {
  const empty: StoredUtm = {
    source: null,
    medium: null,
    campaign: null,
    captured_at: null,
  }
  if (typeof window === 'undefined') return empty
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return empty
    const parsed = JSON.parse(raw) as Partial<StoredUtm>
    return {
      source: parsed.source ?? null,
      medium: parsed.medium ?? null,
      campaign: parsed.campaign ?? null,
      captured_at: parsed.captured_at ?? null,
    }
  } catch (err) {
    console.warn('[utm] read failed:', err)
    return empty
  }
}

export function clearStoredUtm(): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {}
}

export function readSignupAttribution(promoCode?: string | null): SignupAttribution {
  const utm = readStoredUtm()
  return {
    utm_source: utm.source,
    utm_medium: utm.medium,
    utm_campaign: utm.campaign,
    utm_captured_at: utm.captured_at ? new Date(utm.captured_at).toISOString() : null,
    promo_code: normalizePromoCode(promoCode),
  }
}
