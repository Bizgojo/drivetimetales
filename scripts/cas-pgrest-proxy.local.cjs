// Scratch-only reverse proxy: maps Supabase-style /rest/v1/* paths to a
// root-served local PostgREST (upstream has no base-path setting).
// NEVER points at production. Usage:
//   node --max-http-header-size=131072 scripts/cas-pgrest-proxy.local.cjs
// (raised header limit so oversized-URL probes reach PostgREST itself
// instead of failing in the proxy — the 400-under-test must come from
// PostgREST, not test harness).
// Responses are buffered (not piped) so an upstream early-close on an
// oversized URL still yields a clean 502/400 instead of crashing the proxy.
const http = require('http')
const UPSTREAM = 'http://localhost:3001'
const LISTEN = 3002
http.createServer((req, res) => {
  const target = UPSTREAM + String(req.url || '').replace(/^\/rest\/v1/, '')
  const finish = (status, headers, body) => {
    if (!res.headersSent) res.writeHead(status, headers)
    try { res.end(body) } catch (e) { /* client gone */ }
  }
  const proxy = http.request(target, { method: req.method, headers: req.headers }, (up) => {
    const chunks = []
    up.on('data', (c) => chunks.push(c))
    up.on('end', () => finish(up.statusCode || 500, up.headers, Buffer.concat(chunks)))
    up.on('error', (e) => finish(502, {}, String((e && e.message) || e)))
  })
  proxy.on('error', (e) => finish(502, {}, String((e && e.message) || e)))
  req.pipe(proxy)
}).listen(LISTEN, () => console.log(`cas scratch proxy :${LISTEN} -> ${UPSTREAM}`))
