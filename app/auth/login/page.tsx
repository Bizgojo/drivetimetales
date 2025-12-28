'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { LogoStacked } from '@/components/ui/Logo';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // TODO: Handle login
    console.log('Login:', { email, password });
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
          <p className="text-white mt-4">Welcome back!</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
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
          </div>

          <div className="text-right">
            <Link href="/auth/forgot" className="text-orange-400 text-sm">
              Forgot password?
            </Link>
          </div>

          <button
            type="submit"
            className="w-full py-4 bg-orange-500 text-white font-bold rounded-xl"
          >
            Sign In
          </button>
        </form>

        {/* Divider */}
        <div className="flex items-center gap-4 my-6">
          <div className="flex-1 h-px bg-gray-800" />
          <span className="text-white text-sm">or</span>
          <div className="flex-1 h-px bg-gray-800" />
        </div>

        {/* Social Login */}
        <div className="space-y-3">
          <button className="w-full py-3 bg-gray-900 border border-gray-700 rounded-xl text-white flex items-center justify-center gap-3">
            <span>🔵</span> Continue with Google
          </button>
          <button className="w-full py-3 bg-gray-900 border border-gray-700 rounded-xl text-white flex items-center justify-center gap-3">
            <span>⚫</span> Continue with Apple
          </button>
        </div>

        {/* Sign Up Link */}
        <p className="text-center text-white text-sm mt-8">
          Don't have an account?{' '}
          <Link href="/auth/signup" className="text-orange-400 font-medium">
            Sign Up
          </Link>
        </p>
      </div>
    </div>
  );
}
