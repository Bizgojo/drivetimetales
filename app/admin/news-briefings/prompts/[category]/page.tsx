'use client';

// Spinner component
function Spinner({ color = '#ffffff' }: { color?: string }) {
  return (
    <span style={{ 
      display: 'inline-block', 
      width: '20px', 
      height: '20px', 
      border: `3px solid ${color}`, 
      borderTopColor: 'transparent', 
      borderRadius: '50%', 
      animation: 'spin 1s linear infinite', 
      marginRight: '10px', 
      verticalAlign: 'middle' 
    }} />
  );
}

const spinnerStyles = `@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`;

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

const US_STATES = [
  'Alabama', 'Alaska', 'Arizona', 'Arkansas', 'California', 'Colorado', 'Connecticut', 'Delaware',
  'Florida', 'Georgia', 'Hawaii', 'Idaho', 'Illinois', 'Indiana', 'Iowa', 'Kansas', 'Kentucky',
  'Louisiana', 'Maine', 'Maryland', 'Massachusetts', 'Michigan', 'Minnesota', 'Mississippi',
  'Missouri', 'Montana', 'Nebraska', 'Nevada', 'New Hampshire', 'New Jersey', 'New Mexico',
  'New York', 'North Carolina', 'North Dakota', 'Ohio', 'Oklahoma', 'Oregon', 'Pennsylvania',
  'Rhode Island', 'South Carolina', 'South Dakota', 'Tennessee', 'Texas', 'Utah', 'Vermont',
  'Virginia', 'Washington', 'West Virginia', 'Wisconsin', 'Wyoming'
];

interface GeneratedScript {
  intro: string;
  body: string;
  outro: string;
  citations: string[];
  metadata: {
    greetingTimeOfDay: string;
    dateSpoken: string;
    wordCount: number;
    citationsCount: number;
  };
}

