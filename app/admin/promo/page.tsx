'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'

type SortKey = 'first_name' | 'last_name' | 'last_used' | 'finished'

type RedemptionRow = {
  id: string
  user_id?: string | null
  email?: string | null
  days_granted?: number | null
  redeemed_at?: string | null
  users?: Record<string, any> | null
}

type InvitePerson = {
  userId: string
  email: string
  phone: string
  firstName: string
  lastName: string
  displayName: string
  subscriptionDays: number | null
  subscriptionEndsAt: string | null
  lastUsedAt: string | null
  timesUsed: number
  started: number
  finished: number
  stories: StoryDetail[]
}

type StoryDetail = {
  id: string
  title: string
  startedAt: string | null
  finishedAt: string | null
  durationMins: number | null
  progressPercent: number
  completed: boolean
}

const ACCESS_OPTIONS = [
  { value: '14', label: '14 days (2 weeks)', badge: '14 days' },
  { value: '30', label: '30 days (1 month)', badge: '30 days' },
  { value: '90', label: '90 days (3 months)', badge: '3 months' },
  { value: '180', label: '180 days (6 months)', badge: '6 months' },
  { value: '365', label: '365 days (1 year)', badge: '1 year' },
]

const TEST_EMAIL = 'm.postlewaite@gmail.com'

function isTestAccount(email: string) {
  const lower = email.toLowerCase()
  return lower === TEST_EMAIL || lower.includes('test')
}

