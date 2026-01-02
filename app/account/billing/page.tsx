'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Header } from '@/components/ui/Header';
import { useAuth } from '@/contexts/AuthContext';

interface Purchase {
  id: string;
  date: string;
  description: string;
  amount: number;
  credits: number;
  type: 'subscription' | 'credit_pack' | 'story';
}

const samplePurchases: Purchase[] = [
  { id: '1', date: '2024-12-27', description: 'Commuter Monthly', amount: 7.99, credits: 45, type: 'subscription' },
  { id: '2', date: '2024-12-20', description: 'Medium Pack', amount: 9.99, credits: 25, type: 'credit_pack' },
  { id: '3', date: '2024-12-15', description: 'Commuter Monthly', amount: 7.99, credits: 45, type: 'subscription' },
  { id: '4', date: '2024-12-10', description: 'Small Pack', amount: 4.99, credits: 10, type: 'credit_pack' },
];

export default function BillingPage() {
  const { user } = useAuth();
  const [showCancelModal, setShowCancelModal] = useState(false);
  
  const subscription = {
    plan: 'Commuter',
    status: 'active',
    nextBilling: '2025-01-15',
    amount: 7.99,
    credits: 45,
  };

  const handleCancelSubscription = async () => {
    console.log('Canceling subscription...');
    setShowCancelModal(false);
  };

  const totalSpent = samplePurchases.reduce((sum, p) => sum + p.amount, 0);
  const totalCredits = samplePurchases.reduce((sum, p) => sum + p.credits, 0);

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* user.credits matches DB column name */}
      <Header isLoggedIn={!!user} showBack userCredits={user.credits}} />
      
      <div className="px-4 py-5">
        <h1 className="text-2xl font-bold text-white mb-1">💎 Billing & Credits</h1>
        <p className="text-white text-sm mb-6">Manage your subscription and credits</p>

        <div className="bg-gradient-to-r from-orange-500 to-orange-600 rounded-xl p-4 mb-6">
          <div className="flex justify-between items-center">
         <div>
              <p className="text-white/80 text-sm">Available Credits</p>
              <p className="text-4xl font-bold text-white">{user?.credits_remaining || 0}</p>
            </div>
            <Link href="/pricing" className="px-4 py-2 bg-white text-orange-600 font-bold rounded-xl text-sm">
              + Buy More
            </Link>
          </div>
        </div>

        {user?.subscription_status !== 'free' && (
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 mb-6">
            <div className="flex justify-between items-start mb-3">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="text-white font-bold">{subscription.plan} Plan</h3>
                  <span className="px-2 py-0.5 bg-green-500/20 text-green-400 text-xs rounded-full">Active</span>
                </div>
                <p className="text-white text-sm">${subscription.amount}/month</p>
                <p className="text-orange-400 text-sm">{subscription.credits} credits/month</p>
              </div>
              <span className="text-3xl">🚙</span>
            </div>
            
            <div className="border-t border-gray-800 pt-3 mt-3">
              <p className="text-white text-sm mb-3">Next billing: <span className="text-orange-400">{subscription.nextBilling}</span></p>
              <div className="flex gap-2">
                <Link href="/pricing" className="flex-1 py-2 bg-gray-800 text-white text-center rounded-lg text-sm">Change Plan</Link>
                <button onClick={() => setShowCancelModal(true)} className="px-4 py-2 bg-gray-800 text-red-400 rounded-lg text-sm">Cancel</button>
              </div>
            </div>
          </div>
        )}

        {user?.subscription_status === 'free' && (
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 mb-6 text-center py-6">
            <span className="text-4xl mb-3 block">🚗</span>
            <h3 className="text-white font-bold mb-1">No Active Subscription</h3>
            <p className="text-white text-sm mb-4">Subscribe to get monthly credits and save!</p>
            <Link href="/pricing" className="inline-block px-6 py-3 bg-orange-500 text-white font-bold rounded-xl">View Plans</Link>
          </div>
        )}

        <h2 className="text-lg font-bold text-white mb-4">Purchase History</h2>
        
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-3 text-center">
            <p className="text-2xl font-bold text-green-400">${totalSpent.toFixed(2)}</p>
            <p className="text-white text-xs">Total Spent</p>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-3 text-center">
            <p className="text-2xl font-bold text-orange-400">{totalCredits}</p>
            <p className="text-white text-xs">Credits Purchased</p>
          </div>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          {samplePurchases.length > 0 ? (
            <div className="divide-y divide-gray-800">
              {samplePurchases.map((purchase) => (
                <div key={purchase.id} className="p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center text-lg ${
                      purchase.type === 'subscription' ? 'bg-violet-500/20 text-violet-400' :
                      purchase.type === 'credit_pack' ? 'bg-orange-500/20 text-orange-400' : 'bg-blue-500/20 text-blue-400'
                    }`}>
                      {purchase.type === 'subscription' ? '📅' : purchase.type === 'credit_pack' ? '📦' : '📖'}
                    </div>
                    <div>
                      <p className="text-white font-medium">{purchase.description}</p>
                      <p className="text-white text-sm">{purchase.date}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-white font-bold">${purchase.amount.toFixed(2)}</p>
                    <p className="text-orange-400 text-sm">+{purchase.credits} credits</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-8 text-center"><p className="text-white">No purchases yet</p></div>
          )}
        </div>

        <h2 className="text-lg font-bold text-white mt-6 mb-4">Payment Method</h2>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-8 bg-blue-600 rounded flex items-center justify-center text-white text-xs font-bold">VISA</div>
              <div>
                <p className="text-white">•••• •••• •••• 4242</p>
                <p className="text-white text-sm">Expires 12/26</p>
              </div>
            </div>
            <button className="text-orange-400 text-sm">Change</button>
          </div>
        </div>
      </div>

      {showCancelModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 px-4" onClick={() => setShowCancelModal(false)}>
          <div className="bg-gray-900 rounded-xl p-6 max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-xl font-bold text-white mb-2">Cancel Subscription?</h3>
            <p className="text-white text-sm mb-4">You'll lose access to monthly credits at the end of your billing period.</p>
            <div className="flex gap-3">
              <button onClick={() => setShowCancelModal(false)} className="flex-1 py-3 bg-gray-800 text-white rounded-xl">Keep Plan</button>
              <button onClick={handleCancelSubscription} className="flex-1 py-3 bg-red-600 text-white font-bold rounded-xl">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
