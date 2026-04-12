'use client'
import StickyHeaderFull from '@/components/StickyHeaderFull';
import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';

const GENRES = [
  'Adventure',
  'Comedy',
  'Drama',
  'Fantasy',
  'Historical',
  'Horror',
  'Mystery',
  'Romance',
  'Science Fiction',
  'Thriller',
  'True Crime',
  'Western',
];

const TERMS = [
  'No sexual content or graphic violence of any kind.',
  'No real names for characters or specific real-world locations.',
  'I understand there is no compensation for submitted ideas. If selected, I will receive a story credit and one week added free to my subscription.',
  'If published, I accept full liability for any defamation, slander, or libel originating from my story idea.',
];

export default function SuggestStoryPage() {
  const { user } = useAuth();
  const router = useRouter();

  const [form, setForm] = useState({
    name: '',
    email: '',
    genre: '',
    title: '',
    idea: '',
  });
  const [termsChecked, setTermsChecked] = useState([false, false, false, false]);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (user) {
      const fullName = [user.first_name, user.last_name].filter(Boolean).join(' ');
      setForm(prev => ({
        ...prev,
        email: user.email || prev.email,
        name: fullName || prev.name,
      }));
    }
  }, [user]);

  const wordCount = form.idea.trim().split(/\s+/).filter(Boolean).length;
  const allTermsAccepted = termsChecked.every(Boolean);
  const canSubmit =
    form.name.trim() &&
    form.email.trim() &&
    form.genre &&
    form.title.trim() &&
    form.idea.trim() &&
    wordCount <= 50 &&
    allTermsAccepted;

  const handleToggleTerm = (i: number) => {
    setTermsChecked(prev => prev.map((v, idx) => (idx === i ? !v : v)));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError('');

    try {
      const res = await fetch('/api/suggest-story', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });

      if (res.ok) {
        setSubmitted(true);
      } else {
        const data = await res.json();
        setError(data.error || 'Something went wrong. Please try again.');
      }
    } catch {
      setError('Could not submit. Please check your connection and try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="min-h-screen bg-gray-950 text-white">
        <StickyHeaderFull />
        <div className="flex flex-col items-center justify-center px-6 py-20 text-center">
          <span className="text-6xl mb-6">🎙️</span>
          <h1 className="text-2xl font-bold text-white mb-3">Idea Received!</h1>
          <p className="text-gray-400 max-w-sm mb-8">
            Thanks for sharing your story idea. Our team reviews every submission — if yours is selected,
            we'll reach out and add a free week to your subscription.
          </p>
          <button
            onClick={() => router.push('/account/faqs')}
            className="px-6 py-3 bg-orange-500 text-black font-bold rounded-xl"
          >
            Back to FAQs
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <StickyHeaderFull />

      <div className="px-4 py-6 pb-24 max-w-xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <span className="text-5xl mb-4 block">💡</span>
          <h1 className="text-2xl font-bold text-white mb-2">Suggest a Story Idea</h1>
          <p className="text-gray-400 text-sm">
            Got a great idea for a story? Tell us about it. If we pick yours,
            you'll get a credit and a free week added to your subscription.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Your Name</label>
            <input
              type="text"
              value={form.name}
              onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))}
              placeholder="Full name"
              className="w-full bg-gray-900 border border-gray-700 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-orange-500"
              required
            />
          </div>

          {/* Email */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Email Address</label>
            <input
              type="email"
              value={form.email}
              onChange={e => setForm(prev => ({ ...prev, email: e.target.value }))}
              placeholder="you@example.com"
              className="w-full bg-gray-900 border border-gray-700 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-orange-500"
              required
            />
          </div>

          {/* Genre */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Genre</label>
            <select
              value={form.genre}
              onChange={e => setForm(prev => ({ ...prev, genre: e.target.value }))}
              className="w-full bg-gray-900 border border-gray-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-orange-500"
              required
            >
              <option value="" disabled>Select a genre…</option>
              {GENRES.map(g => (
                <option key={g} value={g}>{g}</option>
              ))}
            </select>
          </div>

          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Story Title</label>
            <input
              type="text"
              value={form.title}
              onChange={e => setForm(prev => ({ ...prev, title: e.target.value }))}
              placeholder="Give your story a working title"
              className="w-full bg-gray-900 border border-gray-700 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-orange-500"
              required
            />
          </div>

          {/* Story Idea */}
          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="text-sm font-medium text-gray-300">Your Story Idea</label>
              <span className={`text-xs font-medium ${wordCount > 50 ? 'text-red-400' : 'text-gray-500'}`}>
                {wordCount} / 50 words
              </span>
            </div>
            <textarea
              value={form.idea}
              onChange={e => setForm(prev => ({ ...prev, idea: e.target.value }))}
              placeholder="Describe your story idea in 50 words or less…"
              rows={4}
              className="w-full bg-gray-900 border border-gray-700 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-orange-500 resize-none"
              required
            />
            {wordCount > 50 && (
              <p className="text-red-400 text-xs mt-1">Please keep your idea to 50 words or less.</p>
            )}
          </div>

          {/* Terms */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <p className="text-sm font-semibold text-white mb-4">Submission Terms</p>
            <div className="space-y-3">
              {TERMS.map((term, i) => (
                <label key={i} className="flex items-start gap-3 cursor-pointer">
                  <div
                    onClick={() => handleToggleTerm(i)}
                    className={`mt-0.5 flex-shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                      termsChecked[i]
                        ? 'bg-orange-500 border-orange-500'
                        : 'bg-transparent border-gray-600'
                    }`}
                  >
                    {termsChecked[i] && (
                      <svg className="w-3 h-3 text-black" fill="none" viewBox="0 0 12 12">
                        <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    )}
                  </div>
                  <span className="text-gray-300 text-sm leading-snug" onClick={() => handleToggleTerm(i)}>
                    {term}
                  </span>
                </label>
              ))}
            </div>
          </div>

          {/* Error */}
          {error && (
            <p className="text-red-400 text-sm text-center">{error}</p>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={!canSubmit || submitting}
            className={`w-full py-4 rounded-xl font-bold text-base transition-opacity ${
              canSubmit && !submitting
                ? 'bg-orange-500 text-black'
                : 'bg-gray-700 text-gray-500 cursor-not-allowed'
            }`}
          >
            {submitting ? 'Submitting…' : 'Submit My Idea'}
          </button>
        </form>
      </div>
    </div>
  );
}
