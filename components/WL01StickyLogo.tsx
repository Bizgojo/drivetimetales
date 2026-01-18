'use client'

import Link from 'next/link'

interface WL01StickyLogoProps {
  credits: number
}

export default function WL01StickyLogo({ credits }: WL01StickyLogoProps) {
  return (
    <header 
      className="bg-slate-950 border-b border-slate-800"
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 50,
        padding: '0.75rem 1rem'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', maxWidth: '56rem', marginLeft: 'auto', marginRight: 'auto' }}>
        <Link 
          href="/welcome"
          className="hover:bg-slate-600 transition rounded-lg"
          style={{ 
            backgroundColor: '#475569',
            color: 'white',
            padding: '0.5rem 1rem',
            fontSize: '0.875rem',
            fontWeight: '600'
          }}
        >
          ← Back
        </Link>
        
        <h1 
          style={{ 
            fontSize: '1.25rem',
            fontWeight: 'bold',
            fontStyle: 'italic',
            color: '#f97316'
          }}
        >
          Drive Time Tales
        </h1>
        
        <div className="text-white" style={{ fontSize: '0.875rem' }}>
          {credits} credits
        </div>
      </div>
    </header>
  )
}
