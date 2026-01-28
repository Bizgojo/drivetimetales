'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Header } from '@/components/ui/Header';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';

export default function AccountPage() {
  const { user, signOut, loading } = useAuth();
  const router = useRouter();
  const [stats, setStats] = useState({ completed: 0, inProgress: 0 });
  const [statsLoading, setStatsLoading] = useState(true);

  // Fetch user story stats
  useEffect(() => {
    async function fetchStats() {
      if (!user?.id) return;
      
      try {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        
        if (!url || !key) return;
        
        const response = await fetch(
          `${url}/rest/v1/user_stories?user_id=eq.${user.id}&select=completed,progress_seconds`,
          {
            headers: {
              'apikey': key,
              'Authorization': `Bearer ${key}`,
            }
          }
        );
        
        if (response.ok) {
          const data = await response.json();
          const completed = data.filter((s: any) => s.completed).length;
          const inProgress = data.filter((s: any) => !s.completed && s.progress_seconds > 0).length;
          setStats({ completed, inProgress });
        }
      } catch (error) {
        console.error('Error fetching stats:', error);
      } finally {
        setStatsLoading(false);
      }
    }
    
    fetchStats();
  }, [user?.id]);

  // Handle sign out
  const handleSignOut = async () => {
    await signOut();
    router.push('/');
  };

  // Show loading state
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
  const memberSince = new Date(user.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  const menuItems = [
    { href: '/account/billing', icon: '💎', label: 'Billing & Credits', desc: `${user.credits} credits available` },
    { href: '/account/settings', icon: '⚙️', label: 'Settings', desc: 'Preferences & notifications' },
    { href: '/account/downloads', icon: '📥', label: 'Downloads', desc: 'Offline stories' },
    { href: '/account/help', icon: '❓', label: 'Help & Support', desc: 'FAQs & contact' },
  ];

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <Header showBack isLoggedIn userCredits={user.credits} />
      
      <div className="px-4 py-5">
        {/* Profile Header */}
        <div className="flex items-center gap-4 mb-6">
          <div className="w-20 h-20 bg-orange-500 rounded-full flex items-center justify-center text-3xl font-bold">
            {initials}
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">{displayName}</h1>
            <p className="text-white text-sm">{user.email}</p>
            <p className="text-orange-400 text-sm">{planDisplay} • Member since {memberSince}</p>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-3 text-center">
            <p className="text-2xl font-bold text-orange-400">{user.credits}</p>
            <p className="text-white text-xs">Credits</p>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-3 text-center">
            <p className="text-2xl font-bold text-green-400">{statsLoading ? '-' : stats.completed}</p>
            <p className="text-white text-xs">Completed</p>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-3 text-center">
            <p className="text-2xl font-bold text-blue-400">{statsLoading ? '-' : stats.inProgress}</p>
            <p className="text-white text-xs">In Progress</p>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="flex gap-3 mb-6">
          <Link href="/collection" className="flex-1 py-3 bg-gray-900 border border-gray-800 rounded-xl text-center text-white text-sm">
            📚 My Collection
          </Link>
          <Link href="/wishlist" className="flex-1 py-3 bg-gray-900 border border-gray-800 rounded-xl text-center text-white text-sm">
            ♡ Wishlist
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
                <p className="text-white text-sm">{item.desc}</p>
              </div>
              <span className="text-gray-500">›</span>
            </Link>
          ))}
        </div>

        {/* Danger Zone */}
        <div className="border-t border-gray-800 pt-6">
          {user.subscription_type !== 'free' && (
            <Link 
              href="/account/cancel"
              className="block w-full py-3 bg-gray-900 border border-red-500/30 rounded-xl text-center text-red-400 text-sm mb-3"
            >
              Cancel Subscription
            </Link>
          )}
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
