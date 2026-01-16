/**
 * ============================================================================
 * DTT PROTECTED MODULE - DO NOT MODIFY WITHOUT MARC'S PERMISSION
 * ============================================================================
 * 
 * FILE: 02_HomePage/b_WelcomeCredits.tsx
 * VERSION: 2026-01-16 3:15pm
 * STATUS: APPROVED BY MARC
 * PROTECTED: YES
 * 
 * DESCRIPTION:
 * Welcome message and credits display for Home Page
 * - "Welcome back, {first_name}!"
 * - "You have {credits} credits in your account."
 * - If credits = 0, shows orange [Get More Credits] button
 * 
 * LAYOUT:
 * - Flush left (text-left)
 * - Button appears inline to right of credits text when credits = 0
 * 
 * SPECIFICATIONS:
 * - Welcome: text-2xl, font-bold, text-white, text-left
 * - Credits text: text-white, credits number in text-orange-400 font-bold
 * - Button: bg-orange-500, text-black, font-bold, rounded-lg, links to /pricing
 * - Padding: px-4 py-6
 * 
 * DATABASE:
 * - Table: users
 * - Columns used: first_name, credits
 * - Query: .from('users').select('first_name, credits').eq('id', session.user.id).single()
 * 
 * PROPS:
 * - displayName: string - User's first name (from users.first_name)
 * - userCredits: number - Credit balance (from users.credits)
 * 
 * BUTTON LINK:
 * - Links to: /pricing (page for purchasing more credits)
 * 
 * ============================================================================
 */

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

/**
 * ============================================================================
 * HOW TO FETCH DATA FOR THIS MODULE
 * ============================================================================
 * 
 * In the parent page (e.g., app/home/page.tsx), fetch user data like this:
 * 
 * ```typescript
 * const { data: { session } } = await supabase.auth.getSession()
 * 
 * const { data: profile, error } = await supabase
 *   .from('users')
 *   .select('first_name, credits')
 *   .eq('id', session.user.id)
 *   .single()
 * 
 * const displayName = profile?.first_name || session.user.email?.split('@')[0] || 'friend'
 * const userCredits = profile?.credits || 0
 * ```
 * 
 * Then pass to component:
 * <WelcomeCredits displayName={displayName} userCredits={userCredits} />
 * 
 * ============================================================================
 */
