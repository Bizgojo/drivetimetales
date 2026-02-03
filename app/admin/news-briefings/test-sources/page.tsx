'use client';
import { useState } from 'react';
import Link from 'next/link';

interface StoryTrending { rank: number; title: string; source: string; url: string; }
interface StoryContent { title: string; source: string; contentSource: string; contentNote: string; contentLength: number; contentPreview: string | null; }
interface TestResult {
  category: string;
  step1_trending: { source: string; note: string; storiesFound: number; fetchTimeMs: number; error?: string; stories: StoryTrending[]; };
  step2_content: { source: string; note: string; totalStories: number; directFetchCount: number; newsapiDescCount: number; headlineOnlyCount: number; totalFetchTimeMs: number; stories: StoryContent[]; } | null;
  step3_claude: { source: string; note: string; generateTimeMs?: number; error?: string; script: string | null; } | null;
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
  const [generatingScript, setGeneratingScript] = useState(false);
  const [result, setResult] = useState<TestResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runTest = async (generate = false) => {
    if (generate) { setGeneratingScript(true); } else { setLoading(true); setResult(null); }
    setError(null);
    try {
      const params = new URLSearchParams({ category: selectedCategory, state: selectedState, ...(generate && { generate: 'true' }) });
      const response = await fetch(`/api/admin/test-news-sources?${params}`);
      if (!response.ok) throw new Error(`API returned ${response.status}`);
      setResult(await response.json());
    } catch (err: any) { setError(err.message); }
    finally { setLoading(false); setGeneratingScript(false); }
  };

  const getContentIcon = (source: string) => source === 'direct_fetch' ? '✅' : source === 'newsapi_desc' ? '📝' : '⚠️';
  const getContentColor = (source: string) => source === 'direct_fetch' ? { bg: '#dcfce7', color: '#166534' } : source === 'newsapi_desc' ? { bg: '#dbeafe', color: '#1e40af' } : { bg: '#fef3c7', color: '#92400e' };
  const btnStyle: React.CSSProperties = { padding: '12px 24px', fontSize: '16px', fontWeight: 'bold', border: '2px solid #000', borderRadius: '6px', cursor: 'pointer' };
  const sectionStyle: React.CSSProperties = { backgroundColor: '#fff', border: '2px solid #000', borderRadius: '12px', padding: '20px', marginBottom: '24px' };
  const labelStyle: React.CSSProperties = { fontSize: '12px', fontWeight: 'bold', color: '#666', textTransform: 'uppercase' as const, letterSpacing: '0.5px' };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f8fafc', padding: '24px', fontFamily: 'Arial, sans-serif' }}>
      <Link href="/admin/news-briefings" style={{ color: '#3b82f6', textDecoration: 'none' }}>← Back to News Briefings Admin</Link>
      <h1 style={{ fontSize: '28px', fontWeight: 'bold', marginTop: '16px', marginBottom: '8px' }}>🧪 News Pipeline Testing</h1>
      <p style={{ color: '#666', margin: 0, marginBottom: '24px' }}>See exactly where each piece of data comes from</p>

