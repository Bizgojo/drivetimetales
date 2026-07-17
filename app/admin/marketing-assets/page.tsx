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
  accountName: string
  handle: string
  profileUrl: string
  status: AssetStatus
  statusLabel: string
  recoveryEmail: string
  note: string
  owner: string
  twoFAStatus: string
  passwordManager: string
  details: string
}

const MARKETING_ASSETS: MarketingAsset[] = [
  {
    id: 'twitter',
    platform: 'X (Twitter)',
    icon: '𝕏',
    accountName: 'Endless Tales Audio',
    handle: '@EndlessTalesAudio',
    profileUrl: 'https://x.com/EndlessTalesAudio',
    status: 'action_needed',
    statusLabel: 'ACTION NEEDED',
    recoveryEmail: 'unknown',
    note: 'API connected. @EndlessTalesAudio exists. X Basic plan ($100/mo) not purchased — posting via automation blocked.',
    owner: 'Susan',
    twoFAStatus: 'unknown',
    passwordManager: 'unknown',
    details: 'Full API credentials in .env.local. xurl installed. Manual posting possible. Organic posting ready once X Basic plan activated.',
  },
  {
    id: 'reddit',
    platform: 'Reddit',
    icon: '🔴',
    accountName: 'Endless Tales Audio',
    handle: 'u/EndlessTalesAudio',
    profileUrl: 'https://reddit.com/u/EndlessTalesAudio',
    status: 'connected',
    statusLabel: 'CONNECTED',
    recoveryEmail: 'unknown',
    note: 'Account confirmed. Manual posting via admin panel.',
    owner: 'Susan',
    twoFAStatus: 'unknown',
    passwordManager: 'unknown',
    details: 'No API credentials needed for manual workflow. Admin social generator supports Reddit post formatting.',
  },
  {
    id: 'email',
    platform: 'Email (Resend)',
    icon: '✉️',
    accountName: 'Endless Tales',
    handle: 'hello@endless-tales.com',
    profileUrl: '—',
    status: 'connected',
    statusLabel: 'CONNECTED',
    recoveryEmail: 'marc@endless-tales.com',
    note: 'Fully operational. Transactional routes live (waitlist, referral, promo, alerts).',
    owner: 'Atlas',
    twoFAStatus: 'unknown',
    passwordManager: 'unknown',
    details: 'Resend API key active. Sender domain: endless-tales.com. Routes: waitlist signup, referral, promotional, system alerts.',
  },
  {
    id: 'airtable',
    platform: 'Airtable',
    icon: '📊',
    accountName: 'Endless Tales',
    handle: '—',
    profileUrl: 'https://airtable.com',
    status: 'connected',
    statusLabel: 'CONNECTED',
    recoveryEmail: 'unknown',
    note: 'Marketing operations system. Campaigns, Tasks, Expenses, Snapshots tables active.',
    owner: 'Susan',
    twoFAStatus: 'unknown',
    passwordManager: 'unknown',
    details: 'Tables: Campaigns (tblBBWg3lgcjBYpPy), Tasks (tblJZG3UR2Zq3qFcG), Expenses, Cash Snapshots. Campaign channels configured: Meta, TikTok, Reddit, Email, Google, X.',
  },
  {
    id: 'analytics',
    platform: 'Analytics',
    icon: '📈',
    accountName: 'Endless Tales',
    handle: 'Vercel Analytics',
    profileUrl: '—',
    status: 'partial',
    statusLabel: 'PARTIAL',
    recoveryEmail: '—',
    note: 'Vercel Analytics active (pageviews only). No GA4, no ad platform pixels — attribution runs on promo codes + UTMs + signup survey.',
    owner: 'Atlas',
    twoFAStatus: 'N/A',
    passwordManager: 'N/A',
    details: 'Vercel Analytics tracks pageviews. No Google Analytics 4, no Google Tag Manager, no Meta Pixel, no TikTok Pixel, no Reddit Pixel in codebase. Paid acquisition attribution runs on three layers by design: promo codes (GVLMETA/GVLTOK), UTM parameters, and the signup survey. Pixels are a post-launch upgrade candidate (would enable conversion-optimized campaigns + ROAS).',
  },
  {
    id: 'instagram',
    platform: 'Instagram',
    icon: '📸',
    accountName: 'Endless Tales Audio',
    handle: 'endlesstalesllc',
    profileUrl: 'https://www.instagram.com/endlesstalesllc',
    status: 'connected',
    statusLabel: 'CONNECTED',
    recoveryEmail: 'hello.endlesstales@gmail.com',
    note: 'Active. Organic audience building and story promotion.',
    owner: 'Susan',
    twoFAStatus: 'unknown',
    passwordManager: 'Bitwarden',
    details: 'Account: @endlesstalesllc. Organic channel — no paid ad account linked yet. Meta Pixel not installed on platform. Handle reserved and active.',
  },
  {
    id: 'tiktok',
    platform: 'TikTok',
    icon: '🎵',
    accountName: 'Endless Tales Audio',
    handle: 'endlesstalesllc',
    profileUrl: 'https://www.tiktok.com/@endlesstalesllc',
    status: 'connected',
    statusLabel: 'CONNECTED',
    recoveryEmail: 'hello.endlesstales@gmail.com',
    note: 'Active. Primary organic channel for Founding Member acquisition.',
    owner: 'Susan',
    twoFAStatus: 'unknown',
    passwordManager: 'Bitwarden',
    details: 'Account: @endlesstalesllc. TikTok Business account also active (same handle) for future paid campaigns. TikTok Pixel not yet installed on platform.',
  },
  {
    id: 'tiktok_business',
    platform: 'TikTok Business',
    icon: '🎯',
    accountName: 'Endless Tales Audio',
    handle: 'endlesstalesllc',
    profileUrl: 'https://business.tiktok.com',
    status: 'action_needed',
    statusLabel: 'ACTION NEEDED',
    recoveryEmail: 'hello.endlesstales@gmail.com',
    note: 'Business account active. TikTok Pixel not installed — blocks paid campaigns.',
    owner: 'Susan',
    twoFAStatus: 'unknown',
    passwordManager: 'Bitwarden',
    details: 'TikTok Business Center active under @endlesstalesllc. Pixel must be installed on app.endless-tales.com before paid campaigns can run. No ad spend committed.',
  },
  {
    id: 'facebook',
    platform: 'Facebook',
    icon: '📘',
    accountName: '—',
    handle: '—',
    profileUrl: '—',
    status: 'not_created',
    statusLabel: 'NOT CREATED',
    recoveryEmail: '—',
    note: 'No Facebook Page confirmed.',
    owner: '—',
    twoFAStatus: 'N/A',
    passwordManager: 'N/A',
    details: 'No credentials, no page ID, no account reference found. Page should be created and handle reserved before launch.',
  },
  {
    id: 'youtube',
    platform: 'YouTube',
    icon: '▶️',
    accountName: '—',
    handle: '—',
    profileUrl: '—',
    status: 'not_created',
    statusLabel: 'NOT CREATED',
    recoveryEmail: '—',
    note: 'No YouTube channel confirmed.',
    owner: '—',
    twoFAStatus: 'N/A',
    passwordManager: 'N/A',
    details: 'No credentials or channel ID found. Lower priority than TikTok for this audience.',
  },
  {
    id: 'google_ads',
    platform: 'Google Ads',
    icon: '🔍',
    accountName: '—',
    handle: '—',
    profileUrl: '—',
    status: 'not_created',
    statusLabel: 'NOT CREATED',
    recoveryEmail: '—',
    note: 'No Google Ads account.',
    owner: '—',
    twoFAStatus: 'N/A',
    passwordManager: 'N/A',
    details: 'No Google Ads credentials found. Required before running search or display campaigns. Google Analytics 4 + conversion tracking also needed.',
  },
  {
    id: 'meta_ads',
    platform: 'Meta Ads',
    icon: '📢',
    accountName: 'WonderBooks Press portfolio (Marc personal business account)',
    handle: 'Ad account 10211115959074229',
    profileUrl: '—',
    status: 'connected',
    statusLabel: 'ACTIVE',
    recoveryEmail: '—',
    note: 'LIVE since Jul 17, 2026 ~9:55 AM ET — campaign GVL-TEST-001, 2 ad sets / 6 ads delivering.',
    owner: 'Marc personally — no agent access, no agent credentials (standing governance rule)',
    twoFAStatus: 'unknown',
    passwordManager: "Marc's own",
    details: 'Meta ads live as of Jul 17, 2026 ~9:55 AM ET under Marc\u2019s personal business account (WonderBooks Press portfolio, ad account 10211115959074229). Campaign GVL-TEST-001: 2 ad sets (gvl-broad, gvl-audio-intent), 6 ads delivering. Payment: GVL-Meta Mercury card ••7468.',
  },
  {
    id: 'reddit_ads',
    platform: 'Reddit Ads',
    icon: '📣',
    accountName: '—',
    handle: '—',
    profileUrl: '—',
    status: 'not_created',
    statusLabel: 'NOT CREATED',
    recoveryEmail: '—',
    note: 'No Reddit Ads account.',
    owner: '—',
    twoFAStatus: 'N/A',
    passwordManager: 'N/A',
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

function FieldRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <>
      <div style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' as const, letterSpacing: '0.05em', paddingTop: 2 }}>
        {label}
      </div>
      <div style={{ fontSize: 12, color: '#334155', fontWeight: 500, wordBreak: 'break-word' as const }}>
        {value}
      </div>
    </>
  )
}

