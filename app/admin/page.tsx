'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';

interface DashboardStats {
  totalUsers: number;
  activeSubscribers: number;
  totalStories: number;
  totalPlays: number;
  todayRevenue: number;
  monthRevenue: number;
  newUsersToday: number;
  newUsersMonth: number;
}

interface RecentActivity {
  id: string;
  type: 'signup' | 'purchase' | 'play' | 'subscription';
  description: string;
  timestamp: string;
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [recentActivity, setRecentActivity] = useState<RecentActivity[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchDashboardData() {
      try {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

        if (!url || !key) {
          console.error('Missing Supabase credentials');
          setLoading(false);
          return;
        }

        const headers = {
          'apikey': key,
          'Authorization': `Bearer ${key}`,
        };

        // Fetch users count
        const usersRes = await fetch(`${url}/rest/v1/users?select=id,created_at,subscription_type`, { headers });
        const users = await usersRes.json();

        // Fetch stories count
        const storiesRes = await fetch(`${url}/rest/v1/stories?select=id,play_count`, { headers });
        const stories = await storiesRes.json();

        // Calculate stats
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);

        const totalUsers = users?.length || 0;
        const activeSubscribers = users?.filter((u: any) => 
          u.subscription_type && u.subscription_type !== 'free'
        ).length || 0;
        
        const newUsersToday = users?.filter((u: any) => 
          new Date(u.created_at) >= today
        ).length || 0;
        
        const newUsersMonth = users?.filter((u: any) => 
          new Date(u.created_at) >= monthStart
        ).length || 0;

        const totalStories = stories?.length || 0;
        const totalPlays = stories?.reduce((sum: number, s: any) => sum + (s.play_count || 0), 0) || 0;

        setStats({
          totalUsers,
          activeSubscribers,
          totalStories,
          totalPlays,
          todayRevenue: 0, // Would need purchases table
          monthRevenue: 0, // Would need purchases table
          newUsersToday,
          newUsersMonth,
        });

        // Mock recent activity for now
        setRecentActivity([
          { id: '1', type: 'signup', description: 'New user signed up', timestamp: new Date().toISOString() },
          { id: '2', type: 'play', description: 'Story played: The Midnight Express', timestamp: new Date(Date.now() - 3600000).toISOString() },
          { id: '3', type: 'subscription', description: 'New Road Warrior subscription', timestamp: new Date(Date.now() - 7200000).toISOString() },
        ]);

      } catch (error) {
        console.error('Error fetching dashboard data:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchDashboardData();
  }, []);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
  };

  const formatNumber = (num: number) => {
    return new Intl.NumberFormat('en-US').format(num);
  };

  const getActivityIcon = (type: string) => {
    switch (type) {
      case 'signup': return '👤';
      case 'purchase': return '💳';
      case 'play': return '▶️';
      case 'subscription': return '⭐';
      default: return '📌';
    }
  };

