'use client';
import { useState, useRef } from 'react';

const STATE_ABBREVIATIONS: Record<string, string> = {
  'Alabama': 'AL', 'Alaska': 'AK', 'Arizona': 'AZ', 'Arkansas': 'AR', 'California': 'CA',
  'Colorado': 'CO', 'Connecticut': 'CT', 'Delaware': 'DE', 'Florida': 'FL', 'Georgia': 'GA',
  'Hawaii': 'HI', 'Idaho': 'ID', 'Illinois': 'IL', 'Indiana': 'IN', 'Iowa': 'IA',
  'Kansas': 'KS', 'Kentucky': 'KY', 'Louisiana': 'LA', 'Maine': 'ME', 'Maryland': 'MD',
  'Massachusetts': 'MA', 'Michigan': 'MI', 'Minnesota': 'MN', 'Mississippi': 'MS', 'Missouri': 'MO',
  'Montana': 'MT', 'Nebraska': 'NE', 'Nevada': 'NV', 'New Hampshire': 'NH', 'New Jersey': 'NJ',
  'New Mexico': 'NM', 'New York': 'NY', 'North Carolina': 'NC', 'North Dakota': 'ND', 'Ohio': 'OH',
  'Oklahoma': 'OK', 'Oregon': 'OR', 'Pennsylvania': 'PA', 'Rhode Island': 'RI', 'South Carolina': 'SC',
  'South Dakota': 'SD', 'Tennessee': 'TN', 'Texas': 'TX', 'Utah': 'UT', 'Vermont': 'VT',
  'Virginia': 'VA', 'Washington': 'WA', 'West Virginia': 'WV', 'Wisconsin': 'WI', 'Wyoming': 'WY'
};

const CATEGORIES = [
  { id: 'state', label: 'State', icon: '🏛️', color: '#dc2626' },
  { id: 'national', label: 'National', icon: '🇺🇸', color: '#f97316' },
  { id: 'world', label: 'World', icon: '🌍', color: '#eab308' },
  { id: 'business', label: 'Business', icon: '💼', color: '#16a34a' },
  { id: 'sports', label: 'Sports', icon: '⚽', color: '#2563eb' },
  { id: 'science', label: 'Sci/Tech', icon: '🔬', color: '#9333ea' }
];

interface NewsEpisode { audio_url?: string; audioUrl?: string; }
interface Props { newsEpisodes?: Record<string, NewsEpisode>; credits?: number; userState?: string; userName?: string; userId?: string; }

