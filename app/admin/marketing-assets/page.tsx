'use client'

import { useState, type CSSProperties } from 'react'

const PAGE_BG = '#FAF9F6'

const CARD: CSSProperties = {
  backgroundColor: '#fff',
  border: '1px solid #e2e8f0',
  borderRadius: '10px',
  boxShadow: '0 10px 24px rgba(15,23,42,0.06)',
}

const BTN: CSSProperties = {
  border: '1px solid #cbd5e1',
  borderRadius: '7px',
  backgroundColor: '#fff',
  color: '#0f172a',
  fontWeight: 800,
  fontSize: '12px',
  padding: '0.4rem 0.65rem',
  cursor: 'pointer',
}

type AssetStatus = 'connected' | 'partial' | 'not_created' | 'action_needed'

interface MarketingAsset {
  id: string
  platform: string
  icon: string
  handle: string
  status: AssetStatus
  statusLabel: string
  note: string
  owner: string
  details: string
}

const MARKETING_ASSETS: MarketingAsset[] = [
  {
    id: 'twitter',
    platform: 'X (Twitter)',
    icon: '𝕏',
    handle: '@EndlessTalesAudio',
    status: 'action_needed',
    statusLabel: 'ACTION NEEDED',
    note: 'API connected. @EndlessTalesAudio exists. X Basic plan ($100/mo) not purchased — posting via automation blocked.',
    owner: 'Susan',
    details: 'Full API credentials in .env.local. xurl installed. Manual posting possible. Organic posting ready once X Basic plan activated.',
  },
  {
    id: 'reddit',
    platform: 'Reddit',
    icon: '🔴',
    handle: 'u/EndlessTalesAudio',
    status: 'connected',
    statusLabel: 'CONNECTED',
    note: 'Account confirmed. Manual posting via admin panel.',
    owner: 'Susan',
    details: 'No API credentials needed for manual workflow. Admin social generator supports Reddit post formatting.',
  },
  {
    id: 'email',
    platform: 'Email (Resend)',
    icon: '✉️',
    handle: 'hello@endless-tales.com',
    status: 'connected',
    statusLabel: 'CONNECTED',
    note: 'Fully operational. Transactional routes live (waitlist, referral, promo, alerts).',
    owner: 'Atlas',
    details: 'Resend API key active. Sender domain: endless-tales.com. Routes: waitlist signup, referral, promotional, system alerts.',
  },
  {
    id: 'airtable',
    platform: 'Airtable',
    icon: '📊',
    handle: 'Base: appPYSnJkNbWCc9Lj',
    status: 'connected',
    statusLabel: 'CONNECTED',
    note: 'Marketing operations system. Campaigns, Tasks, Expenses, Snapshots tables active.',
    owner: 'Susan',
    details: 'Tables: Campaigns (tblBBWg3lgcjBYpPy), Tasks (tblJZG3UR2Zq3qFcG), Expenses, Cash Snapshots. Campaign channels configured: Meta, TikTok, Reddit, Email, Google, X.',
  },
  {
    id: 'analytics',
    platform: 'Analytics',
    icon: '📈',
    handle: 'Vercel Analytics',
    status: 'partial',
    statusLabel: 'PARTIAL',
    note: 'Vercel Analytics active (pageviews only). No GA4, no Meta Pixel, no ad platform pixels.',
    owner: 'Atlas',
    details: 'Vercel Analytics tracks pageviews. No Google Analytics 4, no Google Tag Manager, no Meta Pixel, no TikTok Pixel, no Reddit Pixel in codebase. All paid acquisition is attribution-blind.',
  },
  {
    id: 'facebook',
    platform: 'Facebook',
    icon: '📘',
    handle: '—',
    status: 'not_created',
    statusLabel: 'NOT CREATED',
    note: 'No Facebook Page confirmed.',
    owner: '—',
    details: 'No credentials, no page ID, no account reference found. Page should be created and handle reserved before launch.',
  },
  {
    id: 'instagram',
    platform: 'Instagram',
    icon: '📸',
    handle: '—',
    status: 'not_created',
    statusLabel: 'NOT CREATED',
    note: 'No Instagram account confirmed.',
    owner: '—',
    details: 'No credentials or account reference found. Handle should be reserved before launch.',
  },
  {
    id: 'tiktok',
    platform: 'TikTok',
    icon: '🎵',
    handle: '—',
    status: 'not_created',
    statusLabel: 'NOT CREATED',
    note: 'No TikTok account confirmed. Highest-priority missing channel.',
    owner: '—',
    details: 'TikTok is the strongest CPA channel for commuter/driver audience. No account, no pixel. Should be created and pixel installed before any paid spend.',
  },
  {
    id: 'youtube',
    platform: 'YouTube',
    icon: '▶️',
    handle: '—',
    status: 'not_created',
    statusLabel: 'NOT CREATED',
    note: 'No YouTube channel confirmed.',
    owner: '—',
    details: 'No credentials or channel ID found. Lower priority than TikTok for this audience.',
  },
  {
    id: 'google_ads',
    platform: 'Google Ads',
    icon: '🔍',
    handle: '—',
    status: 'not_created',
    statusLabel: 'NOT CREATED',
    note: 'No Google Ads account.',
    owner: '—',
    details: 'No Google Ads credentials found. Required before running search or display campaigns. Google Analytics 4 + conversion tracking also needed.',
  },
  {
    id: 'meta_ads',
    platform: 'Meta Ads',
    icon: '📢',
    handle: '—',
    status: 'not_created',
    statusLabel: 'NOT CREATED',
    note: 'No Meta Ads account.',
    owner: '—',
    details: 'No Meta Business Manager, no Ad Account, no Meta Pixel in codebase. Required before running Facebook/Instagram campaigns.',
  },
  {
    id: 'tiktok_ads',
    platform: 'TikTok Ads',
    icon: '🎯',
    handle: '—',
    status: 'not_created',
    statusLabel: 'NOT CREATED',
    note: 'No TikTok Ads account.',
    owner: '—',
    details: 'No TikTok Business Center, no Ads Manager account, no TikTok Pixel. Required before paid TikTok campaigns.',
  },
  {
    id: 'reddit_ads',
    platform: 'Reddit Ads',
    icon: '📣',
    handle: '—',
    status: 'not_created',
    statusLabel: 'NOT CREATED',
    note: 'No Reddit Ads account.',
    owner: '—',
    details: 'No Reddit Ads credentials found. Reddit organic is active (u/EndlessTalesAudio). Ads account would be created when paid Reddit campaigns are authorized.',
  },
]