function AssetCard({ asset }: { asset: MarketingAsset }) {
  const [expanded, setExpanded] = useState(false)
  const cfg = STATUS_CONFIG[asset.status]

  const showProfileLink =
    (asset.status === 'connected' || asset.status === 'action_needed') &&
    asset.profileUrl !== '—'

  const usernameDisplay = (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <span style={{ fontFamily: 'monospace' }}>{asset.handle}</span>
      {showProfileLink && (
        <a
          href={asset.profileUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{ fontSize: 11, color: '#3b82f6', textDecoration: 'none', fontFamily: 'sans-serif' }}
          title={asset.profileUrl}
        >
          ↗
        </a>
      )}
    </span>
  )

  return (
    <div
      style={{
        ...CARD,
        borderTop: `3px solid ${cfg.dot}`,
        padding: '14px 16px',
        display: 'flex',
        flexDirection: 'column' as const,
        gap: 10,
      }}
    >
      {/* Header: platform + status badge */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 20 }}>{asset.icon}</span>
          <span style={{ fontWeight: 800, fontSize: 14, color: '#0f172a' }}>{asset.platform}</span>
        </div>
        <StatusBadge status={asset.status} label={asset.statusLabel} />
      </div>

      {/* Note (summary) */}
      <div style={{ fontSize: 12, color: '#475569', lineHeight: 1.5 }}>
        {asset.note}
      </div>

      {/* Two-column field grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '6px 12px',
          backgroundColor: '#f8fafc',
          border: '1px solid #e2e8f0',
          borderRadius: 6,
          padding: '10px 12px',
        }}
      >
        <FieldRow label="Account Name" value={asset.accountName} />
        <FieldRow label="Username" value={usernameDisplay} />
        <FieldRow label="Owner" value={asset.owner} />
        <FieldRow label="2FA Status" value={asset.twoFAStatus.toUpperCase()} />
        <FieldRow label="Password Mgr" value={asset.passwordManager} />
        <FieldRow label="Status" value={<StatusBadge status={asset.status} label={asset.statusLabel} />} />
      </div>

      {/* Details expand (includes recovery email) */}
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
              display: 'flex',
              flexDirection: 'column' as const,
              gap: 8,
            }}
          >
            {/* Recovery email — only shown here, not in collapsed view */}
            <div>
              <span style={{ fontWeight: 700, color: '#334155' }}>Recovery Email: </span>
              <span style={{ fontFamily: 'monospace' }}>{asset.recoveryEmail}</span>
            </div>
            {showProfileLink && (
              <div>
                <span style={{ fontWeight: 700, color: '#334155' }}>Profile URL: </span>
                <a
                  href={asset.profileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: '#3b82f6', textDecoration: 'underline', fontSize: 12 }}
                >
                  {asset.profileUrl}
                </a>
              </div>
            )}
            <div>{asset.details}</div>
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
            <span style={{ fontSize: 18, flexShrink: 0 }}>🎯</span>
            <div>
              <div style={{ fontWeight: 700, fontSize: 13, color: '#0f172a', marginBottom: 2 }}>
                TikTok Pixel — blocks paid campaigns
              </div>
              <div style={{ fontSize: 12, color: '#64748b', lineHeight: 1.5 }}>
                TikTok Business Center is active but the pixel is not installed on app.endless-tales.com. Gates TikTok paid launch only (not yet scheduled) — does not affect the current Meta test. In queue for TikTok launch prep.
              </div>
            </div>
            <span style={{ backgroundColor: '#fef3c7', color: '#92400e', borderRadius: 12, padding: '2px 8px', fontSize: 10, fontWeight: 800, whiteSpace: 'nowrap' as const, flexShrink: 0 }}>
              P2
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
                Ad pixels not installed — post-launch upgrade candidate
              </div>
              <div style={{ fontSize: 12, color: '#64748b', lineHeight: 1.5 }}>
                Not attribution-blind: GVL-TEST-001 runs three-layer attribution by design — promo codes (GVLMETA/GVLTOK), UTM parameters, and the signup survey. Pixels are a deliberate post-launch upgrade decision (would enable conversion-optimized campaigns + ROAS), not a launch blocker.
              </div>
            </div>
            <span style={{ backgroundColor: '#f1f5f9', color: '#475569', borderRadius: 12, padding: '2px 8px', fontSize: 10, fontWeight: 800, whiteSpace: 'nowrap' as const, flexShrink: 0 }}>
              P3
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
                Facebook handle reservation + brand Business Manager
              </div>
              <div style={{ fontSize: 12, color: '#64748b', lineHeight: 1.5 }}>
                No Facebook Page confirmed. Instagram is active (@endlesstalesllc); Meta ads run under Marc’s personal business account (WonderBooks Press portfolio). Post-launch item: reserve the Facebook handle and decide on a dedicated brand Business Manager.
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
