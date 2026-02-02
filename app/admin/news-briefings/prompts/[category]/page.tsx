'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';

const CATEGORY_INFO: Record<string, { label: string; icon: string; color: string }> = {
  state: { label: 'State News', icon: '🏛️', color: '#dc2626' },
  national: { label: 'National News', icon: '🇺🇸', color: '#f97316' },
  world: { label: 'World News', icon: '🌍', color: '#eab308' },
  business: { label: 'Business News', icon: '💼', color: '#16a34a' },
  sports: { label: 'Sports News', icon: '⚽', color: '#2563eb' },
  science: { label: 'Science & Tech', icon: '🔬', color: '#9333ea' }
};

const INTRO_SAMPLES = [
  "Good {timeOfDay}, {userName}! I'm {narratorName} with your {category} briefing.",
  "Hey {userName}! {narratorName} here with today's top {category} stories.",
  "Welcome, {userName}! Let's get you caught up on {category} news."
];

const OUTRO_SAMPLES = [
  "That's your {category} update, {userName}. Drive safe!",
  "I'm {narratorName}. Thanks for listening, {userName}. See you next time!",
  "That wraps up {category} news. Thanks for tuning in, {userName}!"
];

const PRIORITY_OPTIONS = [
  { id: 'breaking', label: 'Breaking News' },
  { id: 'government', label: 'Government/Political' },
  { id: 'economic', label: 'Economic/Financial' },
  { id: 'trending', label: 'Trending/Viral Stories' },
  { id: 'crime', label: 'Crime/Public Safety' },
  { id: 'international', label: 'International Affairs' },
  { id: 'weather', label: 'Weather/Natural Disasters' }
];

const AVOID_OPTIONS = [
  { id: 'fluff', label: 'Fluff/Soft News' },
  { id: 'celebrity', label: 'Celebrity News' },
  { id: 'lifestyle', label: 'Lifestyle Content' },
  { id: 'humanInterest', label: 'Human Interest Stories' },
  { id: 'feelGood', label: 'Feel-Good Stories' },
  { id: 'analysis', label: 'Extended Analysis/Opinion' }
];

interface PromptData {
  targetDuration: string;
  storyCount: string;
  maxSecondsPerStory: string;
  focusAreas: string[];
  contentPriority: string[];
  contentAvoid: string[];
  specialInstructions: string;
}

const DEFAULT_PROMPT: PromptData = {
  targetDuration: '3',
  storyCount: '5',
  maxSecondsPerStory: '30',
  focusAreas: ['Major breaking news', 'Government actions', 'Economic updates'],
  contentPriority: ['breaking', 'government', 'economic'],
  contentAvoid: ['fluff', 'celebrity', 'lifestyle'],
  specialInstructions: ''
};

