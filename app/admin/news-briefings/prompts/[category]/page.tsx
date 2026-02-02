// app/admin/news-briefings/prompts/[category]/page.tsx
// DTT News Briefings - Prompt Editor
// February 2026
//
// Full-page editor for customizing Claude prompts per category

'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// Category info
const CATEGORY_INFO: Record<string, { label: string; icon: string; color: string }> = {
  state: { label: 'State News', icon: '🏛️', color: '#dc2626' },
  national: { label: 'National News', icon: '🇺🇸', color: '#f97316' },
  world: { label: 'World News', icon: '🌍', color: '#eab308' },
  business: { label: 'Business News', icon: '💼', color: '#16a34a' },
  sports: { label: 'Sports News', icon: '⚽', color: '#2563eb' },
  science: { label: 'Science & Tech', icon: '🔬', color: '#9333ea' }
};

// Default prompts
const DEFAULT_PROMPTS: Record<string, PromptData> = {
  state: {
    targetDuration: '3',
    focusAreas: [
      'State government actions and legislation',
      'Local crime and public safety',
      'Community events and school news',
      'State college sports (Basketball and Football)',
      'Weather impacts and emergencies'
    ],
    specialInstructions: 'Focus only on news specific to this state. Mention specific cities and local landmarks. Include college sports updates when available.',
    introVariations: [
      'Good {timeOfDay}, {userName}! It\'s {date}. I\'m {narratorName} with your {stateName} news.',
      'Hey {userName}! {narratorName} here with your {stateName} update for {date}.',
      'Welcome, {userName}! I\'m {narratorName}, bringing you {stateName} news for {date}.'
    ],
    outroVariations: [
      'That\'s your {stateName} update, {userName}. Drive safe!',
      'That\'s the news from {stateName}. I\'m {narratorName}. See you next time!',
      'Thanks for listening, {userName}. This is {narratorName}. Stay informed!'
    ]
  },
  national: {
    targetDuration: '3',
    focusAreas: [
      'White House and Presidential actions',
      'Congress legislation and votes',
      'Supreme Court decisions',
      'Federal agency announcements',
      'National economic news'
    ],
    specialInstructions: 'Lead with the most significant federal government news. Explain how policies affect everyday Americans.',
    introVariations: [
      'Good {timeOfDay}, {userName}! It\'s {date}. I\'m {narratorName} with your National news.',
      '{userName}, good {timeOfDay}! {narratorName} here with your National update.',
      'Welcome, {userName}! I\'m {narratorName}, bringing you National news for {date}.'
    ],
    outroVariations: [
      'That\'s your National update. I\'m {narratorName}. Drive safe!',
      'That wraps up National news. {narratorName} here. See you next time!',
      'Thanks for listening, {userName}. Stay informed out there!'
    ]
  },
  world: {
    targetDuration: '3',
    focusAreas: [
      'Major international conflicts and diplomacy',
      'World leaders and government changes',
      'Global economic developments',
      'International disasters and humanitarian issues',
      'US foreign policy impacts'
    ],
    specialInstructions: 'Provide geographic context for listeners unfamiliar with regions. Explain how world events may affect US interests.',
    introVariations: [
      'Good {timeOfDay}, {userName}! It\'s {date}. I\'m {narratorName} with World news.',
      '{userName}, {narratorName} here with your international update for {date}.',
      'Welcome, {userName}! I\'m {narratorName}, bringing you news from around the world.'
    ],
    outroVariations: [
      'That\'s your World update. I\'m {narratorName}. Safe travels!',
      'That\'s the international news. {narratorName} here. Drive safe!',
      'Thanks for listening, {userName}. This is {narratorName}. See you next time!'
    ]
  },
  business: {
    targetDuration: '3',
    focusAreas: [
      'Stock market and economic indicators',
      'Corporate earnings and leadership changes',
      'Small business and entrepreneurship',
      'Consumer spending trends',
      'Job market updates'
    ],
    specialInstructions: 'Translate financial jargon into everyday language. Explain how business news affects the average consumer. Include practical takeaways.',
    introVariations: [
      'Good {timeOfDay}, {userName}! It\'s {date}. I\'m {narratorName} with Business news.',
      '{userName}, {narratorName} here with your business update for {date}.',
      'Welcome, {userName}! I\'m {narratorName}, bringing you the latest in business.'
    ],
    outroVariations: [
      'That\'s your Business update. I\'m {narratorName}. Drive safe!',
      'That wraps up business news. {narratorName} here. See you next time!',
      'Thanks for listening, {userName}. Stay profitable out there!'
    ]
  },
  sports: {
    targetDuration: '3',
    focusAreas: [
      'NFL, NBA, MLB, NHL scores and standings',
      'College football and basketball',
      'Player trades and injuries',
      'Playoff and championship updates',
      'Sports business news'
    ],
    specialInstructions: 'Lead with scores from the last 24 hours. Include playoff implications and notable player performances.',
    introVariations: [
      'Good {timeOfDay}, {userName}! It\'s {date}. I\'m {narratorName} with Sports news.',
      '{userName}, {narratorName} here with your sports update for {date}.',
      'Welcome, {userName}! I\'m {narratorName}, bringing you the latest in sports.'
    ],
    outroVariations: [
      'That\'s your Sports update. I\'m {narratorName}. Drive safe!',
      'That\'s the sports wrap. {narratorName} here. See you next time!',
      'Thanks for listening, {userName}. Go team!'
    ]
  },
  science: {
    targetDuration: '3',
    focusAreas: [
      'Space exploration and NASA updates',
      'Tech industry and product launches',
      'Medical breakthroughs',
      'AI and cybersecurity news',
      'Climate and environmental science'
    ],
    specialInstructions: 'Explain complex concepts in accessible terms. Focus on discoveries that impact daily life. Avoid overly technical jargon.',
    introVariations: [
      'Good {timeOfDay}, {userName}! It\'s {date}. I\'m {narratorName} with Science and Tech news.',
      '{userName}, {narratorName} here with your science update for {date}.',
      'Welcome, {userName}! I\'m {narratorName}, bringing you the latest in science and technology.'
    ],
    outroVariations: [
      'That\'s your Science update. I\'m {narratorName}. Drive safe!',
      'That wraps up science and tech. {narratorName} here. See you next time!',
      'Thanks for listening, {userName}. Stay curious out there!'
    ]
  }
};

