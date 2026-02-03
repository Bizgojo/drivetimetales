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

const DEFAULT_INTROS = [
  "Good {timeOfDay}, I'm {narratorName} with your {category} news briefing for {date}.",
  "Hello and welcome! I'm {narratorName} bringing you today's {category} news for {date}.",
  "Good {timeOfDay}, listeners! {narratorName} here with your {category} update for {date}.",
  "Welcome to Drive Time Tales! I'm {narratorName} with {category} news for {date}.",
  "It's {date}, and I'm {narratorName}. Here's your {category} news briefing.",
  "Hey there, I'm {narratorName}. Let's get into today's {category} news for {date}.",
  "Good {timeOfDay}! {narratorName} here, ready to bring you the latest {category} news.",
  "Welcome back to Drive Time Tales! I'm {narratorName} with your {category} briefing.",
  "Good {timeOfDay}, this is {narratorName} with your {category} news update for {date}.",
  "Hello, I'm {narratorName}. Here's what's happening in {category} news today, {date}.",
  "It's {timeOfDay} on {date}. I'm {narratorName} with your {category} briefing.",
  "Thanks for tuning in! I'm {narratorName}, here with today's top {category} stories.",
  "Good {timeOfDay}, I'm {narratorName}. Let's dive into {category} news for {date}.",
  "Welcome! {narratorName} here with everything you need to know in {category} news.",
  "Hey, it's {narratorName}. Time for your {category} news briefing on this {date}."
];

const DEFAULT_OUTROS = [
  "That's your {category} news update for {date}. I'm {narratorName}. Thanks for listening to Drive Time Tales. Drive safe!",
  "That wraps up {category} news for {date}. I'm {narratorName}. Stay informed and drive safe!",
  "I'm {narratorName}, and that's your {category} briefing. Thanks for tuning in to Drive Time Tales!",
  "That's all for {category} news today. I'm {narratorName}. Have a great {timeOfDay} and drive safe!",
  "This has been your {category} update from Drive Time Tales. I'm {narratorName}. See you next time!",
  "I'm {narratorName}. That's the latest in {category} news. Thanks for listening, and drive safe!",
  "That's your {category} roundup for {date}. I'm {narratorName} for Drive Time Tales. Until next time!",
  "You've been listening to {category} news with {narratorName}. Drive safe and we'll see you soon!",
  "That's a wrap on {category} news! I'm {narratorName}. Thanks for making Drive Time Tales part of your day.",
  "I'm {narratorName}, signing off from your {category} briefing. Stay safe out there!",
  "That's your {category} news for {date}. I'm {narratorName}. Enjoy the drive and stay informed!",
  "Thanks for joining me for {category} news. I'm {narratorName}. Drive safe and catch you next time!",
  "And that's your {category} update! {narratorName} here, wishing you safe travels.",
  "That does it for {category} news on {date}. I'm {narratorName}. Take care and drive safe!",
  "This is {narratorName} wrapping up your {category} briefing. Thanks for listening to Drive Time Tales!"
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
  intros: string[];
  outros: string[];
  customPrompt: string;
}

