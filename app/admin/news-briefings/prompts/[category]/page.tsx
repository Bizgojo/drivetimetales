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

const INTRO_OPTIONS = [
  "Good {timeOfDay}, I'm {narratorName} with your {category} news briefing for {date}.",
  "Hello and welcome! I'm {narratorName} bringing you today's {category} news for {date}.",
  "Good {timeOfDay}, listeners! {narratorName} here with your {category} update for {date}.",
  "Welcome to Drive Time Tales! I'm {narratorName} with {category} news for {date}.",
  "It's {date}, and I'm {narratorName}. Here's your {category} news briefing."
];

const OUTRO_OPTIONS = [
  "That's your {category} news update for {date}. I'm {narratorName}. Thanks for listening to Drive Time Tales. Drive safe!",
  "That wraps up {category} news for {date}. I'm {narratorName}. Stay informed and drive safe!",
  "I'm {narratorName}, and that's your {category} briefing. Thanks for tuning in to Drive Time Tales!",
  "That's all for {category} news today. I'm {narratorName}. Have a great {timeOfDay} and drive safe!",
  "This has been your {category} update from Drive Time Tales. I'm {narratorName}. See you next time!"
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
  selectedIntroIndex: number;
  selectedOutroIndex: number;
}

const DEFAULT_PROMPT: PromptData = {
  targetDuration: '3',
  storyCount: '5',
  maxSecondsPerStory: '30',
  focusAreas: ['Major breaking news', 'Government actions', 'Economic updates'],
  contentPriority: ['breaking', 'government', 'economic'],
  contentAvoid: ['fluff', 'celebrity', 'lifestyle'],
  specialInstructions: '',
  selectedIntroIndex: 0,
  selectedOutroIndex: 0
};

