'use client';

import React, { useEffect, useState } from 'react';

interface Transaction {
  id: string;
  user_id: string;
  user_email?: string;
  type: 'subscription' | 'credit_pack' | 'refund';
  amount_cents: number;
  product_name: string;
  stripe_payment_id?: string;
  created_at: string;
}

interface FinanceStats {
  todayRevenue: number;
  weekRevenue: number;
  monthRevenue: number;
  yearRevenue: number;
  totalRevenue: number;
  subscriptionRevenue: number;
  creditPackRevenue: number;
  refunds: number;
  transactionCount: number;
}

export default function FinancePage() {
  const [stats, setStats] = useState<FinanceStats | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [timeFilter, setTimeFilter] = useState<'today' | 'week' | 'month' | 'year' | 'all'>('month');

  useEffect(() => {
    async function fetchFinanceData() {
      try {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

        if (!url || !key) {
          setLoading(false);
          return;
        }

        const headers = {
          'apikey': key,
          'Authorization': `Bearer ${key}`,
        };

        // Fetch purchases/transactions
        const purchasesRes = await fetch(
          `${url}/rest/v1/purchases?select=*&order=created_at.desc&limit=100`,
          { headers }
        );
        
        let purchases = [];
        if (purchasesRes.ok) {
          purchases = await purchasesRes.json();
        }

        // Calculate date ranges
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
        const monthAgo = new Date(today.getFullYear(), today.getMonth() - 1, today.getDate());
        const yearAgo = new Date(today.getFullYear() - 1, today.getMonth(), today.getDate());

        // Calculate stats
        const calculateRevenue = (items: any[], since?: Date) => {
          return items
            .filter((p: any) => !since || new Date(p.created_at) >= since)
            .filter((p: any) => p.type !== 'refund')
            .reduce((sum: number, p: any) => sum + (p.amount_cents || 0), 0) / 100;
        };

        const refunds = purchases
          .filter((p: any) => p.type === 'refund')
          .reduce((sum: number, p: any) => sum + Math.abs(p.amount_cents || 0), 0) / 100;

        const subscriptionRevenue = purchases
          .filter((p: any) => p.type === 'subscription')
          .reduce((sum: number, p: any) => sum + (p.amount_cents || 0), 0) / 100;

        const creditPackRevenue = purchases
          .filter((p: any) => p.type === 'credit_pack')
          .reduce((sum: number, p: any) => sum + (p.amount_cents || 0), 0) / 100;

        setStats({
          todayRevenue: calculateRevenue(purchases, today),
          weekRevenue: calculateRevenue(purchases, weekAgo),
          monthRevenue: calculateRevenue(purchases, monthAgo),
          yearRevenue: calculateRevenue(purchases, yearAgo),
          totalRevenue: calculateRevenue(purchases),
          subscriptionRevenue,
          creditPackRevenue,
          refunds,
          transactionCount: purchases.length,
        });

        setTransactions(purchases);

      } catch (error) {
        console.error('Error fetching finance data:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchFinanceData();
  }, []);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'subscription': return 'text-blue-400 bg-blue-400/10';
      case 'credit_pack': return 'text-green-400 bg-green-400/10';
      case 'refund': return 'text-red-400 bg-red-400/10';
      default: return 'text-gray-400 bg-gray-400/10';
    }
  };

  const getFilteredTransactions = () => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    return transactions.filter((t) => {
      const date = new Date(t.created_at);
      switch (timeFilter) {
        case 'today':
          return date >= today;
        case 'week':
          return date >= new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
        case 'month':
          return date >= new Date(today.getFullYear(), today.getMonth() - 1, today.getDate());
        case 'year':
          return date >= new Date(today.getFullYear() - 1, today.getMonth(), today.getDate());
        default:
          return true;
      }
    });
  };

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="inline-block w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mb-4" />
          <p className="text-gray-400">Loading finance data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white mb-2">💰 Finance</h1>
        <p className="text-gray-400">Revenue tracking and financial overview</p>
      </div>

      {/* Revenue Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <span className="text-gray-400 text-sm">Today</span>
          <p className="text-2xl font-bold text-white mt-1">{formatCurrency(stats?.todayRevenue || 0)}</p>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <span className="text-gray-400 text-sm">This Week</span>
          <p className="text-2xl font-bold text-white mt-1">{formatCurrency(stats?.weekRevenue || 0)}</p>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <span className="text-gray-400 text-sm">This Month</span>
          <p className="text-2xl font-bold text-white mt-1">{formatCurrency(stats?.monthRevenue || 0)}</p>
        </div>
        <div className="bg-gradient-to-r from-green-900/50 to-green-800/30 border border-green-700/50 rounded-xl p-6">
          <span className="text-green-300 text-sm">Total Revenue</span>
          <p className="text-2xl font-bold text-white mt-1">{formatCurrency(stats?.totalRevenue || 0)}</p>
        </div>
      </div>

      {/* Revenue Breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xl">⭐</span>
            <span className="text-gray-400 text-sm">Subscriptions</span>
          </div>
          <p className="text-2xl font-bold text-blue-400">{formatCurrency(stats?.subscriptionRevenue || 0)}</p>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xl">💎</span>
            <span className="text-gray-400 text-sm">Credit Packs</span>
          </div>
          <p className="text-2xl font-bold text-green-400">{formatCurrency(stats?.creditPackRevenue || 0)}</p>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xl">↩️</span>
            <span className="text-gray-400 text-sm">Refunds</span>
          </div>
          <p className="text-2xl font-bold text-red-400">-{formatCurrency(stats?.refunds || 0)}</p>
        </div>
      </div>

      {/* Transactions Table */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <div className="p-4 border-b border-gray-800 flex items-center justify-between">
          <h2 className="text-lg font-bold text-white">Recent Transactions</h2>
          <div className="flex gap-2">
            {(['today', 'week', 'month', 'year', 'all'] as const).map((filter) => (
              <button
                key={filter}
                onClick={() => setTimeFilter(filter)}
                className={`px-3 py-1 rounded-lg text-sm transition-colors ${
                  timeFilter === filter
                    ? 'bg-orange-500 text-black'
                    : 'bg-gray-800 text-gray-400 hover:text-white'
                }`}
              >
                {filter.charAt(0).toUpperCase() + filter.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {getFilteredTransactions().length === 0 ? (
          <div className="p-8 text-center">
            <span className="text-4xl mb-4 block">📭</span>
            <p className="text-gray-400">No transactions found</p>
            <p className="text-gray-500 text-sm mt-1">Transactions will appear here when customers make purchases</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-800">
                <tr>
                  <th className="px-4 py-3 text-left text-gray-400 text-sm font-medium">Date</th>
                  <th className="px-4 py-3 text-left text-gray-400 text-sm font-medium">Type</th>
                  <th className="px-4 py-3 text-left text-gray-400 text-sm font-medium">Product</th>
                  <th className="px-4 py-3 text-left text-gray-400 text-sm font-medium">User</th>
                  <th className="px-4 py-3 text-right text-gray-400 text-sm font-medium">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {getFilteredTransactions().map((transaction) => (
                  <tr key={transaction.id} className="hover:bg-gray-800/50">
                    <td className="px-4 py-3 text-gray-300 text-sm">
                      {formatDate(transaction.created_at)}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${getTypeColor(transaction.type)}`}>
                        {transaction.type.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-white text-sm">
                      {transaction.product_name || '-'}
                    </td>
                    <td className="px-4 py-3 text-gray-400 text-sm">
                      {transaction.user_email || transaction.user_id?.slice(0, 8) + '...'}
                    </td>
                    <td className={`px-4 py-3 text-right font-medium ${
                      transaction.type === 'refund' ? 'text-red-400' : 'text-green-400'
                    }`}>
                      {transaction.type === 'refund' ? '-' : ''}
                      {formatCurrency((transaction.amount_cents || 0) / 100)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Export Button */}
      <div className="mt-4 flex justify-end">
        <button
          onClick={() => {
            // TODO: Implement CSV export
            alert('Export feature coming soon!');
          }}
          className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded-lg text-sm transition-colors"
        >
          📥 Export to CSV
        </button>
      </div>
    </div>
  );
}
