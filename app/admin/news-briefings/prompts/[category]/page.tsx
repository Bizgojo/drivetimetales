// app/admin/news-briefings/prompts/[category]/page.tsx
// DTT News Briefings - Prompt Editor
// Version 2.0 - February 2026
// Full implementation with all quality controls

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

// 15 Intro options
const INTRO_OPTIONS = [
  "Good {timeOfDay}, {userName}! I'm {narratorName} with your {category} briefing for {date}.",
  "Hey {userName}! {narratorName} here with today's top {category} stories.",
  "Welcome, {userName}! Let's get you caught up on {category} news.",
  "{userName}, good {timeOfDay}! Here's what's happening in {category} news.",
  "It's {date}, and I'm {narratorName}. Let's dive into {category} news, {userName}.",
  "Good {timeOfDay}, {userName}! {narratorName} here with your {category} update.",
  "Hey there, {userName}! Ready for your {category} news? Let's go!",
  "{userName}, welcome! I'm {narratorName}, and here's your {category} briefing.",
  "Good {timeOfDay}! This is {narratorName} with {category} news for {userName}.",
  "Hi {userName}! Let's get into today's {category} headlines.",
  "{userName}, it's {narratorName}. Here's what you need to know in {category} news.",
  "Welcome to your {category} briefing, {userName}! I'm {narratorName}.",
  "Good {timeOfDay}, {userName}! Big stories in {category} news today.",
  "{userName}, {narratorName} here. Let's cover today's {category} news.",
  "Hey {userName}! It's {date}, and I'm {narratorName} with your {category} update."
];

// 15 Outro options
const OUTRO_OPTIONS = [
  "That's your {category} update, {userName}. Drive safe!",
  "I'm {narratorName}. Thanks for listening, {userName}. See you next time!",
  "That's the news, {userName}. Have a great {timeOfDay}!",
  "{userName}, stay informed and drive safe. This is {narratorName}.",
  "That wraps up {category} news. Thanks for tuning in, {userName}!",
  "I'm {narratorName}. Until next time, {userName}, take care!",
  "That's all for {category} news, {userName}. Safe travels!",
  "{userName}, thanks for listening. I'm {narratorName}. Drive safe!",
  "Your {category} briefing is complete. Have a great day, {userName}!",
  "That's the latest in {category} news. I'm {narratorName}. Stay safe!",
  "{userName}, keep listening to Drive Time Tales. See you soon!",
  "This is {narratorName} signing off. Enjoy your drive, {userName}!",
  "Thanks for joining me, {userName}. Until next time!",
  "That's your {category} update. I'm {narratorName}. Stay informed, {userName}!",
  "{userName}, have a great {timeOfDay}. This is {narratorName} for Drive Time Tales!"
];

// Content Priority options
const CONTENT_PRIORITY_OPTIONS = [
  { id: 'breaking', label: 'Breaking News' },
  { id: 'government', label: 'Government/Political' },
  { id: 'economic', label: 'Economic/Financial' },
  { id: 'trending', label: 'Trending/Viral Stories' },
  { id: 'crime', label: 'Crime/Public Safety' },
  { id: 'international', label: 'International Affairs' },
  { id: 'weather', label: 'Weather/Natural Disasters' }
];

// Content to Avoid options
const CONTENT_AVOID_OPTIONS = [
  { id: 'fluff', label: 'Fluff/Soft News' },
  { id: 'celebrity', label: 'Celebrity News' },
  { id: 'lifestyle', label: 'Lifestyle Content' },
  { id: 'humanInterest', label: 'Human Interest Stories' },
  { id: 'feelGood', label: 'Feel-Good Stories' },
  { id: 'analysis', label: 'Extended Analysis/Opinion' }
];

// News Source options
const NEWS_SOURCE_OPTIONS = [
  { id: 'newsapi', label: 'NewsAPI.org (Top Headlines)' },
  { id: 'worldnews', label: 'World News API' },
  { id: 'gdelt', label: 'GDELT (Local/Regional)' }
];

interface PromptData {
  targetDuration: string;
  storyCount: string;
  maxSecondsPerStory: string;
  focusAreas: string[];
  contentPriority: string[];
  contentAvoid: string[];
  newsSourcePriority: string;
  specialInstructions: string;
  selectedIntro: number;
  selectedOutro: number;
  customPrompt: string;
}

const DEFAULT_PROMPT: PromptData = {
  targetDuration: '3',
  storyCount: '5',
  maxSecondsPerStory: '30',
  focusAreas: ['Major breaking news', 'Government actions', 'Economic updates'],
  contentPriority: ['breaking', 'government', 'economic', 'trending'],
  contentAvoid: ['fluff', 'celebrity', 'lifestyle'],
  newsSourcePriority: 'newsapi',
  specialInstructions: '',
  selectedIntro: 0,
  selectedOutro: 0,
  customPrompt: ''
};

