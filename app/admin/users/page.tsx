'use client';

import React, { useEffect, useState } from 'react';

interface User {
  id: string;
  email: string;
  display_name?: string;
  credits: number;
  subscription_type?: string;
  subscription_ends_at?: string;
  stripe_customer_id?: string;
  created_at: string;
  last_login?: string;
}

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'free' | 'subscribed'>('all');
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [editCredits, setEditCredits] = useState<number>(0);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchUsers();
  }, []);

  async function fetchUsers() {
    try {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

      if (!url || !key) {
        setLoading(false);
        return;
      }

      const response = await fetch(
        `${url}/rest/v1/users?select=*&order=created_at.desc`,
        {
          headers: {
            'apikey': key,
            'Authorization': `Bearer ${key}`,
          },
        }
      );

      if (response.ok) {
        const data = await response.json();
        setUsers(data || []);
      }
    } catch (error) {
      console.error('Error fetching users:', error);
    } finally {
      setLoading(false);
    }
  }

  async function updateUserCredits(userId: string, newCredits: number) {
    setSaving(true);
    try {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

      if (!url || !key) return;

      const response = await fetch(
        `${url}/rest/v1/users?id=eq.${userId}`,
        {
          method: 'PATCH',
          headers: {
            'apikey': key,
            'Authorization': `Bearer ${key}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal',
          },
          body: JSON.stringify({ credits: newCredits }),
        }
      );

      if (response.ok) {
        // Update local state
        setUsers(users.map(u => 
          u.id === userId ? { ...u, credits: newCredits } : u
        ));
        setSelectedUser(null);
        alert('Credits updated successfully!');
      } else {
        alert('Failed to update credits');
      }
    } catch (error) {
      console.error('Error updating credits:', error);
      alert('Error updating credits');
    } finally {
      setSaving(false);
    }
  }

  const filteredUsers = users.filter(user => {
    // Search filter
    const matchesSearch = 
      user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (user.display_name?.toLowerCase().includes(searchTerm.toLowerCase()));
    
    // Type filter
    const matchesType = 
      filterType === 'all' ||
      (filterType === 'free' && (!user.subscription_type || user.subscription_type === 'free')) ||
      (filterType === 'subscribed' && user.subscription_type && user.subscription_type !== 'free');

    return matchesSearch && matchesType;
  });

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const getSubscriptionBadge = (type?: string) => {
    if (!type || type === 'free') {
      return <span className="px-2 py-1 bg-gray-700 text-gray-300 rounded-full text-xs">Free</span>;
    }
    const colors: Record<string, string> = {
      test_driver: 'bg-blue-500/20 text-blue-400',
      commuter: 'bg-purple-500/20 text-purple-400',
      road_warrior: 'bg-orange-500/20 text-orange-400',
    };
    const names: Record<string, string> = {
      test_driver: 'Test Driver',
      commuter: 'Commuter',
      road_warrior: 'Road Warrior',
    };
    return (
      <span className={`px-2 py-1 rounded-full text-xs ${colors[type] || 'bg-gray-700 text-gray-300'}`}>
        {names[type] || type}
      </span>
    );
  };

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="inline-block w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mb-4" />
          <p className="text-gray-400">Loading users...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white mb-2">👥 Users</h1>
        <p className="text-gray-400">Manage user accounts and credits</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <span className="text-gray-400 text-sm">Total Users</span>
          <p className="text-2xl font-bold text-white">{users.length}</p>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <span className="text-gray-400 text-sm">Free Users</span>
          <p className="text-2xl font-bold text-white">
            {users.filter(u => !u.subscription_type || u.subscription_type === 'free').length}
          </p>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <span className="text-gray-400 text-sm">Subscribers</span>
          <p className="text-2xl font-bold text-white">
            {users.filter(u => u.subscription_type && u.subscription_type !== 'free').length}
          </p>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <span className="text-gray-400 text-sm">Total Credits (all users)</span>
          <p className="text-2xl font-bold text-orange-400">
            {users.reduce((sum, u) => sum + (u.credits || 0), 0)}
          </p>
        </div>
      </div>

      {/* Search and Filter */}
      <div className="flex flex-col md:flex-row gap-4 mb-6">
        <div className="flex-1">
          <input
            type="text"
            placeholder="Search by email or name..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full px-4 py-2 bg-gray-900 border border-gray-800 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-orange-500"
          />
        </div>
        <div className="flex gap-2">
          {(['all', 'free', 'subscribed'] as const).map((type) => (
            <button
              key={type}
              onClick={() => setFilterType(type)}
              className={`px-4 py-2 rounded-xl text-sm transition-colors ${
                filterType === type
                  ? 'bg-orange-500 text-black'
                  : 'bg-gray-800 text-gray-400 hover:text-white'
              }`}
            >
              {type.charAt(0).toUpperCase() + type.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Users Table */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        {filteredUsers.length === 0 ? (
          <div className="p-8 text-center">
            <span className="text-4xl mb-4 block">🔍</span>
            <p className="text-gray-400">No users found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-800">
                <tr>
                  <th className="px-4 py-3 text-left text-gray-400 text-sm font-medium">User</th>
                  <th className="px-4 py-3 text-left text-gray-400 text-sm font-medium">Plan</th>
                  <th className="px-4 py-3 text-center text-gray-400 text-sm font-medium">Credits</th>
                  <th className="px-4 py-3 text-left text-gray-400 text-sm font-medium">Joined</th>
                  <th className="px-4 py-3 text-left text-gray-400 text-sm font-medium">Last Login</th>
                  <th className="px-4 py-3 text-center text-gray-400 text-sm font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {filteredUsers.map((user) => (
                  <tr key={user.id} className="hover:bg-gray-800/50">
                    <td className="px-4 py-3">
                      <div>
                        <p className="text-white font-medium">{user.display_name || 'No name'}</p>
                        <p className="text-gray-400 text-sm">{user.email}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {getSubscriptionBadge(user.subscription_type)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="text-orange-400 font-bold">
                        {user.credits === -1 ? '∞' : user.credits}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-400 text-sm">
                      {formatDate(user.created_at)}
                    </td>
                    <td className="px-4 py-3 text-gray-400 text-sm">
                      {formatDate(user.last_login || '')}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => {
                          setSelectedUser(user);
                          setEditCredits(user.credits);
                        }}
                        className="px-3 py-1 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm transition-colors"
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Edit User Modal */}
      {selectedUser && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 max-w-md w-full">
            <h2 className="text-xl font-bold text-white mb-4">Edit User</h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-gray-400 text-sm mb-1">Email</label>
                <p className="text-white">{selectedUser.email}</p>
              </div>
              
              <div>
                <label className="block text-gray-400 text-sm mb-1">Name</label>
                <p className="text-white">{selectedUser.display_name || '-'}</p>
              </div>
              
              <div>
                <label className="block text-gray-400 text-sm mb-1">Plan</label>
                <p>{getSubscriptionBadge(selectedUser.subscription_type)}</p>
              </div>
              
              <div>
                <label className="block text-gray-400 text-sm mb-1">Credits</label>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setEditCredits(Math.max(0, editCredits - 1))}
                    className="w-10 h-10 bg-gray-800 hover:bg-gray-700 text-white rounded-lg text-xl"
                  >
                    -
                  </button>
                  <input
                    type="number"
                    value={editCredits}
                    onChange={(e) => setEditCredits(parseInt(e.target.value) || 0)}
                    className="w-24 px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-center"
                  />
                  <button
                    onClick={() => setEditCredits(editCredits + 1)}
                    className="w-10 h-10 bg-gray-800 hover:bg-gray-700 text-white rounded-lg text-xl"
                  >
                    +
                  </button>
                  <button
                    onClick={() => setEditCredits(-1)}
                    className="px-3 py-2 bg-orange-500/20 text-orange-400 rounded-lg text-sm"
                  >
                    ∞ Unlimited
                  </button>
                </div>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setSelectedUser(null)}
                className="flex-1 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => updateUserCredits(selectedUser.id, editCredits)}
                disabled={saving}
                className="flex-1 py-2 bg-orange-500 hover:bg-orange-400 text-black font-bold rounded-xl transition-colors disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
