// components/news/AdminNewsGenerator.tsx
// Admin button to manually trigger news generation

'use client';

import { useState } from 'react';

interface GenerationResult {
  success: boolean;
  message?: string;
  episode?: {
    id: string;
    title: string;
    edition: string;
    audioUrl: string;
    durationMins: number;
    storiesCount: {
      news: number;
      science: number;
      sports: number;
    };
  };
  error?: string;
}

export function AdminNewsGenerator() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<GenerationResult | null>(null);
  const [edition, setEdition] = useState<'morning' | 'evening' | 'auto'>('auto');

  async function handleGenerate() {
    if (!confirm('Generate a new Daily Briefing episode? This will replace the current live episode.')) {
      return;
    }

    setLoading(true);
    setResult(null);

    try {
      const body: Record<string, any> = {};
      if (edition !== 'auto') {
        body.edition = edition;
      }

      const response = await fetch('/api/admin/generate-news', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      const data = await response.json();
      setResult(data);
    } catch (error) {
      setResult({
        success: false,
        error: error instanceof Error ? error.message : 'Generation failed'
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-slate-800 rounded-xl p-6 border border-slate-700">
      <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
        <svg className="w-5 h-5 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9.5a2 2 0 00-2-2h-2" />
        </svg>
        Daily News Generator
      </h3>

      <p className="text-slate-400 text-sm mb-4">
        Generate a new Daily Briefing episode. This will fetch the latest news from RSS feeds, 
        generate a script with Claude, create audio with ElevenLabs, and publish it as the live episode.
      </p>

      <div className="flex items-center gap-4 mb-4">
        <label className="text-sm text-slate-300">Edition:</label>
        <select
          value={edition}
          onChange={(e) => setEdition(e.target.value as 'morning' | 'evening' | 'auto')}
          className="bg-slate-700 text-white rounded px-3 py-2 text-sm border border-slate-600"
          disabled={loading}
        >
          <option value="auto">Auto (based on time)</option>
          <option value="morning">Morning Edition</option>
          <option value="evening">Evening Edition</option>
        </select>
      </div>

      <button
        onClick={handleGenerate}
        disabled={loading}
        className={`w-full py-3 rounded-lg font-medium transition-all flex items-center justify-center gap-2 ${
          loading
            ? 'bg-slate-700 text-slate-400 cursor-not-allowed'
            : 'bg-orange-500 hover:bg-orange-400 text-white'
        }`}
      >
        {loading ? (
          <>
            <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            Generating... (this may take 2-3 minutes)
          </>
        ) : (
          <>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            Generate Daily Briefing
          </>
        )}
      </button>

      {/* Result display */}
      {result && (
        <div className={`mt-4 p-4 rounded-lg ${
          result.success ? 'bg-green-900/30 border border-green-500/30' : 'bg-red-900/30 border border-red-500/30'
        }`}>
          {result.success ? (
            <div>
              <p className="text-green-400 font-medium flex items-center gap-2">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Episode Generated Successfully!
              </p>
              {result.episode && (
                <div className="mt-2 text-sm text-slate-300">
                  <p><strong>Title:</strong> {result.episode.title}</p>
                  <p><strong>Edition:</strong> {result.episode.edition}</p>
                  <p><strong>Duration:</strong> {result.episode.durationMins} minutes</p>
                  <p><strong>Stories:</strong> {result.episode.storiesCount.news} news, {result.episode.storiesCount.science} science, {result.episode.storiesCount.sports} sports</p>
                </div>
              )}
            </div>
          ) : (
            <p className="text-red-400">
              {result.error || result.message || 'Generation failed'}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
