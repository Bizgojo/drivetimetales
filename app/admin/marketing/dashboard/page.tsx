'use client'

import Link from 'next/link'

const CARDS = [
  { href: '/admin/marketing/variance-command-center', title: 'Marketing Variance Command Center (Independent)', desc: 'Alternate campaign presentation using the same Airtable campaign source as Atlas, with Regenerate and variance detail.' },
  { href: '/admin/growth', title: 'Growth Command Center', desc: 'Growth overview, experiments, and key levers.' },
  { href: '/admin/marketing', title: 'Campaigns', desc: 'Active and past marketing campaigns.' },
  { href: '/admin/waitlist', title: 'Waitlist', desc: 'Waitlist growth and invites.' },
  { href: '/admin/social-posting', title: 'Social Posting', desc: 'Compose and schedule social posts.' },
  { href: '/admin/social-analytics', title: 'Social Analytics', desc: 'Engagement and reach across channels.' },
  { href: '/admin/marketing-assets', title: 'Marketing Assets', desc: 'Creative, covers, and shared assets.' },
]

export default function MarketingDashboardPage() {
  return (
    <div style={{ padding: '2rem', maxWidth: '1100px' }}>
      <h1 style={{ fontSize: '24px', fontWeight: 800, margin: '0 0 0.5rem' }}>
        Marketing Dashboard
      </h1>
      <p style={{ color: '#4a4a4a', fontSize: '14px', margin: '0 0 1.5rem' }}>
        High-level overview of marketing performance, growth, and engagement.
      </p>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
          gap: '1rem',
        }}
      >
        {CARDS.map((card) => (
          <Link
            key={card.href}
            href={card.href}
            style={{
              display: 'block',
              background: '#FFFFFF',
              border: '1px solid #e0e0e0',
              borderRadius: '12px',
              padding: '1.25rem',
              textDecoration: 'none',
              color: '#1a1a1a',
            }}
          >
            <div style={{ fontSize: '16px', fontWeight: 700, marginBottom: '0.35rem' }}>
              {card.title}
            </div>
            <div style={{ fontSize: '13px', color: '#4a4a4a' }}>{card.desc}</div>
          </Link>
        ))}
      </div>
    </div>
  )
}
