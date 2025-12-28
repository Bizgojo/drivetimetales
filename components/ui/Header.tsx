'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Logo } from './Logo';

interface HeaderProps {
  isLoggedIn?: boolean;
  userName?: string;
  userCredits?: number;
  showBack?: boolean;
  onMenuClick?: () => void;
}

export const Header = ({ 
  isLoggedIn = false, 
  userName,
  userCredits = 0,
  showBack = false,
  onMenuClick 
}: HeaderProps) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const pathname = usePathname();

  const handleMenuToggle = () => {
    setMenuOpen(!menuOpen);
    onMenuClick?.();
  };

  return (
    <>
      <header className="sticky top-0 bg-gray-950 border-b border-gray-800 px-4 pt-2 pb-3 z-40">
        <div className="flex items-center justify-between">
          <Link href={isLoggedIn ? '/home' : '/'}>
            <Logo size="md" />
          </Link>
          
          <div className="flex items-center gap-3">
            {showBack && (
              <button 
                onClick={() => window.history.back()}
                className="px-3 py-1.5 bg-gray-800 border border-gray-700 text-white text-xs font-medium rounded-lg"
              >
                ← Back
              </button>
            )}
            
            <Link href="/search" className="text-white text-xl">
              🔍
            </Link>
            
            <button 
              onClick={handleMenuToggle}
              className="text-white text-xl"
            >
              ☰
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Menu Dropdown */}
      {menuOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40"
          onClick={() => setMenuOpen(false)}
        >
          <div 
            className="absolute right-0 top-0 w-72 bg-gray-900 h-full shadow-xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="p-4 border-b border-gray-800">
              <div className="flex items-center justify-between mb-4">
                <span className="text-white font-bold">Menu</span>
                <button 
                  onClick={() => setMenuOpen(false)}
                  className="text-gray-400 text-xl"
                >
                  ✕
                </button>
              </div>
              
              {isLoggedIn ? (
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-orange-500 rounded-full flex items-center justify-center text-white font-bold">
                    {userName?.charAt(0) || 'U'}
                  </div>
                  <div>
                    <p className="text-white font-medium">{userName || 'User'}</p>
                    <p className="text-orange-400 text-sm">💎 {userCredits} credits</p>
                  </div>
                </div>
              ) : (
                <div className="flex gap-2">
                  <Link 
                    href="/auth/login"
                    className="flex-1 py-2 bg-gray-800 text-white text-center rounded-lg text-sm"
                  >
                    Sign In
                  </Link>
                  <Link 
                    href="/auth/signup"
                    className="flex-1 py-2 bg-orange-500 text-white text-center rounded-lg text-sm"
                  >
                    Sign Up
                  </Link>
                </div>
              )}
            </div>

            <nav className="p-4">
              <ul className="space-y-1">
                <MenuItem href="/" label="Home" icon="🏠" active={pathname === '/'} />
                <MenuItem href="/library" label="Library" icon="📖" active={pathname === '/library'} />
                <MenuItem href="/browse" label="Browse" icon="📂" active={pathname === '/browse'} />
                <MenuItem href="/search" label="Search" icon="🔍" active={pathname === '/search'} />
                
                {isLoggedIn && (
                  <>
                    <div className="border-t border-gray-800 my-3" />
                    <MenuItem href="/collection" label="My Collection" icon="📚" active={pathname === '/collection'} />
                    <MenuItem href="/wishlist" label="Wishlist" icon="♡" active={pathname === '/wishlist'} />
                    <MenuItem href="/account/downloads" label="Downloads" icon="📥" active={pathname === '/account/downloads'} />
                  </>
                )}
                
                <div className="border-t border-gray-800 my-3" />
                <MenuItem href="/pricing" label="Pricing" icon="💳" active={pathname === '/pricing'} />
                <MenuItem href="/about" label="About" icon="ℹ️" active={pathname === '/about'} />
                
                {isLoggedIn && (
                  <>
                    <div className="border-t border-gray-800 my-3" />
                    <MenuItem href="/account" label="My Account" icon="👤" active={pathname === '/account'} />
                    <MenuItem href="/account/billing" label="Billing & Credits" icon="💎" active={pathname === '/account/billing'} />
                    <MenuItem href="/account/settings" label="Settings" icon="⚙️" active={pathname === '/account/settings'} />
                    <MenuItem href="/account/help" label="Help & Support" icon="❓" active={pathname === '/account/help'} />
                  </>
                )}
              </ul>
            </nav>
          </div>
        </div>
      )}
    </>
  );
};

const MenuItem = ({ 
  href, 
  label, 
  icon, 
  active 
}: { 
  href: string; 
  label: string; 
  icon: string; 
  active: boolean;
}) => (
  <li>
    <Link 
      href={href}
      className={`flex items-center gap-3 px-3 py-2 rounded-lg ${
        active ? 'bg-orange-500/20 text-orange-400' : 'text-white hover:bg-gray-800'
      }`}
    >
      <span>{icon}</span>
      <span>{label}</span>
    </Link>
  </li>
);

export default Header;
