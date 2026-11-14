// lib/tracking/matchKeys.ts — CAPI-MATCH-001 (Marc, Nov 14, 2026: "build the tracking")
//
// Meta matches a server (Conversions API) event to the ad click best with the
// click id cookie (_fbc), the browser id cookie (_fbp), the client IP and the
// user agent. Before this, our server events carried only hashed email and user
// id, so Meta could not tie a signup, trial or purchase back to the ad that
// brought it. These helpers read those keys from the request (or from Stripe
// metadata copied at checkout) and pass them to sendServerEvent.
//
// No new database columns: the keys live in first-party cookies and, for the
// Stripe webhook (which has no browser), in the checkout session metadata.

export type MatchKeys = {
  fbc?: string | null
  fbp?: string | null
  clientIp?: string | null
  userAgent?: string | null
}

const FBC_RE = /^fb\.\d\.\d{10,16}\.[A-Za-z0-9_\-.]+$/
const FBP_RE = /^fb\.\d\.\d{10,16}\.\d+$/

/** Meta's documented _fbc format: fb.<subdomainIndex>.<creationTimeMs>.<fbclid>. */
export function fbcFromFbclid(fbclid: string | null | undefined, createdMs: number = Date.now()): string | null {
  const id = typeof fbclid === 'string' ? fbclid.trim() : ''
  if (!id || id.length > 500 || !/^[A-Za-z0-9_\-.]+$/.test(id)) return null
  return `fb.1.${Math.floor(createdMs)}.${id}`
}

function readCookie(cookieHeader: string | null | undefined, name: string): string | null {
  if (!cookieHeader) return null
  for (const part of cookieHeader.split(';')) {
    const eq = part.indexOf('=')
    if (eq < 0) continue
    if (part.slice(0, eq).trim() !== name) continue
    try {
      return decodeURIComponent(part.slice(eq + 1).trim()) || null
    } catch {
      return part.slice(eq + 1).trim() || null
    }
  }
  return null
}

function clean(value: unknown, max = 500): string | null {
  const s = typeof value === 'string' ? value.trim() : ''
  return s && s.length <= max ? s : null
}

/** Valid-looking values only; anything else is dropped (never sent to Meta). */
export function sanitizeMatchKeys(keys: MatchKeys | null | undefined): MatchKeys {
  const fbc = clean(keys?.fbc)
  const fbp = clean(keys?.fbp)
  const ip = clean(keys?.clientIp, 64)
  const ua = clean(keys?.userAgent, 400)
  return {
    fbc: fbc && FBC_RE.test(fbc) ? fbc : null,
    fbp: fbp && FBP_RE.test(fbp) ? fbp : null,
    clientIp: ip && /^[0-9a-fA-F:.]+$/.test(ip) ? ip : null,
    userAgent: ua,
  }
}

/** Read _fbc/_fbp cookies, client IP and user agent from an incoming request. */
export function requestMatchKeys(req: { headers: { get(name: string): string | null } }): MatchKeys {
  const cookie = req.headers.get('cookie')
  const forwarded = req.headers.get('x-forwarded-for') || ''
  const ip = forwarded.split(',')[0]?.trim() || req.headers.get('x-real-ip') || null
  return sanitizeMatchKeys({
    fbc: readCookie(cookie, '_fbc'),
    fbp: readCookie(cookie, '_fbp'),
    clientIp: ip,
    userAgent: req.headers.get('user-agent'),
  })
}

/** Copy match keys into Stripe metadata (string values, empty when missing). */
export function matchKeysMetadata(keys: MatchKeys): Record<string, string> {
  const k = sanitizeMatchKeys(keys)
  return {
    fbc: k.fbc || '',
    fbp: k.fbp || '',
    client_ip: k.clientIp || '',
    client_ua: (k.userAgent || '').slice(0, 400),
  }
}

/** Read match keys back from Stripe metadata in the webhook. */
export function matchKeysFromMetadata(metadata: Record<string, unknown> | null | undefined): MatchKeys {
  return sanitizeMatchKeys({
    fbc: metadata?.fbc as string,
    fbp: metadata?.fbp as string,
    clientIp: metadata?.client_ip as string,
    userAgent: metadata?.client_ua as string,
  })
}
