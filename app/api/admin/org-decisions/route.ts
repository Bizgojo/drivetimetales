/**
 * GET /api/admin/org-decisions
 *
 * Public read-only endpoint for Orion report generation.
 * Returns only decision state — no sensitive data, no write access.
 *
 * - No auth required (read-only, no secrets exposed)
 * - ONLY returns decisions.active / decisions.deferred / decisions.resolved
 * - Sensitive fields (chatGptPrompt, detail.recommendation, answers) are stripped
 * - /api/admin/org-status remains fully protected (unchanged)
 */

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// ─── Types ───────────────────────────────────────────────────────────────────

interface RawBlocker {
  id: string
  title?: string
  description?: string
  department?: string
  done?: boolean
  resolution?: string | null
  resolvedAt?: string | null
  answeredAt?: string | null
  archived?: boolean          // set by Orion when a blocker is closed via state.json — excluded from all UI sections
  // all other fields intentionally omitted from the public response
  [key: string]: unknown
}

interface DecisionSummary {
  id: string
  title: string
  department: string
  resolution: string | null
  resolvedAt: string | null
  answeredAt: string | null
}

interface DecisionsResponse {
  active: DecisionSummary[]
  deferred: DecisionSummary[]
  resolved: DecisionSummary[]
  counts: { active: number; deferred: number; resolved: number; total: number }
  generatedAt: string
  source: 'storage' | 'seed'
}

// ─── Supabase (service role for Storage reads) ────────────────────────────────

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Supabase env vars missing')
  return createClient(url, key, { auth: { persistSession: false } })
}

// ─── Seed blockers (fallback if Storage is empty) ────────────────────────────
// Minimal version — no sensitive fields

const SEED_DECISION_SUMMARIES: RawBlocker[] = [
  { id: 'b1',  title: 'Has the product launched?',                        department: 'orion',  done: false, resolution: null,       resolvedAt: null, answeredAt: null },
  { id: 'b2',  title: 'What is the target launch date?',                  department: 'orion',  done: false, resolution: null,       resolvedAt: null, answeredAt: null },
  { id: 'b3',  title: 'Canonical Belle B voice ID',                       department: 'vega',   done: false, resolution: null,       resolvedAt: null, answeredAt: null },
  { id: 'b4',  title: 'Pricing: Founding Member and Standard tiers',      department: 'susan',  done: false, resolution: null,       resolvedAt: null, answeredAt: null },
  { id: 'b5',  title: 'Trial length and card requirement',                department: 'lex',    done: false, resolution: null,       resolvedAt: null, answeredAt: null },
  { id: 'b6',  title: 'Suno subscription tier for commercial use',        department: 'lex',    done: false, resolution: null,       resolvedAt: null, answeredAt: null },
  { id: 'b7',  title: 'Mercury API token (runway visibility)',             department: 'bart',   done: false, resolution: null,       resolvedAt: null, answeredAt: null },
  { id: 'b8',  title: 'Launch readiness scenario selection',              department: 'orion',  done: false, resolution: null,       resolvedAt: null, answeredAt: null },
  { id: 'b9',  title: 'Founding Member campaign approval',                department: 'susan',  done: false, resolution: null,       resolvedAt: null, answeredAt: null },
  { id: 'b10', title: 'Genre priority for catalog expansion',             department: 'hal',    done: false, resolution: null,       resolvedAt: null, answeredAt: null },
]

// ─── Read org state from Supabase Storage ────────────────────────────────────

async function readBlockers(): Promise<{ blockers: RawBlocker[]; source: 'storage' | 'seed' }> {
  try {
    const supabase = getSupabase()
    const { data, error } = await supabase.storage.from('org-state').download('state.json')
    if (error || !data) throw new Error(error?.message ?? 'no data')
    const text = await data.text()
    const state = JSON.parse(text) as Record<string, unknown>
    const blockers = state.blockers as RawBlocker[] | undefined
    if (Array.isArray(blockers) && blockers.length > 0) {
      return { blockers, source: 'storage' }
    }
  } catch {
    // fall through to seed
  }
  return { blockers: SEED_DECISION_SUMMARIES, source: 'seed' }
}

// ─── Strip sensitive fields — only public summary fields returned ─────────────

function toSummary(b: RawBlocker): DecisionSummary {
  return {
    id:          b.id,
    title:       b.title ?? b.description ?? '(no title)',
    department:  b.department ?? 'unassigned',
    resolution:  (b.resolution as string | null) ?? null,
    resolvedAt:  (b.resolvedAt as string | null) ?? null,
    answeredAt:  (b.answeredAt as string | null) ?? null,
  }
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function GET(): Promise<NextResponse> {
  const { blockers, source } = await readBlockers()

  // Archived blockers are excluded from all buckets — closed by Orion, not visible to UI.
  const isArchived = (b: RawBlocker) => b.archived === true
  const active   = blockers.filter((b) => !b.done && !isArchived(b)).map(toSummary)
  const deferred = blockers.filter((b) => !isArchived(b) && b.done && b.resolution === 'deferred').map(toSummary)
  const resolved = blockers.filter((b) => !isArchived(b) && b.done && b.resolution != null && b.resolution !== 'deferred').map(toSummary)

  const body: DecisionsResponse = {
    active,
    deferred,
    resolved,
    counts: {
      active:   active.length,
      deferred: deferred.length,
      resolved: resolved.length,
      total:    blockers.length,
    },
    generatedAt: new Date().toISOString(),
    source,
  }

  return NextResponse.json(body, {
    status: 200,
    headers: {
      // Prevent caching — always return live state
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    },
  })
}

// No POST, PATCH, PUT, or DELETE handlers — read-only by design
