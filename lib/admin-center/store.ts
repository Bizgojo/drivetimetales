import 'server-only'
import { accountAdmin } from '@/lib/server/accountUser'
export function db() { return accountAdmin() }
// TEST-ACCOUNTS-AUDIT-20261031: shared test-account ID set for reporting
// exclusions. Read-only, paged; callers filter attributed rows client-side.
export async function testUserIds(): Promise<Set<string>> {
  const ids = new Set<string>()
  for (let page = 0; page < 100; page++) {
    const { data, error } = await db().from('users').select('id').eq('is_test_account', true).order('id').range(page * 1000, page * 1000 + 999)
    if (error) throw error
    for (const row of (data || [])) if (row?.id) ids.add(String(row.id))
    if ((data || []).length < 1000) return ids
  }
  throw new Error('Test-account list exceeded reporting limit')
}
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
