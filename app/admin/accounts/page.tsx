'use client'

import { useMemo, useState, type CSSProperties } from 'react'
import {
  SERVICE_ACCOUNTS,
  SERVICE_CATEGORIES,
  type ServiceAccount,
  type ServiceCategory,
  type ServiceStatus,
} from '@/lib/config/service-accounts'

type AccountTab = 'All' | ServiceCategory

type VerificationAge = {
  state: 'fresh' | 'current' | 'aging' | 'overdue' | 'never'
  label: string
  marker: string
}

const TABS: AccountTab[] = ['All', ...SERVICE_CATEGORIES]

const STATUS_META: Record<ServiceStatus, { label: string; background: string; color: string; border: string }> = {
  active: { label: 'Active', background: '#dcfce7', color: '#166534', border: '#86efac' },
  paused: { label: 'Paused', background: '#fef3c7', color: '#92400e', border: '#fbbf24' },
  pending_setup: { label: 'Pending Setup', background: '#dbeafe', color: '#1d4ed8', border: '#93c5fd' },
  inactive: { label: 'Inactive', background: '#f1f5f9', color: '#475569', border: '#cbd5e1' },
  cancelled: { label: 'Cancelled', background: '#fee2e2', color: '#991b1b', border: '#fca5a5' },
}

const page: CSSProperties = {
  padding: '2rem',
  backgroundColor: '#FAF9F6',
  minHeight: '100vh',
}

const card: CSSProperties = {
  backgroundColor: '#ffffff',
  border: '1px solid #e2e8f0',
  borderRadius: '10px',
  boxShadow: '0 8px 20px rgba(15, 23, 42, 0.05)',
}

function getVerificationAge(verifiedAt: string | null): VerificationAge {
  if (!verifiedAt) {
    return { state: 'never', marker: '-', label: 'Never verified' }
  }

  const verifiedMs = Date.parse(verifiedAt)
  if (!Number.isFinite(verifiedMs)) {
    return { state: 'never', marker: '-', label: 'Never verified' }
  }

  const days = Math.max(0, Math.floor((Date.now() - verifiedMs) / (24 * 60 * 60 * 1000)))
  const ago = days === 0 ? 'Verified today' : `Verified ${days} days ago`

  if (days <= 7) return { state: 'fresh', marker: '✓', label: ago }
  if (days <= 30) return { state: 'current', marker: '✓', label: ago }
  if (days <= 90) return { state: 'aging', marker: '●', label: `${ago} — check soon` }
  return { state: 'overdue', marker: '!', label: `Overdue — last verified ${days} days ago` }
}

function verificationStyle(state: VerificationAge['state']): CSSProperties {
  if (state === 'fresh') return { color: '#166534', backgroundColor: '#dcfce7', borderColor: '#86efac' }
  if (state === 'current') return { color: '#475569', backgroundColor: '#f8fafc', borderColor: '#cbd5e1' }
  if (state === 'aging') return { color: '#92400e', backgroundColor: '#fef3c7', borderColor: '#fbbf24' }
  if (state === 'overdue') return { color: '#991b1b', backgroundColor: '#fee2e2', borderColor: '#fca5a5' }
  return { color: '#64748b', backgroundColor: '#f8fafc', borderColor: '#cbd5e1' }
}

function formatCost(service: ServiceAccount) {
  if (service.monthlyCostUsd === 0) return 'Free'
  if (service.monthlyCostUsd === null) return service.billingCycle === 'usage' ? 'Variable' : '—'
  const amount = `$${service.monthlyCostUsd.toLocaleString('en-US', { maximumFractionDigits: 2 })}`
  return service.billingCycle === 'annual' ? `${amount}/yr` : `${amount}/mo`
}

function statusBadge(status: ServiceStatus) {
  const meta = STATUS_META[status]
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      borderRadius: '999px',
      border: `1px solid ${meta.border}`,
      backgroundColor: meta.background,
      color: meta.color,
      padding: '0.25rem 0.55rem',
      fontSize: '12px',
      fontWeight: 800,
    }}>
      {meta.label}
    </span>
  )
}

function tabSignal(services: ServiceAccount[]) {
  const ages = services.map((service) => getVerificationAge(service.verifiedAt).state)
  if (ages.includes('overdue')) return <span style={{ color: '#dc2626', fontSize: '11px' }}>●</span>
  if (ages.includes('aging')) return <span style={{ color: '#f59e0b', fontSize: '11px' }}>●</span>
  return null
}

function servicesForTab(tab: AccountTab) {
  return tab === 'All'
    ? SERVICE_ACCOUNTS
    : SERVICE_ACCOUNTS.filter((service) => service.category === tab)
}

