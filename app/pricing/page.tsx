'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

export default function PricingPage() {
  const router = useRouter()
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('monthly')

  // Subscription plans with real Stripe Price IDs
  const plans = [
    {
      id: 'test-driver',
      name: 'Test Driver',
      monthlyPrice: 2.99,
      yearlyPrice: 29.99,
      credits: 10,
      features: [
        '10 credits per month',
        'Access to all stories',
        'Save to wishlist',
      ],
      popular: false,
      monthlyPriceId: 'price_1SjSWGG3QDdai0ZhIluFz2T3',
      yearlyPriceId: 'price_1SjSc8G3QDdai0ZhzV24N11l',
    },
    {
      id: 'commuter',
      name: 'Commuter',
      monthlyPrice: 7.99,
      yearlyPrice: 79.99,
      credits: 25,
      features: [
        '25 credits per month',
        'Access to all stories',
        'Save to wishlist',
        'Track your progress',
      ],
      popular: true,
      monthlyPriceId: 'price_1SjShgG3QDdai0ZhpLpMLBig',
      yearlyPriceId: 'price_1SjSj1G3QDdai0ZhSETd2rcS',
    },
    {
      id: 'road-warrior',
      name: 'Road Warrior',
      monthlyPrice: 14.99,
      yearlyPrice: 149.99,
      credits: -1, // -1 means unlimited
      features: [
        'Unlimited credits',
        'Access to all stories',
        'Save to wishlist',
        'Track your progress',
        'Early access to new releases',
      ],
      popular: false,
      monthlyPriceId: 'price_1SjSkJG3QDdai0ZhEqPaFOmU',
      yearlyPriceId: 'price_1SjSlRG3QDdai0ZhD10RJ0sl',
    },
  ]

  // Freedom Packs (one-time purchase)
  const freedomPacks = [
    {
      id: 'small-pack',
      name: 'Small Pack',
      price: 4.99,
      credits: 10,
      priceId: 'price_1SjSxEG3QDdai0Zhi0BbuzED',
    },
    {
      id: 'medium-pack',
      name: 'Medium Pack',
      price: 9.99,
      credits: 25,
      priceId: 'price_1SjSydG3QDdai0ZhUIYLwgzw',
    },
    {
      id: 'large-pack',
      name: 'Large Pack',
      price: 19.99,
      credits: 60,
      priceId: 'price_1SjT2LG3QDdai0ZhyG3JTuGY',
      bestValue: true,
    },
  ]

  const handleSelectPlan = (planId: string, priceId: string) => {
    router.push(`/signup?plan=${planId}&billing=${billingCycle}&priceId=${priceId}&type=subscription`)
  }

  const handleSelectPack = (packId: string, priceId: string) => {
    router.push(`/signup?plan=${packId}&priceId=${priceId}&type=one-time`)
  }

  // Logo component
  const Logo = () => (
    <div className="flex items-center justify-center gap-2">
      <svg width="50" height="30" viewBox="0 0 80 48" fill="none" xmlns="http://www.w3.org/2000/svg">
        <g>
          <rect x="45" y="24" width="30" height="14" rx="3" fill="#f97316"/>
          <path d="M52 24 L56 16 L68 16 L72 24" fill="#f97316"/>
          <path d="M54 23 L57 17 L67 17 L70 23" fill="#1e293b"/>
          <circle cx="54" cy="38" r="5" fill="#334155"/>
          <circle cx="54" cy="38" r="2.5" fill="#64748b"/>
          <circle cx="68" cy="38" r="5" fill="#334155"/>
          <circle cx="68" cy="38" r="2.5" fill="#64748b"/>
          <rect x="73" y="28" width="3" height="4" rx="1" fill="#fef08a"/>
        </g>
        <g>
          <rect x="2" y="20" width="18" height="18" rx="3" fill="#3b82f6"/>
          <path d="M5 20 L8 12 L17 12 L20 20" fill="#3b82f6"/>
          <path d="M7 19 L9 13 L16 13 L18 19" fill="#1e293b"/>
          <rect x="20" y="18" width="22" height="20" rx="2" fill="#60a5fa"/>
          <circle cx="10" cy="38" r="5" fill="#334155"/>
          <circle cx="10" cy="38" r="2.5" fill="#64748b"/>
          <circle cx="32" cy="38" r="5" fill="#334155"/>
          <circle cx="32" cy="38" r="2.5" fill="#64748b"/>
        </g>
      </svg>
      <div className="flex items-baseline">
        <span className="text-lg font-bold text-white">Drive Time </span>
        <span className="text-lg font-bold text-orange-500">Tales</span>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="max-w-4xl mx-auto px-4 py-6">
        
        {/* Header */}
        <div className="flex justify-center mb-6">
          <Link href="/welcome">
            <Logo />
          </Link>
        </div>

        {/* Title */}
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-white mb-2">Choose Your Plan</h1>
          <p className="text-slate-400 text-sm">Unlock audio stories for your commute</p>
        </div>

        {/* Billing Toggle */}
        <div className="flex justify-center mb-6">
          <div className="bg-slate-800 rounded-full p-1 flex">
            <button
              onClick={() => setBillingCycle('monthly')}
              className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                billingCycle === 'monthly'
                  ? 'bg-orange-500 text-black'
                  : 'text-white hover:text-orange-400'
              }`}
            >
              Monthly
            </button>
            <button
              onClick={() => setBillingCycle('yearly')}
              className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                billingCycle === 'yearly'
                  ? 'bg-orange-500 text-black'
                  : 'text-white hover:text-orange-400'
              }`}
            >
              Yearly
              <span className="ml-1 text-green-400 text-xs">Save 17%</span>
            </button>
          </div>
        </div>

        {/* Subscription Plans */}
        <div className="space-y-4 mb-8">
          {plans.map((plan) => {
            const price = billingCycle === 'monthly' ? plan.monthlyPrice : plan.yearlyPrice
            const priceId = billingCycle === 'monthly' ? plan.monthlyPriceId : plan.yearlyPriceId
            const perMonth = billingCycle === 'yearly' ? (plan.yearlyPrice / 12).toFixed(2) : plan.monthlyPrice
            
            return (
              <div
                key={plan.id}
                className={`relative rounded-2xl p-4 border-2 transition-all ${
                  plan.popular
                    ? 'border-orange-500 bg-slate-900'
                    : 'border-slate-700 bg-slate-900/50'
                }`}
              >
                {/* Popular badge */}
                {plan.popular && (
                  <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                    <span className="bg-orange-500 text-black text-xs font-bold px-3 py-1 rounded-full">
                      MOST POPULAR
                    </span>
                  </div>
                )}

                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-bold text-white">{plan.name}</h3>
                    <p className="text-slate-400 text-sm">
                      {plan.credits === -1 ? 'Unlimited' : plan.credits} credits/month
                    </p>
                  </div>
                  
                  <div className="text-right">
                    <div className="flex items-baseline gap-1">
                      <span className="text-2xl font-bold text-white">${price}</span>
                      <span className="text-slate-400 text-sm">/{billingCycle === 'monthly' ? 'mo' : 'yr'}</span>
                    </div>
                    {billingCycle === 'yearly' && (
                      <p className="text-green-400 text-xs">${perMonth}/mo</p>
                    )}
                  </div>
                </div>

                {/* Features */}
                <ul className="mt-3 space-y-1">
                  {plan.features.slice(0, 3).map((feature, index) => (
                    <li key={index} className="flex items-center gap-2 text-sm text-slate-300">
                      <span className="text-green-400">✓</span>
                      {feature}
                    </li>
                  ))}
                </ul>

                {/* Select button */}
                <button
                  onClick={() => handleSelectPlan(plan.id, priceId)}
                  className={`w-full mt-4 py-3 rounded-xl font-semibold transition-colors ${
                    plan.popular
                      ? 'bg-orange-500 hover:bg-orange-400 text-black'
                      : 'bg-slate-700 hover:bg-slate-600 text-white'
                  }`}
                >
                  Get {plan.name}
                </button>
              </div>
            )
          })}
        </div>

        {/* Freedom Packs Section */}
        <div className="mb-8">
          <div className="text-center mb-4">
            <h2 className="text-xl font-bold text-white mb-1">Freedom Packs</h2>
            <p className="text-slate-400 text-sm">One-time purchase, no subscription required</p>
          </div>

          <div className="grid grid-cols-3 gap-3">
            {freedomPacks.map((pack) => (
              <div
                key={pack.id}
                className={`relative rounded-xl p-3 border-2 transition-all ${
                  pack.bestValue
                    ? 'border-green-500 bg-slate-900'
                    : 'border-slate-700 bg-slate-900/50'
                }`}
              >
                {pack.bestValue && (
                  <div className="absolute -top-2 left-1/2 transform -translate-x-1/2">
                    <span className="bg-green-500 text-black text-[10px] font-bold px-2 py-0.5 rounded-full">
                      BEST VALUE
                    </span>
                  </div>
                )}

                <div className="text-center">
                  <h3 className="text-sm font-bold text-white">{pack.name}</h3>
                  <p className="text-2xl font-bold text-white mt-1">${pack.price}</p>
                  <p className="text-orange-400 text-sm font-medium">{pack.credits} credits</p>
                  
                  <button
                    onClick={() => handleSelectPack(pack.id, pack.priceId)}
                    className={`w-full mt-3 py-2 rounded-lg font-semibold text-sm transition-colors ${
                      pack.bestValue
                        ? 'bg-green-500 hover:bg-green-400 text-black'
                        : 'bg-slate-700 hover:bg-slate-600 text-white'
                    }`}
                  >
                    Buy Now
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Already have account */}
        <p className="text-center text-slate-400 text-sm">
          Already have an account?{' '}
          <Link href="/signin" className="text-orange-400 hover:underline font-medium">
            Sign In
          </Link>
        </p>

        {/* Back to stories */}
        <p className="text-center mt-4">
          <Link href="/welcome" className="text-slate-500 text-sm hover:text-white">
            ← Back to free stories
          </Link>
        </p>
      </div>
    </div>
  )
}
