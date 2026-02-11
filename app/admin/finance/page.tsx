'use client'

import { useState, useEffect } from 'react'

// ============================================================================
// SERVICE DEFINITIONS
// ============================================================================
interface ServiceDef {
  name: string
  purpose: string
  loginUrl: string
  defaultCost: number
  billingType: 'monthly' | 'annual' | 'one-time' | 'usage-based'
  category: 'AI & Voice' | 'Infrastructure' | 'Audio Production' | 'Data & APIs' | 'Business Tools'
}

const SERVICES: ServiceDef[] = [
  {
    name: 'Anthropic (Claude)',
    purpose: 'AI scripting for news briefings, story adaptation, and content generation. Powers the news auto-generation system and assists with audio drama script writing.',
    loginUrl: 'https://console.anthropic.com',
    defaultCost: 0,
    billingType: 'monthly',
    category: 'AI & Voice',
  },
  {
    name: 'ElevenLabs',
    purpose: 'Text-to-speech voice generation for all audio dramas and news briefings. Pro plan provides 100,000 characters/month for narrator, announcer, and character voices.',
    loginUrl: 'https://elevenlabs.io/app',
    defaultCost: 0,
    billingType: 'monthly',
    category: 'AI & Voice',
  },
  {
    name: 'OpenAI',
    purpose: 'DALL-E image generation for audio drama cover art (~$0.04/image). Also used for ChatGPT assistance with content development.',
    loginUrl: 'https://platform.openai.com',
    defaultCost: 0,
    billingType: 'monthly',
    category: 'AI & Voice',
  },
  {
    name: 'Suno',
    purpose: 'AI music generation for background music, intro/outro music, and scene-based soundtracks for audio dramas.',
    loginUrl: 'https://suno.com',
    defaultCost: 0,
    billingType: 'monthly',
    category: 'AI & Voice',
  },
  {
    name: 'Supabase',
    purpose: 'PostgreSQL database and file storage backend for DTT website. Stores users, stories, news episodes, preferences, and audio/cover files.',
    loginUrl: 'https://supabase.com/dashboard',
    defaultCost: 0,
    billingType: 'monthly',
    category: 'Infrastructure',
  },
  {
    name: 'Vercel',
    purpose: 'Website hosting and deployment platform for drivetimetales.vercel.app. Handles builds, serverless functions, cron jobs, and CDN.',
    loginUrl: 'https://vercel.com/dashboard',
    defaultCost: 0,
    billingType: 'monthly',
    category: 'Infrastructure',
  },
  {
    name: 'Cloudflare R2',
    purpose: 'Object storage for audio files and cover images. Serves content via CDN with no egress fees. Backup storage alongside Supabase.',
    loginUrl: 'https://dash.cloudflare.com',
    defaultCost: 0,
    billingType: 'monthly',
    category: 'Infrastructure',
  },
  {
    name: 'Stripe',
    purpose: 'Payment processing for DTT subscriptions and credit pack purchases. Handles recurring billing, webhooks, and customer management.',
    loginUrl: 'https://dashboard.stripe.com',
    defaultCost: 0,
    billingType: 'usage-based',
    category: 'Infrastructure',
  },
  {
    name: 'GitHub',
    purpose: 'Source code repository for DTT website. Source of truth for all code. Connected to Vercel for automatic deployments on push.',
    loginUrl: 'https://github.com',
    defaultCost: 0,
    billingType: 'monthly',
    category: 'Infrastructure',
  },
  {
    name: 'REAPER',
    purpose: 'Digital audio workstation for mixing audio drama tracks — combines narrator voice, announcer, intro/outro music, background music, and SFX into final output.',
    loginUrl: 'https://www.reaper.fm/purchase.php',
    defaultCost: 0,
    billingType: 'one-time',
    category: 'Audio Production',
  },
  {
    name: 'Hindenburg Pro',
    purpose: 'Professional audio production software for advanced editing, noise reduction, and audio mastering of voice recordings.',
    loginUrl: 'https://hindenburg.com/account',
    defaultCost: 0,
    billingType: 'monthly',
    category: 'Audio Production',
  },
  {
    name: 'Soundly',
    purpose: 'Sound effects library for sourcing professional SFX used in audio dramas — ambient sounds, transitions, and scene-setting audio.',
    loginUrl: 'https://getsoundly.com',
    defaultCost: 0,
    billingType: 'monthly',
    category: 'Audio Production',
  },
  {
    name: 'NewsAPI / World News',
    purpose: 'RSS and news data feeds providing current headlines for the automated news briefings system. Supplies content for all 6 news categories.',
    loginUrl: 'https://worldnewsapi.com/account',
    defaultCost: 0,
    billingType: 'monthly',
    category: 'Data & APIs',
  },
  {
    name: 'Freesound',
    purpose: 'Free/open-source sound effects API integrated into ADM Tab 5 for auto-searching and downloading SFX clips.',
    loginUrl: 'https://freesound.org',
    defaultCost: 0,
    billingType: 'monthly',
    category: 'Data & APIs',
  },
]

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// ============================================================================
// COMPONENT
// ============================================================================
export default function AdminFinancePage() {
  const [year, setYear] = useState(2026)
  const [costs, setCosts] = useState<Record<string, number[]>>({})
  const [expandedService, setExpandedService] = useState<string | null>(null)
  const [editingCell, setEditingCell] = useState<{ service: string; month: number } | null>(null)
  const [editValue, setEditValue] = useState('')
  const [hasChanges, setHasChanges] = useState(false)

  // Load saved costs from localStorage
  useEffect(() => {
    const saved = localStorage.getItem(`dtt_finance_${year}`)
    if (saved) {
      setCosts(JSON.parse(saved))
    } else {
      // Initialize with defaults
      const initial: Record<string, number[]> = {}
      SERVICES.forEach(s => {
        initial[s.name] = Array(12).fill(s.defaultCost)
      })
      setCosts(initial)
    }
  }, [year])

  // Save to localStorage
  const saveCosts = () => {
    localStorage.setItem(`dtt_finance_${year}`, JSON.stringify(costs))
    setHasChanges(false)
  }

  // Start editing a cell
  const startEdit = (service: string, month: number) => {
    setEditingCell({ service, month })
    setEditValue((costs[service]?.[month] ?? 0).toString())
  }

  // Commit edit
  const commitEdit = () => {
    if (!editingCell) return
    const val = parseFloat(editValue) || 0
    setCosts(prev => {
      const updated = { ...prev }
      if (!updated[editingCell.service]) updated[editingCell.service] = Array(12).fill(0)
      updated[editingCell.service] = [...updated[editingCell.service]]
      updated[editingCell.service][editingCell.month] = val
      return updated
    })
    setEditingCell(null)
    setHasChanges(true)
  }

  // Apply same cost to all months for a service
  const applyToAllMonths = (service: string, value: number) => {
    setCosts(prev => {
      const updated = { ...prev }
      updated[service] = Array(12).fill(value)
      return updated
    })
    setHasChanges(true)
  }

  // Calculate totals
  const getServiceTotal = (service: string) => {
    return (costs[service] || Array(12).fill(0)).reduce((a, b) => a + b, 0)
  }

  const getMonthTotal = (month: number) => {
    return SERVICES.reduce((total, s) => total + (costs[s.name]?.[month] || 0), 0)
  }

  const getGrandTotal = () => {
    return SERVICES.reduce((total, s) => total + getServiceTotal(s.name), 0)
  }

  // Group services by category
  const categories = [...new Set(SERVICES.map(s => s.category))]

  const categoryIcons: Record<string, string> = {
    'AI & Voice': '🤖',
    'Infrastructure': '🏗️',
    'Audio Production': '🎧',
    'Data & APIs': '📡',
    'Business Tools': '💼',
  }

  return (
    <div style={{ padding: '24px', maxWidth: '100%', overflowX: 'auto', color: '#000', background: '#fff', minHeight: '100vh' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 'bold', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
            💰 Expense Tracker
          </h1>
          <p style={{ color: '#666', margin: '4px 0 0', fontSize: '14px' }}>
            Monthly subscription costs for DTT & ADM services
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button
            onClick={() => setYear(y => y - 1)}
            style={{ padding: '6px 12px', border: '1px solid #ccc', borderRadius: '6px', cursor: 'pointer', background: '#f5f5f5', color: '#000' }}
          >
            ◀
          </button>
          <span style={{ fontSize: '20px', fontWeight: 'bold', minWidth: '60px', textAlign: 'center' }}>{year}</span>
          <button
            onClick={() => setYear(y => y + 1)}
            style={{ padding: '6px 12px', border: '1px solid #ccc', borderRadius: '6px', cursor: 'pointer', background: '#f5f5f5', color: '#000' }}
          >
            ▶
          </button>
          <button
            onClick={saveCosts}
            style={{
              padding: '8px 20px',
              background: hasChanges ? '#f97316' : '#ccc',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: hasChanges ? 'pointer' : 'default',
              fontWeight: 'bold',
              marginLeft: '12px',
            }}
          >
            {hasChanges ? '💾 Save Changes' : '✓ Saved'}
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div style={{ display: 'flex', gap: '16px', marginBottom: '24px', flexWrap: 'wrap' }}>
        <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: '8px', padding: '16px 24px', flex: '1', minWidth: '150px' }}>
          <div style={{ fontSize: '12px', color: '#9a3412', fontWeight: '600', textTransform: 'uppercase' }}>Annual Total</div>
          <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#c2410c' }}>${getGrandTotal().toFixed(2)}</div>
        </div>
        <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '16px 24px', flex: '1', minWidth: '150px' }}>
          <div style={{ fontSize: '12px', color: '#166534', fontWeight: '600', textTransform: 'uppercase' }}>Monthly Avg</div>
          <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#15803d' }}>${(getGrandTotal() / 12).toFixed(2)}</div>
        </div>
        <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '8px', padding: '16px 24px', flex: '1', minWidth: '150px' }}>
          <div style={{ fontSize: '12px', color: '#1e40af', fontWeight: '600', textTransform: 'uppercase' }}>Services</div>
          <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#1d4ed8' }}>{SERVICES.length}</div>
        </div>
      </div>

      {/* Spreadsheet */}
      <div style={{ overflowX: 'auto', border: '1px solid #e5e7eb', borderRadius: '8px' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', minWidth: '1200px' }}>
          <thead>
            <tr style={{ background: '#f9fafb' }}>
              <th style={{ textAlign: 'left', padding: '10px 12px', borderBottom: '2px solid #e5e7eb', position: 'sticky', left: 0, background: '#f9fafb', zIndex: 2, minWidth: '200px', color: '#000' }}>
                Service
              </th>
              {MONTHS.map((m, i) => (
                <th key={m} style={{ textAlign: 'right', padding: '10px 8px', borderBottom: '2px solid #e5e7eb', minWidth: '80px', color: '#000' }}>
                  {m} {year.toString().slice(2)}
                </th>
              ))}
              <th style={{ textAlign: 'right', padding: '10px 12px', borderBottom: '2px solid #e5e7eb', background: '#f3f4f6', minWidth: '90px', fontWeight: 'bold', color: '#000' }}>
                Total
              </th>
            </tr>
          </thead>
          <tbody>
            {categories.map(category => (
              <>
                {/* Category Header */}
                <tr key={`cat-${category}`}>
                  <td colSpan={14} style={{ padding: '8px 12px', background: '#f3f4f6', fontWeight: 'bold', fontSize: '12px', textTransform: 'uppercase', color: '#6b7280', letterSpacing: '0.05em', borderBottom: '1px solid #e5e7eb' }}>
                    {categoryIcons[category] || '📁'} {category}
                  </td>
                </tr>
                {SERVICES.filter(s => s.category === category).map(service => (
                  <>
                    <tr key={service.name} style={{ borderBottom: '1px solid #f3f4f6' }}>
                      {/* Service Name Cell */}
                      <td style={{ padding: '8px 12px', position: 'sticky', left: 0, background: '#fff', zIndex: 1, borderRight: '1px solid #f3f4f6' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <button
                            onClick={() => setExpandedService(expandedService === service.name ? null : service.name)}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '10px', color: '#9ca3af', padding: '2px', width: '16px' }}
                          >
                            {expandedService === service.name ? '▼' : '▶'}
                          </button>
                          <a
                            href={service.loginUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ color: '#2563eb', textDecoration: 'none', fontWeight: '500', fontSize: '13px' }}
                            title={`Open ${service.name} login`}
                          >
                            {service.name} ↗
                          </a>
                          {service.billingType === 'one-time' && (
                            <span style={{ fontSize: '10px', background: '#dbeafe', color: '#1d4ed8', padding: '1px 5px', borderRadius: '4px' }}>one-time</span>
                          )}
                          {service.billingType === 'usage-based' && (
                            <span style={{ fontSize: '10px', background: '#fef3c7', color: '#92400e', padding: '1px 5px', borderRadius: '4px' }}>usage</span>
                          )}
                        </div>
                      </td>
                      {/* Monthly Cost Cells */}
                      {MONTHS.map((_, monthIdx) => {
                        const isEditing = editingCell?.service === service.name && editingCell?.month === monthIdx
                        const val = costs[service.name]?.[monthIdx] || 0
                        return (
                          <td
                            key={monthIdx}
                            onClick={() => !isEditing && startEdit(service.name, monthIdx)}
                            style={{
                              textAlign: 'right',
                              padding: '4px 8px',
                              cursor: 'pointer',
                              background: isEditing ? '#fffbeb' : val > 0 ? '#fff' : '#fafafa',
                              color: val > 0 ? '#000' : '#d1d5db',
                            }}
                          >
                            {isEditing ? (
                              <input
                                type="number"
                                value={editValue}
                                onChange={e => setEditValue(e.target.value)}
                                onBlur={commitEdit}
                                onKeyDown={e => {
                                  if (e.key === 'Enter') commitEdit()
                                  if (e.key === 'Escape') setEditingCell(null)
                                }}
                                autoFocus
                                style={{
                                  width: '70px',
                                  textAlign: 'right',
                                  padding: '2px 4px',
                                  border: '2px solid #f97316',
                                  borderRadius: '4px',
                                  fontSize: '13px',
                                  outline: 'none',
                                  color: '#000',
                                  background: '#fff',
                                }}
                                step="0.01"
                              />
                            ) : (
                              <span>{val > 0 ? `$${val.toFixed(2)}` : '—'}</span>
                            )}
                          </td>
                        )
                      })}
                      {/* Row Total */}
                      <td style={{ textAlign: 'right', padding: '8px 12px', background: '#f9fafb', fontWeight: '600', color: '#000' }}>
                        ${getServiceTotal(service.name).toFixed(2)}
                      </td>
                    </tr>
                    {/* Expanded Description Row */}
                    {expandedService === service.name && (
                      <tr key={`${service.name}-desc`}>
                        <td colSpan={14} style={{ padding: '8px 12px 12px 40px', background: '#f8fafc', borderBottom: '1px solid #e5e7eb' }}>
                          <div style={{ fontSize: '12px', color: '#4b5563', lineHeight: '1.5', maxWidth: '800px' }}>
                            <strong>Purpose:</strong> {service.purpose}
                          </div>
                          <div style={{ marginTop: '6px', display: 'flex', gap: '8px', alignItems: 'center' }}>
                            <span style={{ fontSize: '11px', color: '#6b7280' }}>
                              Billing: {service.billingType === 'one-time' ? 'One-time purchase (spread over 12 months)' : service.billingType === 'usage-based' ? 'Pay per transaction' : 'Monthly subscription'}
                            </span>
                            <span style={{ color: '#d1d5db' }}>|</span>
                            <button
                              onClick={() => {
                                const val = costs[service.name]?.[0] || 0
                                if (val > 0) applyToAllMonths(service.name, val)
                              }}
                              style={{ fontSize: '11px', color: '#2563eb', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}
                            >
                              Apply Jan cost to all months
                            </button>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </>
            ))}
          </tbody>
          {/* Footer Totals */}
          <tfoot>
            <tr style={{ borderTop: '2px solid #e5e7eb', background: '#f9fafb' }}>
              <td style={{ padding: '10px 12px', fontWeight: 'bold', position: 'sticky', left: 0, background: '#f9fafb', zIndex: 1, color: '#000' }}>
                MONTHLY TOTALS
              </td>
              {MONTHS.map((_, i) => (
                <td key={i} style={{ textAlign: 'right', padding: '10px 8px', fontWeight: 'bold', color: '#000' }}>
                  ${getMonthTotal(i).toFixed(2)}
                </td>
              ))}
              <td style={{ textAlign: 'right', padding: '10px 12px', fontWeight: 'bold', background: '#fff7ed', color: '#c2410c', fontSize: '14px' }}>
                ${getGrandTotal().toFixed(2)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Instructions */}
      <div style={{ marginTop: '20px', padding: '16px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
        <p style={{ fontSize: '12px', color: '#64748b', margin: 0, lineHeight: '1.6' }}>
          <strong>How to use:</strong> Click any cell to edit the cost. Click ▶ next to a service name to see its purpose and billing type. 
          Click the service name link (↗) to go to its login page. Use the year arrows to switch between years. 
          Changes are saved to your browser — click "Save Changes" to persist.
        </p>
      </div>
    </div>
  )
}
