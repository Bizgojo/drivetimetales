// FILE: app/admin/news-briefings/test-sources/page.tsx
// STANDALONE - Does not touch any existing DTT code
// Safe to delete without affecting anything else

'use client';

import { useState } from 'react';
import Link from 'next/link';

interface NewsStory {
  title: string;
  url: string;
  source: string;
  date: string;
  summary?: string;
  trendingScore?: number;
  fetchedContent?: string;
}

interface SourceResult {
  source: string;
  stories: NewsStory[];
  fetchTimeMs: number;
  error?: string;
  onTopicCount?: number;
  offTopicStories?: string[];
}

interface Comparison {
  source: string;
  storyCount: number;
  onTopicPercent: number;
  avgTrendingScore: number;
  error?: string;
}

interface TestResult {
  category: string;
  timestamp: string;
  results: SourceResult[];
  comparison?: Comparison[];
}

const CATEGORIES = [
  { id: 'national', label: 'National News', icon: '🇺🇸', color: '#f97316' },
  { id: 'business', label: 'Business News', icon: '💼', color: '#16a34a' },
  { id: 'sports', label: 'Sports News', icon: '⚽', color: '#2563eb' },
  { id: 'science', label: 'Science & Tech', icon: '🔬', color: '#9333ea' },
  { id: 'world', label: 'World News', icon: '🌍', color: '#eab308' },
  { id: 'state', label: 'State News', icon: '🏛️', color: '#dc2626' }
];

const SOURCES = [
  { id: 'gdelt', label: 'GDELT', description: 'Free, trending by article volume', experimental: false },
  { id: 'newsapi', label: 'NewsAPI', description: 'Current source, 100 req/day', experimental: false },
  { id: 'worldnews', label: 'World News API', description: 'Backup source', experimental: false },
  { id: 'reuters', label: 'Reuters Wire', description: 'Unofficial mobile API', experimental: true },
  { id: 'espn', label: 'ESPN', description: 'Sports only, unofficial', experimental: true }
];

const US_STATES = [
  'Alabama', 'Alaska', 'Arizona', 'Arkansas', 'California', 'Colorado', 'Connecticut',
  'Delaware', 'Florida', 'Georgia', 'Hawaii', 'Idaho', 'Illinois', 'Indiana', 'Iowa',
  'Kansas', 'Kentucky', 'Louisiana', 'Maine', 'Maryland', 'Massachusetts', 'Michigan',
  'Minnesota', 'Mississippi', 'Missouri', 'Montana', 'Nebraska', 'Nevada', 'New Hampshire',
  'New Jersey', 'New Mexico', 'New York', 'North Carolina', 'North Dakota', 'Ohio',
  'Oklahoma', 'Oregon', 'Pennsylvania', 'Rhode Island', 'South Carolina', 'South Dakota',
  'Tennessee', 'Texas', 'Utah', 'Vermont', 'Virginia', 'Washington', 'West Virginia',
  'Wisconsin', 'Wyoming'
];

