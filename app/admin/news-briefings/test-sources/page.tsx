'use client';
import { useState } from 'react';
import Link from 'next/link';

interface NewsStory { title: string; url: string; source: string; date: string; fetchedContent?: string; contentSource?: string; }
interface ContentFetchResult { story: NewsStory; contentFetchMs: number; contentLength: number; contentSource: string; }
interface TestResult {
  category: string; timestamp?: string; workflow: string;
  step1_trending: { source: string; storiesFound: number; fetchTimeMs: number; error?: string; gdeltUrl?: string; topStories: { title: string; source: string }[] };
  step2_content: { totalStories: number; directFetchSuccess: number; directFetchFailed: number; avgContentLength: number; fetchTimeMs: number; results: ContentFetchResult[] } | null;
  finalStories: NewsStory[]; samplePrompt: string;
}

const CATEGORIES = [
  { id: 'national', label: 'National', icon: '🇺🇸', color: '#f97316' },
  { id: 'business', label: 'Business', icon: '💼', color: '#16a34a' },
  { id: 'sports', label: 'Sports', icon: '⚽', color: '#2563eb' },
  { id: 'science', label: 'Science/Tech', icon: '🔬', color: '#9333ea' },
  { id: 'world', label: 'World', icon: '🌍', color: '#eab308' },
  { id: 'state', label: 'State', icon: '🏛️', color: '#dc2626' }
];

const US_STATES = ['Alabama','Alaska','Arizona','Arkansas','California','Colorado','Connecticut','Delaware','Florida','Georgia','Hawaii','Idaho','Illinois','Indiana','Iowa','Kansas','Kentucky','Louisiana','Maine','Maryland','Massachusetts','Michigan','Minnesota','Mississippi','Missouri','Montana','Nebraska','Nevada','New Hampshire','New Jersey','New Mexico','New York','North Carolina','North Dakota','Ohio','Oklahoma','Oregon','Pennsylvania','Rhode Island','South Carolina','South Dakota','Tennessee','Texas','Utah','Vermont','Virginia','Washington','West Virginia','Wisconsin','Wyoming'];

