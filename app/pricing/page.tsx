'use client'

import Link from 'next/link'
import { useState } from 'react'
import { useUser } from '../layout'

export default function PricingPage() {
  const [billingInterval, setBillingInterval] = useState<'monthly' | 'annual'>('monthly')
  const [loading, setLoading] = useState<string | null>(null)
  const { user } = useUser()

  const handleCheckout = async (productId: string) => {
    setLoading(productId)
    try {
      const response = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId,
          userEmail: user?.email,
          userName: user?.name,
        }),
      })
      
      const data = await response.json()
      
      if (data.url) {
        window.location.href = data.url
      } else {
        alert('Failed to start checkout. Please try again.')
      }
    } catch (error) {
      console.error('Checkout error:', error)
      alert('Failed to start checkout. Please try again.')
    } finally {
      setLoading(null)
    }
  }

  const subscriptionTiers = [
    {
      id: 'test_driver',
      name: 'Test Driver',
      icon: '🚗',
      description: 'Try before you commit',
      monthlyPrice: 0,
      annualPrice: 0,
      productId: null,
      features: [
        '2 hours/month streaming',
        'Ad-supported playback',
        'New releases delayed 30 days',
        'Access to sampler shelf',
      ],
      limitations: [
        'No offline downloads',
        'Ads before stories',
      ],
      cta: 'Current Plan',
      ctaDisabled: true,
      highlight: false,
    },
    {
      id: 'commuter',
      name: 'Commuter',
      icon: '🚙',
      description: 'For daily listeners',
      monthlyPrice: 7.99,
      annualPrice: 59.99,
      annualSavings: 36,
      productIdMonthly: 'commuter_monthly',
      productIdAnnual: 'commuter_annual',
      features: [
        'Unlimited streaming',
        'Ad-free experience',
        'Instant new releases',
        'Full catalog access',
        'Listen on any device',
      ],
      limitations: [
        'No offline downloads',
      ],
      cta: 'Subscribe',
      ctaDisabled: false,
      highlight: true,
      badge: 'Most Popular',
    },
    {
      id: 'road_warrior',
      name: 'Road Warrior',
      icon: '🚛',
      description: 'The complete experience',
      monthlyPrice: 12.99,
      annualPrice: 99.99,
      annualSavings: 56,
      productIdMonthly: 'road_warrior_monthly',
      productIdAnnual: 'road_warrior_annual',
      features: [
        'Everything in Commuter',
        'Offline downloads',
        'Up to 3 devices',
        '48-hour early access',
        'Exclusive content',
        'Behind-the-scenes extras',
      ],
      limitations: [],
      cta: 'Subscribe',
      ctaDisabled: false,
      highlight: false,
    },
  ]

  const creditPacks = [
    { id: 'credits_small', name: 'Small Pack', credits: 10, hours: '2.5 hrs', price: 3.99, perHour: 1.60 },
    { id: 'credits_medium', name: 'Medium Pack', credits: 25, hours: '6.25 hrs', price: 8.99, perHour: 1.44 },
    { id: 'credits_large', name: 'Large Pack', credits: 50, hours: '12.5 hrs', price: 14.99, perHour: 1.20, badge: 'Best Value' },
  ]

  const individualPrices = [
    { duration: '15 min', price: 0.69 },
    { duration: '30 min', price: 1.29 },
    { duration: '1 hour', price: 2.49 },
    { duration: '3 hours', price: 6.99 },
  ]

  return (
    <div className="py-8 px-4">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">Choose Your Journey</h1>
          <p className="text-slate-400">Three ways to enjoy Drive Time Tales</p>
        </div>

        {/* ==================== SUBSCRIPTIONS ==================== */}
        <section className="mb-12">
          <h2 className="text-xl font-bold text-white mb-4 text-center">📅 Subscriptions</h2>
          <p className="text-slate-400 text-center mb-6">Ongoing access for regular listeners</p>

          {/* Billing Toggle */}
          <div className="flex justify-center mb-8">
            <div className="bg-slate-800 rounded-full p-1 flex">
              <button
                onClick={() => setBillingInterval('monthly')}
                className={`px-6 py-2 rounded-full text-sm font-semibold transition-colors ${
                  billingInterval === 'monthly'
                    ? 'bg-orange-500 text-black'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Monthly
              </button>
              <button
                onClick={() => setBillingInterval('annual')}
                className={`px-6 py-2 rounded-full text-sm font-semibold transition-colors ${
                  billingInterval === 'annual'
                    ? 'bg-orange-500 text-black'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Annual <span className="text-green-400 ml-1">Save 37%</span>
              </button>
            </div>
          </div>

          {/* Subscription Cards */}
          <div className="grid md:grid-cols-3 gap-6">
            {subscriptionTiers.map((tier) => {
              const productId = billingInterval === 'monthly' 
                ? (tier as any).productIdMonthly 
                : (tier as any).productIdAnnual
              const isLoading = loading === productId
              
              return (
                <div
                  key={tier.id}
                  className={`relative rounded-2xl p-6 ${
                    tier.highlight
                      ? 'bg-gradient-to-b from-orange-500/20 to-slate-800 border-2 border-orange-500'
                      : 'bg-slate-800/50 border border-slate-700'
                  }`}
                >
                  {tier.badge && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-orange-500 text-black text-xs font-bold rounded-full">
                      {tier.badge}
                    </div>
                  )}

                  <div className="text-center mb-4">
                    <span className="text-4xl block mb-2">{tier.icon}</span>
                    <h3 className="text-xl font-bold text-white">{tier.name}</h3>
                    <p className="text-slate-400 text-sm">{tier.description}</p>
                  </div>

                  <div className="text-center mb-6">
                    {tier.monthlyPrice === 0 ? (
                      <div className="text-3xl font-bold text-white">Free</div>
                    ) : (
                      <>
                        <div className="text-3xl font-bold text-white">
                          ${billingInterval === 'monthly' ? tier.monthlyPrice : tier.annualPrice}
                          <span className="text-lg text-slate-400 font-normal">
                            /{billingInterval === 'monthly' ? 'mo' : 'yr'}
                          </span>
                        </div>
                        {billingInterval === 'annual' && tier.annualSavings && (
                          <p className="text-green-400 text-sm mt-1">
                            Save ${tier.annualSavings}/year • ${(tier.annualPrice / 12).toFixed(2)}/mo
                          </p>
                        )}
                      </>
                    )}
                  </div>

                  <ul className="space-y-2 mb-6">
                    {tier.features.map((feature, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm">
                        <span className="text-green-400 mt-0.5">✓</span>
                        <span className="text-slate-300">{feature}</span>
                      </li>
                    ))}
                    {tier.limitations.map((limitation, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm">
                        <span className="text-slate-500 mt-0.5">✗</span>
                        <span className="text-slate-500">{limitation}</span>
                      </li>
                    ))}
                  </ul>

                  <button
                    onClick={() => productId && handleCheckout(productId)}
                    disabled={tier.ctaDisabled || isLoading}
                    className={`w-full py-3 rounded-xl font-semibold transition-colors ${
                      tier.ctaDisabled
                        ? 'bg-slate-700 text-slate-500 cursor-not-allowed'
                        : tier.highlight
                        ? 'bg-orange-500 hover:bg-orange-400 text-black'
                        : 'bg-slate-700 hover:bg-slate-600 text-white'
                    }`}
                  >
                    {isLoading ? 'Loading...' : (user?.subscriptionTier === tier.id ? 'Current Plan' : tier.cta)}
                  </button>
                </div>
              )
            })}
          </div>

          {/* Breakeven Info */}
          <p className="text-center text-slate-500 text-sm mt-4">
            💡 Commuter pays for itself at ~5 hours/month of listening
          </p>
        </section>

        {/* ==================== CREDIT PACKS ==================== */}
        <section className="mb-12">
          <h2 className="text-xl font-bold text-white mb-4 text-center">🎟️ Credit Packs</h2>
          <p className="text-slate-400 text-center mb-6">Pay-as-you-go streaming • 1 credit = 15 minutes • Credits never expire</p>

          <div className="grid md:grid-cols-3 gap-4 max-w-3xl mx-auto">
            {creditPacks.map((pack) => {
              const isLoading = loading === pack.id
              return (
                <div
                  key={pack.id}
                  className={`relative bg-slate-800/50 border rounded-xl p-5 text-center ${
                    pack.badge ? 'border-green-500' : 'border-slate-700'
                  }`}
                >
                  {pack.badge && (
                    <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 px-2 py-0.5 bg-green-500 text-black text-xs font-bold rounded">
                      {pack.badge}
                    </div>
                  )}
                  <h3 className="font-bold text-white mb-1">{pack.name}</h3>
                  <p className="text-2xl font-bold text-orange-400 mb-1">${pack.price}</p>
                  <p className="text-slate-400 text-sm mb-2">{pack.credits} credits • {pack.hours}</p>
                  <p className="text-slate-500 text-xs mb-3">${pack.perHour.toFixed(2)}/hour</p>
                  <button 
                    onClick={() => handleCheckout(pack.id)}
                    disabled={isLoading}
                    className="w-full py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm font-semibold disabled:opacity-50"
                  >
                    {isLoading ? 'Loading...' : 'Buy Credits'}
                  </button>
                </div>
              )
            })}
          </div>
        </section>

        {/* ==================== INDIVIDUAL PURCHASE ==================== */}
        <section className="mb-12">
          <h2 className="text-xl font-bold text-white mb-4 text-center">🎁 Own Forever</h2>
          <p className="text-slate-400 text-center mb-6">Buy individual stories • Download included • Yours permanently</p>

          <div className="bg-slate-800/30 border border-slate-700 rounded-xl p-6 max-w-2xl mx-auto">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {individualPrices.map((item) => (
                <div key={item.duration} className="text-center">
                  <p className="text-slate-400 text-sm mb-1">{item.duration}</p>
                  <p className="text-xl font-bold text-white">${item.price.toFixed(2)}</p>
                </div>
              ))}
            </div>
            <p className="text-center text-slate-500 text-sm mt-4">
              Look for the "Buy" button on any story page
            </p>
          </div>
        </section>

        {/* ==================== REFERRAL PROGRAM ==================== */}
        <section className="mb-8">
          <div className="bg-gradient-to-r from-purple-500/20 to-orange-500/20 border border-purple-500/30 rounded-xl p-6 max-w-3xl mx-auto text-center">
            <h2 className="text-xl font-bold text-white mb-2">🎉 Share & Earn</h2>
            <p className="text-slate-300 mb-4">
              Give a friend their first month for $0.99. You get a <span className="text-green-400 font-semibold">free month</span> + <span className="text-orange-400 font-semibold">$3 store credit</span>!
            </p>
            {user?.isLoggedIn ? (
              <button className="px-6 py-2 bg-purple-600 hover:bg-purple-500 text-white font-semibold rounded-lg">
                Get My Referral Link
              </button>
            ) : (
              <Link href="/signup" className="px-6 py-2 bg-purple-600 hover:bg-purple-500 text-white font-semibold rounded-lg inline-block">
                Sign Up to Share
              </Link>
            )}
          </div>
        </section>

        {/* ==================== FAQ ==================== */}
        <section>
          <h2 className="text-xl font-bold text-white mb-4 text-center">Questions?</h2>
          <div className="max-w-2xl mx-auto space-y-4">
            <div className="bg-slate-800/30 border border-slate-700 rounded-lg p-4">
              <h3 className="font-semibold text-white mb-1">What's the difference between credits and subscriptions?</h3>
              <p className="text-slate-400 text-sm">Subscriptions give unlimited streaming (Commuter/Road Warrior). Credits are pay-as-you-go - buy a pack, listen anytime, they never expire. Great for occasional listeners!</p>
            </div>
            <div className="bg-slate-800/30 border border-slate-700 rounded-lg p-4">
              <h3 className="font-semibold text-white mb-1">Can I download stories?</h3>
              <p className="text-slate-400 text-sm">Road Warrior subscribers can download for offline listening. Individual purchases also include download rights - own forever!</p>
            </div>
            <div className="bg-slate-800/30 border border-slate-700 rounded-lg p-4">
              <h3 className="font-semibold text-white mb-1">What happens to my credits if I subscribe?</h3>
              <p className="text-slate-400 text-sm">Your credits stay in your account! Use them alongside your subscription or save them for later.</p>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
