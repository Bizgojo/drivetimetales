'use client';
import { useState } from 'react';
import Link from 'next/link';

interface NewsStory { title: string; url: string; source: string; fetchedContent?: string; contentSource?: string; }
interface ContentFetchResult { story: NewsStory; contentFetchMs: number; contentLength: number; contentSource: string; }
interface TestResult {
  category: string; workflow: string;
  step1_trending: { source: string; storiesFound: number; fetchTimeMs: number; error?: string; topStories: { title: string; source: string }[] };
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
      const response = await fetch(`/api/admin/test-news-sources?category=${selectedCategory}&state=${selectedState}`);
      if (!response.ok) throw new Error(`API returned ${response.status}`);
      setResult(await response.json());
    } catch (err: any) { setError(err.message); } finally { setLoading(false); }
  };

  const btnStyle: React.CSSProperties = { padding: '12px 24px', fontSize: '16px', fontWeight: 'bold', border: '2px solid #000', borderRadius: '6px', cursor: 'pointer' };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f8fafc', padding: '24px', fontFamily: 'Arial' }}>
      <Link href="/admin/news-briefings" style={{ color: '#3b82f6' }}>← Back to News Briefings Admin</Link>
      <h1 style={{ fontSize: '28px', fontWeight: 'bold', marginTop: '16px' }}>🧪 News Source Testing</h1>
      <p style={{ color: '#666' }}>Workflow: <strong>NewsAPI</strong> → <strong>Content Fetch</strong> → <strong>Claude</strong></p>

      <div style={{ backgroundColor: '#dbeafe', border: '2px solid #3b82f6', borderRadius: '12px', padding: '16px', margin: '24px 0', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '16px', flexWrap: 'wrap' }}>
        <div style={{ textAlign: 'center', padding: '12px 20px', backgroundColor: '#fff', borderRadius: '8px', border: '2px solid #3b82f6' }}><div style={{ fontSize: '24px' }}>📰</div><div style={{ fontWeight: 'bold' }}>NewsAPI</div></div>
        <div style={{ fontSize: '24px', color: '#3b82f6' }}>→</div>
        <div style={{ textAlign: 'center', padding: '12px 20px', backgroundColor: '#fff', borderRadius: '8px', border: '2px solid #3b82f6' }}><div style={{ fontSize: '24px' }}>📄</div><div style={{ fontWeight: 'bold' }}>Content</div></div>
        <div style={{ fontSize: '24px', color: '#3b82f6' }}>→</div>
        <div style={{ textAlign: 'center', padding: '12px 20px', backgroundColor: '#fff', borderRadius: '8px', border: '2px solid #3b82f6' }}><div style={{ fontSize: '24px' }}>🤖</div><div style={{ fontWeight: 'bold' }}>Claude</div></div>
      </div>

      <div style={{ backgroundColor: '#fff', border: '2px solid #000', borderRadius: '12px', padding: '20px', marginBottom: '24px' }}>
        <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '10px' }}>Category</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginBottom: '20px' }}>
          {CATEGORIES.map(cat => (<button key={cat.id} onClick={() => setSelectedCategory(cat.id)} style={{ ...btnStyle, backgroundColor: selectedCategory === cat.id ? cat.color : '#fff', color: selectedCategory === cat.id ? '#fff' : '#000', borderColor: cat.color }}>{cat.icon} {cat.label}</button>))}
        </div>
        {selectedCategory === 'state' && (<div style={{ marginBottom: '20px' }}><label style={{ fontWeight: 'bold' }}>State</label><select value={selectedState} onChange={e => setSelectedState(e.target.value)} style={{ marginLeft: '10px', padding: '10px', border: '2px solid #000', borderRadius: '6px' }}>{US_STATES.map(s => <option key={s}>{s}</option>)}</select></div>)}
        <button onClick={runTest} disabled={loading} style={{ ...btnStyle, backgroundColor: loading ? '#ccc' : '#3b82f6', color: '#fff' }}>{loading ? '🔄 Running...' : '🔍 Run Test'}</button>
        {error && <div style={{ marginTop: '16px', padding: '12px', backgroundColor: '#fee2e2', borderRadius: '6px', color: '#dc2626' }}>❌ {error}</div>}
      </div>

      {result && (<>
        <div style={{ backgroundColor: '#fff', border: '2px solid #000', borderRadius: '12px', padding: '20px', marginBottom: '24px' }}>
          <h2 style={{ fontSize: '20px', fontWeight: 'bold' }}>📰 Step 1: NewsAPI ({result.step1_trending.fetchTimeMs}ms)</h2>
          {result.step1_trending.error ? <div style={{ padding: '16px', backgroundColor: '#fee2e2', borderRadius: '6px', color: '#dc2626' }}>❌ {result.step1_trending.error}</div> : (<><div style={{ margin: '16px 0', padding: '12px', backgroundColor: '#f0fdf4', borderRadius: '6px' }}>✅ Found {result.step1_trending.storiesFound} stories</div><ol>{result.step1_trending.topStories.map((s, i) => <li key={i} style={{ marginBottom: '8px' }}><strong>{s.title}</strong> <span style={{ fontSize: '13px', color: '#666', backgroundColor: '#e2e8f0', padding: '2px 6px', borderRadius: '4px' }}>{s.source}</span></li>)}</ol></>)}
        </div>

        {result.step2_content && (<div style={{ backgroundColor: '#fff', border: '2px solid #000', borderRadius: '12px', padding: '20px', marginBottom: '24px' }}>
          <h2 style={{ fontSize: '20px', fontWeight: 'bold' }}>📄 Step 2: Content ({result.step2_content.fetchTimeMs}ms)</h2>
          <div style={{ display: 'flex', gap: '16px', margin: '16px 0' }}>
            <div style={{ padding: '12px', backgroundColor: '#f0fdf4', borderRadius: '8px', border: '2px solid #22c55e' }}><div style={{ fontSize: '24px', fontWeight: 'bold', color: '#166534' }}>{result.step2_content.directFetchSuccess}</div><div style={{ fontSize: '13px' }}>With Content</div></div>
            <div style={{ padding: '12px', backgroundColor: '#fef3c7', borderRadius: '8px', border: '2px solid #f59e0b' }}><div style={{ fontSize: '24px', fontWeight: 'bold', color: '#92400e' }}>{result.step2_content.directFetchFailed}</div><div style={{ fontSize: '13px' }}>Headline Only</div></div>
          </div>
          {result.step2_content.results.map((item, i) => (<div key={i} style={{ padding: '12px', marginBottom: '8px', backgroundColor: '#f8fafc', borderRadius: '6px', border: '1px solid #e2e8f0' }}><div style={{ fontWeight: 'bold' }}>{i + 1}. {item.story.title}</div><div style={{ fontSize: '13px', color: '#666' }}>{item.story.source} • {item.contentLength} chars</div>{item.story.fetchedContent && <div style={{ fontSize: '13px', marginTop: '8px', padding: '8px', backgroundColor: '#f1f5f9', borderRadius: '4px', borderLeft: '3px solid #3b82f6' }}>{item.story.fetchedContent.substring(0, 200)}...</div>}</div>))}
        </div>)}

        <div style={{ backgroundColor: '#fff', border: '2px solid #000', borderRadius: '12px', padding: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><h2 style={{ fontSize: '20px', fontWeight: 'bold' }}>🤖 Step 3: Claude Prompt</h2><button onClick={() => setShowPrompt(!showPrompt)} style={{ ...btnStyle, padding: '8px 16px', fontSize: '14px' }}>{showPrompt ? 'Hide' : 'Show'}</button></div>
          {showPrompt && <pre style={{ marginTop: '16px', backgroundColor: '#1e293b', color: '#e2e8f0', borderRadius: '6px', padding: '16px', overflow: 'auto', fontSize: '13px', whiteSpace: 'pre-wrap' }}>{result.samplePrompt}</pre>}
        </div>
      </>)}
    </div>
  );
}
