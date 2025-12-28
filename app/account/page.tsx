'use client';

import React from 'react';
import Link from 'next/link';
import { Header } from '@/components/ui/Header';

export default function AccountPage() {
  // TODO: Get from auth context
  const user = {
    firstName: 'John',
    lastName: 'Doe',
    email: 'john@example.com',
    plan: 'Commuter',
    credits: 32,
    memberSince: 'October 2024',
  };

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
            {user.firstName[0]}{user.lastName[0]}
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">{user.firstName} {user.lastName}</h1>
            <p className="text-white text-sm">{user.email}</p>
            <p className="text-orange-400 text-sm">{user.plan} • Member since {user.memberSince}</p>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-3 text-center">
            <p className="text-2xl font-bold text-orange-400">{user.credits}</p>
            <p className="text-white text-xs">Credits</p>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-3 text-center">
            <p className="text-2xl font-bold text-green-400">12</p>
            <p className="text-white text-xs">Completed</p>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-3 text-center">
            <p className="text-2xl font-bold text-blue-400">3</p>
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
          <Link 
            href="/account/cancel"
            className="block w-full py-3 bg-gray-900 border border-red-500/30 rounded-xl text-center text-red-400 text-sm"
          >
            Cancel Subscription
          </Link>
          <button className="w-full mt-3 py-3 text-red-400 text-sm">
            Sign Out
          </button>
        </div>
      </div>
    </div>
  );
}
