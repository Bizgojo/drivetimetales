'use client'
import { useEffect, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { LISTENING_GENRES, cleanListeningPreferences } from '@/lib/listeningPreferences'
export default function ListeningPreferencesForm() {
  const { user, refreshUser } = useAuth()
  const [form, setForm] = useState(cleanListeningPreferences(null))
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  useEffect(() => { setForm(cleanListeningPreferences(user?.user_metadata?.listening_preferences)) }, [user?.user_metadata?.listening_preferences])
  async function save(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setMessage('')
    try {
      const res = await fetch('/api/user/preferences', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
      const data = await res.json(); if (!res.ok) throw new Error(data.error)
      const { supabaseBrowser } = await import('@/lib/supabase-browser')
      await supabaseBrowser.auth.refreshSession(); await refreshUser()
      setMessage('Saved! Your Home page recommendations will use these preferences.')
    } catch (err) { setMessage(err instanceof Error ? err.message : 'Could not save. Please try again.') }
    finally { setBusy(false) }
  }
  const input = 'block w-full mt-2 p-3 rounded-lg bg-slate-800 text-white border border-slate-600'
  return <form onSubmit={save} className="space-y-4">
    <fieldset><legend className="mb-2 font-bold">Favorite genres</legend><div className="flex flex-wrap gap-2">{LISTENING_GENRES.map(genre => <label key={genre} className="flex gap-2 items-center rounded-lg border border-slate-600 px-3 py-2"><input type="checkbox" checked={form.genres.includes(genre)} onChange={e => setForm(prev => ({ ...prev, genres: e.target.checked ? [...prev.genres, genre] : prev.genres.filter(g => g !== genre) }))} />{genre}</label>)}</div></fieldset>
    <label className="block">Interests or themes<textarea className={input} maxLength={500} placeholder="For example: small towns, space exploration, family secrets" value={form.interests} onChange={e => setForm({ ...form, interests: e.target.value })} /></label>
    <label className="block">Things you’d rather avoid<textarea className={input} maxLength={500} placeholder="Separate topics with commas" value={form.avoid} onChange={e => setForm({ ...form, avoid: e.target.value })} /></label>
    <p className="text-sm">We match these topics against story descriptions. This helps personalize your choices, but cannot guarantee that a story contains no unwanted themes.</p>
    <label className="block">Preferred listening length per episode<select className={input} value={form.minutes} onChange={e => setForm({ ...form, minutes: Number(e.target.value) })}><option value="0">Any length</option><option value="15">About 15 minutes</option><option value="30">About 30 minutes</option><option value="60">About an hour</option></select></label>
    <button disabled={busy} className="px-4 py-3 rounded-xl bg-orange-500 text-black font-bold disabled:opacity-50">{busy ? 'Saving…' : 'Save My Preferences'}</button><p role="status">{message}</p>{message.startsWith('Saved!') && <a href="/home" className="block underline text-orange-300">See My Recommendations</a>}
  </form>
}
