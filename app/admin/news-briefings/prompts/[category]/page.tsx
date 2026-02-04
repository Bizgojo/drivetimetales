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

// Default body prompt template
const DEFAULT_BODY_PROMPT = `You are writing the BODY section of a news briefing script for Drive Time Tales, an audio platform for drivers and commuters.

Context:
- Category: {CATEGORY}
- Duration target: {DURATION_MINUTES} minutes (about {WORD_COUNT_TARGET} words)
- Tone/style: {TONE_STYLE}

GROUNDING AND SAFETY RULES (MUST FOLLOW):
- You will be given NEWS_ITEMS below. Use ONLY these items as facts.
- Do NOT add or invent any events, details, names, numbers, or claims beyond NEWS_ITEMS.
- If NEWS_ITEMS are empty or insufficient, say: "No verified updates were available in the last 6 hours for this category," and fill remaining time with evergreen, non-factual content only (commuting/safety reminder, "check local alerts"), without referencing any specific event.
- No rumors, no speculation, no unverified social media claims.
- Keep language broadcast-safe.

STYLE RULES:
- Write in a conversational, radio broadcaster style
- No bullet lists, no segment numbering, no headings
- Short paragraphs only (2-3 sentences each)
- Use smooth transitions between stories like "In other news..." or "Meanwhile..." or "Turning to..."
- Each story: what happened + why it matters (1-2 sentences each)
- Keep it factual; avoid speculation and rumors

NEWS_ITEMS:
{NEWS_ITEMS_JSON}

Write ONLY the body section now. Do not include any intro or outro - just the news content.
Start directly with the first story. End after the last story.`;

interface PromptSettings {
  toneStyle: string;
  durationMinutes: number;
  promptOriginal: string;
  promptCurrent: string;
}

interface ParsedNewsItem {
  title: string;
  summary?: string;
  source_name?: string;
  source_url?: string;
}

interface GeneratedScript {
  intro: string;
  body: string;
  outro: string;
  metadata: {
    greetingTimeOfDay: string;
    dateSpoken: string;
    newsItemsCount: number;
    wordCount: number;
  };
}

const DEFAULT_SETTINGS: PromptSettings = {
  toneStyle: 'warm, professional radio broadcaster',
  durationMinutes: 3,
  promptOriginal: DEFAULT_BODY_PROMPT,
  promptCurrent: DEFAULT_BODY_PROMPT,
};

