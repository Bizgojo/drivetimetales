'use client'

import Link from 'next/link'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'

export default function SignInPage() {
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [step, setStep] = useState<'info' | 'verify'>('info')
  const router = useRouter()
  const { signIn } = useAuth()

  const handleInfoSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setStep('verify')
  }

  const handleVerify = (e: React.FormEvent) => {
    e.preventDefault()
    router.push('/')
  }
  return (
    <div className="py-16 px-4">
      <div className="max-w-sm mx-auto">
        <Link href="/" className="flex items-center justify-center gap-2 mb-6">
          <span className="text-2xl">🚛</span>
          <span className="font-bold"><span className="text-orange-400">Drive Time</span> Tales</span>
        </Link>
        <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-6">
          {step === 'info' ? (
            <>
              <h1 className="text-xl font-bold text-white text-center mb-1">Welcome Back</h1>
              <p className="text-slate-400 text-sm text-center mb-6">Sign in to register this device</p>
              <form onSubmit={handleInfoSubmit} className="space-y-3">
                <input type="text" value={name} onChange={e => setName(e.target.value)} required placeholder="Your first name" className="w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-orange-500" />
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} required placeholder="you@example.com" className="w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-orange-500" />
                <button type="submit" className="w-full py-3 bg-orange-500 hover:bg-orange-400 text-black font-semibold rounded-lg">Continue</button>
              </form>
            </>
          ) : (
            <>
              <h1 className="text-xl font-bold text-white text-center mb-1">Verify Your Email</h1>
              <p className="text-slate-400 text-sm text-center mb-2">We sent a code to <span className="text-orange-400">{email}</span></p>
              <p className="text-xs text-slate-500 text-center mb-6">(Demo: just click Verify to continue)</p>
              <form onSubmit={handleVerify}>
                <button type="submit" className="w-full py-3 bg-orange-500 hover:bg-orange-400 text-black font-semibold rounded-lg">Verify & Register Device</button>
              </form>
              <button onClick={() => setStep('info')} className="w-full mt-3 text-slate-400 text-sm hover:text-white">← Go back</button>
            </>
          )}
          <div className="mt-6 p-3 bg-slate-900/50 rounded-lg">
            <p className="text-xs text-slate-400 text-center">🔒 Once registered, this device will remember you. No passwords needed!</p>
          </div>
        </div>
        <p className="text-center text-slate-400 text-sm mt-4">New here? <Link href="/signup" className="text-orange-400">Create account</Link></p>
      </div>
    </div>
  )
}