// Styles
const styles = {
  page: { minHeight: '100vh', backgroundColor: '#ffffff', color: '#000000', padding: 24, fontFamily: 'Arial, sans-serif' },
  section: { backgroundColor: '#ffffff', border: '2px solid #000000', borderRadius: 12, padding: 20, marginBottom: 20 },
  label: { display: 'block', marginBottom: 8, fontSize: 16, fontWeight: 'bold' as const, color: '#000000' },
  input: { width: '100%', padding: 12, fontSize: 16, border: '2px solid #000000', borderRadius: 6, backgroundColor: '#ffffff', color: '#000000', boxSizing: 'border-box' as const },
  select: { width: '100%', padding: 12, fontSize: 16, border: '2px solid #000000', borderRadius: 6, backgroundColor: '#ffffff', color: '#000000' },
  textarea: { width: '100%', padding: 12, fontSize: 16, border: '2px solid #000000', borderRadius: 6, backgroundColor: '#ffffff', color: '#000000', resize: 'vertical' as const, fontFamily: 'Arial, sans-serif' },
  btn: { padding: '14px 24px', fontSize: 16, fontWeight: 'bold' as const, border: '2px solid #000000', borderRadius: 6, cursor: 'pointer' },
  checkbox: { width: 20, height: 20, marginRight: 10, cursor: 'pointer' },
  checkboxLabel: { display: 'flex', alignItems: 'center', fontSize: 16, color: '#000000', marginBottom: 8, cursor: 'pointer' },
  row: { display: 'flex', gap: 16, marginBottom: 16, flexWrap: 'wrap' as const },
  focusItem: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, padding: 10, backgroundColor: '#f5f5f5', borderRadius: 6, border: '1px solid #000000' }
};

