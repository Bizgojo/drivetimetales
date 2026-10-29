import Link from 'next/link'

const actions = [
  { icon: '🎙️', title: 'Voice review', detail: 'Review voice decisions only when your approval is required.', href: '/admin/production/approval', cta: 'Open production review' },
  { icon: '📚', title: 'Stories published', detail: 'Inspect newly published episodes and the live library.', href: '/admin/stories', cta: 'Open library' },
  { icon: '💳', title: 'Funding and credits', detail: 'Check recorded AI usage and balances. Verify the provider before adding funds.', href: '/admin/ai-spending', cta: 'Open AI spending' },
  { icon: '📣', title: 'Campaign approval', detail: 'Review creative, audiences, spend and proposals before authorization.', href: '/admin/marketing/campaign-intelligence', cta: 'Open campaigns' },
  { icon: '💬', title: 'Customer replies', detail: 'Read support messages and review AI-suggested responses before sending.', href: '/admin/support', cta: 'Open inbox' },
  { icon: '💡', title: 'Story suggestions', detail: 'Review customer-submitted story ideas.', href: '/admin/story-ideas', cta: 'Open ideas' },
  { icon: '👥', title: 'Friend invitations', detail: 'Inspect referrals and follow-up activity.', href: '/admin/referrals', cta: 'Open referrals' },
]

export default function ActionCenter() {
  return <div style={{ maxWidth: 920, padding: '20px 16px 48px', margin: '0 auto' }}>
    <h1 style={{ fontSize: 26, fontWeight: 800, color: '#17212b', marginBottom: 4 }}>Action Center</h1>
    <p style={{ color: '#596678', fontSize: 14, marginBottom: 22 }}>One place to reach the tasks and decisions that matter.</p>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,280px),1fr))', gap: 12 }}>
      {actions.map(item => <Link key={item.href} href={item.href} style={{ display: 'block', border: '1px solid #e1e5eb', borderRadius: 14, background: '#fff', padding: 18, color: '#17212b', textDecoration: 'none' }}>
        <div style={{ fontSize: 26, marginBottom: 10 }}>{item.icon}</div>
        <div style={{ fontSize: 17, fontWeight: 750 }}>{item.title}</div>
        <p style={{ fontSize: 13, color: '#596678', lineHeight: 1.5, minHeight: 40 }}>{item.detail}</p>
        <span style={{ color: '#c35a11', fontSize: 13, fontWeight: 700 }}>{item.cta} →</span>
      </Link>)}
    </div>
    <section style={{ background: '#fff8ed', border: '1px solid #f7dfb9', borderRadius: 12, padding: 16, marginTop: 18 }}>
      <h2 style={{ fontSize: 15, margin: 0, color: '#6a4211' }}>Belle Alerts: connection pending</h2>
      <p style={{ color: '#6a4211', fontSize: 13, lineHeight: 1.5, marginBottom: 0 }}>These links work as manual shortcuts. Live unread counts, custom sting + Belle audio, push subscriptions, synchronized acknowledgments and event-triggered deep links are not connected yet. No automatic alerts or financial actions have been enabled.</p>
    </section>
  </div>
}
