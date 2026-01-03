'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { LogoStacked } from '@/components/ui/Logo';
import { supabase } from '@/lib/supabase';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rememberedName, setRememberedName] = useState<string | null>(null);

  // Check for remembered user
  useEffect(() => {
    const storedName = localStorage.getItem('dtt_remembered_name');
    const storedEmail = localStorage.getItem('dtt_remembered_email');
    if (storedName) {
      setRememberedName(storedName);
    }
    if (storedEmail) {
      setEmail(storedEmail);
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password: password,
      });

      if (authError) {
        setError(authError.message.includes('Invalid login') 
          ? 'Invalid email or password' 
          : authError.message);
        setIsSubmitting(false);
        return;
      }

      if (data.user) {
        // Save name for "Welcome Back" on future visits
        const { data: profile } = await supabase
          .from('users')
          .select('display_name')
          .eq('id', data.user.id)
          .single();

        if (profile?.display_name) {
          localStorage.setItem('dtt_remembered_name', profile.display_name.split(' ')[0]);
          localStorage.setItem('dtt_remembered_email', email.trim());
        }

        router.push('/home');
      }
    } catch (err) {
      setError('An error occurred. Please try again.');
      setIsSubmitting(false);
    }
  };

  const handleNotYou = () => {
    localStorage.removeItem('dtt_remembered_name');
    localStorage.removeItem('dtt_remembered_email');
    setRememberedName(null);
    setEmail('');
    setPassword('');
  };

  const handleGoogleSignIn = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    if (error) setError(error.message);
  };

  const handleAppleSignIn = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'apple',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    if (error) setError(error.message);
  };

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col">
      {/* Header - only show Back button for new users, not returning users */}
      <header className="px-4 py-4 h-12">
        {!rememberedName && (
          <button 
            onClick={() => router.push('/welcome')}
            className="text-white"
          >
            ← Back
          </button>
        )}
      </header>

      {/* Content */}
      <div className="flex-1 px-6 py-8">
        <div className="text-center mb-8">
          <LogoStacked size="lg" />
          {rememberedName ? (
            <>
              <p className="text-white text-xl mt-4">Welcome back, {rememberedName}! 👋</p>
              <button
                type="button"
                onClick={handleNotYou}
                className="text-orange-400 text-sm hover:underline mt-1"
              >
                Not {rememberedName}? Click here
              </button>
            </>
          ) : (
            <p className="text-white mt-4">Welcome back!</p>
          )}
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
            <Link href="/reset-password" className="text-orange-400 text-sm">
              Forgot password?
            </Link>
          </div>

          {error && (
            <div className="p-3 bg-red-500/20 border border-red-500/30 rounded-lg">
              <p className="text-red-400 text-sm text-center">{error}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className={`w-full py-4 font-bold rounded-xl transition-colors ${
              isSubmitting
                ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                : 'bg-orange-500 hover:bg-orange-400 text-black'
            }`}
          >
            {isSubmitting ? 'Signing In...' : 'Sign In'}
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
          <button 
            onClick={handleGoogleSignIn}
            className="w-full py-3 bg-gray-900 border border-gray-700 rounded-xl text-white flex items-center justify-center gap-3 hover:bg-gray-800 transition-colors"
          >
            <span>🔵</span> Continue with Google
          </button>
          <button 
            onClick={handleAppleSignIn}
            className="w-full py-3 bg-gray-900 border border-gray-700 rounded-xl text-white flex items-center justify-center gap-3 hover:bg-gray-800 transition-colors"
          >
            <span>⚫</span> Continue with Apple
          </button>
        </div>

        {/* Sign Up Link */}
        <p className="text-center text-white text-sm mt-8">
          Don't have an account?{' '}
          <Link href="/pricing" className="text-orange-400 font-medium">
            Sign Up
          </Link>
        </p>
      </div>
    </div>
  );
}
