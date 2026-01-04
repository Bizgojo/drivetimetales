'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Header } from '@/components/ui/Header';
import { useAuth } from '@/contexts/AuthContext';

export default function AccountPage() {
  const { user, signOut, loading } = useAuth();
  const router = useRouter();
  const [showSignOutModal, setShowSignOutModal] = useState(false);

  // Handle sign out with confirmation
  const handleSignOut = async () => {
    // Save the user's name for "Welcome Back" message before signing out
    if (user?.display_name) {
      localStorage.setItem('dtt_remembered_name', user.display_name.split(' ')[0]);
      localStorage.setItem('dtt_remembered_email', user.email);
    }
    
    await signOut();
    router.push('/signed-out');
  };

  // Show loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mb-4" />
          <p>Loading...</p>
        </div>
      </div>
    );
  }

  // Redirect if not logged in
  if (!user) {
    router.push('/auth/login');
    return null;
  }

  // Get display name or fallback
  const displayName = user.display_name || user.email.split('@')[0];
  const initials = displayName.substring(0, 2).toUpperCase();

  // Format subscription type for display
  const planDisplay = user.subscription_type === 'free' ? 'Free' 
    : user.subscription_type === 'test_driver' ? 'Test Driver'
    : user.subscription_type === 'commuter' ? 'Commuter'
    : user.subscription_type === 'road_warrior' ? 'Road Warrior'
    : 'Free';

  // Format member since date
  const memberSince = user.created_at 
    ? new Date(user.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    : 'Recently';

  const menuItems = [
    { href: '/account/billing', icon: '💎', label: 'Billing & Credits', desc: `${user.credits} credits available` },
    { href: '/account/settings', icon: '⚙️', label: 'Settings', desc: 'Preferences & notifications' },
    { href: '/account/downloads', icon: '📥', label: 'Downloads', desc: 'Offline stories' },
    { href: '/account/help', icon: '❓', label: 'Help & Support', desc: 'FAQs & contact' },
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <Header showBack isLoggedIn userName={displayName} userCredits={user.credits} />
      
      <div className="px-4 py-5">
        {/* Profile Header */}
        <div className="flex items-center gap-4 mb-6">
          <div className="w-20 h-20 bg-orange-500 rounded-full flex items-center justify-center text-3xl font-bold text-black">
            {initials}
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">{displayName}</h1>
            <p className="text-slate-300 text-sm">{user.email}</p>
            <p className="text-orange-400 text-sm">{planDisplay} • Member since {memberSince}</p>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          <div className="bg-slate-700 rounded-xl p-3 text-center">
            <p className="text-2xl font-bold text-orange-400">{user.credits}</p>
            <p className="text-white text-xs">Credits</p>
          </div>
          <div className="bg-slate-700 rounded-xl p-3 text-center">
            <p className="text-2xl font-bold text-green-400">-</p>
            <p className="text-white text-xs">Completed</p>
          </div>
          <div className="bg-slate-700 rounded-xl p-3 text-center">
            <p className="text-2xl font-bold text-blue-400">-</p>
            <p className="text-white text-xs">In Progress</p>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="flex gap-3 mb-6">
          <Link href="/collection" className="flex-1 py-3 bg-slate-700 rounded-xl text-center text-white text-sm hover:bg-slate-600 transition">
            📚 My Collection
          </Link>
          <Link href="/wishlist" className="flex-1 py-3 bg-slate-700 rounded-xl text-center text-white text-sm hover:bg-slate-600 transition">
            ♡ Wishlist
          </Link>
        </div>

        {/* Menu Items */}
        <div className="space-y-2 mb-6">
          {menuItems.map(item => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-4 p-4 bg-slate-700 rounded-xl hover:bg-slate-600 transition"
            >
              <span className="text-2xl">{item.icon}</span>
              <div className="flex-1">
                <p className="text-white font-medium">{item.label}</p>
                <p className="text-slate-300 text-sm">{item.desc}</p>
              </div>
              <span className="text-slate-500">›</span>
            </Link>
          ))}
        </div>

        {/* Danger Zone */}
        <div className="border-t border-slate-800 pt-6">
          {user.subscription_type !== 'free' && (
            <Link 
              href="/account/cancel"
              className="block w-full py-3 bg-slate-700 border border-red-500/30 rounded-xl text-center text-red-400 text-sm mb-3 hover:bg-slate-600 transition"
            >
              Cancel Subscription
            </Link>
          )}
          <button 
            onClick={() => setShowSignOutModal(true)}
            className="w-full py-3 text-red-400 text-sm"
          >
            Sign Out
          </button>
        </div>
      </div>

      {/* Sign Out Confirmation Modal */}
      {showSignOutModal && (
        <div 
          className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 px-4"
          onClick={() => setShowSignOutModal(false)}
        >
          <div 
            className="bg-slate-800 rounded-2xl p-6 max-w-sm w-full border border-slate-700"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-center mb-4">
              <span className="text-5xl block mb-3">👋</span>
              <h3 className="text-xl font-bold text-white mb-2">Sign Out?</h3>
              <p className="text-slate-400 text-sm">
                Are you sure you want to sign out of Drive Time Tales?
              </p>
            </div>
            
            <div className="flex gap-3">
              <button
                onClick={() => setShowSignOutModal(false)}
                className="flex-1 py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSignOut}
                className="flex-1 py-3 bg-red-600 hover:bg-red-500 text-white font-bold rounded-xl transition-colors"
              >
                Sign Out
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