const STATUS_CONFIG: Record<AssetStatus, { bg: string; color: string; border: string; dot: string }> = {
  connected:    { bg: '#d1fae5', color: '#065f46', border: '#6ee7b7', dot: '#22c55e' },
  partial:      { bg: '#fef3c7', color: '#92400e', border: '#fcd34d', dot: '#f59e0b' },
  not_created:  { bg: '#f1f5f9', color: '#475569', border: '#cbd5e1', dot: '#94a3b8' },
  action_needed:{ bg: '#fee2e2', color: '#991b1b', border: '#fca5a5', dot: '#ef4444' },
}

function StatusBadge({ status, label }: { status: AssetStatus; label: string }) {
  const cfg = STATUS_CONFIG[status]
  return (
    <span
      style={{
        backgroundColor: cfg.bg,
        color: cfg.color,
        border: `1px solid ${cfg.border}`,
        borderRadius: 12,
        padding: '2px 9px',
        fontSize: 10,
        fontWeight: 800,
        letterSpacing: '0.04em',
        whiteSpace: 'nowrap' as const,
      }}
    >
      {label}
    </span>
  )
}

function AssetCard({ asset }: { asset: MarketingAsset }) {
  const [expanded, setExpanded] = useState(false)
  const cfg = STATUS_CONFIG[asset.status]

  return (
    <div
      style={{
        ...CARD,
        borderTop: `3px solid ${cfg.dot}`,
        padding: '16px',
        display: 'flex',
        flexDirection: 'column' as const,
        gap: 8,
      }}
    >
      {/* Platform name + icon */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 20 }}>{asset.icon}</span>
          <span style={{ fontWeight: 800, fontSize: 14, color: '#0f172a' }}>{asset.platform}</span>
        </div>
        <StatusBadge status={asset.status} label={asset.statusLabel} />
      </div>

      {/* Handle */}
      <div style={{ fontSize: 12, color: '#64748b', fontFamily: 'monospace' }}>
        {asset.handle}
      </div>

      {/* Note */}
      <div style={{ fontSize: 12, color: '#475569', lineHeight: 1.5 }}>
        {asset.note}
      </div>

      {/* Owner */}
      {asset.owner !== '—' && (
        <div style={{ fontSize: 11, color: '#94a3b8' }}>
          Owner: <span style={{ fontWeight: 700, color: '#64748b' }}>{asset.owner}</span>
        </div>
      )}

      {/* Details expand */}
      <div>
        <button
          type="button"
          onClick={() => setExpanded((p) => !p)}
          style={{
            ...BTN,
            fontSize: 11,
            padding: '3px 10px',
            color: '#64748b',
            borderColor: '#e2e8f0',
          }}
        >
          {expanded ? '▲ Hide details' : '▼ Details'}
        </button>
        {expanded && (
          <div
            style={{
              marginTop: 8,
              backgroundColor: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: 6,
              padding: '10px 12px',
              fontSize: 12,
              color: '#475569',
              lineHeight: 1.6,
            }}
          >
            {asset.details}
          </div>
        )}
      </div>
    </div>
  )
}