  const formatTimeAgo = (timestamp: string) => {
    const seconds = Math.floor((Date.now() - new Date(timestamp).getTime()) / 1000);
    if (seconds < 60) return 'Just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
  };

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="inline-block w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mb-4" />
          <p className="text-gray-400">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white mb-2">Dashboard</h1>
        <p className="text-gray-400">Welcome to Drive Time Tales Admin</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {/* Total Users */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-gray-400 text-sm">Total Users</span>
            <span className="text-2xl">👥</span>
          </div>
          <p className="text-3xl font-bold text-white">{formatNumber(stats?.totalUsers || 0)}</p>
          <p className="text-green-400 text-sm mt-1">+{stats?.newUsersToday || 0} today</p>
        </div>

        {/* Active Subscribers */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-gray-400 text-sm">Active Subscribers</span>
            <span className="text-2xl">⭐</span>
          </div>
          <p className="text-3xl font-bold text-white">{formatNumber(stats?.activeSubscribers || 0)}</p>
          <p className="text-gray-500 text-sm mt-1">
            {stats?.totalUsers ? Math.round((stats.activeSubscribers / stats.totalUsers) * 100) : 0}% of users
          </p>
        </div>

        {/* Total Stories */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-gray-400 text-sm">Total Stories</span>
            <span className="text-2xl">📚</span>
          </div>
          <p className="text-3xl font-bold text-white">{formatNumber(stats?.totalStories || 0)}</p>
          <Link href="/admin/stories" className="text-orange-400 text-sm mt-1 hover:underline">
            Manage stories →
          </Link>
        </div>

        {/* Total Plays */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-gray-400 text-sm">Total Plays</span>
            <span className="text-2xl">▶️</span>
          </div>
          <p className="text-3xl font-bold text-white">{formatNumber(stats?.totalPlays || 0)}</p>
          <p className="text-gray-500 text-sm mt-1">All time</p>
        </div>
      </div>

      {/* Revenue Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
        <div className="bg-gradient-to-r from-green-900/50 to-green-800/30 border border-green-700/50 rounded-xl p-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-green-300 text-sm">Today's Revenue</span>
            <span className="text-2xl">💵</span>
          </div>
          <p className="text-3xl font-bold text-white">{formatCurrency(stats?.todayRevenue || 0)}</p>
          <Link href="/admin/finance" className="text-green-400 text-sm mt-1 hover:underline">
            View details →
          </Link>
        </div>

        <div className="bg-gradient-to-r from-blue-900/50 to-blue-800/30 border border-blue-700/50 rounded-xl p-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-blue-300 text-sm">This Month</span>
            <span className="text-2xl">📅</span>
          </div>
          <p className="text-3xl font-bold text-white">{formatCurrency(stats?.monthRevenue || 0)}</p>
          <p className="text-gray-500 text-sm mt-1">+{stats?.newUsersMonth || 0} new users</p>
        </div>
      </div>

      {/* Quick Actions & Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Quick Actions */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <h2 className="text-lg font-bold text-white mb-4">Quick Actions</h2>
          <div className="grid grid-cols-2 gap-3">
            <Link
              href="/admin/stories/new"
              className="flex items-center gap-3 p-4 bg-gray-800 hover:bg-gray-700 rounded-xl transition-colors"
            >
              <span className="text-2xl">➕</span>
              <span className="text-white font-medium">Add Story</span>
            </Link>
            <Link
              href="/admin/users"
              className="flex items-center gap-3 p-4 bg-gray-800 hover:bg-gray-700 rounded-xl transition-colors"
            >
              <span className="text-2xl">👥</span>
              <span className="text-white font-medium">View Users</span>
            </Link>
            <Link
              href="/admin/sales"
              className="flex items-center gap-3 p-4 bg-gray-800 hover:bg-gray-700 rounded-xl transition-colors"
            >
              <span className="text-2xl">🏷️</span>
              <span className="text-white font-medium">Create Promo</span>
            </Link>
            <Link
              href="/admin/partners"
              className="flex items-center gap-3 p-4 bg-gray-800 hover:bg-gray-700 rounded-xl transition-colors"
            >
              <span className="text-2xl">🤝</span>
              <span className="text-white font-medium">Add Partner</span>
            </Link>
          </div>
        </div>

        {/* Recent Activity */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <h2 className="text-lg font-bold text-white mb-4">Recent Activity</h2>
          <div className="space-y-3">
            {recentActivity.map((activity) => (
              <div key={activity.id} className="flex items-center gap-3 p-3 bg-gray-800 rounded-lg">
                <span className="text-xl">{getActivityIcon(activity.type)}</span>
                <div className="flex-1">
                  <p className="text-white text-sm">{activity.description}</p>
                  <p className="text-gray-500 text-xs">{formatTimeAgo(activity.timestamp)}</p>
                </div>
              </div>
            ))}
          </div>
          {recentActivity.length === 0 && (
            <p className="text-gray-500 text-center py-4">No recent activity</p>
          )}
        </div>
      </div>
    </div>
  );
}
