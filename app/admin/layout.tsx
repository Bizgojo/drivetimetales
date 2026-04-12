'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'

const ADMIN_EMAILS = new Set([
  'marc@endless-tales.com',
  'hello.endlesstales@gmail.com',
  'williampostlewaite@icloud.com',
  'm.postlewaite@gmail.com',
])

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const router = useRouter()
  const { user, loading } = useAuth()

  useEffect(() => {
    if (loading) return
    const email = (user?.email || '').toLowerCase()
    if (!user || !ADMIN_EMAILS.has(email)) {
      router.replace('/home')
    }
  }, [user, loading, router])

  useEffect(() => {
    document.body.classList.add('admin-page')
    return () => document.body.classList.remove('admin-page')
  }, [])

  // Don't render while auth resolves or if not admin
  if (loading) return <div style={{ minHeight: '100vh', background: '#f5f5f5' }} />
  const email = (user?.email || '').toLowerCase()
  if (!user || !ADMIN_EMAILS.has(email)) {
    return <div style={{ minHeight: '100vh', background: '#f5f5f5' }} />
  }

  const menuItems = [
    { href: '/admin', label: 'Dashboard', icon: '📊' },
    { href: '/admin/checklist', label: 'Launch Checklist', icon: '🚀' },
    { href: '/admin/finance', label: 'Finance', icon: '💰' },
    { href: '/admin/el-usage', label: 'ElevenLabs Usage', icon: '🎙️' },
    { href: '/admin/story-production', label: 'Story Production', icon: '🎬' },
    { href: '/admin/stories', label: 'Stories', icon: '📚' },
    { href: '/admin/guest-stories', label: 'Guest Stories', icon: '👤' },
    { href: '/admin/story-ideas', label: 'Story Ideas', icon: '💡' },
    { href: '/admin/genres', label: 'Genres', icon: '🎭' },
    { href: '/admin/users', label: 'Users', icon: '👥' },
    { href: '/admin/analytics', label: 'Analytics', icon: '📈' },
    { href: '/admin/subscriptions', label: 'Subscriptions', icon: '💳' },
    { href: '/admin/referrals', label: 'Referrals', icon: '🎁' },
    { href: '/admin/marketing', label: 'Marketing', icon: '📱' },
    { href: '/admin/waitlist', label: 'Waitlist', icon: '📋' },
    { href: '/admin/promo', label: 'Promo Codes', icon: '🎟️' },
    { href: '/admin/landing-stories', label: 'Landing Stories', icon: '🎧' },
    { href: '/admin/social-analytics', label: 'Social Analytics', icon: '📊' },
    { href: '/admin/social-posting', label: 'Social Posting', icon: '🌐' },
  ]

  // Theme colors (light theme for admin)
  const sidebarBg = '#1e293b'
  const sidebarText = '#e2e8f0'
  const sidebarActive = '#f97316'
  const mainBg = '#FAF9F6'

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#FAF9F6', color: '#111' }}>
      {/* Sidebar */}
      <aside style={{ 
        width: '220px', 
        backgroundColor: sidebarBg, 
        padding: '1rem',
        position: 'fixed',
        top: 0,
        left: 0,
        height: '100vh',
        overflowY: 'scroll',
        boxSizing: 'border-box'
      }}>
        {/* Logo */}
        <div style={{ padding: '0.5rem', marginBottom: '1.5rem' }}>
          <Link href="/admin" style={{ textDecoration: 'none' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontSize: '24px' }}>🚗</span>
              <div>
                <div style={{ color: 'white', fontWeight: 'bold', fontSize: '14px' }}>Endless Tales</div>
                <div style={{ color: '#f97316', fontSize: '11px', fontWeight: 500 }}>Admin Panel</div>
              </div>
            </div>
          </Link>
        </div>

        {/* Navigation */}
        <nav style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          {menuItems.map((item) => {
            const isActive = pathname === item.href || 
              (item.href !== '/admin' && pathname.startsWith(item.href))
            
            return (
              <Link
                key={item.href}
                href={item.href}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem',
                  padding: '0.75rem 1rem',
                  borderRadius: '8px',
                  backgroundColor: isActive ? sidebarActive : 'transparent',
                  color: isActive ? 'black' : sidebarText,
                  textDecoration: 'none',
                  fontWeight: isActive ? 600 : 400,
                  fontSize: '14px',
                  transition: 'all 0.15s ease'
                }}
              >
                <span style={{ fontSize: '18px' }}>{item.icon}</span>
                {item.label}
              </Link>
            )
          })}
        </nav>

        {/* Quick Links */}
        <div style={{ marginTop: '2rem', borderTop: '1px solid #334155', paddingTop: '1rem' }}>
          <div style={{ color: '#64748b', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', marginBottom: '0.75rem', paddingLeft: '1rem' }}>
            External Tools
          </div>
          <a 
            href="https://dashboard.stripe.com" 
            target="_blank" 
            rel="noopener noreferrer"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem',
              padding: '0.5rem 1rem',
              color: sidebarText,
              textDecoration: 'none',
              fontSize: '13px',
              opacity: 0.8
            }}
          >
            <span>💳</span> Stripe Dashboard
          </a>
          <a 
            href="https://vercel.com/dashboard" 
            target="_blank" 
            rel="noopener noreferrer"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem',
              padding: '0.5rem 1rem',
              color: sidebarText,
              textDecoration: 'none',
              fontSize: '13px',
              opacity: 0.8
            }}
          >
            <span>▲</span> Vercel
          </a>
          <a 
            href="https://buffer.com/publish" 
            target="_blank" 
            rel="noopener noreferrer"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem',
              padding: '0.5rem 1rem',
              color: sidebarText,
              textDecoration: 'none',
              fontSize: '13px',
              opacity: 0.8
            }}
          >
            <span>📱</span> Buffer
          </a>
          <a 
            href="https://supabase.com/dashboard" 
            target="_blank" 
            rel="noopener noreferrer"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem',
              padding: '0.5rem 1rem',
              color: sidebarText,
              textDecoration: 'none',
              fontSize: '13px',
              opacity: 0.8
            }}
          >
            <span>🗄️</span> Supabase
          </a>
        </div>

        {/* Back to Site */}
        <div style={{ marginTop: '1.5rem', paddingBottom: '0.5rem' }}>
          <Link 
            href="/home" 
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.5rem',
              padding: '0.75rem',
              backgroundColor: '#334155',
              color: 'white',
              textDecoration: 'none',
              borderRadius: '8px',
              fontSize: '13px',
              fontWeight: 500
            }}
          >
            ← Back to Site
          </Link>
        </div>
      </aside>

      {/* Main Content */}
      <main style={{ 
        flex: 1, 
        marginLeft: '220px',
        backgroundColor: mainBg,
        minHeight: '100vh'
      }}>
        {children}
      </main>
    </div>
  )
}