      <div style={sectionStyle}>
        <div style={labelStyle}>Select Category</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginTop: '10px', marginBottom: '20px' }}>
          {CATEGORIES.map(cat => (
            <button key={cat.id} onClick={() => { setSelectedCategory(cat.id); setResult(null); }} style={{ ...btnStyle, backgroundColor: selectedCategory === cat.id ? cat.color : '#fff', color: selectedCategory === cat.id ? '#fff' : '#000', borderColor: cat.color }}>{cat.icon} {cat.label}</button>
          ))}
        </div>
        {selectedCategory === 'state' && (
          <div style={{ marginBottom: '20px' }}><div style={labelStyle}>Select State</div><select value={selectedState} onChange={e => setSelectedState(e.target.value)} style={{ marginTop: '10px', padding: '12px', fontSize: '16px', border: '2px solid #000', borderRadius: '6px', minWidth: '250px' }}>{US_STATES.map(s => <option key={s} value={s}>{s}</option>)}</select></div>
        )}
        <button onClick={() => runTest(false)} disabled={loading} style={{ ...btnStyle, backgroundColor: loading ? '#ccc' : '#3b82f6', color: '#fff', minWidth: '200px' }}>{loading ? '🔄 Fetching...' : '🔍 Run Pipeline Test'}</button>
        {error && <div style={{ marginTop: '16px', padding: '12px', backgroundColor: '#fee2e2', border: '2px solid #dc2626', borderRadius: '6px', color: '#dc2626' }}>❌ {error}</div>}
      </div>

      {result && (<>
        {/* STEP 1 */}
        <div style={sectionStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
            <div style={{ backgroundColor: '#f97316', color: '#fff', padding: '8px 16px', borderRadius: '20px', fontWeight: 'bold' }}>STEP 1</div>
            <h2 style={{ fontSize: '20px', fontWeight: 'bold', margin: 0 }}>📊 What Determines Trending?</h2>
            <span style={{ fontSize: '14px', color: '#666' }}>({result.step1_trending.fetchTimeMs}ms)</span>
          </div>
          <div style={{ backgroundColor: '#fff7ed', border: '1px solid #fed7aa', borderRadius: '8px', padding: '12px', marginBottom: '16px' }}>
            <div style={labelStyle}>Source</div>
            <div style={{ fontWeight: 'bold', marginTop: '4px' }}>{result.step1_trending.source}</div>
            <div style={{ fontSize: '14px', color: '#666', marginTop: '4px' }}>{result.step1_trending.note}</div>
          </div>
          {result.step1_trending.error ? (
            <div style={{ padding: '16px', backgroundColor: '#fee2e2', borderRadius: '6px', color: '#dc2626' }}>❌ {result.step1_trending.error}</div>
          ) : (
            <><div style={{ marginBottom: '12px', color: '#666' }}>Top <strong>{result.step1_trending.storiesFound}</strong> trending stories:</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {result.step1_trending.stories.map((story) => (
                <div key={story.rank} style={{ padding: '12px', backgroundColor: '#f8fafc', borderRadius: '6px', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                  <div style={{ backgroundColor: '#f97316', color: '#fff', width: '28px', height: '28px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', flexShrink: 0 }}>{story.rank}</div>
                  <div><div style={{ fontWeight: 'bold', color: '#000' }}>{story.title}</div><div style={{ fontSize: '13px', color: '#666', marginTop: '4px' }}><span style={{ backgroundColor: '#e2e8f0', padding: '2px 8px', borderRadius: '4px' }}>{story.source}</span></div></div>
                </div>
              ))}
            </div></>
          )}
        </div>

        {/* STEP 2 */}
        {result.step2_content && (
          <div style={sectionStyle}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
              <div style={{ backgroundColor: '#16a34a', color: '#fff', padding: '8px 16px', borderRadius: '20px', fontWeight: 'bold' }}>STEP 2</div>
              <h2 style={{ fontSize: '20px', fontWeight: 'bold', margin: 0 }}>📄 Where Does Content Come From?</h2>
              <span style={{ fontSize: '14px', color: '#666' }}>({result.step2_content.totalFetchTimeMs}ms)</span>
            </div>
            <div style={{ backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '12px', marginBottom: '16px' }}>
              <div style={labelStyle}>Source</div>
              <div style={{ fontWeight: 'bold', marginTop: '4px' }}>{result.step2_content.source}</div>
              <div style={{ fontSize: '14px', color: '#666', marginTop: '4px' }}>{result.step2_content.note}</div>
            </div>
            <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>
              <div style={{ padding: '12px 16px', backgroundColor: '#dcfce7', borderRadius: '8px', border: '2px solid #22c55e' }}><div style={{ fontSize: '20px', fontWeight: 'bold', color: '#166534' }}>{result.step2_content.directFetchCount}</div><div style={{ fontSize: '12px', color: '#166534' }}>✅ Direct Fetch</div></div>
              <div style={{ padding: '12px 16px', backgroundColor: '#dbeafe', borderRadius: '8px', border: '2px solid #3b82f6' }}><div style={{ fontSize: '20px', fontWeight: 'bold', color: '#1e40af' }}>{result.step2_content.newsapiDescCount}</div><div style={{ fontSize: '12px', color: '#1e40af' }}>📝 NewsAPI Desc</div></div>
              <div style={{ padding: '12px 16px', backgroundColor: '#fef3c7', borderRadius: '8px', border: '2px solid #f59e0b' }}><div style={{ fontSize: '20px', fontWeight: 'bold', color: '#92400e' }}>{result.step2_content.headlineOnlyCount}</div><div style={{ fontSize: '12px', color: '#92400e' }}>⚠️ Headline Only</div></div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {result.step2_content.stories.map((story, i) => {
                const colors = getContentColor(story.contentSource);
                return (
                  <div key={i} style={{ padding: '12px', backgroundColor: '#f8fafc', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                      <div style={{ fontSize: '18px' }}>{getContentIcon(story.contentSource)}</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 'bold', color: '#000', marginBottom: '4px' }}>{story.title}</div>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                          <span style={{ backgroundColor: colors.bg, color: colors.color, padding: '2px 8px', borderRadius: '4px', fontSize: '12px' }}>{story.contentNote}</span>
                          <span style={{ fontSize: '13px', color: '#666' }}>{story.contentLength} chars</span>
                        </div>
                        {story.contentPreview && <div style={{ fontSize: '13px', color: '#444', marginTop: '8px', padding: '8px', backgroundColor: '#f1f5f9', borderRadius: '4px', borderLeft: '3px solid #3b82f6' }}>{story.contentPreview}</div>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* STEP 3 */}
        {result.step3_claude && (
          <div style={sectionStyle}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
              <div style={{ backgroundColor: '#9333ea', color: '#fff', padding: '8px 16px', borderRadius: '20px', fontWeight: 'bold' }}>STEP 3</div>
              <h2 style={{ fontSize: '20px', fontWeight: 'bold', margin: 0 }}>🤖 What Does Claude Write?</h2>
              {result.step3_claude.generateTimeMs && <span style={{ fontSize: '14px', color: '#666' }}>({result.step3_claude.generateTimeMs}ms)</span>}
            </div>
            <div style={{ backgroundColor: '#faf5ff', border: '1px solid #e9d5ff', borderRadius: '8px', padding: '12px', marginBottom: '16px' }}>
              <div style={labelStyle}>Source</div>
              <div style={{ fontWeight: 'bold', marginTop: '4px' }}>{result.step3_claude.source}</div>
              <div style={{ fontSize: '14px', color: '#666', marginTop: '4px' }}>{result.step3_claude.note}</div>
            </div>
            {result.step3_claude.error ? (
              <div style={{ padding: '16px', backgroundColor: '#fee2e2', borderRadius: '6px', color: '#dc2626' }}>❌ {result.step3_claude.error}</div>
            ) : result.step3_claude.script ? (
              <div style={{ backgroundColor: '#f8fafc', color: '#000', border: '2px solid #000', borderRadius: '8px', padding: '20px', fontFamily: 'Georgia, serif', fontSize: '15px', lineHeight: '1.8', whiteSpace: 'pre-wrap' }}>{result.step3_claude.script}</div>
            ) : (
              <button onClick={() => runTest(true)} disabled={generatingScript} style={{ ...btnStyle, backgroundColor: generatingScript ? '#ccc' : '#9333ea', color: '#fff' }}>{generatingScript ? '🔄 Generating...' : '✨ Generate Sample Script'}</button>
            )}
          </div>
        )}
      </>)}
    </div>
  );
}