export default function PromptEditor() {
  const params = useParams();
  const router = useRouter();
  const category = params.category as string;
  const catInfo = CATEGORY_INFO[category];

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [promptData, setPromptData] = useState<PromptData>(DEFAULT_PROMPT);
  const [narratorName, setNarratorName] = useState('');

  useEffect(() => {
    if (!category || !CATEGORY_INFO[category]) {
      router.push('/admin/news-briefings');
      return;
    }
    // Load settings including narrator name
    fetch(`/api/admin/news-settings?category=${category}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.settings?.[0]) {
          const settings = data.settings[0];
          if (settings.narrator_name) setNarratorName(settings.narrator_name);
          if (settings.prompt_data) {
            setPromptData({ ...DEFAULT_PROMPT, ...settings.prompt_data });
          }
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
      if (r.ok) alert('Prompt settings saved!');
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

  // Generate preview of the actual Claude prompt
  function generatePromptPreview(): string {
    const timeOfDay = new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 17 ? 'afternoon' : 'evening';
    const date = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    const narrator = narratorName || '[Narrator Name]';
    const catLabel = catInfo?.label || category;

    const intro = INTRO_OPTIONS[promptData.selectedIntroIndex]
      .replace(/{timeOfDay}/g, timeOfDay)
      .replace(/{narratorName}/g, narrator)
      .replace(/{category}/g, catLabel)
      .replace(/{date}/g, date);

    const outro = OUTRO_OPTIONS[promptData.selectedOutroIndex]
      .replace(/{timeOfDay}/g, timeOfDay)
      .replace(/{narratorName}/g, narrator)
      .replace(/{category}/g, catLabel)
      .replace(/{date}/g, date);

    return `You are ${narrator}, a professional radio news broadcaster for Drive Time Tales.

YOUR TASK: Write a ${promptData.targetDuration}-minute spoken news script.

CRITICAL REQUIREMENTS - YOU MUST FOLLOW THESE EXACTLY:

1. START YOUR SCRIPT WITH THIS EXACT OPENING LINE (word for word):
"${intro}"

2. THEN cover these news stories (${promptData.maxSecondsPerStory} seconds each, headlines and key facts only):
[News stories will be inserted here from NewsAPI/GDELT]

3. END YOUR SCRIPT WITH THIS EXACT CLOSING LINE (word for word):
"${outro}"

STYLE RULES:
- Write in a conversational, radio broadcaster style
- Keep each story brief - just the headline and 1-2 key facts
- Use smooth transitions between stories like "In other news..." or "Meanwhile..." or "Turning to..."
- NO stage directions, NO notes, NO commentary - ONLY the spoken words
- Do NOT add any text before the opening line or after the closing line
${promptData.specialInstructions ? `\nSPECIAL INSTRUCTIONS:\n${promptData.specialInstructions}` : ''}

Write the complete script now.`;
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

  // Preview values for intro/outro
  const timeOfDay = new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 17 ? 'afternoon' : 'evening';
  const date = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  const narrator = narratorName || '[Set narrator name in admin]';

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#ffffff', color: '#000000', padding: '24px', fontFamily: 'Arial, sans-serif' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button onClick={() => router.push('/admin/news-briefings')} style={{ ...btnStyle, backgroundColor: '#ffffff' }}>← Back</button>
          <h1 style={{ fontSize: '24px', fontWeight: 'bold', color: '#000000' }}>{catInfo.icon} {catInfo.label} Prompt Editor</h1>
        </div>
        <button onClick={handleSave} disabled={saving} style={{ ...btnStyle, backgroundColor: catInfo.color, color: category === 'world' ? '#000000' : '#ffffff' }}>
          {saving ? 'Saving...' : '💾 Save Prompt'}
        </button>
      </div>

      {/* Duration Settings */}
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

      {/* Intro Selection */}
      <div style={sectionStyle}>
        <h2 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '16px', color: '#000000' }}>👋 Intro Selection</h2>
        <p style={{ marginBottom: '12px', color: '#666666' }}>Select the intro style. Preview shows how it will sound with current settings.</p>
        
        {INTRO_OPTIONS.map((intro, i) => {
          const previewIntro = intro
            .replace(/{timeOfDay}/g, timeOfDay)
            .replace(/{narratorName}/g, narrator)
            .replace(/{category}/g, catInfo.label)
            .replace(/{date}/g, date);
          
          return (
            <div 
              key={i} 
              onClick={() => setPromptData(p => ({ ...p, selectedIntroIndex: i }))}
              style={{ 
                padding: '12px', 
                marginBottom: '8px', 
                border: promptData.selectedIntroIndex === i ? `3px solid ${catInfo.color}` : '2px solid #cccccc', 
                borderRadius: '8px', 
                cursor: 'pointer',
                backgroundColor: promptData.selectedIntroIndex === i ? '#f0f9ff' : '#ffffff'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <input 
                  type="radio" 
                  checked={promptData.selectedIntroIndex === i} 
                  onChange={() => setPromptData(p => ({ ...p, selectedIntroIndex: i }))}
                  style={{ width: '20px', height: '20px' }}
                />
                <div>
                  <div style={{ fontWeight: 'bold', marginBottom: '4px', color: '#000000' }}>Option {i + 1}</div>
                  <div style={{ color: '#333333', fontStyle: 'italic' }}>"{previewIntro}"</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Outro Selection */}
      <div style={sectionStyle}>
        <h2 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '16px', color: '#000000' }}>🎬 Outro Selection</h2>
        <p style={{ marginBottom: '12px', color: '#666666' }}>Select the outro style. Preview shows how it will sound with current settings.</p>
        
        {OUTRO_OPTIONS.map((outro, i) => {
          const previewOutro = outro
            .replace(/{timeOfDay}/g, timeOfDay)
            .replace(/{narratorName}/g, narrator)
            .replace(/{category}/g, catInfo.label)
            .replace(/{date}/g, date);
          
          return (
            <div 
              key={i} 
              onClick={() => setPromptData(p => ({ ...p, selectedOutroIndex: i }))}
              style={{ 
                padding: '12px', 
                marginBottom: '8px', 
                border: promptData.selectedOutroIndex === i ? `3px solid ${catInfo.color}` : '2px solid #cccccc', 
                borderRadius: '8px', 
                cursor: 'pointer',
                backgroundColor: promptData.selectedOutroIndex === i ? '#f0f9ff' : '#ffffff'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <input 
                  type="radio" 
                  checked={promptData.selectedOutroIndex === i} 
                  onChange={() => setPromptData(p => ({ ...p, selectedOutroIndex: i }))}
                  style={{ width: '20px', height: '20px' }}
                />
                <div>
                  <div style={{ fontWeight: 'bold', marginBottom: '4px', color: '#000000' }}>Option {i + 1}</div>
                  <div style={{ color: '#333333', fontStyle: 'italic' }}>"{previewOutro}"</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Focus Areas */}
      <div style={sectionStyle}>
        <h2 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '16px', color: '#000000' }}>🎯 Focus Areas (in priority order)</h2>
        {promptData.focusAreas.map((area, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px', padding: '10px', backgroundColor: '#f5f5f5', borderRadius: '6px', border: '1px solid #cccccc' }}>
            <span style={{ fontWeight: 'bold', minWidth: '24px', color: '#000000' }}>{i + 1}.</span>
            <input type="text" value={area} onChange={e => { const a = [...promptData.focusAreas]; a[i] = e.target.value; setPromptData(p => ({ ...p, focusAreas: a })); }} style={{ ...inputStyle, flex: 1, marginBottom: 0 }} />
            <button onClick={() => moveFocusArea(i, 'up')} disabled={i === 0} style={{ ...btnStyle, padding: '8px 12px', backgroundColor: i === 0 ? '#cccccc' : '#3b82f6', color: '#ffffff' }}>↑</button>
            <button onClick={() => moveFocusArea(i, 'down')} disabled={i === promptData.focusAreas.length - 1} style={{ ...btnStyle, padding: '8px 12px', backgroundColor: i === promptData.focusAreas.length - 1 ? '#cccccc' : '#3b82f6', color: '#ffffff' }}>↓</button>
            <button onClick={() => setPromptData(p => ({ ...p, focusAreas: p.focusAreas.filter((_, j) => j !== i) }))} style={{ ...btnStyle, padding: '8px 12px', backgroundColor: '#dc2626', color: '#ffffff' }}>✕</button>
          </div>
        ))}
        <button onClick={() => setPromptData(p => ({ ...p, focusAreas: [...p.focusAreas, ''] }))} style={{ ...btnStyle, backgroundColor: '#ffffff', marginTop: '8px' }}>+ Add Focus Area</button>
      </div>

      {/* Content Priority */}
      <div style={sectionStyle}>
        <h2 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '16px', color: '#000000' }}>✅ Content Priority</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '8px' }}>
          {PRIORITY_OPTIONS.map(opt => (
            <label key={opt.id} style={{ display: 'flex', alignItems: 'center', fontSize: '16px', color: '#000000', cursor: 'pointer', padding: '8px', borderRadius: '4px', backgroundColor: promptData.contentPriority.includes(opt.id) ? '#e0f2fe' : 'transparent' }}>
              <input type="checkbox" checked={promptData.contentPriority.includes(opt.id)} onChange={() => toggleCheckbox('contentPriority', opt.id)} style={{ width: '20px', height: '20px', marginRight: '10px' }} />
              {opt.label}
            </label>
          ))}
        </div>
      </div>

      {/* Content to Avoid */}
      <div style={sectionStyle}>
        <h2 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '16px', color: '#000000' }}>❌ Content to Avoid</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '8px' }}>
          {AVOID_OPTIONS.map(opt => (
            <label key={opt.id} style={{ display: 'flex', alignItems: 'center', fontSize: '16px', color: '#000000', cursor: 'pointer', padding: '8px', borderRadius: '4px', backgroundColor: promptData.contentAvoid.includes(opt.id) ? '#fee2e2' : 'transparent' }}>
              <input type="checkbox" checked={promptData.contentAvoid.includes(opt.id)} onChange={() => toggleCheckbox('contentAvoid', opt.id)} style={{ width: '20px', height: '20px', marginRight: '10px' }} />
              {opt.label}
            </label>
          ))}
        </div>
      </div>

      {/* Special Instructions */}
      <div style={sectionStyle}>
        <h2 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '16px', color: '#000000' }}>📋 Special Instructions</h2>
        <textarea 
          value={promptData.specialInstructions} 
          onChange={e => setPromptData(p => ({ ...p, specialInstructions: e.target.value }))} 
          rows={4} 
          placeholder="Any additional instructions for Claude (e.g., 'Focus on tech industry news' or 'Avoid political commentary')..." 
          style={{ ...inputStyle, resize: 'vertical' }} 
        />
      </div>

      {/* Claude Prompt Preview */}
      <div style={{ ...sectionStyle, backgroundColor: '#1e293b' }}>
        <h2 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '16px', color: '#ffffff' }}>🤖 Claude Prompt Preview</h2>
        <p style={{ marginBottom: '12px', color: '#94a3b8' }}>This is the actual prompt that will be sent to Claude when generating news:</p>
        <pre style={{ 
          backgroundColor: '#0f172a', 
          padding: '16px', 
          borderRadius: '8px', 
          color: '#e2e8f0', 
          fontSize: '13px', 
          lineHeight: '1.5',
          whiteSpace: 'pre-wrap',
          wordWrap: 'break-word',
          maxHeight: '400px',
          overflow: 'auto',
          border: '1px solid #334155'
        }}>
          {generatePromptPreview()}
        </pre>
      </div>

      {/* Bottom Save Button */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: '16px', marginTop: '24px' }}>
        <button onClick={() => router.push('/admin/news-briefings')} style={{ ...btnStyle, backgroundColor: '#ffffff' }}>← Back to Admin</button>
        <button onClick={handleSave} disabled={saving} style={{ ...btnStyle, backgroundColor: catInfo.color, color: category === 'world' ? '#000000' : '#ffffff' }}>
          {saving ? 'Saving...' : '💾 Save Prompt Settings'}
        </button>
      </div>
    </div>
  );
}
