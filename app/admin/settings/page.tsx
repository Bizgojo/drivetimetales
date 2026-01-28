'use client'

import { useState, useEffect } from 'react'

interface Settings {
  review_credits_per_review: string
  review_credits_max_reviews: string
}

export default function AdminSettingsPage() {
  const [settings, setSettings] = useState<Settings>({
    review_credits_per_review: '2',
    review_credits_max_reviews: '10'
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    loadSettings()
  }, [])

  async function loadSettings() {
    try {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL
      const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
      if (!url || !key) return

      const response = await fetch(
        `${url}/rest/v1/dtt_settings?key=in.(review_credits_per_review,review_credits_max_reviews)&select=key,value`,
        { headers: { 'apikey': key, 'Authorization': `Bearer ${key}` } }
      )

      if (response.ok) {
        const data = await response.json()
        const newSettings: Settings = { ...settings }
        data.forEach((item: { key: string; value: string }) => {
          if (item.key in newSettings) {
            newSettings[item.key as keyof Settings] = item.value
          }
        })
        setSettings(newSettings)
      }
    } catch (error) {
      console.error('Error loading settings:', error)
    } finally {
      setLoading(false)
    }
  }

  async function saveSettings() {
    setSaving(true)
    try {
      const response = await fetch('/api/admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings })
      })

      if (response.ok) {
        alert('Settings saved successfully!')
      } else {
        alert('Failed to save settings')
      }
    } catch (error) {
      console.error('Error saving settings:', error)
      alert('Failed to save settings')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div style={{ padding: '2rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: '#64748b' }}>Loading settings...</p>
      </div>
    )
  }

  return (
    <div style={{ padding: '2rem', backgroundColor: '#FAF9F6', minHeight: '100vh' }}>
      <h1 style={{ fontSize: '28px', fontWeight: 'bold', color: '#1e293b', marginBottom: '0.5rem' }}>
        ⚙️ Settings
      </h1>
      <p style={{ color: '#64748b', marginBottom: '2rem' }}>Configure app settings and rewards</p>

      {/* Review Rewards Section */}
      <div style={{ 
        backgroundColor: 'white', 
        border: '1px solid #e2e8f0', 
        borderRadius: '12px', 
        padding: '1.5rem',
        maxWidth: '600px',
        marginBottom: '1.5rem'
      }}>
        <h2 style={{ fontSize: '18px', fontWeight: 600, color: '#1e293b', marginBottom: '1rem' }}>
          ⭐ Review Rewards
        </h2>
        <p style={{ color: '#64748b', fontSize: '14px', marginBottom: '1.5rem' }}>
          Configure how many credits users earn for leaving reviews.
        </p>

        <div style={{ marginBottom: '1.5rem' }}>
          <label style={{ display: 'block', color: '#1e293b', fontWeight: 500, marginBottom: '0.5rem' }}>
            Credits Per Review
          </label>
          <p style={{ color: '#64748b', fontSize: '13px', marginBottom: '0.5rem' }}>
            How many credits a user earns for each review they submit.
          </p>
          <input
            type="number"
            min="0"
            max="100"
            value={settings.review_credits_per_review}
            onChange={(e) => setSettings({ ...settings, review_credits_per_review: e.target.value })}
            style={{
              width: '120px',
              padding: '10px 14px',
              border: '1px solid #e2e8f0',
              borderRadius: '8px',
              fontSize: '16px',
              color: '#1e293b'
            }}
          />
        </div>

        <div style={{ marginBottom: '1.5rem' }}>
          <label style={{ display: 'block', color: '#1e293b', fontWeight: 500, marginBottom: '0.5rem' }}>
            Maximum Credited Reviews
          </label>
          <p style={{ color: '#64748b', fontSize: '13px', marginBottom: '0.5rem' }}>
            Maximum number of reviews a user can earn credits for (to prevent abuse).
          </p>
          <input
            type="number"
            min="1"
            max="1000"
            value={settings.review_credits_max_reviews}
            onChange={(e) => setSettings({ ...settings, review_credits_max_reviews: e.target.value })}
            style={{
              width: '120px',
              padding: '10px 14px',
              border: '1px solid #e2e8f0',
              borderRadius: '8px',
              fontSize: '16px',
              color: '#1e293b'
            }}
          />
        </div>

        <div style={{ 
          backgroundColor: '#f8fafc', 
          borderRadius: '8px', 
          padding: '1rem',
          marginBottom: '1.5rem'
        }}>
          <p style={{ color: '#64748b', fontSize: '13px' }}>
            <strong>Example:</strong> With current settings, a user can earn up to{' '}
            <span style={{ color: '#f97316', fontWeight: 600 }}>
              {parseInt(settings.review_credits_per_review) * parseInt(settings.review_credits_max_reviews)} credits
            </span>{' '}
            total from reviews ({settings.review_credits_per_review} credits × {settings.review_credits_max_reviews} reviews).
          </p>
        </div>

        <button
          onClick={saveSettings}
          disabled={saving}
          style={{
            padding: '12px 24px',
            backgroundColor: saving ? '#cbd5e1' : '#f97316',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            fontWeight: 600,
            cursor: saving ? 'not-allowed' : 'pointer',
            fontSize: '14px'
          }}
        >
          {saving ? 'Saving...' : 'Save Settings'}
        </button>
      </div>
    </div>
  )
}