export default function PromptEditor() {
  const params = useParams();
  const router = useRouter();
  const category = params.category as string;
  const catInfo = CATEGORY_INFO[category];

  // Settings state
  const [loading, setLoading] = useState(true);
  const [narratorName, setNarratorName] = useState('');
  
  // Input fields (only 3!)
  const [toneStyle, setToneStyle] = useState('warm, expressive, conversational - like a trusted friend giving you the news');
  const [durationMinutes, setDurationMinutes] = useState(2);
  const [selectedState, setSelectedState] = useState('Tennessee');

  // Generation state
  const [generating, setGenerating] = useState(false);
  const [isPersonalized, setIsPersonalized] = useState(true);
  const [generatedScript, setGeneratedScript] = useState<GeneratedScript | null>(null);
  const [editedBody, setEditedBody] = useState('');
  const [error, setError] = useState('');

  // Load narrator name on mount
  useEffect(() => {
    if (!category || !CATEGORY_INFO[category]) {
      router.push('/admin/news-briefings');
      return;
    }

    fetch(`/api/admin/news-settings?category=${category}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.settings?.[0]) {
          const s = data.settings[0];
          if (s.narrator_name) setNarratorName(s.narrator_name);
          if (s.subscriber_state) setSelectedState(s.subscriber_state);
          if (s.prompt_data?.toneStyle) setToneStyle(s.prompt_data.toneStyle);
          if (s.prompt_data?.durationMinutes) setDurationMinutes(s.prompt_data.durationMinutes);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [category, router]);

  // Generate script
  async function handleGenerate() {
    if (!narratorName) {
      setError('Please set a narrator name on the main News Briefings page first.');
      return;
    }

    if (category === 'state' && !selectedState) {
      setError('Please select a state for state news.');
      return;
    }

    setGenerating(true);
    setError('');
    
    try {
      const r = await fetch('/api/admin/generate-news', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category,
          isPersonalized,
          firstName: 'Marc', // Preview name
          state: category === 'state' ? selectedState : undefined,
          narratorName,
          toneStyle,
          durationMinutes,
        })
      });

      const data = await r.json();

      if (data.success && data.script) {
        setGeneratedScript({
          intro: data.script.intro,
          body: data.script.body,
          outro: data.script.outro,
          citations: data.script.citations || [],
          metadata: data.script.metadata,
        });
        setEditedBody(data.script.body);
      } else {
        setError(data.error || 'Failed to generate script');
      }
    } catch (err) {
      console.error('Generation error:', err);
      setError('Failed to generate script. Please try again.');
    } finally {
      setGenerating(false);
    }
  }

  // Save settings
  async function handleSaveSettings() {
    try {
      await fetch('/api/admin/news-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category,
          subscriber_state: selectedState,
          prompt_data: { toneStyle, durationMinutes }
        })
      });
    } catch {
      // Silent save
    }
  }

  if (loading || !catInfo) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ fontSize: '20px', fontWeight: 'bold', color: '#000000' }}>Loading...</p>
      </div>
    );
  }

  const inputStyle: React.CSSProperties = { 
    width: '100%', padding: '12px', fontSize: '16px', border: '2px solid #000000', 
    borderRadius: '6px', backgroundColor: '#ffffff', color: '#000000', boxSizing: 'border-box' 
  };
  const btnStyle: React.CSSProperties = { 
    padding: '14px 28px', fontSize: '18px', fontWeight: 'bold', border: '2px solid #000000', 
    borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' 
  };
  const sectionStyle: React.CSSProperties = { 
    backgroundColor: '#ffffff', border: '2px solid #000000', borderRadius: '12px', 
    padding: '24px', marginBottom: '24px' 
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f5f5f5', color: '#000000', padding: '24px', fontFamily: 'Arial, sans-serif', maxWidth: '900px', margin: '0 auto' }}>
      <style>{spinnerStyles}</style>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <button onClick={() => router.push('/admin/news-briefings')} style={{ ...btnStyle, backgroundColor: '#ffffff', fontSize: '16px', padding: '10px 20px' }}>
          ← Back
        </button>
        <h1 style={{ fontSize: '28px', fontWeight: 'bold', color: catInfo.color, margin: 0 }}>
          {catInfo.icon} {catInfo.label}
        </h1>
        <div style={{ width: '100px' }} />
      </div>

      {/* Simple Input Form */}
      <div style={sectionStyle}>
        <h2 style={{ fontSize: '22px', fontWeight: 'bold', marginBottom: '20px', color: '#000000' }}>⚙️ Generate News Briefing</h2>
        
        {/* Tone/Style */}
        <div style={{ marginBottom: '20px' }}>
          <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold', fontSize: '16px' }}>
            1. Voice / Tone Style
          </label>
          <input 
            type="text" 
            value={toneStyle}
            onChange={e => setToneStyle(e.target.value)}
            onBlur={handleSaveSettings}
            placeholder="e.g., warm, expressive, conversational"
            style={inputStyle}
          />
          <p style={{ fontSize: '13px', color: '#666', marginTop: '6px' }}>
            Describe the narrator's style. Do NOT impersonate living people.
          </p>
        </div>

        {/* Duration */}
        <div style={{ marginBottom: '20px' }}>
          <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold', fontSize: '16px' }}>
            2. Duration (minutes)
          </label>
          <select 
            value={durationMinutes}
            onChange={e => { setDurationMinutes(parseInt(e.target.value)); handleSaveSettings(); }}
            style={{ ...inputStyle, maxWidth: '200px' }}
          >
            <option value={1}>1 minute (~130 words)</option>
            <option value={2}>2 minutes (~260 words)</option>
            <option value={3}>3 minutes (~390 words)</option>
            <option value={4}>4 minutes (~520 words)</option>
            <option value={5}>5 minutes (~650 words)</option>
          </select>
        </div>

        {/* State (only for state news) */}
        {category === 'state' && (
          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold', fontSize: '16px' }}>
              3. State
            </label>
            <select 
              value={selectedState}
              onChange={e => { setSelectedState(e.target.value); handleSaveSettings(); }}
              style={{ ...inputStyle, maxWidth: '300px' }}
            >
              {US_STATES.map(st => (
                <option key={st} value={st}>{st}</option>
              ))}
            </select>
          </div>
        )}

        {/* Personalization Toggle */}
        <div style={{ marginBottom: '24px' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
            <input 
              type="checkbox" 
              checked={isPersonalized}
              onChange={e => setIsPersonalized(e.target.checked)}
              style={{ width: '20px', height: '20px' }}
            />
            <span style={{ fontWeight: 'bold' }}>Personalized</span>
            <span style={{ fontSize: '14px', color: '#666' }}>(uses "Marc" for preview)</span>
          </label>
        </div>

        {/* Generate Button */}
        <button 
          onClick={handleGenerate} 
          disabled={generating || !narratorName}
          style={{ 
            ...btnStyle, 
            backgroundColor: generating ? '#ccc' : catInfo.color, 
            color: '#ffffff',
            width: '100%',
            fontSize: '20px',
            padding: '16px'
          }}
        >
          {generating ? <><Spinner /> Searching news & generating script...</> : '🚀 Generate Script'}
        </button>

        {!narratorName && (
          <p style={{ fontSize: '14px', color: '#dc2626', marginTop: '12px', textAlign: 'center' }}>
            ⚠️ Set a narrator name on the main News Briefings page first.
          </p>
        )}

        {error && (
          <p style={{ fontSize: '14px', color: '#dc2626', marginTop: '12px', textAlign: 'center' }}>
            ⚠️ {error}
          </p>
        )}
      </div>

      {/* Generated Script Output */}
      {generatedScript && (
        <>
          {/* Script Sections */}
          <div style={sectionStyle}>
            <h2 style={{ fontSize: '22px', fontWeight: 'bold', marginBottom: '16px', color: '#000000' }}>📄 Generated Script</h2>
            
            <div style={{ display: 'flex', gap: '16px', marginBottom: '20px', fontSize: '14px', color: '#666', flexWrap: 'wrap' }}>
              <span>🕐 {generatedScript.metadata.greetingTimeOfDay}</span>
              <span>📅 {generatedScript.metadata.dateSpoken}</span>
              <span>📝 ~{generatedScript.metadata.wordCount} words</span>
              <span>🔗 {generatedScript.metadata.citationsCount} sources</span>
            </div>

            {/* INTRO - Read Only */}
            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold', color: '#16a34a', fontSize: '16px' }}>
                👋 INTRO (for ElevenLabs)
              </label>
              <div style={{ 
                padding: '16px', backgroundColor: '#f0fdf4', border: '2px solid #16a34a', 
                borderRadius: '8px', fontSize: '16px', lineHeight: '1.7'
              }}>
                {generatedScript.intro}
              </div>
            </div>

            {/* BODY - Editable */}
            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold', color: '#3b82f6', fontSize: '16px' }}>
                📰 BODY (for ElevenLabs - editable)
              </label>
              <textarea
                value={editedBody}
                onChange={e => setEditedBody(e.target.value)}
                rows={12}
                style={{ 
                  ...inputStyle, 
                  resize: 'vertical', 
                  lineHeight: '1.7',
                  border: '2px solid #3b82f6',
                  backgroundColor: '#eff6ff',
                  fontSize: '16px'
                }}
              />
              <p style={{ fontSize: '13px', color: '#666', marginTop: '6px' }}>
                Word count: ~{editedBody.split(/\s+/).filter(w => w).length} words
              </p>
            </div>

            {/* OUTRO - Read Only */}
            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold', color: '#9333ea', fontSize: '16px' }}>
                🎬 OUTRO (for ElevenLabs)
              </label>
              <div style={{ 
                padding: '16px', backgroundColor: '#faf5ff', border: '2px solid #9333ea', 
                borderRadius: '8px', fontSize: '16px', lineHeight: '1.7'
              }}>
                {generatedScript.outro}
              </div>
            </div>

            {/* Full Script for Copy */}
            <div>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold', fontSize: '16px' }}>
                📋 Full Script (copy for ElevenLabs)
              </label>
              <textarea
                readOnly
                value={`${generatedScript.intro}\n\n${editedBody}\n\n${generatedScript.outro}`}
                rows={8}
                style={{ ...inputStyle, backgroundColor: '#f5f5f5', resize: 'vertical', fontSize: '15px', lineHeight: '1.6' }}
                onClick={e => (e.target as HTMLTextAreaElement).select()}
              />
              <p style={{ fontSize: '13px', color: '#666', marginTop: '6px' }}>
                Click to select all. This is the complete script for audio generation.
              </p>
            </div>
          </div>

          {/* Citations - Separate, NOT for audio */}
          <div style={{ ...sectionStyle, backgroundColor: '#fefce8', borderColor: '#ca8a04' }}>
            <h2 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '12px', color: '#854d0e' }}>
              🔗 Sources (Reference Only - NOT sent to audio)
            </h2>
            <p style={{ fontSize: '13px', color: '#854d0e', marginBottom: '12px' }}>
              These are the news sources used. They are for verification/audit purposes only.
            </p>
            {generatedScript.citations.length > 0 ? (
              <ul style={{ margin: 0, paddingLeft: '20px' }}>
                {generatedScript.citations.map((url, i) => (
                  <li key={i} style={{ marginBottom: '6px' }}>
                    <a href={url} target="_blank" rel="noopener noreferrer" style={{ color: '#1d4ed8', fontSize: '14px', wordBreak: 'break-all' }}>
                      {url}
                    </a>
                  </li>
                ))}
              </ul>
            ) : (
              <p style={{ fontSize: '14px', color: '#666' }}>No citations available.</p>
            )}
          </div>
        </>
      )}

      {/* Bottom Navigation */}
      <div style={{ display: 'flex', justifyContent: 'center', marginTop: '24px' }}>
        <button onClick={() => router.push('/admin/news-briefings')} style={{ ...btnStyle, backgroundColor: '#ffffff', fontSize: '16px', padding: '12px 24px' }}>
          ← Back to News Briefings
        </button>
      </div>
    </div>
  );
}