export function Home_NewsBriefings({ newsEpisodes = {}, credits = 0, userState = '', userName = 'there', userId = '' }: Props) {
  const [playing, setPlaying] = useState<string | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  function getStateLabel(): string {
    if (!userState) return 'State';
    const abbrev = STATE_ABBREVIATIONS[userState] || userState.substring(0, 2).toUpperCase();
    return `${abbrev} News`;
  }

  function stopAudio() {
    if (audioRef.current) { audioRef.current.pause(); audioRef.current.currentTime = 0; }
    setPlaying(null);
  }

  // Play a sequence of audio URLs: intro → news body → outro
  function playSequence(urls: string[], category: string) {
    stopAudio();
    let index = 0;
    setPlaying(category);

    function playNext() {
      if (index >= urls.length) {
        setPlaying(null);
        return;
      }
      const audio = new Audio(urls[index]);
      audioRef.current = audio;
      audio.onended = () => { index++; playNext(); };
      audio.onerror = () => { index++; playNext(); }; // Skip failed, try next
      audio.play();
    }
    playNext();
  }

  function playAudio(url: string, category: string) {
    stopAudio();
    const audio = new Audio(url);
    audioRef.current = audio;
    audio.onended = () => setPlaying(null);
    audio.onerror = () => setPlaying(null);
    audio.play();
    setPlaying(category);
  }

  async function playWithPersonalizedIntro(category: string, newsBodyUrl: string) {
    try {
      const response = await fetch('/api/news/personalized-intro', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          category,
          userName,
          stateName: category === 'state' ? userState : null,
        }),
      });
      const data = await response.json();

      const urls: string[] = [];
      if (data.introUrl) urls.push(data.introUrl);
      urls.push(newsBodyUrl);
      if (data.outroUrl) urls.push(data.outroUrl);

      playSequence(urls, category);
    } catch (error) {
      // If personalized fetch fails, just play the news body
      console.error('[Home] Failed to fetch personalized intro:', error);
      playAudio(newsBodyUrl, category);
    }
  }

  async function handleCategoryClick(category: string) {
    if (playing === category) { stopAudio(); return; }
    stopAudio();

    if (credits < 1) {
      // No credits message
      try {
        setLoading(category);
        const response = await fetch('/api/news/no-credits-message', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ category, userName }),
        });
        const data = await response.json();
        if (data.audioUrl) {
          playAudio(data.audioUrl, category);
        } else {
          alert('You need credits to listen. Please subscribe or purchase credits.');
        }
      } catch {
        alert('You need credits to listen. Please subscribe or purchase credits.');
      } finally {
        setLoading(null);
      }
      return;
    }

    // State news
    if (category === 'state') {
      if (!userState) { alert('Please set your state in your profile to receive state news.'); return; }
      setLoading(category);
      try {
        const response = await fetch(`/api/news/briefing?category=state&state=${encodeURIComponent(userState)}`);
        const data = await response.json();
        if (response.ok && data.episode?.audioUrl) {
          await playWithPersonalizedIntro(category, data.episode.audioUrl);
        } else {
          alert(data.error || 'State news not available yet.');
        }
      } catch {
        alert('Failed to load state news.');
      } finally {
        setLoading(null);
      }
      return;
    }

    // Regular categories - check pre-loaded episodes first
    const episode = newsEpisodes[category];
    const episodeUrl = episode?.audio_url || episode?.audioUrl;

    if (episodeUrl) {
      setLoading(category);
      await playWithPersonalizedIntro(category, episodeUrl);
      setLoading(null);
      return;
    }

    // Fetch from API
    setLoading(category);
    try {
      const response = await fetch(`/api/news/briefing?category=${category}`);
      const data = await response.json();
      if (response.ok && data.episode?.audioUrl) {
        await playWithPersonalizedIntro(category, data.episode.audioUrl);
      } else {
        alert(data.error || 'Briefing not available yet.');
      }
    } catch {
      alert('Failed to load briefing.');
    } finally {
      setLoading(null);
    }
  }

  return (
    <div style={{ width: '100%', padding: '0 0.75rem' }}>
      <h2 style={{ fontSize: '18px', fontWeight: 'bold', color: 'white', marginBottom: '12px', textTransform: 'uppercase' }}>📻 {(() => { const h = new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" })).getHours(); return h >= 5 && h < 12 ? "YOUR MORNING NEWS" : h >= 12 && h < 17 ? "YOUR AFTERNOON NEWS" : "YOUR EVENING NEWS"; })()}</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
        {CATEGORIES.map((cat) => {
          const isPlaying = playing === cat.id;
          const isLoading = loading === cat.id;
          const buttonLabel = cat.id === 'state' ? getStateLabel() : cat.label;
          return (
            <button key={cat.id} onClick={() => handleCategoryClick(cat.id)} disabled={isLoading} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '12px 8px', backgroundColor: isPlaying ? cat.color : '#1e293b', border: `2px solid ${cat.color}`, borderRadius: '10px', cursor: isLoading ? 'wait' : 'pointer', transition: 'all 0.2s ease', opacity: isLoading ? 0.7 : 1 }}>
              <span style={{ fontSize: '24px', marginBottom: '4px' }}>{isLoading ? '⏳' : isPlaying ? '⏹️' : cat.icon}</span>
              <span style={{ fontSize: '12px', fontWeight: '600', color: isPlaying ? (cat.id === 'world' ? 'black' : 'white') : 'white' }}>{buttonLabel}</span>
            </button>
          );
        })}
      </div>
      {playing && (
        <div style={{ marginTop: '12px', padding: '8px 12px', backgroundColor: '#1e293b', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
          <span style={{ display: 'inline-block', width: '8px', height: '8px', backgroundColor: '#22c55e', borderRadius: '50%', animation: 'pulse 1s infinite' }} />
          <span style={{ fontSize: '14px', color: 'white' }}>Now Playing: {CATEGORIES.find(c => c.id === playing)?.label}</span>
          <button onClick={stopAudio} style={{ marginLeft: '8px', padding: '4px 8px', backgroundColor: '#dc2626', color: 'white', border: 'none', borderRadius: '4px', fontSize: '12px', cursor: 'pointer' }}>Stop</button>
        </div>
      )}
      {userName && userName !== 'there' && userName !== 'friend' && (
        <div style={{ marginTop: '8px', fontSize: '12px', color: 'white', opacity: 0.7, textAlign: 'center' }}>Hi {userName}! {userState ? `| ${userState} News` : ''}</div>
      )}
      <style>{`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }`}</style>
    </div>
  );
}

export default Home_NewsBriefings;
