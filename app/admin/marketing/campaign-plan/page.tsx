'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'

type AirtableFields = Record<string, unknown>

type TaskRecord = {
  id: string
  fields: AirtableFields
}

type CampaignRecord = {
  id: string
  fields: AirtableFields
  tasks: TaskRecord[]
}

type CampaignApiResponse = {
  success: boolean
  view?: string
  views?: string[]
  campaigns?: CampaignRecord[]
  error?: string
}

const FALLBACK_VIEWS = [
  'Recommendation Queue',
  'Approval Pipeline',
  'Active Campaigns',
  'Variance Watch',
]

const bg = '#FAF9F6'
const cardBg = '#FFFFFF'
const textPrimary = '#1a1a1a'
const textSecondary = '#4a4a4a'
const border = '#e0e0e0'

const statusColors: Record<string, { bg: string; color: string }> = {
  Recommended: { bg: '#fef3c7', color: '#92400e' },
  Approved: { bg: '#dbeafe', color: '#1d4ed8' },
  Active: { bg: '#dcfce7', color: '#166534' },
  Complete: { bg: '#e0e7ff', color: '#3730a3' },
  Archived: { bg: '#f1f5f9', color: '#475569' },
  Rejected: { bg: '#fee2e2', color: '#991b1b' },
}

function stringField(fields: AirtableFields, name: string) {
  const value = fields[name]
  if (typeof value === 'string') return value
  if (typeof value === 'number') return String(value)
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  return ''
}

function numberField(fields: AirtableFields, name: string) {
  const value = fields[name]
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function dateField(fields: AirtableFields, name: string) {
  const value = fields[name]
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : ''
}

function money(value: unknown) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—'
  return value.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
}

function numberText(value: unknown) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—'
  return value.toLocaleString()
}

function percentText(value: unknown) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—'
  return `${value.toFixed(value < 1 ? 2 : 0)}%`
}

function formatDate(value: string) {
  if (!value) return '—'
  const date = new Date(`${value}T00:00:00Z`)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
}

function daysBetween(start: string, end: string) {
  const s = new Date(`${start}T00:00:00Z`).getTime()
  const e = new Date(`${end}T00:00:00Z`).getTime()
  if (!Number.isFinite(s) || !Number.isFinite(e)) return 0
  return Math.max(1, Math.round((e - s) / 86400000) + 1)
}

function campaignName(campaign: CampaignRecord) {
  return stringField(campaign.fields, 'Campaign Name') || campaign.id
}

function campaignStatus(campaign: CampaignRecord) {
  return stringField(campaign.fields, 'Status') || 'Unspecified'
}

function campaignChannel(campaign: CampaignRecord) {
  return stringField(campaign.fields, 'Channel') || 'Unmapped'
}

function dateRange(campaign: CampaignRecord) {
  const start = dateField(campaign.fields, 'Forecast Start Date')
  const end = dateField(campaign.fields, 'Forecast End Date')
  if (!start && !end) return 'No forecast dates'
  return `${formatDate(start)} – ${formatDate(end)}`
}

function timelineBounds(campaigns: CampaignRecord[]) {
  const starts = campaigns.map(c => dateField(c.fields, 'Forecast Start Date')).filter(Boolean)
  const ends = campaigns.map(c => dateField(c.fields, 'Forecast End Date')).filter(Boolean)
  if (!starts.length || !ends.length) return null
  const start = starts.sort()[0]
  const end = ends.sort()[ends.length - 1]
  return { start, end, totalDays: daysBetween(start, end) }
}

function taskDate(task: TaskRecord) {
  return dateField(task.fields, 'Forecast Start Date') || dateField(task.fields, 'Forecast End Date')
}

