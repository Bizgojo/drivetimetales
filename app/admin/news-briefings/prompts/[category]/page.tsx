// app/admin/news-briefings/prompts/[category]/page.tsx
// DTT News Briefings - Prompt Editor
// February 2026

'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';

// Category info
const CATEGORY_INFO: Record<string, { label: string; icon: string; color: string }> = {
  state: { label: 'State News', icon: '🏛️', color: '#dc2626' },
  national: { label: 'National News', icon: '🇺🇸', color: '#f97316' },
  world: { label: 'World News', icon: '🌍', color: '#eab308' },
  business: { label: 'Business News', icon: '💼', color: '#16a34a' },
  sports: { label: 'Sports News', icon: '⚽', color: '#2563eb' },
  science: { label: 'Science & Tech', icon: '🔬', color: '#9333ea' }
};

// 15 Intro options (randomly selected by Claude)
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

// 15 Outro options (randomly selected by Claude)
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
  { id: 'newsapi', label: 'NewsAPI.org (Top Headlines) - PRIMARY' },
  { id: 'worldnews', label: 'World News API - BACKUP' },
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
  customPrompt: ''
};

// Styles - White background, black text
const pageStyle: React.CSSProperties = {
  minHeight: '100vh',
  backgroundColor: '#ffffff',
  color: '#000000',
  padding: '24px',
  fontFamily: 'Arial, sans-serif'
};

const sectionStyle: React.CSSProperties = {
  backgroundColor: '#ffffff',
  border: '2px solid #000000',
  borderRadius: '12px',
  padding: '20px',
  marginBottom: '20px'
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  marginBottom: '8px',
  fontSize: '16px',
  fontWeight: 'bold',
  color: '#000000'
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '12px',
  fontSize: '16px',
  border: '2px solid #000000',
  borderRadius: '6px',
  backgroundColor: '#ffffff',
  color: '#000000',
  boxSizing: 'border-box'
};

const selectStyle: React.CSSProperties = {
  width: '100%',
  padding: '12px',
  fontSize: '16px',
  border: '2px solid #000000',
  borderRadius: '6px',
  backgroundColor: '#ffffff',
  color: '#000000'
};

const textareaStyle: React.CSSProperties = {
  width: '100%',
  padding: '12px',
  fontSize: '16px',
  border: '2px solid #000000',
  borderRadius: '6px',
  backgroundColor: '#ffffff',
  color: '#000000',
  resize: 'vertical',
  fontFamily: 'Arial, sans-serif',
  boxSizing: 'border-box'
};

const buttonStyle: React.CSSProperties = {
  padding: '14px 24px',
  fontSize: '16px',
  fontWeight: 'bold',
  border: '2px solid #000000',
  borderRadius: '6px',
  cursor: 'pointer'
};

const checkboxLabelStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  fontSize: '16px',
  color: '#000000',
  marginBottom: '8px',
  cursor: 'pointer'
};

const checkboxStyle: React.CSSProperties = {
  width: '20px',
  height: '20px',
  marginRight: '10px',
  cursor: 'pointer'
};

const focusItemStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  marginBottom: '8px',
  padding: '10px',
  backgroundColor: '#f5f5f5',
  borderRadius: '6px',
  border: '1px solid #000000'
};