export default function PromptEditor() {
  const params = useParams();
  const router = useRouter();
  const category = params.category as string;
  const catInfo = CATEGORY_INFO[category];

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [promptData, setPromptData] = useState<PromptData>(DEFAULT_PROMPT);

  useEffect(() => {
    if (!category || !CATEGORY_INFO[category]) {
      router.push('/admin/news-briefings');
      return;
    }
    fetch(`/api/admin/news-settings?category=${category}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.settings?.[0]?.prompt_data) {
          setPromptData({ ...DEFAULT_PROMPT, ...data.settings[0].prompt_data });
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [category, router]);

  async function handleSave() {
    setSaving(true);
    try {
      const r = await fetch('/api/admin/news-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category, prompt_data: promptData })
      });
      if (r.ok) alert('Prompt saved!');
      else alert('Failed to save');
    } catch { alert('Failed to save'); }
    finally { setSaving(false); }
  }

  function moveFocusArea(index: number, direction: 'up' | 'down') {
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= promptData.focusAreas.length) return;
    const newAreas = [...promptData.focusAreas];
    const temp = newAreas[index];
    newAreas[index] = newAreas[newIndex];
    newAreas[newIndex] = temp;
    setPromptData(p => ({ ...p, focusAreas: newAreas }));
  }

  function toggleCheckbox(field: 'contentPriority' | 'contentAvoid', id: string) {
    setPromptData(p => ({
      ...p,
      [field]: p[field].includes(id) ? p[field].filter(x => x !== id) : [...p[field], id]
    }));
  }

  if (loading || !catInfo) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ fontSize: '20px', fontWeight: 'bold', color: '#000000' }}>Loading...</p>
      </div>
    );
  }

  const inputStyle: React.CSSProperties = { width: '100%', padding: '12px', fontSize: '16px', border: '2px solid #000000', borderRadius: '6px', backgroundColor: '#ffffff', color: '#000000', boxSizing: 'border-box' };
  const btnStyle: React.CSSProperties = { padding: '14px 24px', fontSize: '16px', fontWeight: 'bold', border: '2px solid #000000', borderRadius: '6px', cursor: 'pointer' };
  const sectionStyle: React.CSSProperties = { backgroundColor: '#ffffff', border: '2px solid #000000', borderRadius: '12px', padding: '20px', marginBottom: '20px' };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#ffffff', color: '#000000', padding: '24px', fontFamily: 'Arial, sans-serif' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button onClick={() => router.push('/admin/news-briefings')} style={{ ...btnStyle, backgroundColor: '#ffffff' }}>← Back</button>
          <h1 style={{ fontSize: '24px', fontWeight: 'bold', color: '#000000' }}>{catInfo.icon} {catInfo.label} Prompt</h1>
        </div>
        <button onClick={handleSave} disabled={saving} style={{ ...btnStyle, backgroundColor: catInfo.color, color: category === 'world' ? '#000000' : '#ffffff' }}>{saving ? 'Saving...' : '💾 Save Prompt'}</button>
      </div>

      <div style={sectionStyle}>
        <h2 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '16px', color: '#000000' }}>⏱️ Duration & Story Settings</h2>
        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: '150px' }}>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold', color: '#000000' }}>Target Duration (min)</label>
            <input type="number" min="1" max="10" value={promptData.targetDuration} onChange={e => setPromptData(p => ({ ...p, targetDuration: e.target.value }))} style={inputStyle} />
          </div>
          <div style={{ flex: 1, minWidth: '150px' }}>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold', color: '#000000' }}>Story Count</label>
            <input type="number" min="1" max="10" value={promptData.storyCount} onChange={e => setPromptData(p => ({ ...p, storyCount: e.target.value }))} style={inputStyle} />
          </div>
          <div style={{ flex: 1, minWidth: '150px' }}>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold', color: '#000000' }}>Max Seconds/Story</label>
            <input type="number" min="15" max="120" value={promptData.maxSecondsPerStory} onChange={e => setPromptData(p => ({ ...p, maxSecondsPerStory: e.target.value }))} style={inputStyle} />
          </div>
        </div>
      </div>

      <div style={sectionStyle}>
        <h2 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '16px', color: '#000000' }}>🎯 Focus Areas (in order)</h2>
        {promptData.focusAreas.map((area, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px', padding: '10px', backgroundColor: '#f5f5f5', borderRadius: '6px', border: '1px solid #000000' }}>
            <span style={{ fontWeight: 'bold', minWidth: '24px', color: '#000000' }}>{i + 1}.</span>
            <input type="text" value={area} onChange={e => { const a = [...promptData.focusAreas]; a[i] = e.target.value; setPromptData(p => ({ ...p, focusAreas: a })); }} style={{ ...inputStyle, flex: 1, marginBottom: 0 }} />
            <button onClick={() => moveFocusArea(i, 'up')} disabled={i === 0} style={{ ...btnStyle, padding: '8px 12px', backgroundColor: i === 0 ? '#cccccc' : '#3b82f6', color: '#ffffff' }}>↑</button>
            <button onClick={() => moveFocusArea(i, 'down')} disabled={i === promptData.focusAreas.length - 1} style={{ ...btnStyle, padding: '8px 12px', backgroundColor: i === promptData.focusAreas.length - 1 ? '#cccccc' : '#3b82f6', color: '#ffffff' }}>↓</button>
            <button onClick={() => setPromptData(p => ({ ...p, focusAreas: p.focusAreas.filter((_, j) => j !== i) }))} style={{ ...btnStyle, padding: '8px 12px', backgroundColor: '#dc2626', color: '#ffffff' }}>✕</button>
          </div>
        ))}
        <button onClick={() => setPromptData(p => ({ ...p, focusAreas: [...p.focusAreas, ''] }))} style={{ ...btnStyle, backgroundColor: '#ffffff', marginTop: '8px' }}>+ Add Focus Area</button>
      </div>

      <div style={sectionStyle}>
        <h2 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '16px', color: '#000000' }}>✅ Content Priority</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '8px' }}>
          {PRIORITY_OPTIONS.map(opt => (
            <label key={opt.id} style={{ display: 'flex', alignItems: 'center', fontSize: '16px', color: '#000000', cursor: 'pointer' }}>
              <input type="checkbox" checked={promptData.contentPriority.includes(opt.id)} onChange={() => toggleCheckbox('contentPriority', opt.id)} style={{ width: '20px', height: '20px', marginRight: '10px' }} />
              {opt.label}
            </label>
          ))}
        </div>
      </div>

      <div style={sectionStyle}>
        <h2 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '16px', color: '#000000' }}>❌ Content to Avoid</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '8px' }}>
          {AVOID_OPTIONS.map(opt => (
            <label key={opt.id} style={{ display: 'flex', alignItems: 'center', fontSize: '16px', color: '#000000', cursor: 'pointer' }}>
              <input type="checkbox" checked={promptData.contentAvoid.includes(opt.id)} onChange={() => toggleCheckbox('contentAvoid', opt.id)} style={{ width: '20px', height: '20px', marginRight: '10px' }} />
              {opt.label}
            </label>
          ))}
        </div>
      </div>

      <div style={sectionStyle}>
        <h2 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '16px', color: '#000000' }}>👋 Intro & Outro (Randomly Selected by Claude)</h2>
        <p style={{ marginBottom: '12px', color: '#000000' }}>Claude randomly picks from these templates. Samples shown below:</p>
        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: '250px' }}>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold', color: '#000000' }}>Sample Intros (read-only)</label>
            <select disabled style={{ ...inputStyle, backgroundColor: '#f5f5f5', cursor: 'not-allowed' }}>
              {INTRO_SAMPLES.map((s, i) => <option key={i}>{i + 1}. {s.substring(0, 50)}...</option>)}
              <option>...and more</option>
            </select>
          </div>
          <div style={{ flex: 1, minWidth: '250px' }}>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold', color: '#000000' }}>Sample Outros (read-only)</label>
            <select disabled style={{ ...inputStyle, backgroundColor: '#f5f5f5', cursor: 'not-allowed' }}>
              {OUTRO_SAMPLES.map((s, i) => <option key={i}>{i + 1}. {s.substring(0, 50)}...</option>)}
              <option>...and more</option>
            </select>
          </div>
        </div>
      </div>

      <div style={sectionStyle}>
        <h2 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '16px', color: '#000000' }}>📋 Special Instructions</h2>
        <textarea value={promptData.specialInstructions} onChange={e => setPromptData(p => ({ ...p, specialInstructions: e.target.value }))} rows={4} placeholder="Any additional instructions for Claude..." style={{ ...inputStyle, resize: 'vertical' }} />
      </div>

      <div style={{ display: 'flex', justifyContent: 'center', gap: '16px', marginTop: '24px' }}>
        <button onClick={() => router.push('/admin/news-briefings')} style={{ ...btnStyle, backgroundColor: '#ffffff' }}>← Back</button>
        <button onClick={handleSave} disabled={saving} style={{ ...btnStyle, backgroundColor: catInfo.color, color: category === 'world' ? '#000000' : '#ffffff' }}>{saving ? 'Saving...' : '💾 Save Prompt'}</button>
      </div>
    </div>
  );
}
