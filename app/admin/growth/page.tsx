'use client'

import { useState, type CSSProperties } from 'react'
import { FoundingMemberStatusBoard } from './founding-member/page'

type GrowthTab = {
  id: string
  label: string
  description: string
  badge?: string
}

const TABS: GrowthTab[] = [
  { id: 'executive', label: 'Executive Dashboard', description: 'Growth health, campaign pacing, cash runway, CAC, conversion, and launch readiness will roll up here.' },
  { id: 'campaigns', label: 'Campaigns', description: 'Campaign planning, launch status, spend pacing, and performance management will live here.' },
  { id: 'review', label: 'Review Queue', description: 'Campaign, asset, and landing page approval workflows will be reviewed here.' },
  { id: 'assets', label: 'Assets', description: 'Marketing creative, copy, audio clips, and platform-specific assets will be organized here.' },
  { id: 'landing-pages', label: 'Landing Pages', description: 'Landing page variants, UTM setup, approval state, and conversion metrics will be managed here.' },
  { id: 'founding-member', label: 'Founding Member', description: 'Founding Member cap, Stripe subscriber count, and checkout enforcement status.' },
  { id: 'intelligence', label: 'Intelligence', description: 'Archivist pattern detection, campaign learnings, and reusable growth intelligence.', badge: 'Archivist Pending' },
]

const CARD: CSSProperties = {
  backgroundColor: '#FFFFFF',
  border: '1px solid #e0e0e0',
  borderRadius: '8px',
  boxShadow: '0 10px 24px rgba(15,23,42,0.05)',
}

function PlaceholderPanel({ tab }: { tab: GrowthTab }) {
  return (
    <section style={{ ...CARD, padding: 26 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
        <h2 style={{ margin: 0, fontSize: 24, color: '#1a1a1a', letterSpacing: 0 }}>{tab.label}</h2>
        <span style={{ backgroundColor: '#fef3c7', color: '#92400e', border: '1px solid #fde68a', borderRadius: 999, padding: '0.2rem 0.55rem', fontSize: 11, fontWeight: 900 }}>
          Coming in Phase 2/3
        </span>
      </div>
      <p style={{ margin: 0, color: '#555', maxWidth: 780, lineHeight: 1.6 }}>{tab.description}</p>
    </section>
  )
}

function IntelligenceShell() {
  return (
    <section style={{ ...CARD, padding: 26 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap', marginBottom: 18 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 24, color: '#1a1a1a', letterSpacing: 0 }}>Intelligence Center — Archivist Pending Activation</h2>
          <p style={{ margin: '8px 0 0', color: '#555', lineHeight: 1.6 }}>Pattern capture and campaign-learning tables will appear here after Archivist activation.</p>
        </div>
        <span style={{ backgroundColor: '#eef2ff', color: '#3730a3', border: '1px solid #c7d2fe', borderRadius: 999, padding: '0.35rem 0.7rem', fontSize: 12, fontWeight: 900 }}>
          Archivist Pending
        </span>
      </div>
      <div style={{ border: '1px dashed #cfcfcf', borderRadius: 8, padding: 18, backgroundColor: '#fafafa' }}>
        <div style={{ fontSize: 13, fontWeight: 900, color: '#555', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8 }}>Patterns table</div>
        <div style={{ color: '#777' }}>Placeholder for growth patterns, source campaigns, confidence, and recommended actions.</div>
      </div>
    </section>
  )
}

export default function GrowthCommandCenterPage() {
  const [activeTab, setActiveTab] = useState('executive')
  const selectedTab = TABS.find((tab) => tab.id === activeTab) || TABS[0]

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#FAF9F6', color: '#1a1a1a', padding: '24px clamp(16px, 3vw, 34px)' }}>
      <header style={{ marginBottom: 22 }}>
        <div style={{ color: '#777', fontSize: 12, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Admin</div>
        <h1 style={{ margin: 0, fontSize: 34, lineHeight: 1.1, color: '#1a1a1a', letterSpacing: 0 }}>Growth Command Center</h1>
      </header>

      <nav style={{ ...CARD, padding: 8, display: 'flex', gap: 6, overflowX: 'auto', marginBottom: 18 }} aria-label="Growth Command Center tabs">
        {TABS.map((tab) => {
          const active = tab.id === activeTab
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              style={{
                border: active ? '1px solid #1a1a1a' : '1px solid transparent',
                backgroundColor: active ? '#1a1a1a' : '#FFFFFF',
                color: active ? '#FFFFFF' : '#333',
                borderRadius: 7,
                padding: '0.65rem 0.8rem',
                fontSize: 13,
                fontWeight: 850,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                fontFamily: 'inherit',
              }}
            >
              <span>{tab.label}</span>
              {tab.badge && (
                <span style={{ marginLeft: 8, backgroundColor: active ? '#333' : '#eef2ff', color: active ? '#fff' : '#3730a3', borderRadius: 999, padding: '0.1rem 0.4rem', fontSize: 10, fontWeight: 900 }}>
                  {tab.badge}
                </span>
              )}
            </button>
          )
        })}
      </nav>

      {selectedTab.id === 'founding-member' ? (
        <FoundingMemberStatusBoard />
      ) : selectedTab.id === 'intelligence' ? (
        <IntelligenceShell />
      ) : (
        <PlaceholderPanel tab={selectedTab} />
      )}
    </div>
  )
}
