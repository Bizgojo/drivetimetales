'use client';
import StickyHeaderFull from '@/components/StickyHeaderFull';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';

export default function AccountPage() {
  const { user, signOut, loading } = useAuth();
  const isAdmin = user?.email?.toLowerCase().trim() === 'm.postlewaite@gmail.com';
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [travelInsightsEnabled, setTravelInsightsEnabled] = useState(false);
  const [travelInsightsMode, setTravelInsightsMode] = useState<'no' | 'yes' | 'while_using'>('no');
  const [travelInsightsTouched, setTravelInsightsTouched] = useState(false);
  const [travelInsightsMessage, setTravelInsightsMessage] = useState('');
  const [travelInsightsDetailsOpen, setTravelInsightsDetailsOpen] = useState(false);

  const travelInsightsKey = user?.id ? `dtt_travel_listening_insights_${user.id}` : 'dtt_travel_listening_insights';
  const travelInsightsModeKey = user?.id ? `dtt_travel_insights_mode_${user.id}` : 'dtt_travel_insights_mode';

  // Wait for client-side mount
  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted || !user?.id) return;
    let cancelled = false;
    try {
      const savedMode = localStorage.getItem(travelInsightsModeKey);
      const legacyEnabled = localStorage.getItem(travelInsightsKey) === 'true';
      const nextMode = savedMode === 'yes' || savedMode === 'while_using'
        ? savedMode
        : legacyEnabled
          ? 'yes'
          : 'no';
      setTravelInsightsMode(nextMode);
      setTravelInsightsEnabled(nextMode !== 'no');
      setTravelInsightsTouched(savedMode === 'yes' || savedMode === 'while_using' || savedMode === 'no');
    } catch {}

    fetch('/api/user/travel-insights')
      .then((response) => response.ok ? response.json() : null)
      .then((data) => {
        if (cancelled || !data?.mode) return;
        const serverMode = data.mode === 'always' ? 'yes' : data.mode === 'while_using' ? 'while_using' : 'no';
        setTravelInsightsMode(serverMode);
        setTravelInsightsEnabled(serverMode !== 'no');
        setTravelInsightsTouched(true);
        try {
          localStorage.setItem(travelInsightsModeKey, serverMode);
          if (serverMode === 'no') localStorage.removeItem(travelInsightsKey);
          else localStorage.setItem(travelInsightsKey, 'true');
        } catch {}
      })
      .catch(() => {})
    return () => { cancelled = true; }
  }, [mounted, travelInsightsKey, travelInsightsModeKey, user?.id]);

  // Handle sign out
  const handleSignOut = async () => {
    await signOut();
    router.push('/');
  };

  const enableTravelInsights = async (mode: 'yes' | 'while_using') => {
    setTravelInsightsMessage('');

    try {
      const permissionsApi = typeof navigator !== 'undefined' ? (navigator as any).permissions : null;
      if (permissionsApi?.query) {
        const status = await permissionsApi.query({ name: 'geolocation' as PermissionName });
        if (status.state === 'denied') {
          setTravelInsightsMessage('Location permission is blocked in this browser. Playback will still work normally.');
          return;
        }
      }
    } catch {}

    try {
      localStorage.setItem(travelInsightsKey, 'true');
      localStorage.setItem(travelInsightsModeKey, mode);
      setTravelInsightsEnabled(true);
      setTravelInsightsMode(mode);
      setTravelInsightsTouched(true);
      const response = await fetch('/api/user/travel-insights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: mode === 'yes' ? 'always' : 'while_using' }),
      });
      setTravelInsightsMessage(response.ok
        ? 'Enabled. We only use coarse context, never exact routes or stored GPS history.'
        : 'Saved on this device. Admin sync is unavailable right now.');
    } catch {
      setTravelInsightsMessage('Could not save this preference on this device. Playback will still work normally.');
    }
  };

  const disableTravelInsights = async () => {
    try {
      localStorage.removeItem(travelInsightsKey);
      localStorage.setItem(travelInsightsModeKey, 'no');
    } catch {}
    setTravelInsightsEnabled(false);
    setTravelInsightsMode('no');
    setTravelInsightsTouched(true);
    try {
      const response = await fetch('/api/user/travel-insights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'never' }),
      });
      setTravelInsightsMessage(response.ok
        ? 'Disabled. Travel listening context will not be collected.'
        : 'Disabled on this device. Admin sync is unavailable right now.');
    } catch {
      setTravelInsightsMessage('Disabled on this device. Admin sync is unavailable right now.');
    }
  };

  const travelChoiceClass = (active: boolean) =>
    `px-3 py-1.5 rounded-full text-xs font-bold border transition ${
      active
        ? 'bg-orange-500 text-white border-orange-400'
        : 'bg-gray-950 text-gray-300 border-gray-700'
    }`;

  // Show loading state while auth is initializing or not yet mounted
  if (!mounted || loading) {
    return (
      <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mb-4" />
          <p>Loading...</p>
        </div>
      </div>
    );
  }

  // Only redirect if definitely not logged in (after loading completes and mounted)
  if (!user) {
    router.push('/signin');
    return (
      <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center">
        <div className="text-center">
          <p>Redirecting to login...</p>
        </div>
      </div>
    );
  }

  // Get display name - prefer first_name + last_name, then display_name, then email prefix
  let displayName = '';
  const userAny = user as any;
  
  if (user.first_name) {
    displayName = user.first_name;
    if (userAny.last_name) {
      displayName += ' ' + userAny.last_name;
    }
  } else if (user.display_name) {
    displayName = user.display_name;
  } else {
    displayName = user.email.split('@')[0];
  }
  
  const initials = displayName.substring(0, 1).toUpperCase();

  // Format member since date
  const memberSince = new Date(user.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  const menuItems = [
    { href: '/account/billing', icon: '💎', label: 'Billing & Subscription', desc: 'Manage your plan' },
    { href: '/account/help', icon: '💬', label: 'Help & Support', desc: 'Contact us' },
    { href: '/account/faqs', icon: '❓', label: 'FAQs', desc: 'Common questions' },
  ];

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <StickyHeaderFull />
      
      <div className="px-4 py-5">
        {/* Profile Header - No large avatar circle */}
        <div className="mb-6 text-center">
          <h1 className="text-xl font-bold text-white">{displayName}</h1>
          <p className="text-gray-400 text-sm">{user.email}</p>
          <p className="text-orange-400 text-sm mt-1">Member since {memberSince}</p>
        </div>

        {/* Menu Items */}
        <div className="space-y-2 mb-6">
          <section className="p-4 bg-gray-900 border border-gray-800 rounded-xl">
            <div className="flex items-center gap-4">
              <span className="text-2xl">🚗</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-white font-medium">Enable Travel Insights</p>
                  <button type="button" onClick={() => setTravelInsightsDetailsOpen((open) => !open)} className="text-xs font-bold text-orange-300">Learn more</button>
                </div>
                <p className="text-gray-400 text-sm">Better Story Recommendations</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 mt-3">
              <button type="button" onClick={() => enableTravelInsights('yes')} className={travelChoiceClass(travelInsightsTouched && travelInsightsMode === 'yes')}>Always</button>
              <button type="button" onClick={disableTravelInsights} className={travelChoiceClass(travelInsightsTouched && travelInsightsMode === 'no')}>Never</button>
              <button type="button" onClick={() => enableTravelInsights('while_using')} className={travelChoiceClass(travelInsightsTouched && travelInsightsMode === 'while_using')}>Only While Using This App</button>
            </div>
            {travelInsightsDetailsOpen && (
              <p className="text-gray-400 text-xs leading-relaxed mt-3">
                Travel Insights helps Endless Tales recommend better stories for commuting, road trips, and professional drivers. If enabled, Endless Tales may detect whether your device appears to be moving while you listen. We do not track or store your location or route.
              </p>
            )}
            {travelInsightsMessage && (
              <p className="text-orange-300 text-xs mt-2">{travelInsightsMessage}</p>
            )}
          </section>

          {menuItems.map(item => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-4 p-4 bg-gray-900 border border-gray-800 rounded-xl"
            >
              <span className="text-2xl">{item.icon}</span>
              <div className="flex-1">
                <p className="text-white font-medium">{item.label}</p>
                <p className="text-gray-400 text-sm">{item.desc}</p>
              </div>
              <span className="text-gray-500">›</span>
            </Link>
          ))}

        </div>

        {/* Sign Out + Admin */}
        <div className="border-t border-gray-800 pt-6 flex flex-col gap-2">
          <button onClick={handleSignOut} className="w-full py-3 text-red-400 text-sm">Sign Out</button>
          {isAdmin && (
            <a href="/admin" className="w-full py-3 text-center text-sm font-bold" style={{ color: '#f97316', border: '1px solid rgba(249,115,22,0.3)', borderRadius: '10px' }}>Admin Panel</a>
          )}
        </div>
      </div>
    </div>
  );
}
