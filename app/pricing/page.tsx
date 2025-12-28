'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Header } from '@/components/ui/Header';
import { useAuth } from '@/contexts/AuthContext';
import { useCheckout } from '@/hooks/useData';

export default function PricingPage() {
  const { user } = useAuth();
  const { checkout, loading: checkoutLoading, error: checkoutError } = useCheckout();
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'annual'>('annual');
  const [activeSection, setActiveSection] = useState<'subscriptions' | 'packs'>('subscriptions');

  const plans = [
    {
      id: 'test_driver',
      name: 'Test Driver',
      icon: '🚗',
      monthlyPrice: 2.99,
      annualPrice: 29.99,
      credits: 12,
      perMonth: true,
    },
    {
      id: 'commuter',
      name: 'Commuter',
      icon: '🚙',
      monthlyPrice: 7.99,
      annualPrice: 79.99,
      credits: 45,
      perMonth: true,
      badge: 'BEST VALUE',
    },
    {
      id: 'road_warrior',
      name: 'Road Warrior',
      icon: '🚛',
      monthlyPrice: 14.99,
      annualPrice: 149.99,
      credits: 'Unlimited',
      perMonth: true,
    },
  ];

  const packs = [
    { id: 'small', name: 'Small Pack', icon: '📦', credits: 10, hours: '2.5', price: 4.99, perCredit: 0.50 },
    { id: 'medium', name: 'Medium Pack', icon: '📦', credits: 25, hours: '6.5', price: 9.99, perCredit: 0.40, badge: 'POPULAR' },
    { id: 'large', name: 'Large Pack', icon: '📦', credits: 60, hours: '15', price: 19.99, perCredit: 0.33 },
  ];

  const handleSubscribe = (planId: string) => {
    const productId = `${planId}_${billingCycle === 'monthly' ? 'monthly' : 'annual'}`;
    checkout('subscription', productId);
  };

  const handleBuyPack = (packId: string) => {
    checkout('credit_pack', packId);
  };

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <Header showBack />
      
      <div className="px-4 py-5">
        {/* User Credits Display */}
        {user && (
          <div className="mb-4 p-3 bg-green-500/20 border border-green-500/30 rounded-xl">
            <p className="text-green-400 text-sm text-center">
              💎 You have <span className="font-bold">{user.credits}</span> credits
              {user.subscription_type !== 'free' && ` • ${user.subscription_type.replace('_', ' ')} plan`}
            </p>
          </div>
        )}

        {checkoutError && (
          <div className="mb-4 p-3 bg-red-500/20 border border-red-500/30 rounded-xl">
            <p className="text-red-400 text-sm text-center">{checkoutError}</p>
          </div>
        )}

        <h1 className="text-2xl font-bold text-white mb-2">💳 Pricing</h1>
        <p className="text-white text-sm mb-6">Choose the plan that fits your drive</p>

        {/* Section Toggle */}
        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setActiveSection('subscriptions')}
            className={`flex-1 py-3 rounded-xl font-medium ${
              activeSection === 'subscriptions' 
                ? 'bg-orange-500 text-white' 
                : 'bg-gray-800 text-white'
            }`}
          >
            Subscriptions
          </button>
          <button
            onClick={() => setActiveSection('packs')}
            className={`flex-1 py-3 rounded-xl font-medium ${
              activeSection === 'packs' 
                ? 'bg-orange-500 text-white' 
                : 'bg-gray-800 text-white'
            }`}
          >
            Freedom Packs
          </button>
        </div>

        {/* Subscriptions Section */}
        {activeSection === 'subscriptions' && (
          <>
            {/* Billing Toggle */}
            <div className="flex items-center justify-center gap-3 mb-6">
              <span className={billingCycle === 'monthly' ? 'text-white' : 'text-gray-500'}>Monthly</span>
              <button
                onClick={() => setBillingCycle(billingCycle === 'monthly' ? 'annual' : 'monthly')}
                className="w-14 h-8 bg-gray-800 rounded-full relative"
              >
                <div className={`w-6 h-6 bg-orange-500 rounded-full absolute top-1 transition-all ${
                  billingCycle === 'annual' ? 'right-1' : 'left-1'
                }`} />
              </button>
              <span className={billingCycle === 'annual' ? 'text-white' : 'text-gray-500'}>
                Annual
                <span className="ml-1 text-green-400 text-xs">Save 17%</span>
              </span>
            </div>

            {/* Plans */}
            <div className="space-y-4">
              {plans.map((plan) => {
                const price = billingCycle === 'monthly' ? plan.monthlyPrice : plan.annualPrice;
                const monthlyEquiv = billingCycle === 'annual' ? (plan.annualPrice / 12).toFixed(2) : null;
                const savings = billingCycle === 'annual' ? ((plan.monthlyPrice * 12) - plan.annualPrice).toFixed(2) : null;
                
                return (
                  <div 
                    key={plan.name}
                    className={`p-4 bg-gray-900 border rounded-xl ${
                      plan.badge ? 'border-orange-500' : 'border-gray-800'
                    }`}
                  >
                    {plan.badge && (
                      <span className="inline-block px-2 py-1 bg-orange-500 text-white text-xs font-bold rounded mb-2">
                        {plan.badge}
                      </span>
                    )}
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-2xl">{plan.icon}</span>
                        <span className="text-white font-bold text-lg">{plan.name}</span>
                      </div>
                      <div className="text-right">
                        <span className="text-white text-2xl font-bold">${price}</span>
                        <span className="text-white text-sm">/{billingCycle === 'monthly' ? 'mo' : 'yr'}</span>
                      </div>
                    </div>
                    
                    {monthlyEquiv && (
                      <p className="text-white text-sm mb-1">(${monthlyEquiv}/mo)</p>
                    )}
                    
                    <p className="text-orange-400 text-sm mb-2">
                      💎 {plan.credits} credits{plan.perMonth ? '/month' : ''}
                    </p>
                    
                    {savings && (
                      <p className="text-green-400 text-sm">
                        Save ${savings}/year vs monthly
                      </p>
                    )}
                    
                    <button 
                      onClick={() => handleSubscribe(plan.id)}
                      disabled={checkoutLoading}
                      className="w-full mt-3 py-3 bg-orange-500 text-white font-bold rounded-xl disabled:opacity-50"
                    >
                      {checkoutLoading ? 'Loading...' : 'Subscribe'}
                    </button>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* Freedom Packs Section */}
        {activeSection === 'packs' && (
          <>
            <p className="text-white text-sm mb-4">
              No subscription? No problem. Buy credits when you need them.
            </p>

            <div className="space-y-4">
              {packs.map((pack) => (
                <div 
                  key={pack.name}
                  className={`p-4 bg-gray-900 border rounded-xl ${
                    pack.badge ? 'border-orange-500' : 'border-gray-800'
                  }`}
                >
                  {pack.badge && (
                    <span className="inline-block px-2 py-1 bg-orange-500 text-white text-xs font-bold rounded mb-2">
                      {pack.badge}
                    </span>
                  )}
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-2xl">{pack.icon}</span>
                      <div>
                        <span className="text-white font-bold text-lg block">{pack.name}</span>
                        <span className="text-white text-sm">💎 {pack.credits} credits</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="text-white text-2xl font-bold">${pack.price}</span>
                    </div>
                  </div>
                  
                  <p className="text-white text-sm mb-1">Up to {pack.hours} hours of content</p>
                  <p className="text-green-400 text-sm">${pack.perCredit.toFixed(2)}/credit</p>
                  
                  <button 
                    onClick={() => handleBuyPack(pack.id)}
                    disabled={checkoutLoading}
                    className="w-full mt-3 py-3 bg-orange-500 text-white font-bold rounded-xl disabled:opacity-50"
                  >
                    {checkoutLoading ? 'Loading...' : 'Buy Pack'}
                  </button>
                </div>
              ))}
            </div>

            {/* Why Freedom Packs */}
            <div className="mt-6 p-4 bg-gray-900 border border-gray-800 rounded-xl">
              <h3 className="text-white font-bold mb-2">Why Freedom Packs?</h3>
              <ul className="text-white text-sm space-y-1">
                <li>✓ No recurring charges</li>
                <li>✓ Credits never expire</li>
                <li>✓ Use at your own pace</li>
              </ul>
            </div>

            <button 
              onClick={() => setActiveSection('subscriptions')}
              className="w-full mt-4 py-3 bg-gray-800 border border-gray-700 text-white rounded-xl"
            >
              📅 View Subscriptions
            </button>
          </>
        )}

        {/* Footer */}
        <div className="mt-6 text-center">
          <p className="text-white text-sm">🔒 Cancel anytime</p>
          <Link href="/about#faq" className="text-orange-400 text-sm">
            View FAQ
          </Link>
        </div>
      </div>
    </div>
  );
}
