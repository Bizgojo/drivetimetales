'use client';
import StickyHeaderFull from '@/components/StickyHeaderFull';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';

export default function AccountPage() {
  const { user, signOut, loading } = useAuth();
  const isAdmin = user?.email === 'm.postlewaite@gmail.com';
  const router = useRouter();
  const [mounted, setMounted] = useState(false);

  // Wait for client-side mount
  useEffect(() => {
    setMounted(true);
  }, []);

  // Handle sign out
  const handleSignOut = async () => {
    await signOut();
    router.push('/');
  };

  // Show loading state while auth is initializing or not yet mounted
  if (!mounted || loading) {
    return (
      <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mb-4" />
          <p>Loading...</p>
        </div>
      </div>
    );
  }

  // Only redirect if definitely not logged in (after loading completes and mounted)
  if (!user) {
    router.push('/signin');
    return (
      <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center">
        <div className="text-center">
          <p>Redirecting to login...</p>
        </div>
      </div>
    );
  }

  // Get display name - prefer first_name + last_name, then display_name, then email prefix
  let displayName = '';
  const userAny = user as any;
  
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
    { href: '/account/billing', icon: '💎', label: 'Billing & Subscription', desc: 'Manage your plan' },
    { href: '/account/help', icon: '💬', label: 'Help & Support', desc: 'Contact us' },
    { href: '/account/faqs', icon: '❓', label: 'FAQs', desc: 'Common questions' },
  ];

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <StickyHeaderFull />
      
      <div className="px-4 py-5">
        {/* Profile Header - No large avatar circle */}
        <div className="mb-6 text-center">
          <h1 className="text-xl font-bold text-white">{displayName}</h1>
          <p className="text-gray-400 text-sm">{user.email}</p>
          <p className="text-orange-400 text-sm mt-1">Member since {memberSince}</p>
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
