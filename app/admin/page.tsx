'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { AdminNewsGenerator } from '@/components/news';
import { supabase } from '@/lib/supabase'

type TabType = 'overview' | 'stories' | 'users' | 'financial' | 'settings'

interface Story {
  id: string
  title: string
  author: string
  genre: string
  duration_mins: number
  credits: number
  ai_rating: number
  release_date: string
  play_count?: number
  completion_rate?: number
}

interface User {
  id: string
  email: string
  display_name: string
  subscription_status: string
  subscription_plan: string
  credits: number
  created_at: string
  last_login: string
}

export default function AdminPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [isAdmin, setIsAdmin] = useState(false)
  const [activeTab, setActiveTab] = useState<TabType>('overview')
  
  // Overview Stats
  const [stats, setStats] = useState({
    totalUsers: 0,
    newUsersThisMonth: 0,
    activeSubscribers: 0,
    totalStories: 0,
    totalPlays: 0,
    totalRevenue: 0,
    monthlyRevenue: 0,
  })

  // Story Data
  const [stories, setStories] = useState<Story[]>([])
  const [storySort, setStorySort] = useState<'plays' | 'rating' | 'recent'>('recent')

  // User Data
  const [users, setUsers] = useState<User[]>([])
  const [userFilter, setUserFilter] = useState<'all' | 'subscribers' | 'free'>('all')

  // Financial Data
  const [financialData, setFinancialData] = useState({
    testDriverCount: 0,
    commuterCount: 0,
    roadWarriorCount: 0,
    freedomPacksSold: 0,
    testDriverRevenue: 0,
    commuterRevenue: 0,
    roadWarriorRevenue: 0,
    freedomPacksRevenue: 0,
  })

  // Settings
  const [settings, setSettings] = useState({
    showFreedomPacks: true,
    showAnnualPlans: true,
    freeCreditsForNewcomers: 2,
    maintenanceMode: false,
  })
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null)

  useEffect(() => {
    async function loadAdminData() {
      const { data: { session } } = await supabase.auth.getSession()
      
      if (!session) {
        router.push('/signin')
        return
      }

      // Check if user is admin
      const { data: userData } = await supabase
        .from('users')
        .select('*')
        .eq('id', session.user.id)
        .single()
      
      // For now, allow access if user exists (you can add role check later)
      if (!userData) {
        router.push('/home')
        return
      }

      setIsAdmin(true)

      // Load all data
      await Promise.all([
        loadOverviewStats(),
        loadStories(),
        loadUsers(),
        loadFinancialData(),
        loadSettings(),
      ])

      setLoading(false)
    }

    loadAdminData()
  }, [router])

  const loadOverviewStats = async () => {
    const { count: totalUsers } = await supabase
      .from('users')
      .select('*', { count: 'exact', head: true })

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
    const { count: newUsersThisMonth } = await supabase
      .from('users')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', thirtyDaysAgo)

    const { count: activeSubscribers } = await supabase
      .from('users')
      .select('*', { count: 'exact', head: true })
      .eq('subscription_status', 'active')

    const { count: totalStories } = await supabase
      .from('stories')
      .select('*', { count: 'exact', head: true })

    setStats(prev => ({
      ...prev,
      totalUsers: totalUsers || 0,
      newUsersThisMonth: newUsersThisMonth || 0,
      activeSubscribers: activeSubscribers || 0,
      totalStories: totalStories || 0,
    }))
  }

  const loadStories = async () => {
    const { data } = await supabase
      .from('stories')
      .select('*')
      .order('release_date', { ascending: false })

    if (data) {
      setStories(data)
    }
  }

  const loadUsers = async () => {
    const { data } = await supabase
      .from('users')
      .select('*')
      .order('created_at', { ascending: false })

    if (data) {
      setUsers(data)
    }
  }

  const loadFinancialData = async () => {
    // Count by subscription plan
    const { count: testDriverCount } = await supabase
      .from('users')
      .select('*', { count: 'exact', head: true })
      .eq('subscription_plan', 'test-driver')
      .eq('subscription_status', 'active')

    const { count: commuterCount } = await supabase
      .from('users')
      .select('*', { count: 'exact', head: true })
      .eq('subscription_plan', 'commuter')
      .eq('subscription_status', 'active')

    const { count: roadWarriorCount } = await supabase
      .from('users')
      .select('*', { count: 'exact', head: true })
      .eq('subscription_plan', 'road-warrior')
      .eq('subscription_status', 'active')

    setFinancialData({
      testDriverCount: testDriverCount || 0,
      commuterCount: commuterCount || 0,
      roadWarriorCount: roadWarriorCount || 0,
      freedomPacksSold: 0, // Would need a purchases table to track this
      testDriverRevenue: (testDriverCount || 0) * 2.99,
      commuterRevenue: (commuterCount || 0) * 7.99,
      roadWarriorRevenue: (roadWarriorCount || 0) * 14.99,
      freedomPacksRevenue: 0,
    })
  }

  const loadSettings = async () => {
    const { data } = await supabase
      .from('app_settings')
      .select('*')
      .single()

    if (data) {
      setSettings({
        showFreedomPacks: data.show_freedom_packs ?? true,
        showAnnualPlans: data.show_annual_plans ?? true,
        freeCreditsForNewcomers: data.free_credits_newcomers ?? 2,
        maintenanceMode: data.maintenance_mode ?? false,
      })
    }
  }

  const handleSaveSettings = async () => {
    setSaving(true)
    setMessage(null)

    try {
      const { error } = await supabase
        .from('app_settings')
        .upsert({
          id: 1,
          show_freedom_packs: settings.showFreedomPacks,
          show_annual_plans: settings.showAnnualPlans,
          free_credits_newcomers: settings.freeCreditsForNewcomers,
          maintenance_mode: settings.maintenanceMode,
          updated_at: new Date().toISOString(),
        })

      if (error) throw error
      setMessage({ type: 'success', text: 'Settings saved successfully!' })
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to save settings' })
    }

    setSaving(false)
  }

  // Filter users based on selection
  const filteredUsers = users.filter(user => {
    if (userFilter === 'subscribers') return user.subscription_status === 'active'
    if (userFilter === 'free') return user.subscription_status !== 'active'
    return true
  })

  // Sort stories based on selection
  const sortedStories = [...stories].sort((a, b) => {
    if (storySort === 'rating') return (b.ai_rating || 0) - (a.ai_rating || 0)
    if (storySort === 'plays') return (b.play_count || 0) - (a.play_count || 0)
    return new Date(b.release_date).getTime() - new Date(a.release_date).getTime()
  })

  const Toggle = ({ enabled, onChange, label }: { enabled: boolean, onChange: () => void, label: string }) => (
    <div className="flex items-center justify-between py-3 border-b border-slate-700">
      <span className="text-white">{label}</span>
      <button
        onClick={onChange}
        className={`relative w-12 h-6 rounded-full transition-colors ${
          enabled ? 'bg-green-500' : 'bg-slate-600'
        }`}
      >
        <span
          className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${
            enabled ? 'right-1' : 'left-1'
          }`}
        />
      </button>
    </div>
  )

  const Logo = () => (
    <div className="flex items-center gap-2">
      <svg width="40" height="24" viewBox="0 0 80 48" fill="none" xmlns="http://www.w3.org/2000/svg">
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
        <span className="text-base font-bold text-white">Drive Time </span>
        <span className="text-base font-bold text-orange-500">Tales</span>
      </div>
    </div>
  )

  const TabButton = ({ tab, label, icon }: { tab: TabType, label: string, icon: string }) => (
    <button
      onClick={() => setActiveTab(tab)}
      className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
        activeTab === tab
          ? 'bg-orange-500 text-black'
          : 'bg-slate-800 text-white hover:bg-slate-700'
      }`}
    >
      <span>{icon}</span>
      <span className="hidden sm:inline">{label}</span>
    </button>
  )

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="inline-block w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!isAdmin) return null

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="max-w-6xl mx-auto px-4 py-6">
        
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <Logo />
            <span className="text-slate-500">|</span>
            <h1 className="text-xl font-bold text-white">Admin Dashboard</h1>
          </div>
          <Link href="/home" className="text-orange-400 text-sm hover:underline">
            ← Back to App
          </Link>
        </div>

        {/* Tab Navigation */}
        <div className="flex flex-wrap gap-2 mb-6">
          <TabButton tab="overview" label="Overview" icon="📊" />
          <TabButton tab="stories" label="Stories" icon="📚" />
          <TabButton tab="users" label="Users" icon="👥" />
          <TabButton tab="financial" label="Financial" icon="💰" />
          <TabButton tab="settings" label="Settings" icon="⚙️" />
        </div>

        {/* OVERVIEW TAB */}
        {activeTab === 'overview' && (
          <div>
            <h2 className="text-lg font-bold text-white mb-4">Dashboard Overview</h2>
            

            {/* Daily News Generator */}
            <AdminNewsGenerator />
            {/* Stats Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <div className="bg-slate-800 rounded-xl p-4">
                <p className="text-3xl font-bold text-white">{stats.totalUsers}</p>
                <p className="text-slate-400 text-sm">Total Users</p>
              </div>
              <div className="bg-slate-800 rounded-xl p-4">
                <p className="text-3xl font-bold text-green-400">{stats.newUsersThisMonth}</p>
                <p className="text-slate-400 text-sm">New This Month</p>
              </div>
              <div className="bg-slate-800 rounded-xl p-4">
                <p className="text-3xl font-bold text-orange-400">{stats.activeSubscribers}</p>
                <p className="text-slate-400 text-sm">Active Subscribers</p>
              </div>
              <div className="bg-slate-800 rounded-xl p-4">
                <p className="text-3xl font-bold text-blue-400">{stats.totalStories}</p>
                <p className="text-slate-400 text-sm">Total Stories</p>
              </div>
            </div>

            {/* Quick Stats */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-slate-900 rounded-xl p-4 border border-slate-800">
                <h3 className="text-white font-semibold mb-3">Subscription Breakdown</h3>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Test Driver</span>
                    <span className="text-white font-medium">{financialData.testDriverCount}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Commuter</span>
                    <span className="text-white font-medium">{financialData.commuterCount}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Road Warrior</span>
                    <span className="text-white font-medium">{financialData.roadWarriorCount}</span>
                  </div>
                </div>
              </div>

              <div className="bg-slate-900 rounded-xl p-4 border border-slate-800">
                <h3 className="text-white font-semibold mb-3">Monthly Revenue (Est.)</h3>
                <p className="text-3xl font-bold text-green-400">
                  ${(financialData.testDriverRevenue + financialData.commuterRevenue + financialData.roadWarriorRevenue).toFixed(2)}
                </p>
                <p className="text-slate-500 text-sm mt-1">Based on active subscriptions</p>
              </div>
            </div>
          </div>
        )}

        {/* STORIES TAB */}
        {activeTab === 'stories' && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-white">Story Data</h2>
              <div className="flex gap-2">
                <select
                  value={storySort}
                  onChange={(e) => setStorySort(e.target.value as any)}
                  className="px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm"
                >
                  <option value="recent">Most Recent</option>
                  <option value="rating">Highest Rated</option>
                  <option value="plays">Most Played</option>
                </select>
              </div>
            </div>

            {/* Stories Table */}
            <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-slate-800">
                    <tr>
                      <th className="text-left text-slate-400 text-xs font-medium px-4 py-3">Title</th>
                      <th className="text-left text-slate-400 text-xs font-medium px-4 py-3">Author</th>
                      <th className="text-left text-slate-400 text-xs font-medium px-4 py-3">Genre</th>
                      <th className="text-left text-slate-400 text-xs font-medium px-4 py-3">Duration</th>
                      <th className="text-left text-slate-400 text-xs font-medium px-4 py-3">Credits</th>
                      <th className="text-left text-slate-400 text-xs font-medium px-4 py-3">Rating</th>
                      <th className="text-left text-slate-400 text-xs font-medium px-4 py-3">Released</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedStories.map((story, index) => (
                      <tr key={story.id} className={index % 2 === 0 ? 'bg-slate-900' : 'bg-slate-800/50'}>
                        <td className="px-4 py-3 text-white text-sm font-medium">{story.title}</td>
                        <td className="px-4 py-3 text-slate-400 text-sm">{story.author}</td>
                        <td className="px-4 py-3 text-slate-400 text-sm">{story.genre}</td>
                        <td className="px-4 py-3 text-slate-400 text-sm">{story.duration_mins}m</td>
                        <td className="px-4 py-3 text-slate-400 text-sm">{story.credits}</td>
                        <td className="px-4 py-3 text-yellow-400 text-sm">★ {story.ai_rating?.toFixed(1) || 'N/A'}</td>
                        <td className="px-4 py-3 text-slate-400 text-sm">
                          {new Date(story.release_date).toLocaleDateString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <p className="text-slate-500 text-sm mt-3">Total: {stories.length} stories</p>
          </div>
        )}

        {/* USERS TAB */}
        {activeTab === 'users' && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-white">User Data</h2>
              <div className="flex gap-2">
                <select
                  value={userFilter}
                  onChange={(e) => setUserFilter(e.target.value as any)}
                  className="px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm"
                >
                  <option value="all">All Users</option>
                  <option value="subscribers">Subscribers Only</option>
                  <option value="free">Free Users Only</option>
                </select>
              </div>
            </div>

            {/* Users Table */}
            <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-slate-800">
                    <tr>
                      <th className="text-left text-slate-400 text-xs font-medium px-4 py-3">Name</th>
                      <th className="text-left text-slate-400 text-xs font-medium px-4 py-3">Email</th>
                      <th className="text-left text-slate-400 text-xs font-medium px-4 py-3">Plan</th>
                      <th className="text-left text-slate-400 text-xs font-medium px-4 py-3">Status</th>
                      <th className="text-left text-slate-400 text-xs font-medium px-4 py-3">Credits</th>
                      <th className="text-left text-slate-400 text-xs font-medium px-4 py-3">Joined</th>
                      <th className="text-left text-slate-400 text-xs font-medium px-4 py-3">Last Login</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredUsers.map((user, index) => (
                      <tr key={user.id} className={index % 2 === 0 ? 'bg-slate-900' : 'bg-slate-800/50'}>
                        <td className="px-4 py-3 text-white text-sm font-medium">{user.display_name || 'N/A'}</td>
                        <td className="px-4 py-3 text-slate-400 text-sm">{user.email}</td>
                        <td className="px-4 py-3 text-sm">
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                            user.subscription_plan === 'road-warrior' ? 'bg-purple-500/20 text-purple-400' :
                            user.subscription_plan === 'commuter' ? 'bg-blue-500/20 text-blue-400' :
                            user.subscription_plan === 'test-driver' ? 'bg-green-500/20 text-green-400' :
                            'bg-slate-700 text-slate-400'
                          }`}>
                            {user.subscription_plan || 'Free'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm">
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                            user.subscription_status === 'active' ? 'bg-green-500/20 text-green-400' : 'bg-slate-700 text-slate-400'
                          }`}>
                            {user.subscription_status || 'None'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-400 text-sm">
                          {user.credits === -1 ? '∞' : user.credits || 0}
                        </td>
                        <td className="px-4 py-3 text-slate-400 text-sm">
                          {user.created_at ? new Date(user.created_at).toLocaleDateString() : 'N/A'}
                        </td>
                        <td className="px-4 py-3 text-slate-400 text-sm">
                          {user.last_login ? new Date(user.last_login).toLocaleDateString() : 'Never'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <p className="text-slate-500 text-sm mt-3">Showing: {filteredUsers.length} users</p>
          </div>
        )}

        {/* FINANCIAL TAB */}
        {activeTab === 'financial' && (
          <div>
            <h2 className="text-lg font-bold text-white mb-4">Financial Data</h2>

            {/* Revenue Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              <div className="bg-gradient-to-br from-green-500/20 to-green-600/10 rounded-xl p-6 border border-green-500/30">
                <p className="text-green-400 text-sm font-medium mb-1">Estimated Monthly Revenue</p>
                <p className="text-4xl font-bold text-white">
                  ${(financialData.testDriverRevenue + financialData.commuterRevenue + financialData.roadWarriorRevenue + financialData.freedomPacksRevenue).toFixed(2)}
                </p>
              </div>
              <div className="bg-gradient-to-br from-orange-500/20 to-orange-600/10 rounded-xl p-6 border border-orange-500/30">
                <p className="text-orange-400 text-sm font-medium mb-1">Total Active Subscribers</p>
                <p className="text-4xl font-bold text-white">
                  {financialData.testDriverCount + financialData.commuterCount + financialData.roadWarriorCount}
                </p>
              </div>
            </div>

            {/* Revenue Breakdown */}
            <div className="bg-slate-900 rounded-xl p-4 border border-slate-800 mb-6">
              <h3 className="text-white font-semibold mb-4">Subscription Revenue Breakdown</h3>
              <div className="space-y-4">
                <div>
                  <div className="flex justify-between mb-1">
                    <span className="text-slate-400">Test Driver ($2.99/mo)</span>
                    <span className="text-white">{financialData.testDriverCount} subscribers = ${financialData.testDriverRevenue.toFixed(2)}/mo</span>
                  </div>
                  <div className="h-2 bg-slate-700 rounded-full">
                    <div className="h-full bg-green-500 rounded-full" style={{ width: `${(financialData.testDriverCount / Math.max(stats.activeSubscribers, 1)) * 100}%` }} />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between mb-1">
                    <span className="text-slate-400">Commuter ($7.99/mo)</span>
                    <span className="text-white">{financialData.commuterCount} subscribers = ${financialData.commuterRevenue.toFixed(2)}/mo</span>
                  </div>
                  <div className="h-2 bg-slate-700 rounded-full">
                    <div className="h-full bg-blue-500 rounded-full" style={{ width: `${(financialData.commuterCount / Math.max(stats.activeSubscribers, 1)) * 100}%` }} />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between mb-1">
                    <span className="text-slate-400">Road Warrior ($14.99/mo)</span>
                    <span className="text-white">{financialData.roadWarriorCount} subscribers = ${financialData.roadWarriorRevenue.toFixed(2)}/mo</span>
                  </div>
                  <div className="h-2 bg-slate-700 rounded-full">
                    <div className="h-full bg-purple-500 rounded-full" style={{ width: `${(financialData.roadWarriorCount / Math.max(stats.activeSubscribers, 1)) * 100}%` }} />
                  </div>
                </div>
              </div>
            </div>

            {/* Freedom Packs */}
            <div className="bg-slate-900 rounded-xl p-4 border border-slate-800">
              <h3 className="text-white font-semibold mb-4">Freedom Packs (One-Time Purchases)</h3>
              <p className="text-slate-400 text-sm">
                Freedom Pack purchase tracking requires a purchases table. 
                This will show sales data once integrated with Stripe webhooks.
              </p>
            </div>
          </div>
        )}

        {/* SETTINGS TAB */}
        {activeTab === 'settings' && (
          <div>
            <h2 className="text-lg font-bold text-white mb-4">App Settings</h2>

            {/* Pricing Settings */}
            <div className="bg-slate-900 rounded-xl p-4 mb-4 border border-slate-800">
              <h3 className="text-white font-semibold mb-4">Pricing Page</h3>
              <Toggle
                enabled={settings.showFreedomPacks}
                onChange={() => setSettings(s => ({ ...s, showFreedomPacks: !s.showFreedomPacks }))}
                label="Show Freedom Packs"
              />
              <Toggle
                enabled={settings.showAnnualPlans}
                onChange={() => setSettings(s => ({ ...s, showAnnualPlans: !s.showAnnualPlans }))}
                label="Show Annual Plans Toggle"
              />
            </div>

            {/* Newcomer Settings */}
            <div className="bg-slate-900 rounded-xl p-4 mb-4 border border-slate-800">
              <h3 className="text-white font-semibold mb-4">Newcomer Settings</h3>
              <div className="flex items-center justify-between py-3">
                <span className="text-white">Free Credits for Newcomers</span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setSettings(s => ({ ...s, freeCreditsForNewcomers: Math.max(0, s.freeCreditsForNewcomers - 1) }))}
                    className="w-8 h-8 bg-slate-700 hover:bg-slate-600 rounded-lg text-white font-bold"
                  >
                    -
                  </button>
                  <span className="w-8 text-center text-white font-bold">{settings.freeCreditsForNewcomers}</span>
                  <button
                    onClick={() => setSettings(s => ({ ...s, freeCreditsForNewcomers: Math.min(10, s.freeCreditsForNewcomers + 1) }))}
                    className="w-8 h-8 bg-slate-700 hover:bg-slate-600 rounded-lg text-white font-bold"
                  >
                    +
                  </button>
                </div>
              </div>
            </div>

            {/* System Settings */}
            <div className="bg-slate-900 rounded-xl p-4 mb-4 border border-slate-800">
              <h3 className="text-white font-semibold mb-4">System</h3>
              <Toggle
                enabled={settings.maintenanceMode}
                onChange={() => setSettings(s => ({ ...s, maintenanceMode: !s.maintenanceMode }))}
                label="Maintenance Mode"
              />
              {settings.maintenanceMode && (
                <p className="text-yellow-400 text-xs mt-2">
                  ⚠️ Users will see a maintenance message
                </p>
              )}
            </div>

            {/* Message */}
            {message && (
              <div className={`p-3 rounded-lg mb-4 text-sm text-center ${
                message.type === 'success' 
                  ? 'bg-green-500/20 text-green-400 border border-green-500/30' 
                  : 'bg-red-500/20 text-red-400 border border-red-500/30'
              }`}>
                {message.text}
              </div>
            )}

            {/* Save Button */}
            <button
              onClick={handleSaveSettings}
              disabled={saving}
              className={`w-full py-3 rounded-xl font-bold transition-colors ${
                saving
                  ? 'bg-slate-700 text-slate-500 cursor-not-allowed'
                  : 'bg-orange-500 hover:bg-orange-400 text-black'
              }`}
            >
              {saving ? 'Saving...' : 'Save Settings'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
