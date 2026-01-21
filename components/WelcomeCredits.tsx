'use client'

import Link from 'next/link'

interface WelcomeCreditsProps {
  displayName: string
  userCredits: number
}

export function WelcomeCredits({ displayName, userCredits }: WelcomeCreditsProps) {
  return (
    <section style={{ padding: '1.5rem 1rem 1rem' }}>
      <h1 style={{ color: 'white', fontSize: '24px', fontWeight: 'bold', marginBottom: '0.5rem' }}>
        Welcome back, {displayName}!
      </h1>
      <p style={{ color: 'white', fontSize: '16px', marginBottom: '0.75rem' }}>
        You have <span style={{ color: '#fb923c', fontWeight: 'bold' }}>{userCredits}</span> credits in your account.
      </p>
      {userCredits === 0 && (
        <Link 
          href="/pricing"
          style={{
            display: 'inline-block',
            backgroundColor: '#f97316',
            color: 'black',
            fontWeight: 'bold',
            padding: '0.625rem 1.25rem',
            borderRadius: '10px',
            textDecoration: 'none',
            fontSize: '15px'
          }}
        >
          Get More Credits
        </Link>
      )}
    </section>
  )
}
