'use client'

import Link from 'next/link'
import { useState, useEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { Header } from '@/components/ui/Header'

interface Invoice {
  id: string
  amount: number
  date: string
  description: string
}

const PLAN_DETAILS: Record<string, { name: string; price: string; credits: number }> = {
  'test_driver': { name: 'Test Driver', price: '$2.99', credits: 10 },
  'commuter': { name: 'Commuter', price: '$7.99', credits: 30 },
  'road_warrior': { name: 'Road Warrior', price: '$14.99', credits: -1 },
}

export default function BillingPage() {
  const { user } = useAuth()
  const [showCancelModal, setShowCancelModal] = useState(false)
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [totalSpent, setTotalSpent] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (user) {
      loadInvoices()
    }
  }, [user])

  async function loadInvoices() {
    try {
      const response = await fetch('/api/user/invoices')
      if (response.ok) {
        const data = await response.json()
        setInvoices(data.invoices || [])
        setTotalSpent(data.total || 0)
      }
    } catch (error) {
      console.error('Error loading invoices:', error)
    } finally {
      setLoading(false)
    }
  }

  async function handleManagePayment() {
    try {
      const response = await fetch('/api/user/portal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user?.id })
      })
      
      if (response.ok) {
        const { url } = await response.json()
        window.location.href = url
      }
    } catch (error) {
      console.error('Error opening portal:', error)
    }
  }

  const displayName = user?.display_name || user?.email?.split('@')[0]
  const planKey = user?.subscription_type || 'test_driver'
  const plan = PLAN_DETAILS[planKey] || PLAN_DETAILS['test_driver']
  const displayCredits = user?.credits === -1 ? '∞' : user?.credits

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-center">
          <p className="text-slate-400 mb-4">Please sign in to view billing</p>
          <Link href="/auth/login" className="text-orange-400 hover:text-orange-300">
            Sign In
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <Header 
        isLoggedIn={true} 
        showBack 
        userName={displayName} 
        userCredits={user.credits} 
      />

      <main className="px-4 py-6 max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold mb-6">Billing & Credits</h1>

        {/* Current Plan */}
        <section className="bg-slate-900 rounded-xl p-4 mb-6">
          <h2 className="text-sm text-slate-400 mb-2">Current Plan</h2>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xl font-bold text-white">{plan.name}</p>
              <p className="text-slate-400">{plan.price}/month</p>
            </div>
            <Link 
              href="/pricing"
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-sm transition"
            >
              Change Plan
            </Link>
          </div>
        </section>

        {/* Credits */}
        <section className="bg-slate-900 rounded-xl p-4 mb-6">
          <h2 className="text-sm text-slate-400 mb-2">Available Credits</h2>
          <div className="flex items-center justify-between">
            <p className="text-3xl font-bold text-orange-400">{displayCredits}</p>
            {plan.credits > 0 && (
              <p className="text-slate-400 text-sm">
                {plan.credits} credits/month with your plan
              </p>
            )}
            {plan.credits === -1 && (
              <p className="text-green-400 text-sm">Unlimited with Road Warrior</p>
            )}
          </div>
        </section>

        {/* Payment Method */}
        <section className="bg-slate-900 rounded-xl p-4 mb-6">
          <h2 className="text-sm text-slate-400 mb-2">Payment Method</h2>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-6 bg-slate-700 rounded flex items-center justify-center text-xs">
                💳
              </div>
              <span className="text-slate-300">•••• •••• •••• ••••</span>
            </div>
            <button 
              onClick={handleManagePayment}
              className="text-orange-400 hover:text-orange-300 text-sm transition"
            >
              Manage
            </button>
          </div>
        </section>

        {/* Purchase History */}
        <section className="bg-slate-900 rounded-xl p-4">
          <h2 className="text-sm text-slate-400 mb-4">Purchase History</h2>
          
          {loading ? (
            <div className="flex justify-center py-4">
              <div className="w-6 h-6 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : invoices.length > 0 ? (
            <>
              <div className="space-y-3 mb-4">
                {invoices.map(invoice => (
                  <div key={invoice.id} className="flex items-center justify-between py-2 border-b border-slate-800 last:border-0">
                    <div>
                      <p className="text-white text-sm">{invoice.description}</p>
                      <p className="text-slate-500 text-xs">{invoice.date}</p>
                    </div>
                    <p className="text-white font-medium">${(invoice.amount / 100).toFixed(2)}</p>
                  </div>
                ))}
              </div>
              <div className="pt-3 border-t border-slate-700">
                <div className="flex justify-between">
                  <span className="text-slate-400">Total Spent</span>
                  <span className="text-white font-bold">${(totalSpent / 100).toFixed(2)}</span>
                </div>
              </div>
            </>
          ) : (
            <p className="text-slate-500 text-center py-4">No purchase history yet</p>
          )}
        </section>
      </main>
    </div>
  )
}