function formatDate(value?: string | null) {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function relativeDate(value?: string | null) {
  if (!value) return 'Never'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Never'
  const now = new Date()
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const startDate = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
  const days = Math.round((startToday - startDate) / 86400000)
  if (days <= 0) return 'Today'
  if (days === 1) return 'Yesterday'
  return `${days} days ago`
}

function normalizePhone(value?: string | null) {
  return String(value || '').trim()
}

function smsHref(phone: string) {
  return `sms:${phone.replace(/[^\d+]/g, '')}`
}

function accessBadge(days: number | null) {
  if (!days) return '--'
  return ACCESS_OPTIONS.find((option) => Number(option.value) === days)?.badge || `${days} days`
}

function numberFrom(value: any) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function buildStoryDetail(row: any): StoryDetail | null {
  const story = row.stories || row.story || {}
  const storyId = String(row.story_id || story.id || row.id || '')
  if (!storyId) return null
  const durationMins = numberFrom(story.duration_mins || row.duration_mins || row.durationMinutes)
  const progressSeconds = numberFrom(row.progress || row.progress_seconds || row.current_time_seconds)
  const progressPercent = row.progress_percent !== undefined
    ? numberFrom(row.progress_percent)
    : durationMins > 0
      ? Math.min(100, Math.round((progressSeconds / (durationMins * 60)) * 100))
      : row.completed
        ? 100
        : 0

  return {
    id: storyId,
    title: story.title || row.title || 'Untitled story',
    startedAt: row.started_at || row.created_at || row.purchased_at || null,
    finishedAt: row.completed ? (row.finished_at || row.completed_at || row.updated_at || row.last_played || row.last_played_at || null) : null,
    durationMins: durationMins || null,
    progressPercent: Math.max(0, Math.min(100, Math.round(progressPercent))),
    completed: Boolean(row.completed || progressPercent >= 95),
  }
}

function mergePeople(redemptions: RedemptionRow[], storiesByUser: Map<string, StoryDetail[]>) {
  const people = new Map<string, InvitePerson>()

  redemptions.forEach((row) => {
    const user = row.users || {}
    const email = String(user.email || row.email || '').trim().toLowerCase()
    const key = String(row.user_id || user.id || email)
    if (!key || !email) return

    const existing = people.get(key)
    const days = Number(row.days_granted || user.subscription_days || 0) || null
    const lastUsedAt = user.last_login || user.last_active_at || user.updated_at || row.redeemed_at || null

    if (!existing) {
      const firstName = String(user.first_name || '').trim()
      const lastName = String(user.last_name || '').trim()
      people.set(key, {
        userId: String(row.user_id || user.id || ''),
        email,
        phone: normalizePhone(user.phone || user.mobile_phone || user.sms_phone || user.contact_phone),
        firstName,
        lastName,
        displayName: String(user.display_name || user.name || [firstName, lastName].filter(Boolean).join(' ') || email.split('@')[0]),
        subscriptionDays: days,
        subscriptionEndsAt: user.subscription_ends_at || null,
        lastUsedAt,
        timesUsed: 1,
        started: 0,
        finished: 0,
        stories: [],
      })
      return
    }

    existing.timesUsed += 1
    if (!existing.subscriptionDays && days) existing.subscriptionDays = days
    if (lastUsedAt && (!existing.lastUsedAt || new Date(lastUsedAt) > new Date(existing.lastUsedAt))) {
      existing.lastUsedAt = lastUsedAt
    }
  })

  people.forEach((person) => {
    const stories = storiesByUser.get(person.userId) || []
    person.stories = stories
    person.started = stories.length
    person.finished = stories.filter((story) => story.completed).length
  })

  return Array.from(people.values())
}

export default function AdminPromoPage() {
  const [email, setEmail] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [phone, setPhone] = useState('')
  const [duration, setDuration] = useState('30')
  const [showLastName, setShowLastName] = useState(true)
  const [sending, setSending] = useState(false)
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [people, setPeople] = useState<InvitePerson[]>([])
  const [sortBy, setSortBy] = useState<SortKey>('last_used')
  const [selectedPerson, setSelectedPerson] = useState<InvitePerson | null>(null)

  useEffect(() => {
    loadInvites()
  }, [])

  async function loadStoriesForUsers(userIds: string[]) {
    const storiesByUser = new Map<string, StoryDetail[]>()
    if (userIds.length === 0) return storiesByUser

    const attempts = [
      supabase.from('user_library').select('*, stories(id,title,duration_mins)').in('user_id', userIds),
      supabase.from('story_plays').select('*, stories(id,title,duration_mins)').in('user_id', userIds),
      supabase.from('listening_sessions').select('*, stories(id,title,duration_mins)').in('user_id', userIds),
      supabase.from('user_stories').select('*, stories(id,title,duration_mins)').in('user_id', userIds),
      supabase.from('play_history').select('*, stories(id,title,duration_mins)').in('user_id', userIds),
    ]

    for (const attempt of attempts) {
      const { data, error } = await attempt
      if (error || !data) continue
      data.forEach((row: any) => {
        const userId = String(row.user_id || '')
        const story = buildStoryDetail(row)
        if (!userId || !story) return
        const existing = storiesByUser.get(userId) || []
        existing.push(story)
        storiesByUser.set(userId, existing)
      })
      if (storiesByUser.size > 0) break
    }

    storiesByUser.forEach((stories, userId) => {
      const deduped = Array.from(new Map(stories.map((story) => [story.id, story])).values())
        .sort((a, b) => new Date(b.startedAt || 0).getTime() - new Date(a.startedAt || 0).getTime())
      storiesByUser.set(userId, deduped)
    })

    return storiesByUser
  }

  async function loadInvites() {
    setLoading(true)
    const { data, error } = await supabase
      .from('promo_redemptions')
      .select('*, users(*)')
      .order('redeemed_at', { ascending: false })

    if (error || !data) {
      setPeople([])
      setLoading(false)
      return
    }

    const rows = data as RedemptionRow[]
    const userIds = Array.from(new Set(rows.map((row) => String(row.user_id || row.users?.id || '')).filter(Boolean)))
    const storiesByUser = await loadStoriesForUsers(userIds)
    setPeople(mergePeople(rows, storiesByUser))
    setLoading(false)
  }

  async function submitInvite(e: React.FormEvent, channel: 'email' | 'sms' = 'email') {
    e.preventDefault()
    if (!email.includes('@') || !firstName.trim()) {
      setMessage('Email and first name are required.')
      return
    }
    if (channel === 'sms' && !phone.trim()) {
      setMessage('Phone number is required to send via text.')
      return
    }

    setSending(true)
    setMessage('')
    try {
      const res = await fetch('/api/promo/send-magic-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          firstName: firstName.trim(),
          lastName: showLastName ? lastName.trim() : '',
          phone: phone.trim(),
          subscription_days: Number(duration),
          channel,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setMessage('Error: ' + (data.error || 'Failed to send invite'))
      } else {
        if (channel === 'sms' && data.magicUrl) {
          const smsBody = encodeURIComponent(
            `Hi ${firstName.trim()}! Marc here — I wanted to personally invite you to try Endless Tales free for ${data.daysGranted || duration} days. Tap to start listening: ${data.magicUrl}`
          )
          const phoneDigits = phone.trim().replace(/[^\d+]/g, '')
          window.open(`sms:${phoneDigits}?body=${smsBody}`, '_blank')
          setMessage(`Text ready for ${firstName.trim()} — ${data.daysGranted || duration} days granted. Your SMS app should open.`)
        } else {
          setMessage(`Email sent to ${firstName.trim()} — ${data.daysGranted || duration} days granted.`)
        }
        setEmail('')
        setFirstName('')
        setLastName('')
        setPhone('')
        setDuration('30')
        await loadInvites()
      }
    } catch (err) {
      setMessage('Error: ' + String(err))
    }
    setSending(false)
  }

  async function toggleAccess(person: InvitePerson) {
    if (!person.userId) return
    const isActive = person.subscriptionEndsAt && new Date(person.subscriptionEndsAt) > new Date()
    const nextDate = isActive
      ? new Date(Date.now() - 86400000).toISOString()
      : new Date(Date.now() + (person.subscriptionDays || 30) * 86400000).toISOString()

    await supabase
      .from('users')
      .update({ subscription_ends_at: nextDate, subscription_type: isActive ? 'free' : 'active' })
      .eq('id', person.userId)
    await loadInvites()
  }

  const sortedPeople = useMemo(() => {
    return [...people].sort((a, b) => {
      if (sortBy === 'first_name') return (a.firstName || a.displayName).localeCompare(b.firstName || b.displayName)
      if (sortBy === 'last_name') return (a.lastName || a.displayName).localeCompare(b.lastName || b.displayName)
      if (sortBy === 'finished') return b.finished - a.finished
      return new Date(b.lastUsedAt || 0).getTime() - new Date(a.lastUsedAt || 0).getTime()
    })
  }, [people, sortBy])

  return (
    <div className="min-h-screen bg-[#f5f4f0] px-4 py-8 text-[#1a1a1a] sm:px-8">
      <div className="mx-auto max-w-[1200px]">
        <h1 className="mb-1 text-[26px] font-bold tracking-normal">Magic Link Invites</h1>
        <p className="mb-6 text-sm text-[#666]">
          Send one-click invites with free access. Recipients click the link and are instantly in - no code entry needed.
        </p>

        <section className="mb-5 rounded-xl border border-[#e5e5e5] bg-white p-6">
          <h2 className="mb-1.5 text-[17px] font-semibold">Send a Magic Link</h2>
          <p className="mb-5 text-[13px] text-[#666]">
            Creates an account, applies free access, and stores their name for Belle. One click and they&apos;re listening.
          </p>

          <button
            type="button"
            onClick={() => setShowLastName((value) => !value)}
            className="mb-[18px] flex cursor-pointer items-center gap-2 text-[13px] text-[#555]"
          >
            <span className={`relative h-5 w-9 rounded-full ${showLastName ? 'bg-[#f97316]' : 'bg-gray-300'}`}>
              <span className={`absolute top-[3px] h-3.5 w-3.5 rounded-full bg-white transition ${showLastName ? 'right-[3px]' : 'left-[3px]'}`} />
            </span>
            Include last name field
          </button>

          <form onSubmit={submitInvite} className="flex flex-wrap items-end gap-3">
            <label className="flex min-w-[190px] flex-[2] flex-col gap-[5px]">
              <span className="text-[11px] font-bold uppercase tracking-[0.05em] text-[#555]">Email *</span>
              <input className="rounded-lg border border-[#d1d5db] bg-white px-3 py-[9px] text-sm text-[#1a1a1a] placeholder:text-[#aaa]" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="friend@gmail.com" />
            </label>
            <label className="flex min-w-[130px] flex-1 flex-col gap-[5px]">
              <span className="text-[11px] font-bold uppercase tracking-[0.05em] text-[#555]">First Name *</span>
              <input className="rounded-lg border border-[#d1d5db] bg-white px-3 py-[9px] text-sm text-[#1a1a1a] placeholder:text-[#aaa]" value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="Sarah" />
            </label>
            {showLastName && (
              <label className="flex min-w-[130px] flex-1 flex-col gap-[5px]">
                <span className="text-[11px] font-bold uppercase tracking-[0.05em] text-[#555]">Last Name</span>
                <input className="rounded-lg border border-[#d1d5db] bg-white px-3 py-[9px] text-sm text-[#1a1a1a] placeholder:text-[#aaa]" value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Johnson" />
              </label>
            )}
            <label className="flex min-w-[130px] flex-1 flex-col gap-[5px]">
              <span className="text-[11px] font-bold uppercase tracking-[0.05em] text-[#555]">Phone (optional)</span>
              <input className="rounded-lg border border-[#d1d5db] bg-white px-3 py-[9px] text-sm text-[#1a1a1a] placeholder:text-[#aaa]" type="tel" value={phone} onChange={(e) => {
                const digits = e.target.value.replace(/\D/g, '').slice(0, 10)
                let formatted = digits
                if (digits.length > 6) formatted = `(${digits.slice(0,3)}) ${digits.slice(3,6)}-${digits.slice(6)}`
                else if (digits.length > 3) formatted = `(${digits.slice(0,3)}) ${digits.slice(3)}`
                else if (digits.length > 0) formatted = `(${digits}`
                setPhone(formatted)
              }} placeholder="(555) 000-0000" />
            </label>
            <label className="flex min-w-[140px] max-w-[160px] flex-1 flex-col gap-[5px]">
              <span className="text-[11px] font-bold uppercase tracking-[0.05em] text-[#555]">Free Access</span>
              <select className="rounded-lg border border-[#d1d5db] bg-white px-3 py-[9px] text-sm text-[#1a1a1a]" value={duration} onChange={(e) => setDuration(e.target.value)}>
                {ACCESS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
            <label className="flex min-w-fit flex-col gap-[5px]">
              <span className="text-[11px] font-bold uppercase tracking-[0.05em] text-transparent">Submit</span>
              <div className="flex gap-2">
                <button type="button" disabled={sending} onClick={(e) => submitInvite(e, 'email')} className="whitespace-nowrap rounded-lg border-0 bg-[#f97316] px-[18px] py-2.5 text-sm font-semibold text-white disabled:opacity-60">
                  {sending ? '…' : 'Email ✉'}
                </button>
                {phone.trim() && (
                  <button type="button" disabled={sending} onClick={(e) => submitInvite(e, 'sms')} className="whitespace-nowrap rounded-lg border border-[#f97316] bg-white px-[18px] py-2.5 text-sm font-semibold text-[#f97316] disabled:opacity-60">
                    {sending ? '…' : 'Text 💬'}
                  </button>
                )}
              </div>
            </label>
          </form>
          {message && <p className={`mt-3 text-[13px] font-semibold ${message.startsWith('Error') ? 'text-red-600' : 'text-green-700'}`}>{message}</p>}
        </section>

        <section className="rounded-xl border border-[#e5e5e5] bg-white p-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-[17px] font-semibold">
              Invited People <span className="text-sm font-normal text-[#999]">({sortedPeople.length})</span>
            </h2>
            <label className="flex items-center gap-2 text-[13px] text-[#555]">
              Sort by:
              <select className="rounded-md border border-[#d1d5db] px-2.5 py-[5px] text-[13px]" value={sortBy} onChange={(e) => setSortBy(e.target.value as SortKey)}>
                <option value="first_name">First Name</option>
                <option value="last_name">Last Name</option>
                <option value="last_used">Last Used ↓</option>
                <option value="finished">Stories Finished ↓</option>
              </select>
            </label>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[13px]">
              <thead>
                <tr>
                  {['Name', 'Contact', 'Access', 'Status', 'Times Used', 'Last Used', 'Started', 'Finished', 'Actions'].map((heading) => (
                    <th key={heading} className="border-b-2 border-[#e5e5e5] px-3 py-2 text-left text-[11px] font-bold uppercase tracking-[0.05em] text-[#888]">
                      {heading === 'Times Used' || heading === 'Last Used' ? heading.replace(' ', '\n') : heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td className="px-3 py-5 text-[#888]" colSpan={9}>Loading...</td></tr>
                ) : sortedPeople.length === 0 ? (
                  <tr><td className="px-3 py-5 text-[#888]" colSpan={9}>No magic link invite redemptions found.</td></tr>
                ) : sortedPeople.map((person) => {
                  const active = person.subscriptionEndsAt ? new Date(person.subscriptionEndsAt) > new Date() : false
                  const displayFirst = person.firstName || person.displayName
                  const displayLast = person.lastName
                  return (
                    <tr key={person.userId || person.email} className="border-b border-[#f0f0f0] hover:bg-[#fafafa]">
                      <td className="px-3 py-[13px] align-middle text-sm font-semibold">
                        {displayFirst || '--'} {displayLast && <span className="font-normal text-[#888]">{displayLast}</span>}
                        {isTestAccount(person.email) && <span className="ml-1.5 inline-block rounded bg-[#fef3c7] px-1.5 py-0.5 align-middle text-[10px] font-bold text-[#92400e]">TEST</span>}
                      </td>
                      <td className="px-3 py-[13px] align-middle">
                        <a className="text-xs text-[#f97316] no-underline hover:underline" href={`mailto:${person.email}`}>{person.email}</a>
                        {person.phone ? (
                          <a className="mt-[3px] block text-xs text-[#3b82f6] no-underline" href={smsHref(person.phone)}>Phone {person.phone}</a>
                        ) : (
                          <span className="mt-[3px] block text-xs text-[#ccc]">No phone on file</span>
                        )}
                      </td>
                      <td className="px-3 py-[13px] align-middle"><span className="inline-block rounded-md bg-[#eff6ff] px-2 py-[3px] text-xs font-semibold text-[#1d4ed8]">{accessBadge(person.subscriptionDays)}</span></td>
                      <td className="px-3 py-[13px] align-middle"><span className={`inline-block rounded-md px-2 py-[3px] text-xs font-semibold ${active ? 'bg-[#d1fae5] text-[#065f46]' : 'bg-[#fee2e2] text-[#991b1b]'}`}>{active ? 'Active' : 'Expired'}</span></td>
                      <td className="px-3 py-[13px] text-center align-middle text-[15px] font-bold">{person.timesUsed}</td>
                      <td className="whitespace-nowrap px-3 py-[13px] align-middle text-xs text-[#555]">
                        {formatDate(person.lastUsedAt) || <span className="italic text-[#ccc]">Never</span>}
                        <br /><span className="text-[11px] text-[#999]">{relativeDate(person.lastUsedAt)}</span>
                      </td>
                      <td className="px-3 py-[13px] text-center align-middle">
                        <button type="button" onClick={() => setSelectedPerson(person)} className="text-[15px] font-bold text-[#f97316] underline decoration-dotted hover:text-[#ea6c0a]">{person.started}</button>
                      </td>
                      <td className="px-3 py-[13px] text-center align-middle text-[15px] font-bold">{person.finished}</td>
                      <td className="min-w-[190px] px-3 py-[13px] align-middle">
                        <a className="mr-1 inline-block rounded-md border border-[#d1d5db] bg-white px-[11px] py-[5px] text-xs font-medium text-[#374151]" href={`mailto:${person.email}`}>Email</a>
                        {person.phone && <a className="mr-1 inline-block rounded-md border border-[#3b82f6] bg-white px-[11px] py-[5px] text-xs font-medium text-[#3b82f6]" href={smsHref(person.phone)}>Text</a>}
                        <button type="button" onClick={() => toggleAccess(person)} className={`rounded-md border bg-white px-[11px] py-[5px] text-xs font-medium ${active ? 'border-[#d1d5db] text-[#9ca3af]' : 'border-[#f97316] text-[#f97316]'}`}>{active ? 'Deactivate' : 'Reactivate'}</button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div className="mt-5 rounded-lg border border-[#fed7aa] bg-[#fff7ed] px-4 py-3 text-[13px] text-[#92400e]">
            <strong>Started</strong> count is clickable - tap to see each story&apos;s metadata and completion status. <strong>Email</strong> opens your mail client. <strong>Text</strong> opens SMS. <strong>Test</strong> users are marked for metric review.
          </div>
        </section>
      </div>

      {selectedPerson && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 p-4" onClick={(e) => e.target === e.currentTarget && setSelectedPerson(null)}>
          <div className="max-h-[85vh] w-[640px] max-w-[95vw] overflow-y-auto rounded-[14px] bg-white p-7">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-bold">{selectedPerson.displayName} - Stories</h3>
                <p className="mt-1 text-[13px] text-[#888]">{selectedPerson.started} started · {selectedPerson.finished} completed</p>
              </div>
              <button type="button" onClick={() => setSelectedPerson(null)} className="border-0 bg-transparent text-[22px] leading-none text-[#aaa] hover:text-[#333]">x</button>
            </div>

            {selectedPerson.stories.length === 0 ? (
              <p className="rounded-[10px] border border-[#e5e5e5] p-4 text-sm text-[#888]">No story activity found for this user.</p>
            ) : selectedPerson.stories.map((story) => (
              <div key={story.id} className="mb-3 rounded-[10px] border border-[#e5e5e5] p-4">
                <h4 className="mb-2 text-[15px] font-semibold">
                  {story.title}
                  <span className={`ml-2 inline-block rounded-[10px] px-2 py-0.5 text-[11px] font-bold ${story.completed ? 'bg-[#d1fae5] text-[#065f46]' : 'bg-[#fef3c7] text-[#92400e]'}`}>{story.completed ? 'Completed' : 'In Progress'}</span>
                </h4>
                <div className="flex flex-wrap gap-5">
                  <div className="flex flex-col gap-0.5"><span className="text-[11px] font-semibold uppercase text-[#999]">Started</span><span className="text-[13px] font-semibold">{formatDate(story.startedAt) || '--'}</span></div>
                  <div className="flex flex-col gap-0.5"><span className="text-[11px] font-semibold uppercase text-[#999]">Finished</span><span className="text-[13px] font-semibold">{formatDate(story.finishedAt) || '--'}</span></div>
                  <div className="flex flex-col gap-0.5"><span className="text-[11px] font-semibold uppercase text-[#999]">Duration</span><span className="text-[13px] font-semibold">{story.durationMins ? `${story.durationMins} min` : '--'}</span></div>
                  <div className="flex flex-col gap-0.5"><span className="text-[11px] font-semibold uppercase text-[#999]">Listen %</span><span className="text-[13px] font-semibold">{story.progressPercent}%</span></div>
                </div>
                {!story.completed && (
                  <div className="mt-2 h-1.5 rounded bg-[#f0f0f0]">
                    <div className="h-1.5 rounded bg-[#f97316]" style={{ width: `${story.progressPercent}%` }} />
                  </div>
                )}
              </div>
            ))}

            <div className="mt-4 text-right">
              <button type="button" onClick={() => setSelectedPerson(null)} className="rounded-lg bg-[#f97316] px-[22px] py-2.5 text-sm font-semibold text-white">Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
