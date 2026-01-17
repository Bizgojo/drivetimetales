'use client'

import Link from 'next/link'

interface WelcomeCreditsProps {
  displayName: string
  userCredits: number
}

export function WelcomeCredits({ displayName, userCredits }: WelcomeCreditsProps) {
  return (
    <section className="px-4 py-6">
      <h1 className="text-2xl font-bold text-white text-left">Welcome back, {displayName}!</h1>
      <div className="flex items-center gap-3 mt-2">
        <p className="text-white text-left">
          You have <span className="text-orange-400 font-bold">{userCredits}</span> credits in your account.
        </p>
        {userCredits === 0 && (
          <Link 
            href="/pricing"
            className="bg-orange-500 hover:bg-orange-400 text-black font-bold px-4 py-2 rounded-lg transition whitespace-nowrap"
          >
            Get More Credits
          </Link>
        )}
      </div>
    </section>
  )
}
