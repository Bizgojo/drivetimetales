/**
 * GET  /api/admin/checklist  — fetch checklist (from static JSON bundled at build time)
 * POST /api/admin/checklist  — update a task (persisted in Supabase)
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import checklistData from '@/data/checklist.json'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const TABLE = 'checklist_overrides'

export async function GET() {
  try {
    // Load base from static JSON
    const data = JSON.parse(JSON.stringify(checklistData))

    // Apply any overrides stored in Supabase
    const { data: overrides } = await supabase
      .from(TABLE)
      .select('task_id, status, completed_date')

    if (overrides && overrides.length > 0) {
      const overrideMap: Record<string, { status: string; completed_date: string | null }> = {}
      overrides.forEach((o: any) => { overrideMap[o.task_id] = o })

      for (const area of data.areas) {
        for (const task of area.tasks) {
          if (overrideMap[task.id]) {
            task.status = overrideMap[task.id].status
            task.completedDate = overrideMap[task.id].completed_date
          }
        }
      }
    }

    // Recount
    let total = 0, done = 0
    for (const area of data.areas) {
      total += area.tasks.length
      done  += area.tasks.filter((t: any) => t.status === 'complete').length
    }
    data.meta.totalTasks = total
    data.meta.completedTasks = done
    data.meta.lastUpdated = new Date().toISOString()

    return NextResponse.json(data)
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const { taskId, status, completedDate } = await req.json()
    if (!taskId || !status) return NextResponse.json({ error: 'taskId and status required' }, { status: 400 })

    // Upsert override in Supabase
    const { error } = await supabase.from(TABLE).upsert({
      task_id: taskId,
      status,
      completed_date: status === 'complete' ? (completedDate || new Date().toISOString().split('T')[0]) : null,
      updated_at: new Date().toISOString()
    }, { onConflict: 'task_id' })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
