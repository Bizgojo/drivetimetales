'use client'
import StickyHeaderFull from '@/components/StickyHeaderFull'

import Link from 'next/link'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'

interface Invoice {
  id: string
  amount: number
  date: string
  description: string
}

const PLAN_DETAILS: Record<string, { name: string; price: string }> = {
  'free': { name: 'Free', price: '$0' },
  'founding_member': { name: 'Founding Member', price: '$2.99/mo' },
  'standard': { name: 'Unlimited', price: '$7.99/mo' },
  // Legacy plan names (kept for backward compat)
  'test_driver': { name: 'Founding Member', price: '$2.99/mo' },
  'commuter': { name: 'Unlimited', price: '$7.99/mo' },
  'road_warrior': { name: 'Unlimited', price: '$7.99/mo' },
}

export default function BillingPage() {
  const { user } = useAuth()
  const router = useRouter()
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

  const userAny = user as any
  const planKey = userAny?.plan || userAny?.subscription_type || 'free'
  const plan = PLAN_DETAILS[planKey] || PLAN_DETAILS['free']
  const hasSubscription = planKey && planKey !== 'free'

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-center">
          <p className="text-slate-400 mb-4">Please sign in to view billing</p>
          <Link href="/signin" className="text-orange-400 hover:text-orange-300">
            Sign In
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-950">
      <StickyHeaderFull />
      
      <main className="p-4 space-y-6 pb-24">
        <section className="bg-slate-800 rounded-xl p-4">
          <h2 className="text-white font-semibold mb-3">Current Plan</h2>
          <div className="flex justify-between items-center">
            <div>
              <p className="text-orange-400 font-bold text-lg">{plan.name}</p>
              <p className="text-slate-400 text-sm">{plan.price}/month</p>
            </div>
            <div className="text-right">
              <p className="text-slate-400 text-sm">Active</p>
            </div>
          </div>
        </section>

        <section className="bg-slate-800 rounded-xl p-4">
          <h2 className="text-white font-semibold mb-3">Payment Method</h2>
          <button
            onClick={handleManagePayment}
            className="w-full py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors"
          >
            Manage Payment Method
          </button>
        </section>

        <section className="bg-slate-800 rounded-xl p-4">
          <h2 className="text-white font-semibold mb-3">Purchase History</h2>
          {loading ? (
            <p className="text-slate-500 text-center py-4">Loading...</p>
          ) : invoices.length > 0 ? (
            <>
              <div className="space-y-2">
                {invoices.map((invoice) => (
                  <div key={invoice.id} className="flex justify-between text-sm">
                    <span className="text-slate-400">{invoice.date}</span>
                    <span className="text-slate-300">{invoice.description}</span>
                    <p className="text-white">${(invoice.amount / 100).toFixed(2)}</p>
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

        {/* Cancel Subscription Link */}
        {hasSubscription && (
          <div className="pt-4 text-center">
            <Link 
              href="/account/cancel"
              className="text-red-400 text-sm hover:text-red-300"
            >
              Cancel Subscription
            </Link>
          </div>
        )}
      </main>
    </div>
  )
}
