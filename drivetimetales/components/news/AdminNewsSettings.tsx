// components/news/AdminNewsSettings.tsx
// Admin panel for configuring news generation settings

'use client';

import { useState, useEffect } from 'react';

interface NewsSettings {
  morning_time: string;
  evening_time: string;
  timezone: string;
  auto_generate: boolean;
  stories_per_section: number;
  target_duration_mins: number;
  anchor_voice_name: string;
  anchor_voice_id: string;
  elevenlabs_api_key: string | null;
  anthropic_api_key: string | null;
}

export function AdminNewsSettings() {
  const [settings, setSettings] = useState<NewsSettings | null>(null);
  const [availableVoices, setAvailableVoices] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    morning_time: '06:00',
    evening_time: '18:00',
    timezone: 'America/New_York',
    auto_generate: false,
    stories_per_section: 5,
    anchor_voice_name: 'Rachel',
    elevenlabs_api_key: '',
    anthropic_api_key: ''
  });

  useEffect(() => {
    fetchSettings();
  }, []);

  async function fetchSettings() {
    try {
      const response = await fetch('/api/admin/news-settings');
      const data = await response.json();
      setSettings(data.settings);
      setAvailableVoices(data.availableVoices || []);
      
      // Populate form
      if (data.settings) {
        setFormData({
          morning_time: data.settings.morning_time?.substring(0, 5) || '06:00',
          evening_time: data.settings.evening_time?.substring(0, 5) || '18:00',
          timezone: data.settings.timezone || 'America/New_York',
          auto_generate: data.settings.auto_generate || false,
          stories_per_section: data.settings.stories_per_section || 5,
          anchor_voice_name: data.settings.anchor_voice_name || 'Rachel',
          elevenlabs_api_key: '',
          anthropic_api_key: ''
        });
      }
    } catch (error) {
      console.error('Failed to fetch settings:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    setMessage(null);

    try {
      const updateData: Record<string, any> = {
        morning_time: formData.morning_time + ':00',
        evening_time: formData.evening_time + ':00',
        timezone: formData.timezone,
        auto_generate: formData.auto_generate,
        stories_per_section: formData.stories_per_section,
        anchor_voice_name: formData.anchor_voice_name
      };

      // Only send API keys if they've been entered
      if (formData.elevenlabs_api_key) {
        updateData.elevenlabs_api_key = formData.elevenlabs_api_key;
      }
      if (formData.anthropic_api_key) {
        updateData.anthropic_api_key = formData.anthropic_api_key;
      }

      const response = await fetch('/api/admin/news-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updateData)
      });

      const data = await response.json();
      
      if (data.success) {
        setMessage({ type: 'success', text: 'Settings saved successfully!' });
        // Clear API key inputs after save
        setFormData(prev => ({
          ...prev,
          elevenlabs_api_key: '',
          anthropic_api_key: ''
        }));
        fetchSettings(); // Refresh
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to save settings' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to save settings' });
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="bg-slate-800 rounded-xl p-6 animate-pulse">
        <div className="h-64 bg-slate-700 rounded"></div>
      </div>
    );
  }

  return (
    <div className="bg-slate-800 rounded-xl p-6 border border-slate-700">
      <h3 className="text-lg font-semibold text-white mb-6 flex items-center gap-2">
        <svg className="w-5 h-5 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
        News Generation Settings
      </h3>

      <div className="space-y-6">
        {/* Schedule Section */}
        <div>
          <h4 className="text-sm font-medium text-slate-300 mb-3">Schedule</h4>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Morning Edition</label>
              <input
                type="time"
                value={formData.morning_time}
                onChange={(e) => setFormData(prev => ({ ...prev, morning_time: e.target.value }))}
                className="w-full bg-slate-700 text-white rounded px-3 py-2 text-sm border border-slate-600"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Evening Edition</label>
              <input
                type="time"
                value={formData.evening_time}
                onChange={(e) => setFormData(prev => ({ ...prev, evening_time: e.target.value }))}
                className="w-full bg-slate-700 text-white rounded px-3 py-2 text-sm border border-slate-600"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Timezone</label>
              <select
                value={formData.timezone}
                onChange={(e) => setFormData(prev => ({ ...prev, timezone: e.target.value }))}
                className="w-full bg-slate-700 text-white rounded px-3 py-2 text-sm border border-slate-600"
              >
                <option value="America/New_York">Eastern (ET)</option>
                <option value="America/Chicago">Central (CT)</option>
                <option value="America/Denver">Mountain (MT)</option>
                <option value="America/Los_Angeles">Pacific (PT)</option>
              </select>
            </div>
          </div>
          
          <label className="flex items-center gap-2 mt-4 cursor-pointer">
            <input
              type="checkbox"
              checked={formData.auto_generate}
              onChange={(e) => setFormData(prev => ({ ...prev, auto_generate: e.target.checked }))}
              className="w-4 h-4 rounded border-slate-600 text-orange-500 focus:ring-orange-500"
            />
            <span className="text-sm text-slate-300">Enable automatic generation (requires cron setup)</span>
          </label>
        </div>

        {/* Content Section */}
        <div>
          <h4 className="text-sm font-medium text-slate-300 mb-3">Content</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Stories per Section</label>
              <select
                value={formData.stories_per_section}
                onChange={(e) => setFormData(prev => ({ ...prev, stories_per_section: parseInt(e.target.value) }))}
                className="w-full bg-slate-700 text-white rounded px-3 py-2 text-sm border border-slate-600"
              >
                {[3, 4, 5, 6, 7].map(n => (
                  <option key={n} value={n}>{n} stories</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Anchor Voice</label>
              <select
                value={formData.anchor_voice_name}
                onChange={(e) => setFormData(prev => ({ ...prev, anchor_voice_name: e.target.value }))}
                className="w-full bg-slate-700 text-white rounded px-3 py-2 text-sm border border-slate-600"
              >
                {availableVoices.map(voice => (
                  <option key={voice} value={voice}>{voice}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* API Keys Section */}
        <div>
          <h4 className="text-sm font-medium text-slate-300 mb-3">API Keys</h4>
          <p className="text-xs text-slate-500 mb-3">
            Leave blank to keep existing keys. Keys are stored encrypted.
          </p>
          <div className="space-y-3">
            <div>
              <label className="block text-xs text-slate-400 mb-1">
                ElevenLabs API Key 
                {settings?.elevenlabs_api_key && <span className="text-green-400 ml-2">✓ Configured</span>}
              </label>
              <input
                type="password"
                value={formData.elevenlabs_api_key}
                onChange={(e) => setFormData(prev => ({ ...prev, elevenlabs_api_key: e.target.value }))}
                placeholder="Enter new key to update..."
                className="w-full bg-slate-700 text-white rounded px-3 py-2 text-sm border border-slate-600"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">
                Anthropic API Key (Claude)
                {settings?.anthropic_api_key && <span className="text-green-400 ml-2">✓ Configured</span>}
              </label>
              <input
                type="password"
                value={formData.anthropic_api_key}
                onChange={(e) => setFormData(prev => ({ ...prev, anthropic_api_key: e.target.value }))}
                placeholder="Enter new key to update..."
                className="w-full bg-slate-700 text-white rounded px-3 py-2 text-sm border border-slate-600"
              />
            </div>
          </div>
        </div>

        {/* Message */}
        {message && (
          <div className={`p-3 rounded-lg text-sm ${
            message.type === 'success' 
              ? 'bg-green-900/30 text-green-400 border border-green-500/30' 
              : 'bg-red-900/30 text-red-400 border border-red-500/30'
          }`}>
            {message.text}
          </div>
        )}

        {/* Save Button */}
        <button
          onClick={handleSave}
          disabled={saving}
          className={`w-full py-3 rounded-lg font-medium transition-all ${
            saving 
              ? 'bg-slate-700 text-slate-400 cursor-not-allowed' 
              : 'bg-orange-500 hover:bg-orange-400 text-white'
          }`}
        >
          {saving ? 'Saving...' : 'Save Settings'}
        </button>
      </div>
    </div>
  );
}
