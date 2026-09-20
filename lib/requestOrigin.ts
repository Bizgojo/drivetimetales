// lib/requestOrigin.ts — OAUTH-ORIGIN-001 (2026-09-20)
//
// "Where is the user actually browsing?" for auth redirects.
//
// Never use VERCEL_URL: it is the deployment-specific *.vercel.app host on
// every deployment, production included (AUTH-CALLBACK-ORIGIN-001 — that bug
// sent real subscribers to Vercel's SSO wall, 0% activation for weeks).
//
// Prefer the forwarded host headers over `new URL(request.url).origin`:
// behind Vercel both agree, but the dev server binds 0.0.0.0 and reports
// `http://0.0.0.0:3000` as the request URL while the browser is on
// `localhost:3000`. That mismatch breaks local Google sign-in and, because
// "0.0.0.0" does not contain "localhost", would flip auth cookies to
// sameSite=none/secure on plain http.

export function resolveRequestOrigin(request: Request): string {
  const headers = request.headers
  const forwardedHost = headers.get('x-forwarded-host') || headers.get('host')
  if (forwardedHost) {
    const proto = headers.get('x-forwarded-proto') || (isLocalHostname(forwardedHost) ? 'http' : 'https')
    return `${proto}://${forwardedHost}`
  }
  return new URL(request.url).origin
}

/** Local dev hosts — cookies must stay sameSite=lax + insecure for these. */
export function isLocalOrigin(origin: string): boolean {
  try {
    return isLocalHostname(new URL(origin).host)
  } catch {
    return isLocalHostname(origin)
  }
}

function isLocalHostname(host: string): boolean {
  const name = host.split(':')[0].toLowerCase()
  return name === 'localhost' || name === '127.0.0.1' || name === '0.0.0.0' || name === '::1' || name.endsWith('.localhost')
}