export default function PromptEditor() {
  const params = useParams();
  const router = useRouter();
  const category = params.category as string;
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [promptData, setPromptData] = useState<PromptData>(DEFAULT_PROMPT);
  
  const catInfo = CATEGORY_INFO[category];

  // Load prompt data
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

  // Save prompt
  async function handleSave() {
    setSaving(true);
    try {
      const r = await fetch('/api/admin/news-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category, prompt_data: promptData })
      });
      if (r.ok) {
        alert('✅ Prompt saved successfully!');
      } else {
        alert('❌ Failed to save prompt');
      }
    } catch {
      alert('❌ Failed to save prompt');
    } finally {
      setSaving(false);
    }
  }

  // Move focus area up/down
  function moveFocusArea(index: number, direction: 'up' | 'down') {
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= promptData.focusAreas.length) return;
    
    const newAreas = [...promptData.focusAreas];
    [newAreas[index], newAreas[newIndex]] = [newAreas[newIndex], newAreas[index]];
    setPromptData(p => ({ ...p, focusAreas: newAreas }));
  }

  // Add focus area
  function addFocusArea() {
    setPromptData(p => ({ ...p, focusAreas: [...p.focusAreas, ''] }));
  }

  // Remove focus area
  function removeFocusArea(index: number) {
    setPromptData(p => ({ ...p, focusAreas: p.focusAreas.filter((_, i) => i !== index) }));
  }

  // Update focus area
  function updateFocusArea(index: number, value: string) {
    const newAreas = [...promptData.focusAreas];
    newAreas[index] = value;
    setPromptData(p => ({ ...p, focusAreas: newAreas }));
  }

  // Toggle checkbox
  function toggleCheckbox(field: 'contentPriority' | 'contentAvoid', id: string) {
    setPromptData(p => {
      const current = p[field];
      const newValue = current.includes(id) ? current.filter(x => x !== id) : [...current, id];
      return { ...p, [field]: newValue };
    });
  }

  // Generate prompt preview
  function generatePreview(): string {
    const intro = INTRO_OPTIONS[promptData.selectedIntro] || INTRO_OPTIONS[0];
    const outro = OUTRO_OPTIONS[promptData.selectedOutro] || OUTRO_OPTIONS[0];
    
    const priorityLabels = promptData.contentPriority
      .map(id => CONTENT_PRIORITY_OPTIONS.find(o => o.id === id)?.label)
      .filter(Boolean);
    
    const avoidLabels = promptData.contentAvoid
      .map(id => CONTENT_AVOID_OPTIONS.find(o => o.id === id)?.label)
      .filter(Boolean);

    return `You are {narratorName}, a professional radio news broadcaster.
Create a ${promptData.targetDuration}-minute ${catInfo?.label || category} briefing.

TARGET: ${promptData.storyCount} stories, ${promptData.maxSecondsPerStory} seconds each maximum.

CONTENT PRIORITY (in order):
${priorityLabels.map((l, i) => `${i + 1}. ${l}`).join('\n')}

FOCUS AREAS (in order of importance):
${promptData.focusAreas.map((a, i) => `${i + 1}. ${a}`).join('\n')}

CONTENT TO AVOID:
${avoidLabels.map(l => `- ${l}`).join('\n')}

RULES:
- Lead with the most important breaking news
- ${promptData.maxSecondsPerStory} seconds per story maximum - headlines and key facts only
- NO deep dives or extended analysis
- Keep it fast-paced like a radio news update

${promptData.specialInstructions ? `SPECIAL INSTRUCTIONS:\n${promptData.specialInstructions}\n` : ''}
INTRO (use this): "${intro}"

OUTRO (use this): "${outro}"`;
  }

  if (loading || !catInfo) {
    return (
      <div style={{ ...styles.page, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ fontSize: 20, fontWeight: 'bold' }}>Loading...</p>
      </div>
    );
  }

  return (
    <div style={styles.page}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={() => router.push('/admin/news-briefings')} style={{ ...styles.btn, backgroundColor: '#ffffff' }}>
            ← Back
          </button>
          <h1 style={{ fontSize: 24, fontWeight: 'bold', color: '#000000' }}>
            {catInfo.icon} {catInfo.label} Prompt
          </h1>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          style={{ ...styles.btn, backgroundColor: catInfo.color, color: category === 'world' ? '#000000' : '#ffffff' }}
        >
          {saving ? 'Saving...' : '💾 Save Prompt'}
        </button>
      </div>

      {/* Duration & Story Settings */}
      <div style={styles.section}>
        <h2 style={{ fontSize: 18, fontWeight: 'bold', marginBottom: 16, color: '#000000' }}>⏱️ Duration & Story Settings</h2>
        <div style={styles.row}>
          <div style={{ flex: 1, minWidth: 150 }}>
            <label style={styles.label}>Target Duration (minutes)</label>
            <input
              type="number"
              min="1"
              max="10"
              value={promptData.targetDuration}
              onChange={e => setPromptData(p => ({ ...p, targetDuration: e.target.value }))}
              style={styles.input}
            />
          </div>
          <div style={{ flex: 1, minWidth: 150 }}>
            <label style={styles.label}>Story Count</label>
            <input
              type="number"
              min="1"
              max="10"
              value={promptData.storyCount}
              onChange={e => setPromptData(p => ({ ...p, storyCount: e.target.value }))}
              style={styles.input}
            />
          </div>
          <div style={{ flex: 1, minWidth: 150 }}>
            <label style={styles.label}>Max Seconds Per Story</label>
            <input
              type="number"
              min="15"
              max="120"
              value={promptData.maxSecondsPerStory}
              onChange={e => setPromptData(p => ({ ...p, maxSecondsPerStory: e.target.value }))}
              style={styles.input}
            />
          </div>
        </div>
      </div>

      {/* Focus Areas - Reorderable */}
      <div style={styles.section}>
        <h2 style={{ fontSize: 18, fontWeight: 'bold', marginBottom: 16, color: '#000000' }}>🎯 Focus Areas (in order of importance)</h2>
        {promptData.focusAreas.map((area, index) => (
          <div key={index} style={styles.focusItem}>
            <span style={{ fontWeight: 'bold', minWidth: 24 }}>{index + 1}.</span>
            <input
              type="text"
              value={area}
              onChange={e => updateFocusArea(index, e.target.value)}
              placeholder="Enter focus area..."
              style={{ ...styles.input, flex: 1, marginBottom: 0 }}
            />
            <button
              onClick={() => moveFocusArea(index, 'up')}
              disabled={index === 0}
              style={{ ...styles.btn, padding: '8px 12px', backgroundColor: index === 0 ? '#cccccc' : '#3b82f6', color: '#ffffff' }}
            >
              ↑
            </button>
            <button
              onClick={() => moveFocusArea(index, 'down')}
              disabled={index === promptData.focusAreas.length - 1}
              style={{ ...styles.btn, padding: '8px 12px', backgroundColor: index === promptData.focusAreas.length - 1 ? '#cccccc' : '#3b82f6', color: '#ffffff' }}
            >
              ↓
            </button>
            <button
              onClick={() => removeFocusArea(index)}
              style={{ ...styles.btn, padding: '8px 12px', backgroundColor: '#dc2626', color: '#ffffff' }}
            >
              ✕
            </button>
          </div>
        ))}
        <button onClick={addFocusArea} style={{ ...styles.btn, backgroundColor: '#ffffff', marginTop: 8 }}>
          + Add Focus Area
        </button>
      </div>

      {/* Content Priority */}
      <div style={styles.section}>
        <h2 style={{ fontSize: 18, fontWeight: 'bold', marginBottom: 16, color: '#000000' }}>✅ Content Priority (what to include)</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8 }}>
          {CONTENT_PRIORITY_OPTIONS.map(opt => (
            <label key={opt.id} style={styles.checkboxLabel}>
              <input
                type="checkbox"
                checked={promptData.contentPriority.includes(opt.id)}
                onChange={() => toggleCheckbox('contentPriority', opt.id)}
                style={styles.checkbox}
              />
              {opt.label}
            </label>
          ))}
        </div>
      </div>

      {/* Content to Avoid */}
      <div style={styles.section}>
        <h2 style={{ fontSize: 18, fontWeight: 'bold', marginBottom: 16, color: '#000000' }}>❌ Content to Avoid (what to exclude)</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8 }}>
          {CONTENT_AVOID_OPTIONS.map(opt => (
            <label key={opt.id} style={styles.checkboxLabel}>
              <input
                type="checkbox"
                checked={promptData.contentAvoid.includes(opt.id)}
                onChange={() => toggleCheckbox('contentAvoid', opt.id)}
                style={styles.checkbox}
              />
              {opt.label}
            </label>
          ))}
        </div>
      </div>

      {/* News Source Priority */}
      <div style={styles.section}>
        <h2 style={{ fontSize: 18, fontWeight: 'bold', marginBottom: 16, color: '#000000' }}>📰 News Source Priority</h2>
        <select
          value={promptData.newsSourcePriority}
          onChange={e => setPromptData(p => ({ ...p, newsSourcePriority: e.target.value }))}
          style={styles.select}
        >
          {NEWS_SOURCE_OPTIONS.map(opt => (
            <option key={opt.id} value={opt.id}>{opt.label}</option>
          ))}
        </select>
      </div>

      {/* Intro/Outro Selection */}
      <div style={styles.section}>
        <h2 style={{ fontSize: 18, fontWeight: 'bold', marginBottom: 16, color: '#000000' }}>👋 Intro & Outro Scripts</h2>
        <div style={styles.row}>
          <div style={{ flex: 1 }}>
            <label style={styles.label}>Select Intro</label>
            <select
              value={promptData.selectedIntro}
              onChange={e => setPromptData(p => ({ ...p, selectedIntro: parseInt(e.target.value) }))}
              style={styles.select}
            >
              {INTRO_OPTIONS.map((intro, i) => (
                <option key={i} value={i}>{i + 1}. {intro.substring(0, 60)}...</option>
              ))}
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <label style={styles.label}>Select Outro</label>
            <select
              value={promptData.selectedOutro}
              onChange={e => setPromptData(p => ({ ...p, selectedOutro: parseInt(e.target.value) }))}
              style={styles.select}
            >
              {OUTRO_OPTIONS.map((outro, i) => (
                <option key={i} value={i}>{i + 1}. {outro.substring(0, 60)}...</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Special Instructions */}
      <div style={styles.section}>
        <h2 style={{ fontSize: 18, fontWeight: 'bold', marginBottom: 16, color: '#000000' }}>📋 Special Instructions</h2>
        <textarea
          value={promptData.specialInstructions}
          onChange={e => setPromptData(p => ({ ...p, specialInstructions: e.target.value }))}
          rows={4}
          placeholder="Any additional instructions for Claude..."
          style={styles.textarea}
        />
      </div>

      {/* Prompt Preview - Editable */}
      <div style={{ ...styles.section, backgroundColor: '#f5f5f5' }}>
        <h2 style={{ fontSize: 18, fontWeight: 'bold', marginBottom: 16, color: '#000000' }}>📄 Prompt Preview (Editable)</h2>
        <textarea
          value={promptData.customPrompt || generatePreview()}
          onChange={e => setPromptData(p => ({ ...p, customPrompt: e.target.value }))}
          rows={20}
          style={{ ...styles.textarea, fontSize: 14, fontFamily: 'monospace', backgroundColor: '#ffffff' }}
        />
        <button
          onClick={() => setPromptData(p => ({ ...p, customPrompt: '' }))}
          style={{ ...styles.btn, backgroundColor: '#ffffff', marginTop: 12 }}
        >
          🔄 Reset to Generated Preview
        </button>
      </div>

      {/* Bottom Save Button */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: 16, marginTop: 24 }}>
        <button onClick={() => router.push('/admin/news-briefings')} style={{ ...styles.btn, backgroundColor: '#ffffff' }}>
          ← Back to Admin
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          style={{ ...styles.btn, backgroundColor: catInfo.color, color: category === 'world' ? '#000000' : '#ffffff' }}
        >
          {saving ? 'Saving...' : '💾 Save Prompt'}
        </button>
      </div>
    </div>
  );
}
