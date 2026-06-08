import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const STORAGE_BUCKET = 'org-state'
const STORAGE_KEY = 'agent-state.json'

const VALID_ROLES = ['orion', 'system']
const VALID_AGENT_IDS = ['hal', 'atlas', 'maya', 'susan', 'vega', 'bart', 'lex', 'codex', 'orion']

async function readAgentState(): Promise<Record<string, Record<string, unknown>>> {
  try {
    const { data, error } = await supabase.storage.from(STORAGE_BUCKET).download(STORAGE_KEY)
    if (error || !data) return {}
    const text = await data.text()
    return JSON.parse(text) as Record<string, Record<string, unknown>>
  } catch {
    return {}
  }
}

async function writeAgentState(state: Record<string, Record<string, unknown>>): Promise<void> {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' })
  const { error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(STORAGE_KEY, blob, { upsert: true })

  if (error?.message?.toLowerCase().includes('bucket')) {
    await supabase.storage.createBucket(STORAGE_BUCKET, { public: false })
    await supabase.storage.from(STORAGE_BUCKET).upload(STORAGE_KEY, blob, { upsert: true })
  }
}

// GET — public, no auth — returns full agent-state.json
export async function GET(_req: NextRequest) {
  try {
    const agents = await readAgentState()
    return NextResponse.json(
      { success: true, agents, generatedAt: new Date().toISOString() },
      { headers: { 'Cache-Control': 'no-store' } }
    )
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 })
  }
}

// POST — role-validated open write (no env-var-dependent auth)
// Body: { role: string, agentId: string, patch: object }
export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      role?: string
      agentId?: string
      patch?: Record<string, unknown>
    }

    const { role, agentId, patch } = body

    if (!role || !VALID_ROLES.includes(role)) {
      return NextResponse.json(
        { success: false, error: `Invalid role. Must be one of: ${VALID_ROLES.join(', ')}` },
        { status: 403 }
      )
    }

    if (!agentId || !VALID_AGENT_IDS.includes(agentId)) {
      return NextResponse.json(
        { success: false, error: `Invalid agentId. Must be one of: ${VALID_AGENT_IDS.join(', ')}` },
        { status: 400 }
      )
    }

    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
      return NextResponse.json(
        { success: false, error: 'patch must be a non-null object' },
        { status: 400 }
      )
    }

    const currentState = await readAgentState()
    const currentAgent = currentState[agentId] ?? {}
    const updatedAgent = { ...currentAgent, ...patch, updatedAt: new Date().toISOString() }
    const newState = { ...currentState, [agentId]: updatedAgent }

    await writeAgentState(newState)

    return NextResponse.json({
      success: true,
      agentId,
      updated: updatedAgent,
      generatedAt: new Date().toISOString(),
    })
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 })
  }
}
