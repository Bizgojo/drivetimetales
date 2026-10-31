import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { adminAccess } from '@/lib/admin-center/auth'
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export async function GET(req: Request) {
  const denied = await adminAccess(req)
  if (denied) return denied
  try {
    const html = await readFile(path.join(process.cwd(), 'content/admin-information-flow.html'), 'utf8')
    return new Response(html, {headers:{
      'Content-Type':'text/html; charset=utf-8',
      'Cache-Control':'private, no-store',
      'X-Content-Type-Options':'nosniff',
      'Content-Security-Policy':"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'; frame-ancestors 'self'",
    }})
  } catch { return Response.json({error:'Process reference is unavailable'}, {status:503}) }
}
