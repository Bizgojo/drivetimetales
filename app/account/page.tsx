'use client';

import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';

export default function AccountPage() {
  const { user, signOut, loading } = useAuth();
  const router = useRouter();

  // Handle sign out
  const handleSignOut = async () => {
    await signOut();
    router.push('/');
  };

  // Show loading state while auth is initializing
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mb-4" />
          <p>Loading...</p>
        </div>
      </div>
    );
  }

  // Only redirect if definitely not logged in (after loading completes)
  if (!loading && !user) {
    // Use useEffect for redirect to avoid hydration issues
    if (typeof window !== 'undefined') {
      router.push('/auth/login');
    }
    return (
      <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center">
        <div className="text-center">
          <p>Redirecting to login...</p>
        </div>
      </div>
    );
  }

  // If still no user after all checks, show nothing
  if (!user) {
    return null;
  }

  // Get display name - prefer first_name + last_name (from Stripe), then display_name, then email prefix
  let displayName = '';
  const userAny = user as any; // Type assertion to access potential last_name field
  
  // Debug logging
  console.log('User object:', { 
    first_name: user.first_name, 
    last_name: userAny.last_name, 
    display_name: user.display_name,
    email: user.email 
  });
  
  if (user.first_name) {
    displayName = user.first_name;
    if (userAny.last_name) {
      displayName += ' ' + userAny.last_name;
    }
  } else if (user.display_name) {
    displayName = user.display_name;
  } else {
    displayName = user.email.split('@')[0];
  }
  
  const initials = displayName.substring(0, 1).toUpperCase();

  // Format member since date
  const memberSince = new Date(user.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  const menuItems = [
    { href: '/account/billing', icon: '💎', label: 'Billing & Credits', desc: `${user.credits} credits available` },
    { href: '/account/help', icon: '💬', label: 'Help & Support', desc: 'Contact us' },
    { href: '/account/faqs', icon: '❓', label: 'FAQs', desc: 'Common questions' },
  ];

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Custom Header for Account Page - No clickable avatar */}
      <header style={{
        position: 'sticky',
        top: 0,
        zIndex: 50,
        backgroundColor: '#030712',
        borderBottom: '1px solid #1f2937',
        padding: '12px 16px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          {/* Back button */}
          <button 
            onClick={() => router.back()}
            style={{
              width: '44px',
              height: '44px',
              borderRadius: '50%',
              backgroundColor: '#1f2937',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0
            }}
          >
            <span style={{ color: 'white', fontSize: '20px' }}>‹</span>
          </button>
          
          {/* Logo */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '20px' }}>🚛</span>
            <span style={{ fontSize: '20px' }}>🚗</span>
            <span style={{ color: 'white', fontWeight: 'bold', marginLeft: '4px' }}>Drive Time </span>
            <span style={{ color: '#fb923c', fontWeight: 'bold' }}>Tales</span>
          </div>
          
          {/* Avatar - NOT clickable on account page */}
          <div
            style={{
              width: '44px',
              height: '44px',
              borderRadius: '50%',
              backgroundColor: '#f97316',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0
            }}
          >
            <span style={{ color: 'black', fontWeight: 'bold', fontSize: '18px' }}>{initials}</span>
          </div>
        </div>
      </header>
      
      <div className="px-4 py-5">
        {/* Profile Header - No large avatar circle */}
        <div className="mb-6 text-center">
          <h1 className="text-xl font-bold text-white">{displayName}</h1>
          <p className="text-gray-400 text-sm">{user.email}</p>
          <p className="text-orange-400 text-sm mt-1">Member since {memberSince}</p>
        </div>

        {/* Quick Actions - Orange and Blue buttons */}
        <div className="flex gap-3 mb-6">
          <Link 
            href="/collection" 
            style={{
              flex: 1,
              padding: '14px',
              backgroundColor: '#f97316',
              borderRadius: '12px',
              textAlign: 'center',
              color: 'white',
              fontWeight: '600',
              fontSize: '14px',
              textDecoration: 'none'
            }}
          >
            📚 My Collection
          </Link>
          <Link 
            href="/wishlist" 
            style={{
              flex: 1,
              padding: '14px',
              backgroundColor: '#3b82f6',
              borderRadius: '12px',
              textAlign: 'center',
              color: 'white',
              fontWeight: '600',
              fontSize: '14px',
              textDecoration: 'none'
            }}
          >
            ♡ Reserved Stories
          </Link>
        </div>

        {/* Menu Items */}
        <div className="space-y-2 mb-6">
          {menuItems.map(item => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-4 p-4 bg-gray-900 border border-gray-800 rounded-xl"
            >
              <span className="text-2xl">{item.icon}</span>
              <div className="flex-1">
                <p className="text-white font-medium">{item.label}</p>
                <p className="text-gray-400 text-sm">{item.desc}</p>
              </div>
              <span className="text-gray-500">›</span>
            </Link>
          ))}
        </div>

        {/* Sign Out */}
        <div className="border-t border-gray-800 pt-6">
          <button 
            onClick={handleSignOut}
            className="w-full py-3 text-red-400 text-sm"
          >
            Sign Out
          </button>
        </div>
      </div>
    </div>
  );
}
