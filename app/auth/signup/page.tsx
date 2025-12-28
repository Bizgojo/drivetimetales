'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { LogoStacked } from '@/components/ui/Logo';

export default function SignUpPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // TODO: Handle signup
    console.log('Signup:', { email, password, firstName });
  };

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col">
      {/* Header */}
      <header className="px-4 py-4">
        <button 
          onClick={() => window.history.back()}
          className="text-white"
        >
          ← Back
        </button>
      </header>

      {/* Content */}
      <div className="flex-1 px-6 py-8">
        <div className="text-center mb-8">
          <LogoStacked size="lg" />
          <p className="text-white mt-4">Create your account</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-white text-sm mb-2">First Name</label>
            <input
              type="text"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              placeholder="John"
              className="w-full bg-gray-900 border border-gray-700 rounded-xl py-3 px-4 text-white placeholder-gray-500 focus:outline-none focus:border-orange-500"
              required
            />
          </div>

          <div>
            <label className="block text-white text-sm mb-2">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com"
              className="w-full bg-gray-900 border border-gray-700 rounded-xl py-3 px-4 text-white placeholder-gray-500 focus:outline-none focus:border-orange-500"
              required
            />
          </div>

          <div>
            <label className="block text-white text-sm mb-2">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full bg-gray-900 border border-gray-700 rounded-xl py-3 px-4 text-white placeholder-gray-500 focus:outline-none focus:border-orange-500"
              required
            />
            <p className="text-white text-xs mt-1">At least 8 characters</p>
          </div>

          <button
            type="submit"
            className="w-full py-4 bg-orange-500 text-white font-bold rounded-xl"
          >
            Create Account
          </button>

          <p className="text-white text-xs text-center">
            By signing up, you agree to our{' '}
            <Link href="/terms" className="text-orange-400">Terms</Link>
            {' '}and{' '}
            <Link href="/privacy" className="text-orange-400">Privacy Policy</Link>
          </p>
        </form>

        {/* Divider */}
        <div className="flex items-center gap-4 my-6">
          <div className="flex-1 h-px bg-gray-800" />
          <span className="text-white text-sm">or</span>
          <div className="flex-1 h-px bg-gray-800" />
        </div>

        {/* Social Signup */}
        <div className="space-y-3">
          <button className="w-full py-3 bg-gray-900 border border-gray-700 rounded-xl text-white flex items-center justify-center gap-3">
            <span>🔵</span> Continue with Google
          </button>
          <button className="w-full py-3 bg-gray-900 border border-gray-700 rounded-xl text-white flex items-center justify-center gap-3">
            <span>⚫</span> Continue with Apple
          </button>
        </div>

        {/* Sign In Link */}
        <p className="text-center text-white text-sm mt-8">
          Already have an account?{' '}
          <Link href="/auth/login" className="text-orange-400 font-medium">
            Sign In
          </Link>
        </p>

        {/* Free Credits Banner */}
        <div className="mt-6 p-4 bg-green-500/20 border border-green-500/30 rounded-xl text-center">
          <p className="text-green-400 font-medium">🎉 Get 2 free credits when you sign up!</p>
        </div>
      </div>
    </div>
  );
}
