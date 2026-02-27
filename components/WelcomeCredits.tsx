'use client'

import InstallAppButton from '@/components/InstallAppButton'

interface WelcomeCreditsProps {
  displayName: string
  userCredits?: number
}

export default function WelcomeCredits({ displayName }: WelcomeCreditsProps) {
  return (
    <section style={{ padding: '1.5rem 1rem 1rem' }}>
      <h1 style={{ color: 'white', fontSize: '24px', fontWeight: 'bold', marginBottom: '1rem' }}>
        Welcome back, {displayName}!
      </h1>
      <InstallAppButton />
    </section>
  )
}