export default function MarketingAssetsPage() {
  const connected     = MARKETING_ASSETS.filter(a => a.status === 'connected').length
  const partial       = MARKETING_ASSETS.filter(a => a.status === 'partial').length
  const notCreated    = MARKETING_ASSETS.filter(a => a.status === 'not_created').length
  const actionNeeded  = MARKETING_ASSETS.filter(a => a.status === 'action_needed').length

  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: PAGE_BG,
        color: '#0f172a',
        padding: '2rem 2rem 5rem',
      }}
    >
      <style jsx>{`
        .ma-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 16px;
        }
        @media (max-width: 900px) {
          .ma-grid {
            grid-template-columns: repeat(2, 1fr);
          }
        }
        @media (max-width: 560px) {
          .ma-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>

      {/* Header */}
      <header style={{ marginBottom: 24 }}>
        <h1 style={{ margin: 0, fontWeight: 800, fontSize: 22, color: '#0f172a' }}>
          Marketing Assets
        </h1>
        <div style={{ fontSize: 13, color: '#64748b', marginTop: 4 }}>
          Account status and connections
        </div>
      </header>

      {/* Summary Strip */}
      <div
        style={{
          ...CARD,
          padding: '12px 20px',
          marginBottom: 24,
          display: 'flex',
          flexWrap: 'wrap' as const,
          gap: 24,
          alignItems: 'center',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: '#22c55e', display: 'inline-block' }} />
          <span style={{ fontWeight: 700, fontSize: 13, color: '#065f46' }}>Connected:</span>
          <span style={{ fontWeight: 800, fontSize: 16, color: '#065f46' }}>{connected}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: '#f59e0b', display: 'inline-block' }} />
          <span style={{ fontWeight: 700, fontSize: 13, color: '#92400e' }}>Partial:</span>
          <span style={{ fontWeight: 800, fontSize: 16, color: '#92400e' }}>{partial}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: '#94a3b8', display: 'inline-block' }} />
          <span style={{ fontWeight: 700, fontSize: 13, color: '#475569' }}>Not created:</span>
          <span style={{ fontWeight: 800, fontSize: 16, color: '#475569' }}>{notCreated}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: '#ef4444', display: 'inline-block' }} />
          <span style={{ fontWeight: 700, fontSize: 13, color: '#991b1b' }}>Action needed:</span>
          <span style={{ fontWeight: 800, fontSize: 16, color: '#991b1b' }}>{actionNeeded}</span>
        </div>
      </div>

      {/* Asset Cards Grid */}
      <div className="ma-grid" style={{ marginBottom: 32 }}>
        {MARKETING_ASSETS.map((asset) => (
          <AssetCard key={asset.id} asset={asset} />
        ))}
      </div>

      {/* Priority Gaps Section */}
      <div
        style={{
          border: '2px solid #f59e0b',
          borderRadius: 10,
          backgroundColor: '#fffbeb',
          padding: '16px 20px',
        }}
      >
        <div style={{ fontWeight: 800, fontSize: 15, color: '#92400e', marginBottom: 14 }}>
          ⚡ Priority Gaps
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 12 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 12,
              backgroundColor: '#fff',
              border: '1px solid #fde68a',
              borderRadius: 8,
              padding: '12px 14px',
            }}
          >
            <span style={{ fontSize: 18, flexShrink: 0 }}>🎵</span>
            <div>
              <div style={{ fontWeight: 700, fontSize: 13, color: '#0f172a', marginBottom: 2 }}>
                TikTok account + Pixel
              </div>
              <div style={{ fontSize: 12, color: '#64748b', lineHeight: 1.5 }}>
                Best CPA channel for commuter/driver audience. No account exists, no pixel installed. Should be the highest-priority channel to create before any paid spend.
              </div>
            </div>
            <span style={{ backgroundColor: '#fee2e2', color: '#991b1b', borderRadius: 12, padding: '2px 8px', fontSize: 10, fontWeight: 800, whiteSpace: 'nowrap' as const, flexShrink: 0 }}>
              P1
            </span>
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 12,
              backgroundColor: '#fff',
              border: '1px solid #fde68a',
              borderRadius: 8,
              padding: '12px 14px',
            }}
          >
            <span style={{ fontSize: 18, flexShrink: 0 }}>📈</span>
            <div>
              <div style={{ fontWeight: 700, fontSize: 13, color: '#0f172a', marginBottom: 2 }}>
                Ad pixels missing on all platforms
              </div>
              <div style={{ fontSize: 12, color: '#64748b', lineHeight: 1.5 }}>
                No Meta Pixel, no TikTok Pixel, no Reddit Pixel, no Google Tag Manager in codebase. All paid acquisition is currently attribution-blind — blocks ROAS measurement on any campaign.
              </div>
            </div>
            <span style={{ backgroundColor: '#fee2e2', color: '#991b1b', borderRadius: 12, padding: '2px 8px', fontSize: 10, fontWeight: 800, whiteSpace: 'nowrap' as const, flexShrink: 0 }}>
              P1
            </span>
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 12,
              backgroundColor: '#fff',
              border: '1px solid #fde68a',
              borderRadius: 8,
              padding: '12px 14px',
            }}
          >
            <span style={{ fontSize: 18, flexShrink: 0 }}>📘</span>
            <div>
              <div style={{ fontWeight: 700, fontSize: 13, color: '#0f172a', marginBottom: 2 }}>
                Facebook + Instagram handle reservation
              </div>
              <div style={{ fontSize: 12, color: '#64748b', lineHeight: 1.5 }}>
                Neither @EndlessTales nor @EndlessTalesAudio is confirmed reserved on Facebook or Instagram. Squatting risk increases as brand awareness grows. Reserve handles before public launch.
              </div>
            </div>
            <span style={{ backgroundColor: '#fef3c7', color: '#92400e', borderRadius: 12, padding: '2px 8px', fontSize: 10, fontWeight: 800, whiteSpace: 'nowrap' as const, flexShrink: 0 }}>
              P2
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
