import 'server-only'
import { accountAdmin } from '@/lib/server/accountUser'
export function db() { return accountAdmin() }
export async function audit(actor: string, action: string, target: string, before: unknown, after: unknown) {
  const { error } = await db().from('admin_center_audit').insert({ actor_id: actor, action, target, before_json: before, after_json: after })
  if (error) throw new Error('Audit storage unavailable; action not completed')
}
export async function rows(table: string, columns = '*', order = 'created_at', limit = 100) {
  try {
    const { data, error } = await db().from(table).select(columns).order(order, { ascending: false }).limit(limit)
    if (error) throw error
    return { status: (data||[]).length===limit?'partial':'connected', source: table, fetchedAt: new Date().toISOString(), data: data || [], limit }
  } catch { return { status: 'unavailable', source: table, fetchedAt: new Date().toISOString(), data: null, limit } }
}