export default function TestSourcesPage() {
  const [selectedCategory, setSelectedCategory] = useState('national');
  const [selectedSources, setSelectedSources] = useState<string[]>(['gdelt', 'newsapi', 'worldnews']);
  const [selectedState, setSelectedState] = useState('South Carolina');
  const [fetchContent, setFetchContent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<TestResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const toggleSource = (sourceId: string) => {
    setSelectedSources(prev => 
      prev.includes(sourceId) 
        ? prev.filter(s => s !== sourceId)
        : [...prev, sourceId]
    );
  };

  const runTest = async () => {
    if (selectedSources.length === 0) {
      setError('Please select at least one source');
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const params = new URLSearchParams({
        category: selectedCategory,
        sources: selectedSources.join(','),
        state: selectedState,
        fetchContent: fetchContent.toString()
      });

      const response = await fetch(`/api/admin/test-news-sources?${params}`);
      
      if (!response.ok) {
        throw new Error(`API returned ${response.status}`);
      }

      const data = await response.json();
      setResult(data);
    } catch (err: any) {
      setError(err.message || 'Test failed');
    } finally {
      setLoading(false);
    }
  };

  const getQualityStars = (onTopicPercent: number): string => {
    if (onTopicPercent >= 90) return '⭐⭐⭐⭐⭐';
    if (onTopicPercent >= 75) return '⭐⭐⭐⭐';
    if (onTopicPercent >= 60) return '⭐⭐⭐';
    if (onTopicPercent >= 40) return '⭐⭐';
    return '⭐';
  };

  const formatDate = (dateStr: string): string => {
    try {
      return new Date(dateStr).toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit'
      });
    } catch {
      return dateStr;
    }
  };

  const inputStyle: React.CSSProperties = { padding: '10px', fontSize: '16px', border: '2px solid #000000', borderRadius: '6px', backgroundColor: '#ffffff', color: '#000000' };
  const btnStyle: React.CSSProperties = { padding: '12px 24px', fontSize: '16px', fontWeight: 'bold', border: '2px solid #000000', borderRadius: '6px', cursor: 'pointer' };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f8fafc', color: '#000000', padding: '24px', fontFamily: 'Arial, sans-serif' }}>
      {/* Header */}
      <div style={{ marginBottom: '24px' }}>
        <Link href="/admin/news-briefings" style={{ color: '#3b82f6', textDecoration: 'none', fontSize: '16px' }}>
          ← Back to News Briefings Admin
        </Link>
        <h1 style={{ fontSize: '28px', fontWeight: 'bold', marginTop: '16px', marginBottom: '8px' }}>
          🧪 News Source Testing
        </h1>
        <p style={{ color: '#666666', fontSize: '16px' }}>
          Compare different news sources to find the best quality and trending accuracy for each category.
        </p>
      </div>

      {/* Controls */}
      <div style={{ backgroundColor: '#ffffff', border: '2px solid #000000', borderRadius: '12px', padding: '20px', marginBottom: '24px' }}>
        {/* Category Selection */}
        <div style={{ marginBottom: '20px' }}>
          <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '10px', fontSize: '16px' }}>Category</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
            {CATEGORIES.map(cat => (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                style={{
                  ...btnStyle,
                  backgroundColor: selectedCategory === cat.id ? cat.color : '#ffffff',
                  color: selectedCategory === cat.id ? '#ffffff' : '#000000',
                  borderColor: cat.color
                }}
              >
                {cat.icon} {cat.label}
              </button>
            ))}
          </div>
        </div>

        {/* State Selection (only for state category) */}
        {selectedCategory === 'state' && (
          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '10px', fontSize: '16px' }}>State</label>
            <select
              value={selectedState}
              onChange={e => setSelectedState(e.target.value)}
              style={{ ...inputStyle, width: '300px' }}
            >
              {US_STATES.map(state => (
                <option key={state} value={state}>{state}</option>
              ))}
            </select>
          </div>
        )}

        {/* Source Selection */}
        <div style={{ marginBottom: '20px' }}>
          <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '10px', fontSize: '16px' }}>Sources to Test</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
            {SOURCES.map(source => {
              // Only show ESPN for sports category
              if (source.id === 'espn' && selectedCategory !== 'sports') return null;
              
              const isSelected = selectedSources.includes(source.id);
              return (
                <div
                  key={source.id}
                  onClick={() => toggleSource(source.id)}
                  style={{
                    padding: '12px 16px',
                    border: `2px solid ${isSelected ? '#3b82f6' : '#cccccc'}`,
                    borderRadius: '8px',
                    backgroundColor: isSelected ? '#dbeafe' : '#ffffff',
                    cursor: 'pointer',
                    minWidth: '180px'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => {}}
                      style={{ width: '18px', height: '18px' }}
                    />
                    <span style={{ fontWeight: 'bold' }}>{source.label}</span>
                    {source.experimental && (
                      <span style={{ fontSize: '12px', backgroundColor: '#fef3c7', padding: '2px 6px', borderRadius: '4px' }}>
                        experimental
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: '13px', color: '#666666', marginTop: '4px', marginLeft: '26px' }}>
                    {source.description}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Options */}
        <div style={{ marginBottom: '20px' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={fetchContent}
              onChange={e => setFetchContent(e.target.checked)}
              style={{ width: '18px', height: '18px' }}
            />
            <span style={{ fontWeight: 'bold' }}>Fetch article content</span>
            <span style={{ fontSize: '14px', color: '#666666' }}>(slower, shows what Claude would receive)</span>
          </label>
        </div>

        {/* Run Button */}
        <button
          onClick={runTest}
          disabled={loading || selectedSources.length === 0}
          style={{
            ...btnStyle,
            backgroundColor: loading ? '#cccccc' : '#3b82f6',
            color: '#ffffff',
            minWidth: '200px'
          }}
        >
          {loading ? '🔄 Running Test...' : '🔍 Run Test'}
        </button>

        {error && (
          <div style={{ marginTop: '16px', padding: '12px', backgroundColor: '#fee2e2', border: '2px solid #dc2626', borderRadius: '6px', color: '#dc2626' }}>
            ❌ {error}
          </div>
        )}
      </div>

      {/* Results */}
      {result && (
        <>
          {/* Comparison Table */}
          {result.comparison && result.comparison.length > 0 && (
            <div style={{ backgroundColor: '#ffffff', border: '2px solid #000000', borderRadius: '12px', padding: '20px', marginBottom: '24px' }}>
              <h2 style={{ fontSize: '20px', fontWeight: 'bold', marginBottom: '16px' }}>📊 Comparison</h2>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ backgroundColor: '#f1f5f9' }}>
                    <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #000000' }}>Source</th>
                    <th style={{ padding: '12px', textAlign: 'center', borderBottom: '2px solid #000000' }}>Stories</th>
                    <th style={{ padding: '12px', textAlign: 'center', borderBottom: '2px solid #000000' }}>On-Topic</th>
                    <th style={{ padding: '12px', textAlign: 'center', borderBottom: '2px solid #000000' }}>Quality</th>
                    <th style={{ padding: '12px', textAlign: 'center', borderBottom: '2px solid #000000' }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {result.comparison.map((comp, i) => (
                    <tr key={i} style={{ backgroundColor: i % 2 === 0 ? '#ffffff' : '#f8fafc' }}>
                      <td style={{ padding: '12px', fontWeight: 'bold' }}>{comp.source}</td>
                      <td style={{ padding: '12px', textAlign: 'center' }}>{comp.storyCount}</td>
                      <td style={{ padding: '12px', textAlign: 'center' }}>
                        {comp.storyCount > 0 ? `${comp.onTopicPercent}%` : '-'}
                      </td>
                      <td style={{ padding: '12px', textAlign: 'center' }}>
                        {comp.storyCount > 0 ? getQualityStars(comp.onTopicPercent) : '-'}
                      </td>
                      <td style={{ padding: '12px', textAlign: 'center' }}>
                        {comp.error ? (
                          <span style={{ color: '#dc2626' }}>❌ {comp.error}</span>
                        ) : (
                          <span style={{ color: '#16a34a' }}>✅ OK</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Detailed Results */}
          {result.results.map((sourceResult, idx) => (
            <div 
              key={idx} 
              style={{ 
                backgroundColor: '#ffffff', 
                border: '2px solid #000000', 
                borderRadius: '12px', 
                padding: '20px', 
                marginBottom: '20px' 
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h2 style={{ fontSize: '20px', fontWeight: 'bold', margin: 0 }}>
                  {sourceResult.source}
                </h2>
                <div style={{ display: 'flex', gap: '16px', fontSize: '14px', color: '#666666' }}>
                  <span>Found: {sourceResult.stories.length} stories</span>
                  <span>Fetch Time: {sourceResult.fetchTimeMs}ms</span>
                  {sourceResult.onTopicCount !== undefined && (
                    <span>On-Topic: {sourceResult.onTopicCount}/{sourceResult.stories.length}</span>
                  )}
                </div>
              </div>

              {sourceResult.error ? (
                <div style={{ padding: '16px', backgroundColor: '#fee2e2', borderRadius: '6px', color: '#dc2626' }}>
                  ❌ Error: {sourceResult.error}
                </div>
              ) : (
                <>
                  {/* Off-topic warnings */}
                  {sourceResult.offTopicStories && sourceResult.offTopicStories.length > 0 && (
                    <div style={{ padding: '12px', backgroundColor: '#fef3c7', borderRadius: '6px', marginBottom: '16px' }}>
                      <strong>⚠️ Off-topic stories detected:</strong>
                      <ul style={{ margin: '8px 0 0 20px', padding: 0 }}>
                        {sourceResult.offTopicStories.slice(0, 5).map((story, i) => (
                          <li key={i} style={{ fontSize: '14px', color: '#92400e' }}>{story}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Stories */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {sourceResult.stories.slice(0, 10).map((story, i) => (
                      <div 
                        key={i} 
                        style={{ 
                          padding: '12px', 
                          backgroundColor: '#f8fafc', 
                          borderRadius: '6px',
                          border: '1px solid #e2e8f0'
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px' }}>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>
                              {i + 1}. {story.title}
                            </div>
                            <div style={{ fontSize: '13px', color: '#666666' }}>
                              <span style={{ backgroundColor: '#e2e8f0', padding: '2px 6px', borderRadius: '4px', marginRight: '8px' }}>
                                {story.source}
                              </span>
                              {formatDate(story.date)}
                              {story.trendingScore && (
                                <span style={{ marginLeft: '8px', color: '#f97316' }}>
                                  🔥 Score: {story.trendingScore}
                                </span>
                              )}
                            </div>
                            {story.summary && (
                              <div style={{ fontSize: '14px', color: '#444444', marginTop: '8px' }}>
                                {story.summary.substring(0, 200)}...
                              </div>
                            )}
                            {story.fetchedContent && (
                              <div style={{ fontSize: '13px', color: '#666666', marginTop: '8px', padding: '8px', backgroundColor: '#f1f5f9', borderRadius: '4px' }}>
                                <strong>Fetched Content:</strong> {story.fetchedContent.substring(0, 300)}...
                              </div>
                            )}
                          </div>
                          <a 
                            href={story.url} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            style={{ color: '#3b82f6', fontSize: '14px', whiteSpace: 'nowrap' }}
                          >
                            View →
                          </a>
                        </div>
                      </div>
                    ))}
                  </div>

                  {sourceResult.stories.length > 10 && (
                    <div style={{ marginTop: '12px', fontSize: '14px', color: '#666666', textAlign: 'center' }}>
                      ... and {sourceResult.stories.length - 10} more stories
                    </div>
                  )}
                </>
              )}
            </div>
          ))}

          {/* Sample Claude Prompt Preview */}
          <div style={{ backgroundColor: '#ffffff', border: '2px solid #000000', borderRadius: '12px', padding: '20px', marginBottom: '24px' }}>
            <h2 style={{ fontSize: '20px', fontWeight: 'bold', marginBottom: '16px' }}>📝 Sample Claude Prompt</h2>
            <p style={{ fontSize: '14px', color: '#666666', marginBottom: '12px' }}>
              This is what would be sent to Claude based on the best source results:
            </p>
            <pre style={{ 
              backgroundColor: '#f8fafc', 
              border: '1px solid #e2e8f0', 
              borderRadius: '6px', 
              padding: '16px', 
              overflow: 'auto',
              fontSize: '13px',
              whiteSpace: 'pre-wrap'
            }}>
{`You are a professional radio news broadcaster for Drive Time Tales.

YOUR TASK: Write a 3-minute spoken news script for ${CATEGORIES.find(c => c.id === selectedCategory)?.label || selectedCategory}.

STORIES TO COVER (in order of importance):
${result.results.find(r => r.stories.length > 0 && !r.error)?.stories.slice(0, 5).map((s, i) => 
`${i + 1}. ${s.title}
   Source: ${s.source}
   ${s.fetchedContent ? `Context: ${s.fetchedContent.substring(0, 200)}...` : ''}`
).join('\n\n') || 'No stories available'}

Write the complete script now, starting with the intro and ending with the outro.`}
            </pre>
          </div>
        </>
      )}

      {/* Instructions */}
      <div style={{ backgroundColor: '#f1f5f9', border: '2px solid #cccccc', borderRadius: '12px', padding: '20px' }}>
        <h3 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '12px' }}>📖 How to Use</h3>
        <ol style={{ margin: 0, paddingLeft: '20px', lineHeight: '1.8' }}>
          <li>Select a <strong>category</strong> to test</li>
          <li>Check the <strong>sources</strong> you want to compare</li>
          <li>Enable <strong>"Fetch article content"</strong> to see what Claude would receive (slower)</li>
          <li>Click <strong>"Run Test"</strong> and review the results</li>
          <li>Compare sources in the table - higher on-topic % = better quality</li>
          <li>Check for <strong>⚠️ off-topic warnings</strong> - sources with many off-topic stories should be avoided</li>
        </ol>
        <div style={{ marginTop: '16px', padding: '12px', backgroundColor: '#dbeafe', borderRadius: '6px' }}>
          <strong>💡 Tip:</strong> For best results, look for sources with 90%+ on-topic stories and good article content fetching.
        </div>
      </div>
    </div>
  );
}
