/**
 * scripts/cfo-report/meta.ts
 * Fetches Meta (Facebook/Instagram) ad spend month-to-date.
 *
 * BLOCKED: META_ACCESS_TOKEN and META_AD_ACCOUNT_ID are empty in .env.local.
 * When credentials are populated, this module will auto-activate.
 *
 * Credentials needed: META_ACCESS_TOKEN, META_AD_ACCOUNT_ID
 *
 * Known cards charged via Meta:
 *   GVL-Meta (last4: 7468) — main Meta ad spend card
 *   GVL-TikTok (last4: 3966) — TikTok ad spend card
 */

const GRAPH_BASE = 'https://graph.facebook.com/v20.0'

export interface MetaData {
  spendMtd: number
  impressionsMtd: number
  clicksMtd: number
  campaignBreakdown: Array<{
    campaignName: string
    spend: number
    impressions: number
    clicks: number
  }>
  stale: false
  fetchedAt: string
}

export interface MetaStale {
  stale: true
  reason: string
}

function getMonthDateRange(): { since: string; until: string } {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const today = now.toISOString().slice(0, 10)
  return {
    since: `${year}-${month}-01`,
    until: today,
  }
}

export async function fetchMetaData(): Promise<MetaData | MetaStale> {
  const accessToken = process.env.META_ACCESS_TOKEN?.trim()
  const adAccountId = process.env.META_AD_ACCOUNT_ID?.trim()

  if (!accessToken || !adAccountId) {
    return {
      stale: true,
      reason:
        'META_ACCESS_TOKEN and META_AD_ACCOUNT_ID not configured — populate in .env.local and Vercel to activate. ' +
        'Known spend cards: GVL-Meta (7468), GVL-TikTok (3966). ' +
        'Use Mercury transactions as a proxy for now.',
    }
  }

  try {
    const { since, until } = getMonthDateRange()

    // Account-level MTD insights
    const accountParams = new URLSearchParams({
      access_token: accessToken,
      time_range: JSON.stringify({ since, until }),
      fields: 'spend,impressions,clicks',
      level: 'account',
    })

    const accountRes = await fetch(
      `${GRAPH_BASE}/act_${adAccountId}/insights?${accountParams.toString()}`,
      { cache: 'no-store' }
    )
    if (!accountRes.ok) {
      const txt = await accountRes.text()
      throw new Error(`Meta insights API error ${accountRes.status}: ${txt.slice(0, 300)}`)
    }
    const accountData = await accountRes.json() as {
      data?: Array<{ spend?: string; impressions?: string; clicks?: string }>
    }
    const accountRow = accountData.data?.[0] || {}
    const spendMtd = parseFloat(accountRow.spend || '0') || 0
    const impressionsMtd = parseInt(accountRow.impressions || '0', 10) || 0
    const clicksMtd = parseInt(accountRow.clicks || '0', 10) || 0

    // Campaign breakdown
    const campaignParams = new URLSearchParams({
      access_token: accessToken,
      time_range: JSON.stringify({ since, until }),
      fields: 'campaign_name,spend,impressions,clicks',
      level: 'campaign',
      limit: '20',
    })

    const campaignRes = await fetch(
      `${GRAPH_BASE}/act_${adAccountId}/insights?${campaignParams.toString()}`,
      { cache: 'no-store' }
    )
    let campaignBreakdown: MetaData['campaignBreakdown'] = []
    if (campaignRes.ok) {
      const campaignData = await campaignRes.json() as {
        data?: Array<{
          campaign_name?: string
          spend?: string
          impressions?: string
          clicks?: string
        }>
      }
      campaignBreakdown = (campaignData.data || []).map(row => ({
        campaignName: row.campaign_name || 'Unknown Campaign',
        spend: parseFloat(row.spend || '0') || 0,
        impressions: parseInt(row.impressions || '0', 10) || 0,
        clicks: parseInt(row.clicks || '0', 10) || 0,
      }))
    }

    return {
      spendMtd,
      impressionsMtd,
      clicksMtd,
      campaignBreakdown,
      stale: false,
      fetchedAt: new Date().toISOString(),
    }
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err)
    console.error('[cfo/meta] Fetch failed:', reason)
    return { stale: true, reason }
  }
}

// CLI entry point
if (require.main === module) {
  ;(async () => {
    const result = await fetchMetaData()
    console.log(JSON.stringify(result, null, 2))
  })()
}