export default function PromptEditor() {
  const params = useParams();
  const router = useRouter();
  const category = params.category as string;
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [promptData, setPromptData] = useState<PromptData>(DEFAULT_PROMPT);
  
  const catInfo = CATEGORY_INFO[category];

  // Load prompt data from database
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

  // Save prompt to database
  async function handleSave() {
    setSaving(true);
    try {
      const response = await fetch('/api/admin/news-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category, prompt_data: promptData })
      });
      if (response.ok) {
        alert('✅ Prompt saved successfully!');
      } else {
        alert('❌ Failed to save prompt');
      }
    } catch (error) {
      console.error('Save error:', error);
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
    const temp = newAreas[index];
    newAreas[index] = newAreas[newIndex];
    newAreas[newIndex] = temp;
    setPromptData(prev => ({ ...prev, focusAreas: newAreas }));
  }

  // Add focus area
  function addFocusArea() {
    setPromptData(prev => ({ ...prev, focusAreas: [...prev.focusAreas, ''] }));
  }

  // Remove focus area
  function removeFocusArea(index: number) {
    setPromptData(prev => ({
      ...prev,
      focusAreas: prev.focusAreas.filter((_, i) => i !== index)
    }));
  }

  // Update focus area text
  function updateFocusArea(index: number, value: string) {
    const newAreas = [...promptData.focusAreas];
    newAreas[index] = value;
    setPromptData(prev => ({ ...prev, focusAreas: newAreas }));
  }

  // Toggle checkbox
  function toggleCheckbox(field: 'contentPriority' | 'contentAvoid', id: string) {
    setPromptData(prev => {
      const current = prev[field];
      const newValue = current.includes(id)
        ? current.filter(x => x !== id)
        : [...current, id];
      return { ...prev, [field]: newValue };
    });
  }

  // Generate prompt preview
  function generatePreview(): string {
    const priorityLabels = promptData.contentPriority
      .map(id => CONTENT_PRIORITY_OPTIONS.find(o => o.id === id)?.label)
      .filter(Boolean);
    
    const avoidLabels = promptData.contentAvoid
      .map(id => CONTENT_AVOID_OPTIONS.find(o => o.id === id)?.label)
      .filter(Boolean);

    return `You are {narratorName}, a professional radio news broadcaster.
Create a ${promptData.targetDuration}-minute ${catInfo?.label || category} briefing.

TARGET: ${promptData.storyCount} stories, ${promptData.maxSecondsPerStory} seconds each maximum.

CONTENT PRIORITY (cover these types first):
${priorityLabels.map((l, i) => `${i + 1}. ${l}`).join('\n')}

FOCUS AREAS (in order of importance):
${promptData.focusAreas.filter(a => a.trim()).map((a, i) => `${i + 1}. ${a}`).join('\n')}

CONTENT TO AVOID:
${avoidLabels.map(l => `- ${l}`).join('\n')}

RULES:
- Lead with the most important breaking news
- ${promptData.maxSecondsPerStory} seconds per story maximum - headlines and key facts only
- NO deep dives or extended analysis
- Keep it fast-paced like a radio news update

${promptData.specialInstructions ? `SPECIAL INSTRUCTIONS:\n${promptData.specialInstructions}\n` : ''}
INTRO: (Claude will randomly select from 15 options)
OUTRO: (Claude will randomly select from 15 options)`;
  }

  if (loading || !catInfo) {
    return (
      <div style={{ ...pageStyle, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ fontSize: '20px', fontWeight: 'bold', color: '#000000' }}>Loading...</p>
      </div>
    );
  }

  return (
    <div style={pageStyle}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '24px',
        flexWrap: 'wrap',
        gap: '16px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button
            onClick={() => router.push('/admin/news-briefings')}
            style={{ ...buttonStyle, backgroundColor: '#ffffff' }}
          >
            ← Back
          </button>
          <h1 style={{ fontSize: '24px', fontWeight: 'bold', color: '#000000' }}>
            {catInfo.icon} {catInfo.label} Prompt
          </h1>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            ...buttonStyle,
            backgroundColor: catInfo.color,
            color: category === 'world' ? '#000000' : '#ffffff'
          }}
        >
          {saving ? 'Saving...' : '💾 Save Prompt'}
        </button>
      </div>

      {/* Duration & Story Settings */}
      <div style={sectionStyle}>
        <h2 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '16px', color: '#000000' }}>
          ⏱️ Duration & Story Settings
        </h2>
        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: '150px' }}>
            <label style={labelStyle}>Target Duration (minutes)</label>
            <input
              type="number"
              min="1"
              max="10"
              value={promptData.targetDuration}
              onChange={e => setPromptData(prev => ({ ...prev, targetDuration: e.target.value }))}
              style={inputStyle}
            />
          </div>
          <div style={{ flex: 1, minWidth: '150px' }}>
            <label style={labelStyle}>Story Count</label>
            <input
              type="number"
              min="1"
              max="10"
              value={promptData.storyCount}
              onChange={e => setPromptData(prev => ({ ...prev, storyCount: e.target.value }))}
              style={inputStyle}
            />
          </div>
          <div style={{ flex: 1, minWidth: '150px' }}>
            <label style={labelStyle}>Max Seconds Per Story</label>
            <input
              type="number"
              min="15"
              max="120"
              value={promptData.maxSecondsPerStory}
              onChange={e => setPromptData(prev => ({ ...prev, maxSecondsPerStory: e.target.value }))}
              style={inputStyle}
            />
          </div>
        </div>
      </div>

      {/* Focus Areas - Reorderable */}
      <div style={sectionStyle}>
        <h2 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '16px', color: '#000000' }}>
          🎯 Focus Areas (in order of importance)
        </h2>
        {promptData.focusAreas.map((area, index) => (
          <div key={index} style={focusItemStyle}>
            <span style={{ fontWeight: 'bold', minWidth: '24px', color: '#000000' }}>{index + 1}.</span>
            <input
              type="text"
              value={area}
              onChange={e => updateFocusArea(index, e.target.value)}
              placeholder="Enter focus area..."
              style={{ ...inputStyle, flex: 1, marginBottom: 0 }}
            />
            <button
              onClick={() => moveFocusArea(index, 'up')}
              disabled={index === 0}
              style={{
                ...buttonStyle,
                padding: '8px 12px',
                backgroundColor: index === 0 ? '#cccccc' : '#3b82f6',
                color: '#ffffff'
              }}
            >
              ↑
            </button>
            <button
              onClick={() => moveFocusArea(index, 'down')}
              disabled={index === promptData.focusAreas.length - 1}
              style={{
                ...buttonStyle,
                padding: '8px 12px',
                backgroundColor: index === promptData.focusAreas.length - 1 ? '#cccccc' : '#3b82f6',
                color: '#ffffff'
              }}
            >
              ↓
            </button>
            <button
              onClick={() => removeFocusArea(index)}
              style={{
                ...buttonStyle,
                padding: '8px 12px',
                backgroundColor: '#dc2626',
                color: '#ffffff'
              }}
            >
              ✕
            </button>
          </div>
        ))}
        <button
          onClick={addFocusArea}
          style={{ ...buttonStyle, backgroundColor: '#ffffff', marginTop: '8px' }}
        >
          + Add Focus Area
        </button>
      </div>

      {/* Content Priority */}
      <div style={sectionStyle}>
        <h2 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '16px', color: '#000000' }}>
          ✅ Content Priority (what to include)
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '8px' }}>
          {CONTENT_PRIORITY_OPTIONS.map(opt => (
            <label key={opt.id} style={checkboxLabelStyle}>
              <input
                type="checkbox"
                checked={promptData.contentPriority.includes(opt.id)}
                onChange={() => toggleCheckbox('contentPriority', opt.id)}
                style={checkboxStyle}
              />
              {opt.label}
            </label>
          ))}
        </div>
      </div>

      {/* Content to Avoid */}
      <div style={sectionStyle}>
        <h2 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '16px', color: '#000000' }}>
          ❌ Content to Avoid (what to exclude)
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '8px' }}>
          {CONTENT_AVOID_OPTIONS.map(opt => (
            <label key={opt.id} style={checkboxLabelStyle}>
              <input
                type="checkbox"
                checked={promptData.contentAvoid.includes(opt.id)}
                onChange={() => toggleCheckbox('contentAvoid', opt.id)}
                style={checkboxStyle}
              />
              {opt.label}
            </label>
          ))}
        </div>
      </div>

      {/* News Source Priority */}
      <div style={sectionStyle}>
        <h2 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '16px', color: '#000000' }}>
          📰 News Source Priority
        </h2>
        <select
          value={promptData.newsSourcePriority}
          onChange={e => setPromptData(prev => ({ ...prev, newsSourcePriority: e.target.value }))}
          style={selectStyle}
        >
          {NEWS_SOURCE_OPTIONS.map(opt => (
            <option key={opt.id} value={opt.id}>{opt.label}</option>
          ))}
        </select>
      </div>

      {/* Intro/Outro Scripts - Read Only */}
      <div style={sectionStyle}>
        <h2 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '16px', color: '#000000' }}>
          👋 Intro & Outro Scripts (Randomly Selected by Claude)
        </h2>
        <p style={{ marginBottom: '16px', color: '#000000' }}>
          Claude will randomly choose from these 15 options for each briefing:
        </p>
        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: '250px' }}>
            <label style={labelStyle}>Sample Intros (read-only)</label>
            <select disabled style={{ ...selectStyle, backgroundColor: '#f5f5f5', cursor: 'not-allowed' }}>
              {INTRO_OPTIONS.slice(0, 5).map((intro, i) => (
                <option key={i}>{i + 1}. {intro.substring(0, 50)}...</option>
              ))}
              <option>... and 10 more variations</option>
            </select>
          </div>
          <div style={{ flex: 1, minWidth: '250px' }}>
            <label style={labelStyle}>Sample Outros (read-only)</label>
            <select disabled style={{ ...selectStyle, backgroundColor: '#f5f5f5', cursor: 'not-allowed' }}>
              {OUTRO_OPTIONS.slice(0, 5).map((outro, i) => (
                <option key={i}>{i + 1}. {outro.substring(0, 50)}...</option>
              ))}
              <option>... and 10 more variations</option>
            </select>
          </div>
        </div>
      </div>

      {/* Special Instructions */}
      <div style={sectionStyle}>
        <h2 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '16px', color: '#000000' }}>
          📋 Special Instructions
        </h2>
        <textarea
          value={promptData.specialInstructions}
          onChange={e => setPromptData(prev => ({ ...prev, specialInstructions: e.target.value }))}
          rows={4}
          placeholder="Any additional instructions for Claude..."
          style={textareaStyle}
        />
      </div>

      {/* Prompt Preview - Large and Editable */}
      <div style={{ ...sectionStyle, backgroundColor: '#f5f5f5' }}>
        <h2 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '16px', color: '#000000' }}>
          📄 Prompt Preview (Editable)
        </h2>
        <textarea
          value={promptData.customPrompt || generatePreview()}
          onChange={e => setPromptData(prev => ({ ...prev, customPrompt: e.target.value }))}
          rows={20}
          style={{
            ...textareaStyle,
            fontSize: '14px',
            fontFamily: 'monospace',
            backgroundColor: '#ffffff'
          }}
        />
        <button
          onClick={() => setPromptData(prev => ({ ...prev, customPrompt: '' }))}
          style={{ ...buttonStyle, backgroundColor: '#ffffff', marginTop: '12px' }}
        >
          🔄 Reset to Generated Preview
        </button>
      </div>

      {/* Bottom Save Button */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: '16px', marginTop: '24px' }}>
        <button
          onClick={() => router.push('/admin/news-briefings')}
          style={{ ...buttonStyle, backgroundColor: '#ffffff' }}
        >
          ← Back to Admin
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            ...buttonStyle,
            backgroundColor: catInfo.color,
            color: category === 'world' ? '#000000' : '#ffffff'
          }}
        >
          {saving ? 'Saving...' : '💾 Save Prompt'}
        </button>
      </div>
    </div>
  );
}
