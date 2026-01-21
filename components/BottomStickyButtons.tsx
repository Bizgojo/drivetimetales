'use client'

import Link from 'next/link'

export default function BottomStickyButtons() {
  return (
    <div style={{ 
      position: 'fixed', 
      bottom: 0, 
      left: 0, 
      right: 0, 
      backgroundColor: '#0f172a',
      padding: '0.5rem 1rem 0.75rem',
      borderTop: '1px solid #334155',
      zIndex: 40
    }}>
      <div style={{ display: 'flex', gap: '0.75rem' }}>
        
        {/* Left Button: Go to Library */}
        <Link 
          href="/library" 
          style={{ 
            flex: 1, 
            padding: '0.6rem 0.5rem',
            textAlign: 'center', 
            backgroundColor: '#f97316', 
            color: 'white', 
            fontSize: '14px',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.4rem',
            borderRadius: '10px',
            textDecoration: 'none'
          }}
        >
          <span style={{ fontSize: '18px' }}>📚</span>
          <span>Go to Library</span>
        </Link>
        
        {/* Right Button: Help a Friend */}
        <Link 
          href="/refer" 
          style={{ 
            flex: 1, 
            padding: '0.4rem 0.5rem',
            textAlign: 'center', 
            backgroundColor: '#14b8a6', 
            color: 'black', 
            fontSize: '14px',
            fontWeight: 600,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: '10px',
            textDecoration: 'none'
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <span style={{ fontSize: '16px' }}>❤️</span>
            <span>Help a Friend</span>
          </span>
          <span style={{ fontSize: '11px', fontWeight: 500 }}>It's a Win Win</span>
        </Link>
        
      </div>
    </div>
  )
}