export default function TestSourcesPage() {
  const [selectedCategory, setSelectedCategory] = useState('national');
  const [selectedState, setSelectedState] = useState('South Carolina');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<TestResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);

  const runTest = async () => {
    setLoading(true); setError(null); setResult(null);
    try {
      const params = new URLSearchParams({ category: selectedCategory, state: selectedState });
      const response = await fetch(`/api/admin/test-news-sources?${params}`);
      if (!response.ok) throw new Error(`API returned ${response.status}`);
      setResult(await response.json());
    } catch (err: any) { setError(err.message || 'Test failed'); }
    finally { setLoading(false); }
  };

  const getContentBadge = (source?: string) => {
    if (source === 'direct') return { text: '✅ Fetched', bg: '#dcfce7', color: '#166534' };
    return { text: '❌ Failed', bg: '#fee2e2', color: '#991b1b' };
  };

  const btnStyle: React.CSSProperties = { padding: '12px 24px', fontSize: '16px', fontWeight: 'bold', border: '2px solid #000', borderRadius: '6px', cursor: 'pointer' };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f8fafc', padding: '24px', fontFamily: 'Arial, sans-serif' }}>
      <div style={{ marginBottom: '24px' }}>
        <Link href="/admin/news-briefings" style={{ color: '#3b82f6' }}>← Back to News Briefings Admin</Link>
        <h1 style={{ fontSize: '28px', fontWeight: 'bold', marginTop: '16px' }}>🧪 News Source Testing</h1>
        <p style={{ color: '#666' }}>Workflow: <strong>GDELT</strong> (trending) → <strong>Direct Fetch</strong> (content) → <strong>Claude</strong></p>
      </div>

      <div style={{ backgroundColor: '#dbeafe', border: '2px solid #3b82f6', borderRadius: '12px', padding: '16px', marginBottom: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '16px', flexWrap: 'wrap' }}>
        <div style={{ textAlign: 'center', padding: '12px 20px', backgroundColor: '#fff', borderRadius: '8px', border: '2px solid #3b82f6' }}><div style={{ fontSize: '24px' }}>📊</div><div style={{ fontWeight: 'bold' }}>Step 1: GDELT</div><div style={{ fontSize: '13px', color: '#666' }}>Trending stories</div></div>
        <div style={{ fontSize: '24px', color: '#3b82f6' }}>→</div>
        <div style={{ textAlign: 'center', padding: '12px 20px', backgroundColor: '#fff', borderRadius: '8px', border: '2px solid #3b82f6' }}><div style={{ fontSize: '24px' }}>📄</div><div style={{ fontWeight: 'bold' }}>Step 2: Fetch</div><div style={{ fontSize: '13px', color: '#666' }}>Article content</div></div>
        <div style={{ fontSize: '24px', color: '#3b82f6' }}>→</div>
        <div style={{ textAlign: 'center', padding: '12px 20px', backgroundColor: '#fff', borderRadius: '8px', border: '2px solid #3b82f6' }}><div style={{ fontSize: '24px' }}>🤖</div><div style={{ fontWeight: 'bold' }}>Step 3: Claude</div><div style={{ fontSize: '13px', color: '#666' }}>Generate script</div></div>
      </div>

      <div style={{ backgroundColor: '#fff', border: '2px solid #000', borderRadius: '12px', padding: '20px', marginBottom: '24px' }}>
        <div style={{ marginBottom: '20px' }}>
          <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '10px' }}>Select Category</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
            {CATEGORIES.map(cat => (
              <button key={cat.id} onClick={() => setSelectedCategory(cat.id)} style={{ ...btnStyle, backgroundColor: selectedCategory === cat.id ? cat.color : '#fff', color: selectedCategory === cat.id ? '#fff' : '#000', borderColor: cat.color }}>{cat.icon} {cat.label}</button>
            ))}
          </div>
        </div>
        {selectedCategory === 'state' && (
          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '10px' }}>Select State</label>
            <select value={selectedState} onChange={e => setSelectedState(e.target.value)} style={{ padding: '10px', fontSize: '16px', border: '2px solid #000', borderRadius: '6px', width: '300px' }}>
              {US_STATES.map(state => <option key={state} value={state}>{state}</option>)}
            </select>
          </div>
        )}
        <button onClick={runTest} disabled={loading} style={{ ...btnStyle, backgroundColor: loading ? '#ccc' : '#3b82f6', color: '#fff', minWidth: '200px' }}>{loading ? '🔄 Running...' : '🔍 Run Test'}</button>
        {error && <div style={{ marginTop: '16px', padding: '12px', backgroundColor: '#fee2e2', border: '2px solid #dc2626', borderRadius: '6px', color: '#dc2626' }}>❌ {error}</div>}
      </div>

      {result && (
        <>
          <div style={{ backgroundColor: '#fff', border: '2px solid #000', borderRadius: '12px', padding: '20px', marginBottom: '24px' }}>
            <h2 style={{ fontSize: '20px', fontWeight: 'bold', marginBottom: '16px' }}>📊 Step 1: GDELT Trending <span style={{ fontSize: '14px', fontWeight: 'normal', color: '#666' }}>({result.step1_trending.fetchTimeMs}ms)</span></h2>
            {result.step1_trending.error ? (
              <div style={{ padding: '16px', backgroundColor: '#fee2e2', borderRadius: '6px', color: '#dc2626' }}>❌ {result.step1_trending.error}</div>
            ) : (
              <>
                <div style={{ marginBottom: '16px', padding: '12px', backgroundColor: '#f0fdf4', borderRadius: '6px' }}>✅ Found <strong>{result.step1_trending.storiesFound}</strong> trending stories</div>
                <ol style={{ margin: 0, paddingLeft: '20px' }}>
                  {result.step1_trending.topStories.map((s, i) => <li key={i} style={{ marginBottom: '8px' }}><strong>{s.title}</strong> <span style={{ fontSize: '13px', color: '#666', backgroundColor: '#e2e8f0', padding: '2px 6px', borderRadius: '4px' }}>{s.source}</span></li>)}
                </ol>
              </>
            )}
            {result.step1_trending.gdeltUrl && <div style={{ marginTop: '12px', fontSize: '12px', color: '#666', wordBreak: 'break-all' }}>Debug URL: {result.step1_trending.gdeltUrl}</div>}
          </div>

          {result.step2_content && (
            <div style={{ backgroundColor: '#fff', border: '2px solid #000', borderRadius: '12px', padding: '20px', marginBottom: '24px' }}>
              <h2 style={{ fontSize: '20px', fontWeight: 'bold', marginBottom: '16px' }}>📄 Step 2: Content Fetching <span style={{ fontSize: '14px', fontWeight: 'normal', color: '#666' }}>({result.step2_content.fetchTimeMs}ms)</span></h2>
              <div style={{ display: 'flex', gap: '16px', marginBottom: '20px', flexWrap: 'wrap' }}>
                <div style={{ padding: '12px 20px', backgroundColor: '#f0fdf4', borderRadius: '8px', border: '2px solid #22c55e' }}><div style={{ fontSize: '24px', fontWeight: 'bold', color: '#166534' }}>{result.step2_content.directFetchSuccess}</div><div style={{ fontSize: '13px', color: '#166534' }}>Success</div></div>
                <div style={{ padding: '12px 20px', backgroundColor: '#fee2e2', borderRadius: '8px', border: '2px solid #ef4444' }}><div style={{ fontSize: '24px', fontWeight: 'bold', color: '#991b1b' }}>{result.step2_content.directFetchFailed}</div><div style={{ fontSize: '13px', color: '#991b1b' }}>Failed</div></div>
                <div style={{ padding: '12px 20px', backgroundColor: '#f1f5f9', borderRadius: '8px', border: '2px solid #64748b' }}><div style={{ fontSize: '24px', fontWeight: 'bold', color: '#334155' }}>{result.step2_content.avgContentLength}</div><div style={{ fontSize: '13px', color: '#334155' }}>Avg Chars</div></div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {result.step2_content.results.map((item, i) => {
                  const badge = getContentBadge(item.contentSource);
                  return (
                    <div key={i} style={{ padding: '12px', backgroundColor: '#f8fafc', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                        <span style={{ padding: '2px 8px', borderRadius: '4px', fontSize: '12px', backgroundColor: badge.bg, color: badge.color }}>{badge.text}</span>
                        <span style={{ fontSize: '13px', color: '#666' }}>{item.contentLength} chars • {item.contentFetchMs}ms</span>
                      </div>
                      <div style={{ fontWeight: 'bold' }}>{i + 1}. {item.story.title}</div>
                      <div style={{ fontSize: '13px', color: '#666' }}><span style={{ backgroundColor: '#e2e8f0', padding: '2px 6px', borderRadius: '4px' }}>{item.story.source}</span></div>
                      {item.story.fetchedContent && <div style={{ fontSize: '13px', color: '#444', marginTop: '8px', padding: '8px', backgroundColor: '#f1f5f9', borderRadius: '4px', borderLeft: '3px solid #3b82f6' }}>{item.story.fetchedContent.substring(0, 300)}...</div>}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div style={{ backgroundColor: '#fff', border: '2px solid #000', borderRadius: '12px', padding: '20px', marginBottom: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h2 style={{ fontSize: '20px', fontWeight: 'bold', margin: 0 }}>🤖 Step 3: Sample Claude Prompt</h2>
              <button onClick={() => setShowPrompt(!showPrompt)} style={{ ...btnStyle, padding: '8px 16px', fontSize: '14px' }}>{showPrompt ? 'Hide' : 'Show'} Prompt</button>
            </div>
            {showPrompt && <pre style={{ backgroundColor: '#1e293b', color: '#e2e8f0', borderRadius: '6px', padding: '16px', overflow: 'auto', fontSize: '13px', whiteSpace: 'pre-wrap', maxHeight: '400px' }}>{result.samplePrompt}</pre>}
          </div>
        </>
      )}
    </div>
  );
}