interface PromptData {
  targetDuration: string;
  focusAreas: string[];
  specialInstructions: string;
  introVariations: string[];
  outroVariations: string[];
}

export default function PromptEditor() {
  const params = useParams();
  const router = useRouter();
  const category = params.category as string;
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [promptData, setPromptData] = useState<PromptData | null>(null);
  
  const catInfo = CATEGORY_INFO[category];

  // Load prompt data
  useEffect(() => {
    async function loadPrompt() {
      try {
        const { data, error } = await supabase
          .from('news_settings')
          .select('prompt_data')
          .eq('category', category)
          .single();

        if (data?.prompt_data) {
          setPromptData(data.prompt_data);
        } else {
          // Use defaults
          setPromptData(DEFAULT_PROMPTS[category] || DEFAULT_PROMPTS['national']);
        }
      } catch (error) {
        setPromptData(DEFAULT_PROMPTS[category] || DEFAULT_PROMPTS['national']);
      } finally {
        setLoading(false);
      }
    }
    
    if (category && CATEGORY_INFO[category]) {
      loadPrompt();
    } else {
      router.push('/admin/news-briefings');
    }
  }, [category, router]);

  // Save prompt data
  async function handleSave() {
    if (!promptData) return;
    
    setSaving(true);
    
    try {
      const { error } = await supabase
        .from('news_settings')
        .update({ prompt_data: promptData })
        .eq('category', category);

      if (error) {
        // If row doesn't exist, insert it
        await supabase.from('news_settings').upsert({
          category,
          prompt_data: promptData
        }, { onConflict: 'category' });
      }

      alert('✅ Prompt saved successfully!');
    } catch (error) {
      alert('❌ Failed to save prompt');
    } finally {
      setSaving(false);
    }
  }

  // Reset to defaults
  function handleReset() {
    if (confirm('Reset to default prompt? This will overwrite your changes.')) {
      setPromptData(DEFAULT_PROMPTS[category] || DEFAULT_PROMPTS['national']);
    }
  }

  // Update focus area
  function updateFocusArea(index: number, value: string) {
    if (!promptData) return;
    const newAreas = [...promptData.focusAreas];
    newAreas[index] = value;
    setPromptData({ ...promptData, focusAreas: newAreas });
  }

  // Add focus area
  function addFocusArea() {
    if (!promptData) return;
    setPromptData({ ...promptData, focusAreas: [...promptData.focusAreas, ''] });
  }

  // Remove focus area
  function removeFocusArea(index: number) {
    if (!promptData) return;
    const newAreas = promptData.focusAreas.filter((_, i) => i !== index);
    setPromptData({ ...promptData, focusAreas: newAreas });
  }

  // Update intro variation
  function updateIntro(index: number, value: string) {
    if (!promptData) return;
    const newIntros = [...promptData.introVariations];
    newIntros[index] = value;
    setPromptData({ ...promptData, introVariations: newIntros });
  }

  // Add intro
  function addIntro() {
    if (!promptData) return;
    setPromptData({ ...promptData, introVariations: [...promptData.introVariations, ''] });
  }

  // Remove intro
  function removeIntro(index: number) {
    if (!promptData) return;
    const newIntros = promptData.introVariations.filter((_, i) => i !== index);
    setPromptData({ ...promptData, introVariations: newIntros });
  }

  // Update outro variation
  function updateOutro(index: number, value: string) {
    if (!promptData) return;
    const newOutros = [...promptData.outroVariations];
    newOutros[index] = value;
    setPromptData({ ...promptData, outroVariations: newOutros });
  }

  // Add outro
  function addOutro() {
    if (!promptData) return;
    setPromptData({ ...promptData, outroVariations: [...promptData.outroVariations, ''] });
  }

  // Remove outro
  function removeOutro(index: number) {
    if (!promptData) return;
    const newOutros = promptData.outroVariations.filter((_, i) => i !== index);
    setPromptData({ ...promptData, outroVariations: newOutros });
  }

  if (loading || !promptData || !catInfo) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#020617', color: 'white', padding: '24px' }}>
        <p>Loading...</p>
      </div>
    );
  }

  const inputStyle = {
    width: '100%',
    backgroundColor: '#334155',
    color: 'white',
    border: '1px solid #475569',
    borderRadius: '6px',
    padding: '10px 12px',
    fontSize: '14px'
  };

  const labelStyle = {
    display: 'block',
    marginBottom: '8px',
    fontSize: '14px',
    fontWeight: 'bold' as const,
    color: 'white'
  };

  const sectionStyle = {
    backgroundColor: '#1e293b',
    borderRadius: '12px',
    padding: '20px',
    marginBottom: '20px'
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#020617', color: 'white', padding: '24px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button
            onClick={() => router.push('/admin/news-briefings')}
            style={{
              backgroundColor: '#334155',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              padding: '8px 16px',
              cursor: 'pointer'
            }}
          >
            ← Back
          </button>
          <span style={{ fontSize: '28px' }}>{catInfo.icon}</span>
          <h1 style={{ fontSize: '24px', fontWeight: 'bold', color: catInfo.color }}>
            {catInfo.label} Prompt
          </h1>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button
            onClick={handleReset}
            style={{
              backgroundColor: '#475569',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              padding: '10px 20px',
              cursor: 'pointer',
              fontWeight: 'bold'
            }}
          >
            Reset to Default
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              backgroundColor: catInfo.color,
              color: category === 'world' ? 'black' : 'white',
              border: 'none',
              borderRadius: '6px',
              padding: '10px 24px',
              cursor: saving ? 'not-allowed' : 'pointer',
              fontWeight: 'bold'
            }}
          >
            {saving ? 'Saving...' : '💾 Save Prompt'}
          </button>
        </div>
      </div>

      {/* Help Text */}
      <div style={{ ...sectionStyle, backgroundColor: '#1e3a5f', borderLeft: `4px solid ${catInfo.color}` }}>
        <p style={{ margin: 0, fontSize: '14px' }}>
          <strong>Available placeholders:</strong> {'{timeOfDay}'} (morning/afternoon/evening), {'{userName}'} (listener's name), 
          {'{date}'} (today's date), {'{narratorName}'} (broadcaster name), {'{stateName}'} (state name for state news)
        </p>
      </div>

      {/* Target Duration */}
      <div style={sectionStyle}>
        <label style={labelStyle}>⏱️ Target Duration (minutes)</label>
        <input
          type="number"
          min="1"
          max="10"
          value={promptData.targetDuration}
          onChange={(e) => setPromptData({ ...promptData, targetDuration: e.target.value })}
          style={{ ...inputStyle, width: '120px' }}
        />
        <p style={{ margin: '8px 0 0', fontSize: '12px', opacity: 0.7 }}>
          How long the briefing should be when read aloud
        </p>
      </div>

      {/* Focus Areas */}
      <div style={sectionStyle}>
        <label style={labelStyle}>🎯 Focus Areas (topics Claude should prioritize)</label>
        {promptData.focusAreas.map((area, index) => (
          <div key={index} style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
            <input
              type="text"
              value={area}
              onChange={(e) => updateFocusArea(index, e.target.value)}
              placeholder="Enter a topic to focus on..."
              style={inputStyle}
            />
            <button
              onClick={() => removeFocusArea(index)}
              style={{
                backgroundColor: '#dc2626',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                padding: '0 12px',
                cursor: 'pointer'
              }}
            >
              ✕
            </button>
          </div>
        ))}
        <button
          onClick={addFocusArea}
          style={{
            backgroundColor: '#334155',
            color: 'white',
            border: '1px dashed #475569',
            borderRadius: '6px',
            padding: '8px 16px',
            cursor: 'pointer',
            marginTop: '8px'
          }}
        >
          + Add Focus Area
        </button>
      </div>

      {/* Special Instructions */}
      <div style={sectionStyle}>
        <label style={labelStyle}>📋 Special Instructions (guidance for Claude)</label>
        <textarea
          value={promptData.specialInstructions}
          onChange={(e) => setPromptData({ ...promptData, specialInstructions: e.target.value })}
          rows={4}
          placeholder="Any special instructions for how Claude should write this briefing..."
          style={{ ...inputStyle, resize: 'vertical' }}
        />
      </div>

      {/* Intro Variations */}
      <div style={sectionStyle}>
        <label style={labelStyle}>👋 Intro Variations (Claude picks one randomly)</label>
        {promptData.introVariations.map((intro, index) => (
          <div key={index} style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
            <input
              type="text"
              value={intro}
              onChange={(e) => updateIntro(index, e.target.value)}
              placeholder="Enter an intro variation..."
              style={inputStyle}
            />
            <button
              onClick={() => removeIntro(index)}
              style={{
                backgroundColor: '#dc2626',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                padding: '0 12px',
                cursor: 'pointer'
              }}
            >
              ✕
            </button>
          </div>
        ))}
        <button
          onClick={addIntro}
          style={{
            backgroundColor: '#334155',
            color: 'white',
            border: '1px dashed #475569',
            borderRadius: '6px',
            padding: '8px 16px',
            cursor: 'pointer',
            marginTop: '8px'
          }}
        >
          + Add Intro Variation
        </button>
      </div>

      {/* Outro Variations */}
      <div style={sectionStyle}>
        <label style={labelStyle}>👋 Outro Variations (Claude picks one randomly)</label>
        {promptData.outroVariations.map((outro, index) => (
          <div key={index} style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
            <input
              type="text"
              value={outro}
              onChange={(e) => updateOutro(index, e.target.value)}
              placeholder="Enter an outro variation..."
              style={inputStyle}
            />
            <button
              onClick={() => removeOutro(index)}
              style={{
                backgroundColor: '#dc2626',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                padding: '0 12px',
                cursor: 'pointer'
              }}
            >
              ✕
            </button>
          </div>
        ))}
        <button
          onClick={addOutro}
          style={{
            backgroundColor: '#334155',
            color: 'white',
            border: '1px dashed #475569',
            borderRadius: '6px',
            padding: '8px 16px',
            cursor: 'pointer',
            marginTop: '8px'
          }}
        >
          + Add Outro Variation
        </button>
      </div>

      {/* Preview */}
      <div style={{ ...sectionStyle, backgroundColor: '#0f172a', borderLeft: `4px solid ${catInfo.color}` }}>
        <label style={labelStyle}>📄 Prompt Preview (what Claude will see)</label>
        <pre style={{
          backgroundColor: '#1e293b',
          padding: '16px',
          borderRadius: '8px',
          fontSize: '12px',
          overflow: 'auto',
          whiteSpace: 'pre-wrap',
          color: '#94a3b8'
        }}>
{`You are [Narrator Name], a professional radio news broadcaster.
Create a ${promptData.targetDuration}-minute briefing for ${catInfo.label}.

FOCUS AREAS:
${promptData.focusAreas.map(a => `- ${a}`).join('\n')}

SPECIAL INSTRUCTIONS:
${promptData.specialInstructions}

INTRO (pick one randomly):
${promptData.introVariations.map(i => `- "${i}"`).join('\n')}

OUTRO (pick one randomly):
${promptData.outroVariations.map(o => `- "${o}"`).join('\n')}`}
        </pre>
      </div>
    </div>
  );
}
