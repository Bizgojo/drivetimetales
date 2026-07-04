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

const SIDEBAR_WIDTH = 230
const SIDEBAR_STORAGE_KEY = 'admin_sidebar_open'

const NAV_GROUPS = [
  { id: 'dashboard', label: 'Dashboard', icon: '📊', items: [
    { href: '/admin', label: 'Overview' },
    { href: '/admin/command-center', label: 'Command Center' },
    { href: '/admin/workspace', label: 'Workspace' },
    { href: '/admin/accounts', label: 'Accounts & Integrations' },
  ]},
  { id: 'production', label: 'Production', icon: '🎬', items: [
    { href: '/admin/story-queue', label: 'Story Queue' },
    { href: '/admin/story-production-v2', label: 'Story Production V2' },
    { href: '/admin/asc', label: 'ASC' },
    { href: '/admin/production/console', label: 'Production Console' },
    { href: '/admin/production/approval', label: 'Content Approval' },
    { href: '/admin/production-approval', label: 'Production & Approval ✦' },
    { href: '/admin/authors-narrators-v2', label: 'Authors & Narrators' },
    { href: '/admin/story-ideas', label: 'Story Ideas' },
    { href: '/admin/genres', label: 'Genres' },
    { href: '/admin/el-usage', label: 'ElevenLabs Usage' },
  ]},
  { id: 'library', label: 'Library', icon: '📚', items: [
    { href: '/admin/stories', label: 'Published Stories' },
    { href: '/admin/landing-stories', label: 'Landing Stories' },
  ]},
  { id: 'subscribers', label: 'Subscribers', icon: '👥', items: [
    { href: '/admin/users', label: 'Users' },
    { href: '/admin/subscriptions', label: 'Subscriptions' },
    { href: '/admin/promo', label: 'Magic Link Invites' },
    { href: '/admin/referrals', label: 'Referrals' },
  ]},
  { id: 'marketing', label: 'Marketing', icon: '📱', items: [
    { href: '/admin/growth', label: 'Growth Command Center' },
    { href: '/admin/marketing', label: 'Campaigns' },
    { href: '/admin/waitlist', label: 'Waitlist' },
    { href: '/admin/social-posting', label: 'Social Posting' },
    { href: '/admin/social-analytics', label: 'Social Analytics' },
    { href: '/admin/marketing-assets', label: 'Marketing Assets' },
  ]},
  { id: 'analytics', label: 'Analytics', icon: '📈', items: [
    { href: '/admin/analytics', label: 'Overview' },
  ]},
  { id: 'finance', label: 'Finance', icon: '💰', items: [
    { href: '/admin/finance', label: 'Revenue & Costs' },
  ]},
]

function isActivePath(pathname: string, href: string) {
  if (pathname === href) return true
  if (href === '/admin') return false
  return pathname.startsWith(`${href}/`)
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const { user, loading } = useAuth()
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [sidebarLoaded, setSidebarLoaded] = useState(false)
  const [openGroups, setOpenGroups] = useState<Set<string>>(() => {
    const active = NAV_GROUPS.find(g => g.items.some(i => isActivePath(pathname, i.href)))
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
    const saved = localStorage.getItem(SIDEBAR_STORAGE_KEY)
    if (saved !== null) setSidebarOpen(saved === 'true')
    setSidebarLoaded(true)
  }, [])

  useEffect(() => {
    if (!sidebarLoaded) return
    localStorage.setItem(SIDEBAR_STORAGE_KEY, String(sidebarOpen))
  }, [sidebarLoaded, sidebarOpen])

  useEffect(() => {
    const active = NAV_GROUPS.find(g => g.items.some(i => isActivePath(pathname, i.href)))
    if (active) setOpenGroups(prev => new Set([...Array.from(prev), active.id]))
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
      {!sidebarOpen && (
        <button
          type="button"
          onClick={() => setSidebarOpen(true)}
          title="Show menu"
          aria-label="Show admin menu"
          style={{
            position: 'fixed',
            top: '14px',
            left: 0,
            zIndex: 50,
            width: '34px',
            height: '38px',
            border: '1px solid #334155',
            borderLeft: 'none',
            borderRadius: '0 8px 8px 0',
            backgroundColor: '#1e293b',
            color: '#f97316',
            cursor: 'pointer',
            fontWeight: 900,
            boxShadow: '0 8px 20px rgba(15,23,42,0.18)',
          }}
        >
          &#9654;
        </button>
      )}
      <aside style={{ width: sidebarOpen ? `${SIDEBAR_WIDTH}px` : 0, backgroundColor: '#1e293b', padding: sidebarOpen ? '1rem 0.75rem' : '1rem 0', position: 'fixed', top: 0, left: 0, height: '100vh', overflowY: sidebarOpen ? 'auto' : 'hidden', overflowX: 'hidden', boxSizing: 'border-box', transition: 'width 0.2s ease, padding 0.2s ease' }}>
        <div style={{ width: `${SIDEBAR_WIDTH - 24}px`, opacity: sidebarOpen ? 1 : 0, transition: 'opacity 0.15s ease' }}>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.35rem', marginBottom: '0.75rem', padding: '0 0.25rem' }}>
            <button
              type="button"
              onClick={() => router.refresh()}
              title="Refresh"
              aria-label="Refresh"
              style={{ width: '30px', height: '30px', border: '1px solid #334155', borderRadius: '6px', backgroundColor: '#273449', color: '#e2e8f0', cursor: 'pointer', fontSize: '14px', fontWeight: 800 }}
            >
              &#8635;
            </button>
            <button
              type="button"
              onClick={() => setSidebarOpen(false)}
              title="Hide menu"
              aria-label="Hide admin menu"
              style={{ height: '30px', border: '1px solid #334155', borderRadius: '6px', backgroundColor: '#273449', color: '#e2e8f0', cursor: 'pointer', fontSize: '12px', fontWeight: 700, padding: '0 0.55rem' }}
            >
              Hide menu
            </button>
          </div>
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
              const hasActivePage = group.items.some(i => isActivePath(pathname, i.href))
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
                        const isActive = isActivePath(pathname, item.href)
                        return (
                          <Link key={item.href} href={item.href} style={{ display: 'block', padding: '0.45rem 0.75rem', borderRadius: '5px', backgroundColor: isActive ? '#f97316' : 'transparent', color: isActive ? 'white' : '#e2e8f0', textDecoration: 'none', fontWeight: isActive ? 600 : 400, fontSize: '13px' }}>
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
            <div style={{ color: '#94a3b8', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.5rem', paddingLeft: '0.75rem' }}>External Tools</div>
            {[
              { href: 'https://dashboard.stripe.com', label: 'Stripe', icon: '💳' },
              { href: 'https://vercel.com/dashboard', label: 'Vercel', icon: '▲' },
              { href: 'https://supabase.com/dashboard', label: 'Supabase', icon: '🗄' },
              { href: 'https://elevenlabs.io', label: 'ElevenLabs', icon: '🎙' },
            ].map(tool => (
              <a key={tool.href} href={tool.href} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.4rem 0.75rem', color: '#cbd5e1', textDecoration: 'none', fontSize: '12px' }}>
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
        </div>
      </aside>
      <main style={{ flex: 1, marginLeft: sidebarOpen ? `${SIDEBAR_WIDTH}px` : 0, backgroundColor: '#FAF9F6', minHeight: '100vh', transition: 'margin-left 0.2s ease' }}>
        {children}
      </main>
    </div>
  )
}
