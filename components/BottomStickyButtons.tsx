/*
================================================================================
🔒 PROTECTED MODULE 09 - PRODUCTION SAFE VERSION
================================================================================
*/

'use client'

import Link from 'next/link'

export default function BottomStickyButtons() {
  return (
    <div 
      className="bg-slate-950 border-t border-slate-800"
      style={{ 
        position: 'fixed', 
        bottom: 0, 
        left: 0, 
        right: 0, 
        paddingLeft: '1rem', 
        paddingRight: '1rem', 
        paddingTop: '0.75rem', 
        paddingBottom: '0.75rem', 
        zIndex: 50 
      }}
    >
      <div style={{ display: 'flex', gap: '0.75rem', maxWidth: '48rem', marginLeft: 'auto', marginRight: 'auto' }}>
        
        {/* Left Button: Go to Library (Orange, white text) */}
        <Link 
          href="/library" 
          className="hover:bg-orange-400 font-semibold rounded-xl transition"
          style={{ 
            flex: 1, 
            paddingTop: '1.25rem', 
            paddingBottom: '1.25rem', 
            textAlign: 'center', 
            backgroundColor: '#f97316', 
            color: 'white', 
            fontSize: '1.125rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.5rem'
          }}
        >
          <span style={{ fontSize: '1.75rem', lineHeight: 1 }}>📚</span>
          <span>Go to Library</span>
        </Link>
        
        {/* Right Button: Recommend a Friend (Teal, black text) */}
        <Link 
          href="/refer" 
          className="hover:bg-teal-400 font-semibold rounded-xl transition"
          style={{ 
            flex: 1, 
            paddingTop: '1rem', 
            paddingBottom: '1rem', 
            textAlign: 'center', 
            backgroundColor: '#14b8a6', 
            color: 'black', 
            fontSize: '1rem',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontSize: '1.75rem', lineHeight: 1 }}>💌</span>
            <span>Recommend a Friend</span>
          </span>
          <span style={{ fontSize: '0.75rem', fontWeight: 'normal' }}>It's a Win Win</span>
        </Link>
        
      </div>
    </div>
  )
}