export default function PromptEditor() {
  const params = useParams();
  const router = useRouter();
  const category = params.category as string;
  const catInfo = CATEGORY_INFO[category];

  // Settings state
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<PromptSettings>(DEFAULT_SETTINGS);
  const [narratorName, setNarratorName] = useState('');
  const [subscriberState, setSubscriberState] = useState('South Carolina'); // Default for preview

  // News items state
  const [newsItemsRaw, setNewsItemsRaw] = useState('');
  const [parsedItems, setParsedItems] = useState<ParsedNewsItem[]>([]);
  const [parseError, setParseError] = useState('');
  const [showParsed, setShowParsed] = useState(false);

  // Generation state
  const [generating, setGenerating] = useState(false);
  const [isPersonalized, setIsPersonalized] = useState(true);
  const [generatedScript, setGeneratedScript] = useState<GeneratedScript | null>(null);
  const [editedBody, setEditedBody] = useState('');

  // Load settings on mount
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
          if (s.subscriber_state) setSubscriberState(s.subscriber_state);
          
          // Load prompt settings from prompt_data JSONB
          if (s.prompt_data) {
            const pd = s.prompt_data;
            setSettings({
              toneStyle: pd.toneStyle || DEFAULT_SETTINGS.toneStyle,
              durationMinutes: pd.durationMinutes || pd.targetDuration || DEFAULT_SETTINGS.durationMinutes,
              promptOriginal: pd.promptOriginal || DEFAULT_BODY_PROMPT,
              promptCurrent: pd.promptCurrent || pd.customPrompt || DEFAULT_BODY_PROMPT,
            });
          }
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [category, router]);

  // Parse news items when raw input changes
  function handleParseNewsItems() {
    const trimmed = newsItemsRaw.trim();
    if (!trimmed) {
      setParsedItems([]);
      setParseError('No news items provided');
      setShowParsed(true);
      return;
    }

    // Try JSON first
    if (trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          const items: ParsedNewsItem[] = parsed.map((item: unknown) => {
            if (typeof item === 'object' && item !== null) {
              const obj = item as Record<string, unknown>;
              return {
                title: String(obj.title || ''),
                summary: obj.summary ? String(obj.summary) : undefined,
                source_name: obj.source_name ? String(obj.source_name) : undefined,
                source_url: obj.source_url ? String(obj.source_url) : undefined,
              };
            }
            return { title: String(item) };
          }).filter(item => item.title);
          setParsedItems(items);
          setParseError('');
          setShowParsed(true);
          return;
        }
      } catch {
        // Not valid JSON, try plain text
      }
    }

    // Plain text parsing: split by blank lines
    const blocks = trimmed.split(/\n\s*\n/).filter(b => b.trim());
    const items: ParsedNewsItem[] = [];

    for (const block of blocks) {
      const lines = block.split('\n').map(l => l.trim()).filter(l => l);
      if (lines.length === 0) continue;

      const item: ParsedNewsItem = { title: lines[0] };
      const urlLine = lines.find(l => l.match(/https?:\/\//));
      if (urlLine) {
        const urlMatch = urlLine.match(/(https?:\/\/[^\s]+)/);
        if (urlMatch) {
          item.source_url = urlMatch[1];
          try {
            const url = new URL(item.source_url);
            item.source_name = url.hostname.replace('www.', '');
          } catch { /* Invalid URL */ }
        }
      }
      const nonTitleNonUrlLines = lines.slice(1).filter(l => !l.match(/https?:\/\//));
      if (nonTitleNonUrlLines.length > 0) {
        item.summary = nonTitleNonUrlLines.join(' ');
      }
      items.push(item);
    }

    if (items.length === 0) {
      setParseError('Could not parse any news items. Use blank lines to separate items.');
    } else {
      setParseError('');
    }
    setParsedItems(items);
    setShowParsed(true);
  }

  // Save settings
  async function handleSave() {
    setSaving(true);
    try {
      const promptData = {
        toneStyle: settings.toneStyle,
        durationMinutes: settings.durationMinutes,
        promptOriginal: settings.promptOriginal,
        promptCurrent: settings.promptCurrent,
      };

      const r = await fetch('/api/admin/news-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category, prompt_data: promptData })
      });

      if (r.ok) {
        alert('Settings saved!');
      } else {
        alert('Failed to save settings');
      }
    } catch {
      alert('Failed to save settings');
    } finally {
      setSaving(false);
    }
  }

  // Revert prompt to original
  function handleRevert() {
    if (confirm('Revert prompt to original? This will overwrite your current edits.')) {
      setSettings(s => ({ ...s, promptCurrent: s.promptOriginal }));
    }
  }

  // Generate script
  async function handleGenerate() {
    if (!narratorName) {
      alert('Please set a narrator name on the main News Briefings page first.');
      return;
    }

    setGenerating(true);
    try {
      const r = await fetch('/api/admin/generate-news', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category,
          newsItemsRaw,
          isPersonalized,
          firstName: 'Marc', // Preview name
          state: category === 'state' ? subscriberState : undefined,
          narratorName,
          toneStyle: settings.toneStyle,
          durationMinutes: settings.durationMinutes,
          customPrompt: settings.promptCurrent,
        })
      });

      const data = await r.json();

      if (data.success && data.script) {
        setGeneratedScript({
          intro: data.script.intro,
          body: data.script.body,
          outro: data.script.outro,
          metadata: data.script.metadata,
        });
        setEditedBody(data.script.body);
      } else {
        alert(data.error || 'Failed to generate script');
      }
    } catch (error) {
      console.error('Generation error:', error);
      alert('Failed to generate script');
    } finally {
      setGenerating(false);
    }
  }

  // Regenerate with different personalization
  function handleTogglePersonalized(newValue: boolean) {
    setIsPersonalized(newValue);
    // If we have a generated script, regenerate with new setting
    if (generatedScript) {
      handleGenerate();
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
    padding: '12px 20px', fontSize: '16px', fontWeight: 'bold', border: '2px solid #000000', 
    borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' 
  };
  const sectionStyle: React.CSSProperties = { 
    backgroundColor: '#ffffff', border: '2px solid #000000', borderRadius: '12px', 
    padding: '20px', marginBottom: '20px' 
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f5f5f5', color: '#000000', padding: '24px', fontFamily: 'Arial, sans-serif' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <button onClick={() => router.push('/admin/news-briefings')} style={{ ...btnStyle, backgroundColor: '#ffffff' }}>
          ← Back to News Briefings
        </button>
        <h1 style={{ fontSize: '28px', fontWeight: 'bold', color: catInfo.color }}>
          {catInfo.icon} {catInfo.label} - Edit Prompt
        </h1>
        <div style={{ width: '180px' }} /> {/* Spacer */}
      </div>

      {/* Settings Section */}
      <div style={sectionStyle}>
        <h2 style={{ fontSize: '20px', fontWeight: 'bold', marginBottom: '16px', color: '#000000' }}>⚙️ Generation Settings</h2>
        
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '6px', fontWeight: 'bold' }}>Tone / Style</label>
            <input 
              type="text" 
              value={settings.toneStyle}
              onChange={e => setSettings(s => ({ ...s, toneStyle: e.target.value }))}
              placeholder="e.g., warm, professional radio broadcaster"
              style={inputStyle}
            />
            <p style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>
              Describe the narrator's style. Do NOT impersonate living people.
            </p>
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '6px', fontWeight: 'bold' }}>Duration (minutes)</label>
            <input 
              type="number" 
              min="1" 
              max="10"
              value={settings.durationMinutes}
              onChange={e => setSettings(s => ({ ...s, durationMinutes: parseInt(e.target.value) || 3 }))}
              style={inputStyle}
            />
            <p style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>
              Target duration. ~130 words per minute.
            </p>
          </div>
        </div>

        {category === 'state' && (
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', marginBottom: '6px', fontWeight: 'bold' }}>Preview State (for timezone)</label>
            <input 
              type="text" 
              value={subscriberState}
              onChange={e => setSubscriberState(e.target.value)}
              placeholder="e.g., South Carolina"
              style={{ ...inputStyle, maxWidth: '300px' }}
            />
          </div>
        )}

        <div style={{ display: 'flex', gap: '10px' }}>
          <button onClick={handleSave} disabled={saving} style={{ ...btnStyle, backgroundColor: catInfo.color, color: '#ffffff' }}>
            {saving ? 'Saving...' : '💾 Save Settings'}
          </button>
        </div>
      </div>

      {/* NEWS_ITEMS Input Section */}
      <div style={sectionStyle}>
        <h2 style={{ fontSize: '20px', fontWeight: 'bold', marginBottom: '16px', color: '#000000' }}>📰 News Items (Last 6 Hours)</h2>
        <p style={{ fontSize: '14px', color: '#666', marginBottom: '12px' }}>
          Paste news items below. The AI will ONLY use these facts - it will not invent any information.
        </p>
        <p style={{ fontSize: '12px', color: '#666', marginBottom: '12px', backgroundColor: '#f0f9ff', padding: '8px', borderRadius: '4px' }}>
          <strong>Format:</strong> JSON array (preferred) or plain text separated by blank lines.<br/>
          Plain text: First line = title, middle lines = summary, line with URL = source.
        </p>
        
        <textarea
          value={newsItemsRaw}
          onChange={e => { setNewsItemsRaw(e.target.value); setShowParsed(false); }}
          placeholder={`Example JSON:
[
  {"title": "Governor signs new education bill", "summary": "The bill allocates $50M to schools.", "source_url": "https://example.com/news"},
  {"title": "Storm warning issued for coast", "summary": "Residents advised to prepare.", "source_url": "https://weather.com/alert"}
]

Or plain text:
Governor signs new education bill
The bill allocates $50M to schools.
https://example.com/news

Storm warning issued for coast
Residents advised to prepare.
https://weather.com/alert`}
          rows={10}
          style={{ ...inputStyle, fontFamily: 'monospace', fontSize: '14px', resize: 'vertical', marginBottom: '12px' }}
        />

        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <button onClick={handleParseNewsItems} style={{ ...btnStyle, backgroundColor: '#3b82f6', color: '#ffffff' }}>
            ✓ Validate / Parse
          </button>
          {showParsed && (
            <span style={{ fontSize: '14px', color: parseError ? '#dc2626' : '#16a34a' }}>
              {parseError || `✅ ${parsedItems.length} items parsed`}
            </span>
          )}
        </div>

        {/* Parsed items preview */}
        {showParsed && parsedItems.length > 0 && (
          <div style={{ marginTop: '16px', backgroundColor: '#f5f5f5', padding: '12px', borderRadius: '6px', border: '1px solid #ccc' }}>
            <h3 style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '8px' }}>Parsed Items Preview:</h3>
            {parsedItems.map((item, i) => (
              <div key={i} style={{ marginBottom: '8px', paddingBottom: '8px', borderBottom: i < parsedItems.length - 1 ? '1px solid #ddd' : 'none' }}>
                <p style={{ fontWeight: 'bold', margin: 0 }}>{i + 1}. {item.title}</p>
                {item.summary && <p style={{ fontSize: '13px', color: '#666', margin: '2px 0' }}>{item.summary}</p>}
                {item.source_url && (
                  <a href={item.source_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: '12px', color: '#3b82f6' }}>
                    {item.source_name || item.source_url}
                  </a>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Prompt Template Section */}
      <div style={sectionStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h2 style={{ fontSize: '20px', fontWeight: 'bold', color: '#000000', margin: 0 }}>🤖 Body Prompt Template</h2>
          <button onClick={handleRevert} style={{ ...btnStyle, padding: '8px 16px', backgroundColor: '#f5f5f5', fontSize: '14px' }}>
            ↩️ Revert to Original
          </button>
        </div>
        <p style={{ fontSize: '14px', color: '#666', marginBottom: '12px' }}>
          This prompt generates the BODY section only. Intro/outro are generated from templates.
          Placeholders: {'{CATEGORY}'}, {'{DURATION_MINUTES}'}, {'{WORD_COUNT_TARGET}'}, {'{TONE_STYLE}'}, {'{NEWS_ITEMS_JSON}'}
        </p>
        <textarea
          value={settings.promptCurrent}
          onChange={e => setSettings(s => ({ ...s, promptCurrent: e.target.value }))}
          rows={15}
          style={{ ...inputStyle, fontFamily: 'monospace', fontSize: '14px', resize: 'vertical' }}
        />
      </div>

      {/* Generate Section */}
      <div style={sectionStyle}>
        <h2 style={{ fontSize: '20px', fontWeight: 'bold', marginBottom: '16px', color: '#000000' }}>🎬 Generate Script</h2>
        
        <div style={{ display: 'flex', gap: '16px', alignItems: 'center', marginBottom: '16px' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
            <input 
              type="checkbox" 
              checked={isPersonalized}
              onChange={e => handleTogglePersonalized(e.target.checked)}
              style={{ width: '20px', height: '20px' }}
            />
            <span style={{ fontWeight: 'bold' }}>Personalized</span>
            <span style={{ fontSize: '13px', color: '#666' }}>(uses name "Marc" for preview)</span>
          </label>
        </div>

        <button 
          onClick={handleGenerate} 
          disabled={generating || !narratorName}
          style={{ 
            ...btnStyle, 
            backgroundColor: generating ? '#ccc' : catInfo.color, 
            color: '#ffffff',
            minWidth: '200px'
          }}
        >
          {generating ? '⏳ Generating...' : '🚀 Generate Script'}
        </button>

        {!narratorName && (
          <p style={{ fontSize: '14px', color: '#dc2626', marginTop: '8px' }}>
            ⚠️ Set a narrator name on the main News Briefings page first.
          </p>
        )}
      </div>

      {/* Generated Script Output */}
      {generatedScript && (
        <div style={sectionStyle}>
          <h2 style={{ fontSize: '20px', fontWeight: 'bold', marginBottom: '16px', color: '#000000' }}>📄 Generated Script</h2>
          
          <div style={{ display: 'flex', gap: '16px', marginBottom: '16px', fontSize: '14px', color: '#666' }}>
            <span>🕐 {generatedScript.metadata.greetingTimeOfDay}</span>
            <span>📅 {generatedScript.metadata.dateSpoken}</span>
            <span>📰 {generatedScript.metadata.newsItemsCount} items</span>
            <span>📝 ~{generatedScript.metadata.wordCount} words</span>
          </div>

          {/* Intro - Read Only */}
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', marginBottom: '6px', fontWeight: 'bold', color: '#16a34a' }}>
              👋 INTRO (read-only)
            </label>
            <div style={{ 
              padding: '12px', backgroundColor: '#f0fdf4', border: '2px solid #16a34a', 
              borderRadius: '6px', fontSize: '16px', lineHeight: '1.6'
            }}>
              {generatedScript.intro}
            </div>
          </div>

          {/* Body - Editable */}
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', marginBottom: '6px', fontWeight: 'bold', color: '#3b82f6' }}>
              📰 BODY (editable)
            </label>
            <textarea
              value={editedBody}
              onChange={e => setEditedBody(e.target.value)}
              rows={12}
              style={{ 
                ...inputStyle, 
                resize: 'vertical', 
                lineHeight: '1.6',
                border: '2px solid #3b82f6',
                backgroundColor: '#eff6ff'
              }}
            />
            <p style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>
              Word count: ~{editedBody.split(/\s+/).filter(w => w).length} words
            </p>
          </div>

          {/* Outro - Read Only */}
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', marginBottom: '6px', fontWeight: 'bold', color: '#9333ea' }}>
              🎬 OUTRO (read-only)
            </label>
            <div style={{ 
              padding: '12px', backgroundColor: '#faf5ff', border: '2px solid #9333ea', 
              borderRadius: '6px', fontSize: '16px', lineHeight: '1.6'
            }}>
              {generatedScript.outro}
            </div>
          </div>

          {/* Full Script Preview */}
          <div>
            <label style={{ display: 'block', marginBottom: '6px', fontWeight: 'bold' }}>
              📋 Full Script (for copy/paste)
            </label>
            <textarea
              readOnly
              value={`${generatedScript.intro}\n\n${editedBody}\n\n${generatedScript.outro}`}
              rows={8}
              style={{ ...inputStyle, backgroundColor: '#f5f5f5', resize: 'vertical' }}
              onClick={e => (e.target as HTMLTextAreaElement).select()}
            />
            <p style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>
              Click to select all. This is the complete script ready for audio generation.
            </p>
          </div>
        </div>
      )}

      {/* Bottom Navigation */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: '16px', marginTop: '24px' }}>
        <button onClick={() => router.push('/admin/news-briefings')} style={{ ...btnStyle, backgroundColor: '#ffffff' }}>
          ← Back to News Briefings
        </button>
      </div>
    </div>
  );
}