const DEFAULT_PROMPT: PromptData = {
  targetDuration: '3',
  storyCount: '5',
  maxSecondsPerStory: '30',
  focusAreas: ['Major breaking news', 'Government actions', 'Economic updates'],
  contentPriority: ['breaking', 'government', 'economic'],
  contentAvoid: ['fluff', 'celebrity', 'lifestyle'],
  specialInstructions: '',
  intros: DEFAULT_INTROS,
  outros: DEFAULT_OUTROS,
  customPrompt: ''
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
  const [showIntros, setShowIntros] = useState(false);
  const [showOutros, setShowOutros] = useState(false);

  // Generate the default prompt template
  function generateDefaultPrompt(): string {
    const catLabel = catInfo?.label || category;
    return `You are {narratorName}, a professional radio news broadcaster for Drive Time Tales.

YOUR TASK: Write a ${promptData.targetDuration}-minute spoken news script.

CRITICAL REQUIREMENTS - YOU MUST FOLLOW THESE EXACTLY:

1. START YOUR SCRIPT WITH ONE OF THE PROVIDED INTRO OPTIONS (randomly selected, with variables filled in)

2. THEN cover these news stories (${promptData.maxSecondsPerStory} seconds each, headlines and key facts only):
[News stories will be inserted here from NewsAPI/GDELT]

3. END YOUR SCRIPT WITH ONE OF THE PROVIDED OUTRO OPTIONS (randomly selected, with variables filled in)

STYLE RULES:
- Write in a conversational, radio broadcaster style
- Keep each story brief - just the headline and 1-2 key facts
- Use smooth transitions between stories like "In other news..." or "Meanwhile..." or "Turning to..."
- NO stage directions, NO notes, NO commentary - ONLY the spoken words
- Do NOT add any text before the opening line or after the closing line
${promptData.specialInstructions ? `\nSPECIAL INSTRUCTIONS:\n${promptData.specialInstructions}` : ''}

Write the complete script now.`;
  }

  useEffect(() => {
    if (!category || !CATEGORY_INFO[category]) {
      router.push('/admin/news-briefings');
      return;
    }
    fetch(`/api/admin/news-settings?category=${category}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.settings?.[0]) {
          const settings = data.settings[0];
          if (settings.narrator_name) setNarratorName(settings.narrator_name);
          if (settings.prompt_data) {
            const loaded = { ...DEFAULT_PROMPT, ...settings.prompt_data };
            // Ensure intros/outros have 15 items
            if (!loaded.intros || loaded.intros.length < 15) loaded.intros = DEFAULT_INTROS;
            if (!loaded.outros || loaded.outros.length < 15) loaded.outros = DEFAULT_OUTROS;
            // Set custom prompt if not set
            if (!loaded.customPrompt) loaded.customPrompt = '';
            setPromptData(loaded);
          }
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [category, router]);

  // Initialize custom prompt with default if empty
  useEffect(() => {
    if (!loading && !promptData.customPrompt) {
      setPromptData(p => ({ ...p, customPrompt: generateDefaultPrompt() }));
    }
  }, [loading, catInfo]);

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

  function resetPromptToDefault() {
    if (confirm('Reset prompt to default? This will overwrite your custom edits.')) {
      setPromptData(p => ({ ...p, customPrompt: generateDefaultPrompt() }));
    }
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

  function updateIntro(index: number, value: string) {
    const newIntros = [...promptData.intros];
    newIntros[index] = value;
    setPromptData(p => ({ ...p, intros: newIntros }));
  }

  function updateOutro(index: number, value: string) {
    const newOutros = [...promptData.outros];
    newOutros[index] = value;
    setPromptData(p => ({ ...p, outros: newOutros }));
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
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button onClick={() => router.push('/admin/news-briefings')} style={{ ...btnStyle, backgroundColor: '#ffffff' }}>← Back</button>
          <h1 style={{ fontSize: '24px', fontWeight: 'bold', color: '#000000' }}>{catInfo.icon} {catInfo.label} Prompt Editor</h1>
        </div>
        <button onClick={handleSave} disabled={saving} style={{ ...btnStyle, backgroundColor: catInfo.color, color: category === 'world' ? '#000000' : '#ffffff' }}>
          {saving ? 'Saving...' : '💾 Save All Settings'}
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

      {/* Intros - Collapsible */}
      <div style={sectionStyle}>
        <div 
          onClick={() => setShowIntros(!showIntros)} 
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}
        >
          <h2 style={{ fontSize: '18px', fontWeight: 'bold', color: '#000000', margin: 0 }}>
            👋 Intro Options (15) - AI selects randomly at generation time
          </h2>
          <span style={{ fontSize: '20px', color: '#666666' }}>{showIntros ? '▼' : '▶'}</span>
        </div>
        <p style={{ fontSize: '14px', color: '#666666', marginTop: '8px', marginBottom: showIntros ? '16px' : 0 }}>
          Variables: {'{narratorName}'}, {'{category}'}, {'{date}'}, {'{timeOfDay}'}
        </p>
        
        {showIntros && (
          <div style={{ maxHeight: '400px', overflowY: 'auto', border: '1px solid #cccccc', borderRadius: '6px', padding: '10px' }}>
            {promptData.intros.map((intro, i) => (
              <div key={i} style={{ marginBottom: '10px' }}>
                <label style={{ fontSize: '14px', fontWeight: 'bold', color: '#666666' }}>#{i + 1}</label>
                <textarea
                  value={intro}
                  onChange={e => updateIntro(i, e.target.value)}
                  rows={2}
                  style={{ ...inputStyle, resize: 'vertical', marginTop: '4px' }}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Outros - Collapsible */}
      <div style={sectionStyle}>
        <div 
          onClick={() => setShowOutros(!showOutros)} 
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}
        >
          <h2 style={{ fontSize: '18px', fontWeight: 'bold', color: '#000000', margin: 0 }}>
            🎬 Outro Options (15) - AI selects randomly at generation time
          </h2>
          <span style={{ fontSize: '20px', color: '#666666' }}>{showOutros ? '▼' : '▶'}</span>
        </div>
        <p style={{ fontSize: '14px', color: '#666666', marginTop: '8px', marginBottom: showOutros ? '16px' : 0 }}>
          Variables: {'{narratorName}'}, {'{category}'}, {'{date}'}, {'{timeOfDay}'}
        </p>
        
        {showOutros && (
          <div style={{ maxHeight: '400px', overflowY: 'auto', border: '1px solid #cccccc', borderRadius: '6px', padding: '10px' }}>
            {promptData.outros.map((outro, i) => (
              <div key={i} style={{ marginBottom: '10px' }}>
                <label style={{ fontSize: '14px', fontWeight: 'bold', color: '#666666' }}>#{i + 1}</label>
                <textarea
                  value={outro}
                  onChange={e => updateOutro(i, e.target.value)}
                  rows={2}
                  style={{ ...inputStyle, resize: 'vertical', marginTop: '4px' }}
                />
              </div>
            ))}
          </div>
        )}
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

      {/* Claude Prompt - Editable */}
      <div style={sectionStyle}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <h2 style={{ fontSize: '18px', fontWeight: 'bold', color: '#000000', margin: 0 }}>🤖 Claude Prompt (Editable)</h2>
          <button onClick={resetPromptToDefault} style={{ ...btnStyle, padding: '8px 16px', backgroundColor: '#f5f5f5', fontSize: '14px' }}>
            Reset to Default
          </button>
        </div>
        <p style={{ marginBottom: '12px', color: '#666666', fontSize: '14px' }}>
          This is the prompt sent to Claude when generating news. Edit directly to customize. News stories and a randomly selected intro/outro will be inserted at generation time.
        </p>
        <textarea
          value={promptData.customPrompt || generateDefaultPrompt()}
          onChange={e => setPromptData(p => ({ ...p, customPrompt: e.target.value }))}
          rows={20}
          style={{ 
            ...inputStyle, 
            fontFamily: 'monospace',
            fontSize: '14px',
            lineHeight: '1.5',
            resize: 'vertical',
            backgroundColor: '#ffffff',
            color: '#000000'
          }}
        />
      </div>

      {/* Bottom Save Button */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: '16px', marginTop: '24px' }}>
        <button onClick={() => router.push('/admin/news-briefings')} style={{ ...btnStyle, backgroundColor: '#ffffff' }}>← Back to Admin</button>
        <button onClick={handleSave} disabled={saving} style={{ ...btnStyle, backgroundColor: catInfo.color, color: category === 'world' ? '#000000' : '#ffffff' }}>
          {saving ? 'Saving...' : '💾 Save All Settings'}
        </button>
      </div>
    </div>
  );
}
