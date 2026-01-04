'use client'

import Link from 'next/link'
import { useState } from 'react'

interface HeaderProps {
  isLoggedIn?: boolean
  showBack?: boolean
  backHref?: string
  userName?: string
  userCredits?: number
  variant?: 'default' | 'minimal'
}

export function Header({ 
  isLoggedIn, 
  showBack, 
  backHref = '/library',
  userName, 
  userCredits,
  variant = 'default'
}: HeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false)

  const handleBack = () => {
    if (typeof window !== 'undefined') {
      window.history.back()
    }
  }

  const userInitial = userName?.charAt(0).toUpperCase() || 'U'
  const displayCredits = userCredits === -1 ? '∞' : userCredits

  return (
    <>
      <header className="flex items-center justify-between px-4 py-3 border-b border-slate-800 bg-slate-950">
        {/* Left - Back button or empty space */}
        {showBack ? (
          <button 
            onClick={handleBack}
            className="text-slate-400 hover:text-white flex items-center gap-2 transition"
          >
            <span>←</span>
            <span className="text-sm">Back</span>
          </button>
        ) : (
          <div className="w-16" /> 
        )}

        {/* Center - Logo */}
        <Link href="/home" className="flex items-center gap-1">
          <span className="text-lg">🚛🚗</span>
          <span className="font-bold text-white">
            Drive Time<span className="text-orange-400">Tales</span>
          </span>
        </Link>

        {/* Right - User avatar or hamburger */}
        {isLoggedIn ? (
          <button 
            onClick={() => setMenuOpen(true)}
            className="w-8 h-8 rounded-full bg-orange-500 flex items-center justify-center text-black font-bold text-sm hover:bg-orange-400 transition"
          >
            {userInitial}
          </button>
        ) : (
          <Link 
            href="/auth/login"
            className="text-orange-400 hover:text-orange-300 text-sm font-medium transition"
          >
            Sign In
          </Link>
        )}
      </header>

      {/* Mobile Menu Overlay */}
      {menuOpen && (
        <div 
          className="fixed inset-0 bg-black/80 z-50"
          onClick={() => setMenuOpen(false)}
        >
          <div 
            className="absolute right-0 top-0 h-full w-72 bg-slate-900 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Menu Header */}
            <div className="p-4 border-b border-slate-800">
              <div className="flex items-center justify-between mb-4">
                <button 
                  onClick={() => setMenuOpen(false)}
                  className="text-slate-400 hover:text-white"
                >
                  ✕
                </button>
              </div>
              
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-orange-500 flex items-center justify-center text-black font-bold text-xl">
                  {userInitial}
                </div>
                <div>
                  <p className="text-white font-medium">{userName || 'User'}</p>
                  <p className="text-orange-400 text-sm">{displayCredits} credits</p>
                </div>
              </div>
            </div>

            {/* Menu Items */}
            <nav className="p-4 space-y-1">
              <Link 
                href="/home" 
                className="flex items-center gap-3 px-3 py-3 text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition"
                onClick={() => setMenuOpen(false)}
              >
                <span>🏠</span>
                <span>Home</span>
              </Link>
              
              <Link 
                href="/library" 
                className="flex items-center gap-3 px-3 py-3 text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition"
                onClick={() => setMenuOpen(false)}
              >
                <span>📚</span>
                <span>Browse Library</span>
              </Link>
              
              <Link 
                href="/collection" 
                className="flex items-center gap-3 px-3 py-3 text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition"
                onClick={() => setMenuOpen(false)}
              >
                <span>📖</span>
                <span>My Collection</span>
              </Link>
              
              <Link 
                href="/wishlist" 
                className="flex items-center gap-3 px-3 py-3 text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition"
                onClick={() => setMenuOpen(false)}
              >
                <span>❤️</span>
                <span>Wishlist</span>
              </Link>

              <div className="border-t border-slate-800 my-3" />

              <Link 
                href="/account" 
                className="flex items-center gap-3 px-3 py-3 text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition"
                onClick={() => setMenuOpen(false)}
              >
                <span>👤</span>
                <span>My Account</span>
              </Link>
              
              <Link 
                href="/account/billing" 
                className="flex items-center gap-3 px-3 py-3 text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition"
                onClick={() => setMenuOpen(false)}
              >
                <span>💳</span>
                <span>Billing & Credits</span>
              </Link>
              
              <Link 
                href="/account/settings" 
                className="flex items-center gap-3 px-3 py-3 text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition"
                onClick={() => setMenuOpen(false)}
              >
                <span>⚙️</span>
                <span>Settings</span>
              </Link>
            </nav>

            {/* Sign Out */}
            <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-slate-800">
              <Link 
                href="/auth/login"
                className="flex items-center gap-3 px-3 py-3 text-red-400 hover:text-red-300 hover:bg-slate-800 rounded-lg transition"
                onClick={() => setMenuOpen(false)}
              >
                <span>🚪</span>
                <span>Sign Out</span>
              </Link>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

// Export Logo component separately for use in custom headers
export function Logo({ size = 'default' }: { size?: 'small' | 'default' | 'large' }) {
  const textSize = {
    small: 'text-sm',
    default: 'text-base',
    large: 'text-xl'
  }[size]

  const iconSize = {
    small: 'text-base',
    default: 'text-lg',
    large: 'text-2xl'
  }[size]

  return (
    <Link href="/home" className="flex items-center gap-1">
      <span className={iconSize}>🚛🚗</span>
      <span className={`font-bold text-white ${textSize}`}>
        Drive Time<span className="text-orange-400">Tales</span>
      </span>
    </Link>
  )
}

export default Header
