// lib/marketing/approvalsStore.ts — Supabase access for Amendment 1 tables.
// SERVER-ONLY.

import { createClient } from '@supabase/supabase-js'
import type { ApprovalStatus, Amendment1Check, CheckResult } from './amendment1'

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export interface ApprovalRecord {
  campaign_id: string
  version_hash: string
  status: ApprovalStatus
  spend_ceiling: string | null
  decided_by: string | null
  decided_at: string | null
  launched_by: string | null
  launched_at: string | null
  notes: string | null
}

export async function getApproval(
  campaignId: string,
  versionHash: string
): Promise<ApprovalRecord | null> {
  const { data } = await admin()
    .from('campaign_approvals')
    .select('*')
    .eq('campaign_id', campaignId)
    .eq('version_hash', versionHash)
    .maybeSingle()
  return (data as ApprovalRecord | null) ?? null
}

export async function getLatestApproval(campaignId: string): Promise<ApprovalRecord | null> {
  const { data } = await admin()
    .from('campaign_approvals')
    .select('*')
    .eq('campaign_id', campaignId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return (data as ApprovalRecord | null) ?? null
}

export async function upsertApproval(rec: {
  campaignId: string
  versionHash: string
  status: ApprovalStatus
  decidedBy?: string | null
  spendCeiling?: string | null
  notes?: string | null
  launchedBy?: string | null
}): Promise<void> {
  const payload: Record<string, unknown> = {
    campaign_id: rec.campaignId,
    version_hash: rec.versionHash,
    status: rec.status,
    notes: rec.notes ?? null,
  }
  if (rec.decidedBy !== undefined) {
    payload.decided_by = rec.decidedBy
    payload.decided_at = new Date().toISOString()
  }
  if (rec.spendCeiling !== undefined) payload.spend_ceiling = rec.spendCeiling
  if (rec.launchedBy !== undefined) {
    payload.launched_by = rec.launchedBy
    payload.launched_at = new Date().toISOString()
  }
  const { error } = await admin().from('campaign_approvals').upsert(payload, {
    onConflict: 'campaign_id,version_hash',
  })
  if (error) throw new Error(`approval upsert failed: ${error.message}`)
}

export async function saveTestRun(rec: {
  runId: string
  campaignId: string
  versionHash: string
  results: Record<Amendment1Check, CheckResult>
  ownerTestedPersonally: boolean
  screenshots: string[]
}): Promise<void> {
  const { error } = await admin().from('campaign_test_runs').insert({
    run_id: rec.runId,
    campaign_id: rec.campaignId,
    version_hash: rec.versionHash,
    check_video_audio: rec.results.video_audio,
    check_destination_url: rec.results.destination_url,
    check_signup: rec.results.signup,
    check_checkout: rec.results.checkout,
    check_tracking: rec.results.tracking,
    check_mobile: rec.results.mobile,
    owner_tested_personally: rec.ownerTestedPersonally,
    screenshots: rec.screenshots,
    finished_at: new Date().toISOString(),
  })
  if (error) throw new Error(`test-run save failed: ${error.message}`)
}

export async function getLatestTestRun(
  campaignId: string,
  versionHash: string
): Promise<Record<Amendment1Check, CheckResult> | null> {
  const { data } = await admin()
    .from('campaign_test_runs')
    .select('*')
    .eq('campaign_id', campaignId)
    .eq('version_hash', versionHash)
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!data) return null
  return {
    video_audio: (data.check_video_audio || 'not_tested') as CheckResult,
    destination_url: (data.check_destination_url || 'not_tested') as CheckResult,
    signup: (data.check_signup || 'not_tested') as CheckResult,
    checkout: (data.check_checkout || 'not_tested') as CheckResult,
    tracking: (data.check_tracking || 'not_tested') as CheckResult,
    mobile: (data.check_mobile || 'not_tested') as CheckResult,
  }
}
