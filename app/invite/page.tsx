'use client'
import { useEffect, useState } from 'react'
import { normalizeReferralCode } from '@/lib/referral'
export default function InvitePage() {
  const [code, setCode] = useState(''), [token, setToken] = useState('')
  const [firstName, setFirstName] = useState(''), [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false), [sent, setSent] = useState(false), [error, setError] = useState('')
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    setCode(normalizeReferralCode(params.get('ref')) || '')
    setToken(new URLSearchParams(window.location.hash.slice(1)).get('token_hash') || '')
    if (window.location.hash) window.history.replaceState(null, '', window.location.pathname + window.location.search)
    if (params.has('error')) setError('This invitation could not be activated. Open a new invitation email, or sign in if you already have an account.')
  }, [])
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError('')
    try {
      const response = await fetch('/api/referral/start', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ firstName, email, code }) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error)
      setSent(true)
    } catch (err) { setError(err instanceof Error ? err.message : 'Please try again.') } finally { setBusy(false) }
  }
  return <div className="max-w-md mx-auto p-6 text-white">
    <h1 className="text-2xl font-bold mb-4">Your friend is giving you two free weeks</h1>
    <p className="mb-5">Enjoy every story for 14 days. No card required. After your free access ends, choose a subscription to keep listening.</p>
    {token ? <form action="/api/referral/accept" method="POST"><input type="hidden" name="token_hash" value={token} /><input type="hidden" name="code" value={code} /><button className="bg-orange-500 text-black font-bold rounded-xl p-4 w-full">Start My Two Free Weeks</button></form> : sent ? <p role="status">Check your email. Open the invitation and tap Start My Two Free Weeks to confirm your address and begin.</p> : <form onSubmit={submit} className="flex flex-col gap-4">
      <label>First name<input className="block w-full p-3 mt-1 rounded-lg text-black bg-white" required maxLength={100} autoComplete="given-name" value={firstName} onChange={e => setFirstName(e.target.value)} /></label>
      <label>Email<input className="block w-full p-3 mt-1 rounded-lg text-black bg-white" required type="email" maxLength={254} autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} /></label>
      <button disabled={busy || !code} className="bg-orange-500 text-black font-bold rounded-xl p-4">{busy ? 'Sending…' : 'Get My Two Free Weeks'}</button>
    </form>}
    {error && <p role="alert" className="mt-4">{error}</p>}
    <p className="mt-5"><a href="/signin" className="underline">Already have an account? Sign in</a></p>
  </div>
}
