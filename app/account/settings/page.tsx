'use client';

import React, { useState } from 'react';
import { Header } from '@/components/ui/Header';
import { useAuth } from '@/contexts/AuthContext';

export default function SettingsPage() {
  const { user, signOut } = useAuth();
  
  const [settings, setSettings] = useState({
    defaultSpeed: '1',
    autoPlay: true,
    skipSilence: false,
    sleepTimer: '0',
    downloadOnWifi: true,
    downloadQuality: 'high',
    autoDownload: false,
    newReleases: true,
    seriesUpdates: true,
    promotions: false,
  });

  const updateSetting = (key: string, value: any) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  const Toggle = ({ value, onChange }: { value: boolean; onChange: () => void }) => (
    <button onClick={onChange} className={`w-12 h-7 rounded-full relative transition-colors ${value ? 'bg-orange-500' : 'bg-gray-700'}`}>
      <div className={`w-5 h-5 bg-white rounded-full absolute top-1 transition-all ${value ? 'right-1' : 'left-1'}`} />
    </button>
  );

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <Header isLoggedIn={!!user} showBack userCredits={user?.credits} />
      
      <div className="px-4 py-5">
        <h1 className="text-2xl font-bold text-white mb-6">⚙️ Settings</h1>

        <section className="mb-6">
          <h2 className="text-lg font-bold text-white mb-3">🎧 Playback</h2>
          <div className="bg-gray-900 border border-gray-800 rounded-xl divide-y divide-gray-800">
            <div className="p-4 flex items-center justify-between">
              <div><p className="text-white font-medium">Default Speed</p><p className="text-white text-sm">For new stories</p></div>
              <select value={settings.defaultSpeed} onChange={(e) => updateSetting('defaultSpeed', e.target.value)} className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white">
                <option value="0.5">0.5x</option><option value="0.75">0.75x</option><option value="1">1x</option><option value="1.25">1.25x</option><option value="1.5">1.5x</option><option value="2">2x</option>
              </select>
            </div>
            <div className="p-4 flex items-center justify-between">
              <div><p className="text-white font-medium">Auto-Play Next</p><p className="text-white text-sm">Play next in series</p></div>
              <Toggle value={settings.autoPlay} onChange={() => updateSetting('autoPlay', !settings.autoPlay)} />
            </div>
            <div className="p-4 flex items-center justify-between">
              <div><p className="text-white font-medium">Skip Silence</p><p className="text-white text-sm">Skip quiet parts</p></div>
              <Toggle value={settings.skipSilence} onChange={() => updateSetting('skipSilence', !settings.skipSilence)} />
            </div>
            <div className="p-4 flex items-center justify-between">
              <div><p className="text-white font-medium">Sleep Timer Default</p><p className="text-white text-sm">Auto-stop after</p></div>
              <select value={settings.sleepTimer} onChange={(e) => updateSetting('sleepTimer', e.target.value)} className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white">
                <option value="0">Off</option><option value="15">15 min</option><option value="30">30 min</option><option value="45">45 min</option><option value="60">1 hour</option>
              </select>
            </div>
          </div>
        </section>

        <section className="mb-6">
          <h2 className="text-lg font-bold text-white mb-3">📥 Downloads</h2>
          <div className="bg-gray-900 border border-gray-800 rounded-xl divide-y divide-gray-800">
            <div className="p-4 flex items-center justify-between">
              <div><p className="text-white font-medium">WiFi Only</p><p className="text-white text-sm">Save mobile data</p></div>
              <Toggle value={settings.downloadOnWifi} onChange={() => updateSetting('downloadOnWifi', !settings.downloadOnWifi)} />
            </div>
            <div className="p-4 flex items-center justify-between">
              <div><p className="text-white font-medium">Quality</p><p className="text-white text-sm">Audio file quality</p></div>
              <select value={settings.downloadQuality} onChange={(e) => updateSetting('downloadQuality', e.target.value)} className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white">
                <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option>
              </select>
            </div>
            <div className="p-4 flex items-center justify-between">
              <div><p className="text-white font-medium">Auto-Download</p><p className="text-white text-sm">Download purchases</p></div>
              <Toggle value={settings.autoDownload} onChange={() => updateSetting('autoDownload', !settings.autoDownload)} />
            </div>
          </div>
        </section>

        <section className="mb-6">
          <h2 className="text-lg font-bold text-white mb-3">🔔 Notifications</h2>
          <div className="bg-gray-900 border border-gray-800 rounded-xl divide-y divide-gray-800">
            <div className="p-4 flex items-center justify-between">
              <div><p className="text-white font-medium">New Releases</p><p className="text-white text-sm">New stories added</p></div>
              <Toggle value={settings.newReleases} onChange={() => updateSetting('newReleases', !settings.newReleases)} />
            </div>
            <div className="p-4 flex items-center justify-between">
              <div><p className="text-white font-medium">Series Updates</p><p className="text-white text-sm">New episodes</p></div>
              <Toggle value={settings.seriesUpdates} onChange={() => updateSetting('seriesUpdates', !settings.seriesUpdates)} />
            </div>
            <div className="p-4 flex items-center justify-between">
              <div><p className="text-white font-medium">Promotions</p><p className="text-white text-sm">Deals & offers</p></div>
              <Toggle value={settings.promotions} onChange={() => updateSetting('promotions', !settings.promotions)} />
            </div>
          </div>
        </section>

        <section className="mb-6">
          <h2 className="text-lg font-bold text-white mb-3">Account</h2>
          <div className="space-y-3">
            <button onClick={() => signOut()} className="w-full py-3 bg-gray-900 border border-gray-800 text-white rounded-xl">Sign Out</button>
            <button className="w-full py-3 bg-gray-900 border border-red-500/30 text-red-400 rounded-xl">Delete Account</button>
          </div>
        </section>

        <div className="text-center text-white text-sm">
          <p>DriveTimeTales v1.0.0</p>
          <p className="mt-1">Made with ❤️ for drivers</p>
        </div>
      </div>
    </div>
  );
}
