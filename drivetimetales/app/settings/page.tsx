'use client'

import Link from 'next/link'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { useStories } from '@/hooks/useData'

const tierNames: Record<string, { name: string; icon: string; color: string }> = {
  'free': { name: 'Free', icon: '🆓', color: 'text-slate-300' },
  'test_driver': { name: 'Test Driver', icon: '🚗', color: 'text-slate-300' },
  'commuter': { name: 'Commuter', icon: '🚙', color: 'text-orange-400' },
  'road_warrior': { name: 'Road Warrior', icon: '🚛', color: 'text-purple-400' },
}

export default function SettingsPage() {
  const router = useRouter()
  const { user, signOut } = useAuth()
  const { stories } = useStories()
  
  // Create story lookup
  const storyLookup: Record<string, any> = {}
  stories.forEach((story: any) => { storyLookup[story.id] = story })
  
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(user?.display_name || '')
  const [showClearConfirm, setShowClearConfirm] = useState(false)

  if (!user) {
    return (
      <div className="py-12 px-4 text-center">
        <span className="text-4xl block mb-3">🔐</span>
        <h2 className="text-xl font-bold text-white mb-3">Sign In Required</h2>
        <Link href="/signin" className="px-6 py-2 bg-orange-500 text-black font-semibold rounded-lg inline-block">Sign In</Link>
      </div>
    )
  }

  const tier = tierNames[user.subscription_type] || tierNames['free']

  const handleSaveName = () => {
    if (name.trim()) {
      setEditing(false)
    }
  }

  const handleClearHistory = () => {
    localStorage.removeItem('dtt_listening_history')
    window.location.reload()
  }

  const handleSignOut = async () => {
    await signOut()
    router.push('/')
  }

  return (
    <div className="py-8 px-4">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold text-white mb-6">Settings</h1>

        {/* Profile Section */}
        <section className="bg-slate-800/50 border border-slate-700 rounded-xl p-6 mb-6">
          <h2 className="text-lg font-semibold text-white mb-4">👤 Profile</h2>
          
          <div className="space-y-4">
            {/* Name */}
            <div>
              <label className="text-sm text-slate-400 block mb-1">Name</label>
              {editing ? (
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    className="flex-1 px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:border-orange-500"
                  />
                  <button onClick={handleSaveName} className="px-4 py-2 bg-green-600 text-white text-sm rounded-lg">Save</button>
                  <button onClick={() => { setEditing(false); setName(user.display_name || ''); }} className="px-4 py-2 bg-slate-700 text-white text-sm rounded-lg">Cancel</button>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <span className="text-white">{user.display_name || 'Not set'}</span>
                  <button onClick={() => setEditing(true)} className="text-orange-400 text-sm">Edit</button>
                </div>
              )}
            </div>

            {/* Email */}
            <div>
              <label className="text-sm text-slate-400 block mb-1">Email</label>
              <span className="text-white">{user.email}</span>
            </div>
          </div>
        </section>

        {/* Subscription Section */}
        <section className="bg-slate-800/50 border border-slate-700 rounded-xl p-6 mb-6">
          <h2 className="text-lg font-semibold text-white mb-4">💳 Subscription</h2>
          
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className={`font-semibold ${tier.color}`}>
                  {tier.icon} {tier.name}
                </p>
                <p className="text-sm text-slate-400">
                  {user.subscription_type === 'road_warrior' 
                    ? 'Unlimited streaming + downloads' 
                    : user.subscription_type === 'commuter'
                    ? 'Unlimited streaming'
                    : 'Pay per story with credits'}
                </p>
              </div>
              <Link href="/pricing" className="px-4 py-2 bg-orange-500 text-black text-sm font-semibold rounded-lg">
                {user.subscription_type === 'free' || user.subscription_type === 'test_driver' ? 'Upgrade' : 'Change Plan'}
              </Link>
            </div>

            {/* Credit balance */}
            <div className="p-3 bg-slate-900/50 rounded-lg">
              <div className="flex items-center justify-between">
                <span className="text-slate-400 text-sm">Credit Balance</span>
                <span className="text-green-400 font-semibold">{user.credits} credits</span>
              </div>
              <p className="text-xs text-slate-500 mt-1">1 credit = 15 minutes • Credits never expire</p>
            </div>

            {/* Subscription end date if applicable */}
            {user.subscription_ends_at && (
              <div className="p-3 bg-slate-900/50 rounded-lg">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400 text-sm">Subscription Renews</span>
                  <span className="text-white">{new Date(user.subscription_ends_at).toLocaleDateString()}</span>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Listening History Section */}
        <section className="bg-slate-800/50 border border-slate-700 rounded-xl p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-white">📊 Listening History</h2>
          </div>
          <p className="text-slate-400 text-sm">No listening history yet</p>
        </section>

        {/* Device Section */}
        <section className="bg-slate-800/50 border border-slate-700 rounded-xl p-6 mb-6">
          <h2 className="text-lg font-semibold text-white mb-4">📱 This Device</h2>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-white text-sm">Device recognized</p>
              <p className="text-xs text-slate-400">You'll be automatically signed in on this device</p>
            </div>
            <span className="text-green-400">✓ Active</span>
          </div>
        </section>

        {/* Sign Out */}
        <section className="bg-slate-800/50 border border-slate-700 rounded-xl p-6">
          <button 
            onClick={handleSignOut}
            className="w-full py-3 bg-red-600/20 border border-red-600/50 text-red-400 font-semibold rounded-xl hover:bg-red-600/30"
          >
            Sign Out
          </button>
          <p className="text-xs text-slate-500 text-center mt-2">
            This will remove device recognition. You'll need to verify your email to sign back in.
          </p>
        </section>
      </div>
    </div>
  )
}
