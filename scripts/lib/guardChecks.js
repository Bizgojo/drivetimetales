#!/usr/bin/env node
/**
 * scripts/lib/guardChecks.js — BELL-FREEZE-GUARD-001 (CJS wrapper for Node scripts)
 *
 * CommonJS wrapper around the TypeScript guard modules for use in standalone
 * Node.js scripts (freeze scripts, patch scripts, etc.) that can't import .ts directly.
 *
 * Also provides loadDecisions() which reads today + yesterday from the Orion
 * workspace decisions log.
 *
 * Usage:
 *   const { checkFrozenGuard, checkFreezePrerequisites, loadDecisions } = require('./lib/guardChecks')
 *
 *   // In a freeze script — require approval before proceeding:
 *   const decisions = await loadDecisions()
 *   const preflight = checkFreezePrerequisites({
 *     storyId: PV2_ID,
 *     requiredDecisionId: 'pv2-ear-approval-rev7',
 *     decisions,
 *     options: { label: 'PV2 rev7' }
 *   })
 *   if (!preflight.allowed) { console.error('❌', preflight.reason); process.exit(1) }
 *
 *   // In a patch/regen script — block if already frozen without unlock:
 *   const frozenGuard = checkFrozenGuard({
 *     manifest,
 *     storyId: PV2_ID,
 *     operation: 'regen-segment-0030',
 *     decisions,
 *   })
 *   if (!frozenGuard.allowed) { console.error('❌', frozenGuard.reason); process.exit(1) }
 */

'use strict'

const fs   = require('fs')
const path = require('path')
const os   = require('os')

// ─── Decisions log loader ────────────────────────────────────────────────────

const DECISIONS_DIR = process.env.DECISIONS_LOG_DIR ||
  path.join(os.homedir(), '.openclaw', 'workspace-orion', 'decisions')

function dateString(offsetDays = 0) {
  const d = new Date()
  d.setDate(d.getDate() + offsetDays)
  return d.toISOString().slice(0, 10)
}

function readDayLog(dateStr) {
  const filePath = path.join(DECISIONS_DIR, `${dateStr}.json`)
  if (!fs.existsSync(filePath)) return []
  try {
    const raw = fs.readFileSync(filePath, 'utf8').trim()
    return raw ? JSON.parse(raw) : []
  } catch (err) {
    console.warn(`[guardChecks] Could not parse decisions log ${filePath}: ${err.message}`)
    return []
  }
}

/**
 * Load decisions from today and yesterday (covers midnight session boundary).
 * Returns a flat array of Decision objects.
 */
function loadDecisions() {
  return [
    ...readDayLog(dateString(0)),
    ...readDayLog(dateString(-1)),
  ]
}

// ─── FrozenGuard ─────────────────────────────────────────────────────────────

/**
 * Check whether a story's manifest allows the requested operation.
 *
 * @param {object} params
 * @param {object|null} params.manifest - Loaded sfx-manifest.json (or null)
 * @param {string} params.storyId - Story UUID
 * @param {string} params.operation - Human-readable operation name
 * @param {Array}  params.decisions - Decisions from loadDecisions()
 * @param {string} [params.unlockDecisionId] - Specific decision_id that unlocks this story
 * @returns {{ allowed: boolean, frozen: boolean, frozenAt, frozenRevision, frozenBy, unlockedByDecision, reason }}
 */
