import { NextRequest, NextResponse } from 'next/server'
import { authorized, client } from '@/lib/ai-spending/auth'
import { parseExport } from '@/lib/ai-spending/openclaw'
import { saveImport } from '@/lib/ai-spending/openclaw-storage'
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60
const json = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { 'Cache-Control': 'no-store' } })
export async function POST(req: NextRequest) {
  try {
    if (!await authorized()) return json({ error: 'Unauthorized' }, 401)
    const origin = req.headers.get('origin')
    if (!origin || origin !== new URL(req.url).origin) return json({ error: 'Import must come from this admin page.' }, 403)
    if (!req.headers.get('content-type')?.startsWith('application/x-ndjson')) return json({ error: 'Select a JSONL usage export.' }, 400)
    if (Number(req.headers.get('content-length') || 0) > 3800000) return json({ error: 'Export exceeds the 3.8 MB upload limit.' }, 413)
    const text = await req.text()
    if (Buffer.byteLength(text) > 3800000) return json({ error: 'Export exceeds the 3.8 MB upload limit.' }, 413)
    try { parseExport(text) } catch (e: any) { return json({ error: e.message }, 400) }
    const result = await saveImport(client(), text)
    return json({ success: true, ...result })
  } catch { return json({ error: 'Import could not be saved. Check private storage access; existing history is preserved.' }, 500) }
}