export default function AdminAccountsPage() {
  const [activeTab, setActiveTab] = useState<AccountTab>('All')

  const activeServices = servicesForTab(activeTab)
  const launchCritical = SERVICE_ACCOUNTS.filter((service) => service.launchCritical)
  const launchBlocked = launchCritical.filter((service) => service.status === 'inactive' || service.status === 'cancelled')
  const launchWarnings = launchCritical.filter((service) => service.status === 'paused' || service.status === 'pending_setup')
  const launchActiveCount = launchCritical.filter((service) => service.status === 'active').length
  const launchNonActiveCount = launchCritical.length - launchActiveCount

  const verificationSummary = useMemo(() => {
    return SERVICE_ACCOUNTS.reduce(
      (summary, service) => {
        const state = getVerificationAge(service.verifiedAt).state
        if (state === 'overdue') return { ...summary, overdue: summary.overdue + 1 }
        if (state === 'aging') return { ...summary, aging: summary.aging + 1 }
        return summary
      },
      { overdue: 0, aging: 0 }
    )
  }, [])

  const launchBorder = launchBlocked.length > 0 ? '#dc2626' : launchWarnings.length > 0 ? '#f59e0b' : '#16a34a'

  return (
    <div style={page}>
      <header style={{ marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap' }}>
          <div>
            <p style={{ color: '#f97316', fontSize: '12px', fontWeight: 900, textTransform: 'uppercase', margin: '0 0 0.35rem' }}>
              Atlas Phase 0.1
            </p>
            <h1 style={{ color: '#0f172a', fontSize: '30px', lineHeight: 1.15, margin: 0 }}>
              Accounts & Integrations
            </h1>
            <p style={{ color: '#64748b', margin: '0.55rem 0 0', maxWidth: '760px', fontSize: '14px', lineHeight: 1.6 }}>
              Read-only launch inventory for external services, account ownership, verification aging, and critical dependency status.
            </p>
          </div>
          {(verificationSummary.overdue > 0 || verificationSummary.aging > 0) && (
            <div style={{
              ...card,
              padding: '0.85rem 1rem',
              minWidth: '220px',
              borderColor: verificationSummary.overdue > 0 ? '#fca5a5' : '#fbbf24',
            }}>
              <div style={{ color: '#0f172a', fontWeight: 900, fontSize: '13px', marginBottom: '0.25rem' }}>Verification Watch</div>
              {verificationSummary.overdue > 0 && <div style={{ color: '#991b1b', fontSize: '13px', fontWeight: 700 }}>{verificationSummary.overdue} overdue</div>}
              {verificationSummary.aging > 0 && <div style={{ color: '#92400e', fontSize: '13px', fontWeight: 700 }}>{verificationSummary.aging} aging</div>}
            </div>
          )}
        </div>
      </header>

      <section style={{ ...card, borderLeft: `6px solid ${launchBorder}`, padding: '1rem 1.15rem', marginBottom: '1.25rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
          <div>
            <h2 style={{ color: '#0f172a', fontSize: '18px', margin: '0 0 0.35rem' }}>Launch Critical Services</h2>
            <p style={{ color: '#475569', margin: 0, fontSize: '14px' }}>
              {launchCritical.length} total · {launchActiveCount} active · {launchNonActiveCount} non-active
            </p>
          </div>
          {launchBlocked.length === 0 && launchWarnings.length === 0 && (
            <span style={{ color: '#166534', fontSize: '13px', fontWeight: 900 }}>All launch-critical services active</span>
          )}
        </div>
        {(launchWarnings.length > 0 || launchBlocked.length > 0) && (
          <div style={{ marginTop: '0.9rem', display: 'grid', gap: '0.65rem' }}>
            {launchWarnings.map((service) => (
              <div key={service.id} style={{ backgroundColor: '#fffbeb', border: '1px solid #fbbf24', borderRadius: '8px', padding: '0.75rem' }}>
                <strong style={{ color: '#92400e' }}>{service.name}</strong>
                <span style={{ color: '#92400e' }}> · {STATUS_META[service.status].label}</span>
                {service.statusNote && <div style={{ color: '#78350f', marginTop: '0.25rem', fontSize: '13px' }}>{service.statusNote}</div>}
              </div>
            ))}
            {launchBlocked.map((service) => (
              <div key={service.id} style={{ backgroundColor: '#fef2f2', border: '1px solid #fca5a5', borderRadius: '8px', padding: '0.75rem' }}>
                <strong style={{ color: '#991b1b' }}>{service.name}</strong>
                <span style={{ color: '#991b1b' }}> · {STATUS_META[service.status].label}</span>
                {service.statusNote && <div style={{ color: '#7f1d1d', marginTop: '0.25rem', fontSize: '13px' }}>{service.statusNote}</div>}
              </div>
            ))}
          </div>
        )}
      </section>

      <nav style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1.25rem' }} aria-label="Service categories">
        {TABS.map((tab) => {
          const selected = activeTab === tab
          const tabServices = servicesForTab(tab)
          return (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              style={{
                border: `1px solid ${selected ? '#f97316' : '#e2e8f0'}`,
                backgroundColor: selected ? '#fff7ed' : '#ffffff',
                color: selected ? '#9a3412' : '#334155',
                borderRadius: '999px',
                padding: '0.55rem 0.8rem',
                fontWeight: 800,
                fontSize: '13px',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.4rem',
              }}
            >
              <span>{tab}</span>
              {tabSignal(tabServices)}
              <span style={{ color: selected ? '#c2410c' : '#64748b', fontSize: '12px' }}>{tabServices.length}</span>
            </button>
          )
        })}
      </nav>

      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(310px, 1fr))', gap: '1rem' }}>
        {activeServices.map((service) => {
          const verification = getVerificationAge(service.verifiedAt)
          const verificationColors = verificationStyle(verification.state)
          return (
            <article key={service.id} style={{ ...card, padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'flex-start' }}>
                <div>
                  <h2 style={{
                    color: '#0f172a',
                    fontSize: '18px',
                    lineHeight: 1.25,
                    margin: 0,
                    textDecoration: service.status === 'cancelled' ? 'line-through' : 'none',
                  }}>
                    {service.name}
                  </h2>
                  <p style={{ color: '#64748b', margin: '0.3rem 0 0', fontSize: '13px', fontWeight: 700 }}>{service.category}</p>
                </div>
                {service.version && (
                  <span style={{
                    borderRadius: '999px',
                    backgroundColor: '#eef2ff',
                    color: '#3730a3',
                    fontSize: '12px',
                    fontWeight: 900,
                    padding: '0.25rem 0.55rem',
                    whiteSpace: 'nowrap',
                  }}>
                    {service.version}
                  </span>
                )}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                {statusBadge(service.status)}
                <span style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  borderRadius: '999px',
                  border: `1px solid ${verificationColors.borderColor}`,
                  backgroundColor: verificationColors.backgroundColor,
                  color: verificationColors.color,
                  padding: '0.25rem 0.55rem',
                  fontSize: '12px',
                  fontWeight: 800,
                }}>
                  {verification.marker} {verification.label}
                </span>
              </div>

              {service.statusNote && (
                <div style={{ backgroundColor: '#fff7ed', border: '1px solid #fed7aa', borderRadius: '8px', padding: '0.65rem', color: '#9a3412', fontSize: '13px', lineHeight: 1.45 }}>
                  {service.statusNote}
                </div>
              )}

              <dl style={{ display: 'grid', gridTemplateColumns: '130px 1fr', gap: '0.45rem 0.65rem', margin: 0, fontSize: '13px' }}>
                <dt style={{ color: '#64748b', fontWeight: 800 }}>Owner</dt>
                <dd style={{ margin: 0, color: '#0f172a' }}>{service.owner}</dd>
                <dt style={{ color: '#64748b', fontWeight: 800 }}>Account</dt>
                <dd style={{ margin: 0, color: '#0f172a' }}>{service.accountIdentifier}</dd>
                <dt style={{ color: '#64748b', fontWeight: 800 }}>Bitwarden</dt>
                <dd style={{ margin: 0, color: '#0f172a' }}>{service.bitwardenFolder}</dd>
                <dt style={{ color: '#64748b', fontWeight: 800 }}>Cost</dt>
                <dd style={{ margin: 0, color: '#0f172a' }}>{formatCost(service)}</dd>
                <dt style={{ color: '#64748b', fontWeight: 800 }}>Dashboard</dt>
                <dd style={{ margin: 0 }}>
                  {service.dashboardUrl ? (
                    <a href={service.dashboardUrl} target="_blank" rel="noopener noreferrer" style={{ color: '#ea580c', fontWeight: 800, textDecoration: 'none' }}>
                      Open dashboard
                    </a>
                  ) : (
                    <span style={{ color: '#64748b' }}>—</span>
                  )}
                </dd>
              </dl>

              {service.notes && (
                <p style={{ color: '#475569', backgroundColor: '#f8fafc', borderRadius: '8px', padding: '0.7rem', margin: 0, fontSize: '13px', lineHeight: 1.45 }}>
                  {service.notes}
                </p>
              )}
            </article>
          )
        })}
      </section>
    </div>
  )
}