function checkFrozenGuard({ manifest, storyId, operation, decisions, unlockDecisionId }) {
  if (!manifest || !manifest.frozen) {
    return {
      allowed: true,
      frozen: false,
      frozenAt: null,
      frozenRevision: null,
      frozenBy: null,
      unlockedByDecision: null,
      reason: 'Story is not frozen.',
    }
  }

  const frozenAt = manifest.frozen_at || null
  const frozenRevision = manifest.frozen_revision || null
  const frozenBy = manifest.frozen_by || null

  function isAffirmative(value) {
    const v = (value || '').toLowerCase().trim()
    return v !== 'rejected' && v !== 'revoked' && v !== 'blocked' && v !== 'denied'
  }

  // Check explicit unlock decision id
  if (unlockDecisionId) {
    const d = decisions.find(x => x.decision_id === unlockDecisionId)
    if (d && isAffirmative(d.value)) {
      return {
        allowed: true, frozen: true, frozenAt, frozenRevision, frozenBy,
        unlockedByDecision: unlockDecisionId,
        reason: `Story is frozen but explicitly unlocked by decision "${unlockDecisionId}" (${d.timestamp}).`,
      }
    }
  }

  // Generic unlock patterns
  const shortId = storyId.slice(0, 8)
  for (const pattern of [`${shortId}-unlock`, `${storyId}-unlock`]) {
    const d = decisions.find(x => x.decision_id === pattern)
    if (d && isAffirmative(d.value)) {
      return {
        allowed: true, frozen: true, frozenAt, frozenRevision, frozenBy,
        unlockedByDecision: d.decision_id,
        reason: `Story is frozen but unlocked by decision "${d.decision_id}" (${d.timestamp}).`,
      }
    }
  }

  const unlockKey = unlockDecisionId || `${shortId}-unlock`
  return {
    allowed: false, frozen: true, frozenAt, frozenRevision, frozenBy,
    unlockedByDecision: null,
    reason:
      `BELL-FREEZE-GUARD-001 [frozenGuard]: Story ${storyId} is frozen` +
      (frozenAt ? ` (frozen_at=${frozenAt})` : '') +
      (frozenBy ? `, frozen_by="${frozenBy}"` : '') +
      `. Operation "${operation}" is blocked. Only Marc can unlock.` +
      ` Required decisions-log entry: decision_id="${unlockKey}".`,
  }
}

// ─── FreezePreflight ─────────────────────────────────────────────────────────

/**
 * Verify Marc's approval is present before allowing a freeze to proceed.
 *
 * @param {object} params
 * @param {string} params.storyId
 * @param {string} params.requiredDecisionId - Exact decision_id that must be present
 * @param {Array}  params.decisions - Decisions from loadDecisions()
 * @param {object} [params.options]
 * @param {string} [params.options.requireAfterTimestamp] - Approval must be newer than this ISO timestamp
 * @param {string} [params.options.label] - Human label for error messages
 * @returns {{ allowed: boolean, approvalFound: boolean, approvalDecisionId, approvalTimestamp, reason }}
 */
function checkFreezePrerequisites({ storyId, requiredDecisionId, decisions, options = {} }) {
  const label = options.label || storyId
  const approval = decisions.find(d => d.decision_id === requiredDecisionId)

  if (!approval) {
    return {
      allowed: false, approvalFound: false, approvalDecisionId: null, approvalTimestamp: null,
      reason:
        `BELL-FREEZE-GUARD-001 [freezePreflight]: Freeze blocked for ${label}.` +
        ` Required approval decision "${requiredDecisionId}" not found in decisions log.` +
        ` Marc must approve before this story can be frozen.`,
    }
  }

  const v = (approval.value || '').toLowerCase().trim()
  if (v === 'rejected' || v === 'revoked' || v === 'blocked' || v === 'denied') {
    return {
      allowed: false, approvalFound: true,
      approvalDecisionId: requiredDecisionId, approvalTimestamp: approval.timestamp,
      reason:
        `BELL-FREEZE-GUARD-001 [freezePreflight]: Freeze blocked for ${label}.` +
        ` Decision "${requiredDecisionId}" value is "${approval.value}" — not an approval.`,
    }
  }

  if (options.requireAfterTimestamp) {
    const approvalTs = new Date(approval.timestamp).getTime()
    const requiredAfterTs = new Date(options.requireAfterTimestamp).getTime()
    if (approvalTs < requiredAfterTs) {
      return {
        allowed: false, approvalFound: true,
        approvalDecisionId: requiredDecisionId, approvalTimestamp: approval.timestamp,
        reason:
          `BELL-FREEZE-GUARD-001 [freezePreflight]: Freeze blocked for ${label}.` +
          ` Approval "${requiredDecisionId}" (${approval.timestamp}) predates` +
          ` required cutoff (${options.requireAfterTimestamp}).` +
          ` Marc must re-approve after the most recent change.`,
      }
    }
  }

  return {
    allowed: true, approvalFound: true,
    approvalDecisionId: requiredDecisionId, approvalTimestamp: approval.timestamp,
    reason: `Approval "${requiredDecisionId}" confirmed (${approval.timestamp}). Freeze allowed for ${label}.`,
  }
}

// ─── Exports ─────────────────────────────────────────────────────────────────

module.exports = {
  loadDecisions,
  checkFrozenGuard,
  checkFreezePrerequisites,
}
