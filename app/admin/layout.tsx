'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'

const ADMIN_EMAILS = new Set([
  'marc@endless-tales.com',
  'hello.endlesstales@gmail.com',
  'williampostlewaite@icloud.com',
  'm.postlewaite@gmail.com',
])

const NAV_GROUPS = [
  { id: 'dashboard', label: 'Dashboard', icon: '\U0001f4ca', items: [
    { href: '/admin', label: 'Overview' },
    { href: '/admin/checklist', label: 'Launch Checklist' },
  ]},
  { id: 'production', label: 'Production', icon: '\U0001f3ac', items: [
    { href: '/admin/story-production', label: 'Story Production' },
    { href: '/admin/story-ideas', label: 'Story Ideas' },
    { href: '/admin/authors-narrators', label: 'Authors & Narrators' },
    { href: '/admin/genres', label: 'Genres' },
    { href: '/admin/el-usage', label: 'ElevenLabs Usage' },
  ]},
  { id: 'library', label: 'Library', icon: '\U0001f4da', items: [
    { href: '/admin/stories', label: 'Published Stories' },
    { href: '/admin/guest-stories', label: 'Guest Stories' },
    { href: '/admin/landing-stories', label: 'Landing Stories' },
  ]},
  { id: 'subscribers', label: 'Subscribers', icon: '\U0001f465', items: [
    { href: '/admin/users', label: 'Users' },
    { href: '/admin/subscriptions', label: 'Subscriptions' },
    { href: '/admin/promo', label: 'Promo Codes' },
    { href: '/admin/referrals', label: 'Referrals' },
  ]},
  { id: 'marketing', label: 'Marketing', icon: '\U0001f4f1', items: [
    { href: '/admin/marketing', label: 'Campaigns' },
    { href: '/admin/waitlist', label: 'Waitlist' },
    { href: '/admin/social-posting', label: 'Social Posting' },
    { href: '/admin/social-analytics', label: 'Social Analytics' },
  ]},
  { id: 'analytics', label: 'Analytics', icon: '\U0001f4c8', items: [
    { href: '/admin/analytics', label: 'Overview' },
  ]},
  { id: 'finance', label: 'Finance', icon: '\U0001f4b0', items: [
    { href: '/admin/finance', label: 'Revenue & Costs' },
  ]},
]

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const { user, loading } = useAuth()
  const [openGroups, setOpenGroups] = useState<Set<string>>(() => {
    const active = NAV_GROUPS.find(g => g.items.some(i => pathname === i.href || (i.href !== '/admin' && pathname.startsWith(i.href))))
    return new Set(active ? [active.id] : ['dashboard'])
  })

  useEffect(() => {
    if (loading) return
    const email = (user?.email || '').toLowerCase()
    if (!user || !ADMIN_EMAILS.has(email)) router.replace('/home')
  }, [user, loading, router])

  useEffect(() => {
    document.body.classList.add('admin-page')
    return () => document.body.classList.remove('admin-page')
  }, [])

  useEffect(() => {
    const active = NAV_GROUPS.find(g => g.items.some(i => pathname === i.href || (i.href !== '/admin' && pathname.startsWith(i.href))))
    if (active) setOpenGroups(prev => new Set([...prev, active.id]))
  }, [pathname])

  if (loading) return <div style={{ minHeight: '100vh', background: '#f5f5f5' }} />
  const email = (user?.email || '').toLowerCase()
  if (!user || !ADMIN_EMAILS.has(email)) return <div style={{ minHeight: '100vh', background: '#f5f5f5' }} />

  const toggleGroup = (id: string) => {
    setOpenGroups(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#FAF9F6', color: '#111' }}>
      <aside style={{ width: '230px', backgroundColor: '#1e293b', padding: '1rem 0.75rem', position: 'fixed', top: 0, left: 0, height: '100vh', overflowY: 'auto', boxSizing: 'border-box' }}>
        <div style={{ padding: '0.25rem 0.75rem', marginBottom: '1.25rem' }}>
          <Link href="/admin" style={{ textDecoration: 'none' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <img src="/images/et-logo.png" alt="" style={{ width: 28, height: 28, objectFit: 'contain' }} />
              <div>
                <div style={{ color: 'white', fontWeight: 800, fontSize: '15px' }}>Endless Tales</div>
                <div style={{ color: '#f97316', fontSize: '10px', fontWeight: 600, letterSpacing: '0.05em' }}>Admin Panel</div>
              </div>
            </div>
          </Link>
        </div>
        <nav style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
          {NAV_GROUPS.map((group) => {
            const isOpen = openGroups.has(group.id)
            const hasActivePage = group.items.some(i => pathname === i.href || (i.href !== '/admin' && pathname.startsWith(i.href)))
            return (
              <div key={group.id}>
                <button onClick={() => toggleGroup(group.id)} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', width: '100%', padding: '0.6rem 0.75rem', border: 'none', borderRadius: '6px', backgroundColor: hasActivePage ? 'rgba(249,115,22,0.12)' : 'transparent', color: hasActivePage ? '#f97316' : '#cbd5e1', cursor: 'pointer', fontSize: '13px', fontWeight: 700, textAlign: 'left', fontFamily: 'inherit' }}>
                  <span style={{ fontSize: '16px', width: '20px', textAlign: 'center' }}>{group.icon}</span>
                  <span style={{ flex: 1 }}>{group.label}</span>
                  <span style={{ fontSize: '10px', color: '#94a3b8', transition: 'transform 0.15s', transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)' }}>&#9654;</span>
                </button>
                {isOpen && (
                  <div style={{ marginLeft: '20px', borderLeft: '1px solid #334155', paddingLeft: '12px', marginTop: '2px', marginBottom: '6px' }}>
                    {group.items.map((item) => {
                      const isActive = pathname === item.href || (item.href !== '/admin' && pathname.startsWith(item.href))
                      return (
                        <Link key={item.href} href={item.href} style={{ display: 'block', padding: '0.45rem 0.75rem', borderRadius: '5px', backgroundColor: isActive ? '#f97316' : 'transparent', color: isActive ? 'white' : '#94a3b8', textDecoration: 'none', fontWeight: isActive ? 600 : 400, fontSize: '13px' }}>
                          {item.label}
                        </Link>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </nav>
        <div style={{ marginTop: '1.5rem', borderTop: '1px solid #334155', paddingTop: '0.75rem' }}>
          <div style={{ color: '#475569', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.5rem', paddingLeft: '0.75rem' }}>External Tools</div>
          {[
            { href: 'https://dashboard.stripe.com', label: 'Stripe', icon: '\U0001f4b3' },
            { href: 'https://vercel.com/dashboard', label: 'Vercel', icon: '\u25b2' },
            { href: 'https://supabase.com/dashboard', label: 'Supabase', icon: '\U0001f5c4' },
            { href: 'https://elevenlabs.io', label: 'ElevenLabs', icon: '\U0001f399' },
          ].map(tool => (
            <a key={tool.href} href={tool.href} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.4rem 0.75rem', color: '#64748b', textDecoration: 'none', fontSize: '12px' }}>
              <span style={{ fontSize: '14px', width: '20px', textAlign: 'center' }}>{tool.icon}</span>
              {tool.label}
            </a>
          ))}
        </div>
        <div style={{ marginTop: '1rem', padding: '0 0.25rem 0.5rem' }}>
          <Link href="/home" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', padding: '0.6rem', backgroundColor: '#334155', color: 'white', textDecoration: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: 500 }}>
            &larr; Back to Site
          </Link>
        </div>
      </aside>
      <main style={{ flex: 1, marginLeft: '230px', backgroundColor: '#FAF9F6', minHeight: '100vh' }}>
        {children}
      </main>
    </div>
  )
}