export default function CampaignPlanPage() {
  const router = useRouter()
  const [activeView, setActiveView] = useState(FALLBACK_VIEWS[0])
  const [views, setViews] = useState<string[]>(FALLBACK_VIEWS)
  const [campaigns, setCampaigns] = useState<CampaignRecord[]>([])
  const [selectedId, setSelectedId] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let alive = true
    async function loadCampaigns() {
      setLoading(true)
      setError('')
      try {
        const response = await fetch(`/api/admin/marketing/campaigns?view=${encodeURIComponent(activeView)}`, {
          cache: 'no-store',
        })
        const payload = await response.json() as CampaignApiResponse
        if (!response.ok || !payload.success) {
          throw new Error(payload.error || `Campaign API failed with ${response.status}`)
        }
        if (!alive) return
        const nextCampaigns = payload.campaigns || []
        setViews(payload.views || FALLBACK_VIEWS)
        setCampaigns(nextCampaigns)
        setSelectedId(current => nextCampaigns.some(c => c.id === current) ? current : nextCampaigns[0]?.id || '')
      } catch (err) {
        if (!alive) return
        setError(err instanceof Error ? err.message : String(err))
        setCampaigns([])
        setSelectedId('')
      } finally {
        if (alive) setLoading(false)
      }
    }
    loadCampaigns()
    return () => { alive = false }
  }, [activeView])

  const selectedCampaign = useMemo(
    () => campaigns.find(campaign => campaign.id === selectedId) || campaigns[0] || null,
    [campaigns, selectedId],
  )
  const bounds = timelineBounds(campaigns)

  const totals = useMemo(() => {
    return campaigns.reduce((acc, campaign) => {
      acc.spend += numberField(campaign.fields, 'Forecast Spend') || 0
      acc.clicks += numberField(campaign.fields, 'Forecast Clicks') || 0
      acc.trials += numberField(campaign.fields, 'Forecast Trial Signups') || 0
      acc.subscribers += numberField(campaign.fields, 'Forecast Paid Subs') || 0
      return acc
    }, { spend: 0, clicks: 0, trials: 0, subscribers: 0 })
  }, [campaigns])

  return (
    <div style={{ minHeight: '100vh', backgroundColor: bg, padding: '1rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <button onClick={() => router.push('/admin/marketing')} style={{ backgroundColor: '#e5e5e5', color: textPrimary, padding: '0.5rem 1rem', borderRadius: '8px', border: 'none', cursor: 'pointer', fontWeight: 600 }}>
            ← Marketing
          </button>
          <div>
            <h1 style={{ color: textPrimary, fontSize: '24px', fontWeight: 900, margin: 0 }}>Campaign Plan</h1>
            <p style={{ color: textSecondary, fontSize: '13px', margin: '0.25rem 0 0' }}>
              Live Airtable campaigns, funnel forecasts, PERT timing, task owners, approval status, and variance watch.
            </p>
          </div>
        </div>
        <a href="https://airtable.com" target="_blank" rel="noopener noreferrer" style={{ backgroundColor: '#2563eb', color: 'white', padding: '0.55rem 1rem', borderRadius: '8px', textDecoration: 'none', fontWeight: 800 }}>
          Open Airtable
        </a>
      </div>

      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
        {views.map(view => (
          <button
            key={view}
            onClick={() => setActiveView(view)}
            style={{
              border: activeView === view ? '2px solid #f97316' : `1px solid ${border}`,
              backgroundColor: activeView === view ? '#fff7ed' : '#ffffff',
              color: activeView === view ? '#9a3412' : textPrimary,
              borderRadius: '999px',
              padding: '0.55rem 0.85rem',
              fontSize: '13px',
              fontWeight: 800,
              cursor: 'pointer',
            }}
          >
            {view}
          </button>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '0.75rem', marginBottom: '1rem' }}>
        {[
          ['Campaigns', numberText(campaigns.length)],
          ['Forecast Spend', money(totals.spend)],
          ['Forecast Clicks', numberText(totals.clicks)],
          ['Forecast Trials', numberText(totals.trials)],
          ['Forecast Subs', numberText(totals.subscribers)],
        ].map(([label, value]) => (
          <div key={label} style={{ backgroundColor: cardBg, border: `1px solid ${border}`, borderRadius: '12px', padding: '0.9rem' }}>
            <div style={{ color: textSecondary, fontSize: '11px', fontWeight: 900, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{label}</div>
            <div style={{ color: textPrimary, fontSize: '24px', fontWeight: 900, marginTop: '0.25rem' }}>{value}</div>
          </div>
        ))}
      </div>

      <div style={{ backgroundColor: cardBg, borderRadius: '14px', border: `1px solid ${border}`, padding: '1rem', marginBottom: '1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', marginBottom: '0.75rem' }}>
          <div>
            <h2 style={{ color: textPrimary, fontSize: '18px', fontWeight: 900, margin: 0 }}>PERT Timeline</h2>
            <p style={{ color: textSecondary, fontSize: '13px', margin: '0.25rem 0 0' }}>Click a campaign row or bar to inspect full strategy, funnel, and generated tactics.</p>
          </div>
          <button onClick={() => setActiveView(activeView)} style={{ alignSelf: 'flex-start', backgroundColor: '#f3f4f6', border: `1px solid ${border}`, borderRadius: '8px', color: textPrimary, cursor: 'pointer', fontWeight: 800, padding: '0.45rem 0.75rem' }}>
            Refresh
          </button>
        </div>

        {loading ? (
          <div style={{ color: textSecondary, padding: '2rem', textAlign: 'center' }}>Loading Airtable campaigns...</div>
        ) : error ? (
          <div style={{ backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '10px', color: '#991b1b', padding: '1rem' }}>
            Could not load campaigns: {error}
          </div>
        ) : campaigns.length === 0 ? (
          <div style={{ backgroundColor: '#f8fafc', border: `1px solid ${border}`, borderRadius: '10px', color: textSecondary, padding: '1.25rem' }}>
            No campaigns in the Airtable view <strong>{activeView}</strong>. When Marc adds or approves campaigns in Airtable, they will appear here automatically.
          </div>
        ) : (
          <div style={{ overflowX: 'auto', paddingBottom: '0.25rem' }}>
            <div style={{ minWidth: '1060px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: '1rem', color: textSecondary, fontSize: '12px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.5rem' }}>
                <div>Campaign</div>
                <div>{bounds ? `${formatDate(bounds.start)} to ${formatDate(bounds.end)}` : 'Forecast date range'}</div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                {campaigns.map(campaign => {
                  const selected = selectedCampaign?.id === campaign.id
                  const status = campaignStatus(campaign)
                  const colors = statusColors[status] || { bg: '#f1f5f9', color: '#334155' }
                  const start = dateField(campaign.fields, 'Forecast Start Date')
                  const end = dateField(campaign.fields, 'Forecast End Date')
                  const offset = bounds && start ? daysBetween(bounds.start, start) - 1 : 0
                  const span = start && end ? daysBetween(start, end) : 1
                  const left = bounds ? Math.max(0, Math.min(94, (offset / bounds.totalDays) * 100)) : 0
                  const width = bounds ? Math.max(4, Math.min(100 - left, (span / bounds.totalDays) * 100)) : 12
                  return (
                    <div key={campaign.id} style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: '1rem', alignItems: 'stretch' }}>
                      <button onClick={() => setSelectedId(campaign.id)} style={{ backgroundColor: selected ? '#fff7ed' : '#f8fafc', border: selected ? '2px solid #f97316' : `1px solid ${border}`, borderRadius: '10px', padding: '0.75rem', textAlign: 'left', cursor: 'pointer' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem' }}>
                          <div>
                            <div style={{ color: textPrimary, fontSize: '13px', fontWeight: 900 }}>{campaignName(campaign)}</div>
                            <div style={{ color: textSecondary, fontSize: '11px', marginTop: '0.15rem' }}>{campaignChannel(campaign)} | {dateRange(campaign)}</div>
                          </div>
                          <span style={{ backgroundColor: colors.bg, color: colors.color, borderRadius: '999px', padding: '0.25rem 0.45rem', fontSize: '10px', fontWeight: 900, whiteSpace: 'nowrap' }}>{status}</span>
                        </div>
                        <div style={{ color: textSecondary, fontSize: '11px', marginTop: '0.35rem' }}>
                          Spend {money(campaign.fields['Forecast Spend'])} | CAC {money(campaign.fields['Forecast CAC'])} | Tasks {campaign.tasks.length}
                        </div>
                      </button>
                      <button onClick={() => setSelectedId(campaign.id)} style={{ position: 'relative', minHeight: '58px', backgroundColor: selected ? '#fff7ed' : '#f8fafc', border: selected ? '2px solid #f97316' : `1px solid ${border}`, borderRadius: '10px', overflow: 'hidden', cursor: 'pointer' }}>
                        <div style={{ position: 'absolute', inset: 0, display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)' }}>
                          {[0, 1, 2, 3, 4, 5].map(i => <div key={i} style={{ borderLeft: i === 0 ? 'none' : `1px solid ${border}` }} />)}
                        </div>
                        <div style={{ position: 'absolute', left: `${left}%`, width: `${width}%`, top: '13px', height: '30px', borderRadius: '999px', background: 'linear-gradient(90deg,#f97316,#2563eb)', color: 'white', fontSize: '11px', fontWeight: 900, display: 'flex', alignItems: 'center', padding: '0 0.75rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {campaignChannel(campaign)}
                        </div>
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      {selectedCampaign && (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 1.1fr) minmax(320px, 0.9fr)', gap: '1rem' }}>
          <div style={{ backgroundColor: cardBg, border: `1px solid ${border}`, borderRadius: '14px', padding: '1rem' }}>
            <div style={{ color: textSecondary, fontSize: '11px', fontWeight: 900, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Selected Campaign</div>
            <h2 style={{ color: textPrimary, margin: '0.25rem 0', fontSize: '22px', fontWeight: 900 }}>{campaignName(selectedCampaign)}</h2>
            <div style={{ color: textSecondary, fontSize: '13px', marginBottom: '1rem' }}>{campaignChannel(selectedCampaign)} | {dateRange(selectedCampaign)}</div>

            <DetailBlock label="Strategy / Hypothesis" value={stringField(selectedCampaign.fields, 'Hypothesis')} />
            <DetailBlock label="Target Audience" value={stringField(selectedCampaign.fields, 'Target Audience')} />
            <DetailBlock label="Research Notes" value={stringField(selectedCampaign.fields, 'Research Notes')} />
            <DetailBlock label="Variance / Rejection Notes" value={stringField(selectedCampaign.fields, 'Variance Analysis') || stringField(selectedCampaign.fields, 'Rejection Reason')} />

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(135px, 1fr))', gap: '0.65rem', marginTop: '1rem' }}>
              <Metric label="Forecast Spend" value={money(selectedCampaign.fields['Forecast Spend'])} />
              <Metric label="Forecast CAC" value={money(selectedCampaign.fields['Forecast CAC'])} />
              <Metric label="Impressions" value={numberText(selectedCampaign.fields['Forecast Impressions'])} />
              <Metric label="Clicks" value={numberText(selectedCampaign.fields['Forecast Clicks'])} />
              <Metric label="Trials" value={numberText(selectedCampaign.fields['Forecast Trial Signups'])} />
              <Metric label="Paid Subs" value={numberText(selectedCampaign.fields['Forecast Paid Subs'])} />
              <Metric label="Annual Mix" value={percentText(selectedCampaign.fields['Forecast Annual Mix %'])} />
              <Metric label="Actual Paid Subs" value={numberText(selectedCampaign.fields['Actual Paid Subs'])} />
            </div>
          </div>

          <div style={{ backgroundColor: cardBg, border: `1px solid ${border}`, borderRadius: '14px', padding: '1rem' }}>
            <div style={{ color: textSecondary, fontSize: '11px', fontWeight: 900, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '0.75rem' }}>
              Tactics / Tasks
            </div>
            {selectedCampaign.tasks.length === 0 ? (
              <div style={{ backgroundColor: '#f8fafc', border: `1px solid ${border}`, borderRadius: '10px', color: textSecondary, padding: '1rem', lineHeight: 1.45 }}>
                No linked tasks yet. Approved campaigns get task templates automatically after the stress test passes.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
                {[...selectedCampaign.tasks].sort((a, b) => taskDate(a).localeCompare(taskDate(b))).map((task, index) => (
                  <div key={task.id} style={{ backgroundColor: '#f8fafc', border: `1px solid ${border}`, borderRadius: '10px', padding: '0.75rem' }}>
                    <div style={{ color: textPrimary, fontSize: '13px', fontWeight: 900 }}>{index + 1}. {stringField(task.fields, 'Task Name') || task.id}</div>
                    <div style={{ color: textSecondary, fontSize: '11px', marginTop: '0.25rem' }}>
                      Owner: {stringField(task.fields, 'Owner') || 'Unassigned'} | Status: {stringField(task.fields, 'Status') || 'Not Started'} | Priority: {stringField(task.fields, 'Priority') || 'P1'}
                    </div>
                    <div style={{ color: textSecondary, fontSize: '11px', marginTop: '0.2rem' }}>
                      Forecast: {formatDate(dateField(task.fields, 'Forecast Start Date'))}
                    </div>
                    {stringField(task.fields, 'Notes') && (
                      <div style={{ color: textSecondary, fontSize: '12px', lineHeight: 1.45, marginTop: '0.45rem' }}>{stringField(task.fields, 'Notes')}</div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ backgroundColor: '#0f172a', borderRadius: '10px', padding: '0.75rem', color: 'white' }}>
      <div style={{ color: '#cbd5e1', fontSize: '10px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
      <div style={{ fontSize: '18px', fontWeight: 900, marginTop: '0.25rem' }}>{value}</div>
    </div>
  )
}

function DetailBlock({ label, value }: { label: string; value: string }) {
  if (!value) return null
  return (
    <div style={{ backgroundColor: '#f8fafc', border: `1px solid ${border}`, borderRadius: '10px', padding: '0.8rem', marginTop: '0.75rem' }}>
      <div style={{ color: textSecondary, fontSize: '11px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.25rem' }}>{label}</div>
      <div style={{ color: textPrimary, fontSize: '13px', lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>{value}</div>
    </div>
  )
}
