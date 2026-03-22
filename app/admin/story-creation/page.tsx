'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Play, Pause, RotateCcw, Edit2, Save, X, Trash2, Plus, Volume2, Image as ImageIcon, Music, Zap } from 'lucide-react';

// ============================================================================
// TYPES
// ============================================================================

type Stage = 'create' | 'to-test' | 'review' | 'publish';

interface StoryPrompt {
  concept: string;
  tone: string;
  wordCount: number;
  primaryGenre: string;
  secondaryGenre1?: string;
  secondaryGenre2?: string;
  series: string;
  episode: string;
  authorName: string;
  authorStyle: string;
  targetDestination: string;
  useOpus?: boolean;
}

interface StorySegment {
  speaker: string;
  text_preview: string;
  audioUrl: string;
  index: number;
}

interface CharacterGuideEntry {
  name: string;
  description: string;
  voiceId: string;
  voiceName: string;
}

interface Story {
  id: string;
  title: string;
  primaryGenre: string;
  secondaryGenre1?: string;
  secondaryGenre2?: string;
  wordCount: number;
  series: string;
  episode: string;
  concept: string;
  tone: string;
  authorName: string;
  authorStyle: string;
  targetDestination: string;
  status: 'pending' | 'in_review' | 'ready' | 'published';
  createdAt: string;
  generatedScript?: string;
  introText?: string;
  outroText?: string;
  introAudioUrl?: string;
  storyAudioUrl?: string;
  storyAudioUrls?: string[];
  storySegments?: StorySegment[];
  characterGuide?: CharacterGuideEntry[];
  outroAudioUrl?: string;
  backgroundMusicUrl?: string;
  coverImageUrl?: string;
  sfxMetadata?: Array<{ id: string; time: string; description: string }>;
  sunoStatus?: string;
  audioUrl?: string;
}

const AUTHOR_STYLE_PROFILES = {
  'Stephen King': {
    name: 'Stephen King',
    description: 'The Master of Psychological Horror',
    birth_year: 1947,
    death_year: null,
    living: true,
    techniques: 'Ordinary made terrible, deep character interiority, conversational voice, slow burn to explosion, flawed relatable protagonists',
    audioAdaptation: 'Build dread through ambient sounds, pace dialogue to create mounting unease, include dark humor'
  },
  'Richard Matheson': {
    name: 'Richard Matheson',
    description: 'The Architect of Paranoid Science Fiction',
    birth_year: 1926,
    death_year: 2013,
    living: false,
    techniques: 'Scientific rationalization, isolation as horror, relentless pace, paranoid atmosphere, twist of perspective',
    audioAdaptation: 'Maintain relentless forward momentum, use silence and ambient menace, build to revelation'
  },
  'Ray Bradbury': {
    name: 'Ray Bradbury',
    description: 'The Poet of Science Fiction',
    birth_year: 1920,
    death_year: 2012,
    living: false,
    techniques: 'Lyrical prose poetry, nostalgic melancholy, humanist science fiction, sensory immersion, warning through wonder',
    audioAdaptation: 'Narrator voice more prominent, rich ambient soundscapes, slower pacing, musical underscore'
  },
  'Roald Dahl': {
    name: 'Roald Dahl',
    description: 'The Master of Dark Comedy',
    birth_year: 1916,
    death_year: 1990,
    living: false,
    techniques: 'Delicious twists, dark humor, precise economical prose, urbane narrator voice, moral inversion',
    audioAdaptation: 'Measured pace building to sudden revelation, end on twist without explaining'
  },
  'O. Henry': {
    name: 'O. Henry',
    description: 'The Craftsman of Surprise Endings',
    birth_year: 1862,
    death_year: 1910,
    living: false,
    techniques: 'O. Henry Ending with surprise conclusions that illuminate deeper truth, warmth for common people, humor with heart, ironic commentary on society and human nature',
    audioAdaptation: 'Warm narrator with touch of irony, authentic working-class voices, emotional twist at conclusion'
  },
  'Agatha Christie': {
    name: 'Agatha Christie',
    description: 'The Queen of Mystery',
    birth_year: 1890,
    death_year: 1976,
    living: false,
    techniques: 'Fair-play cluing with all clues presented to listener, misdirection mastery, closed circle setting with limited suspects, foreboding atmosphere, detective as lens observing what others miss',
    audioAdaptation: 'Plant clues in conversation, distinct character voices for each suspect, theatrical final reveal'
  },
  'Arthur Conan Doyle': {
    name: 'Arthur Conan Doyle',
    description: 'The Father of Deductive Detection',
    birth_year: 1859,
    death_year: 1930,
    living: false,
    techniques: 'Deductive revelation through logical chains, Watson viewpoint allowing genius to dazzle, detailed Victorian description, problem-solution structure, eccentric brilliant detective',
    audioAdaptation: 'First-person Watson narration, Holmes delivers deductions theatrically, rich period atmosphere through sound'
  },
  'Elmore Leonard': {
    name: 'Elmore Leonard',
    description: 'The Master of Criminal Dialogue',
    birth_year: 1925,
    death_year: 2013,
    living: false,
    techniques: 'Invisible prose ("If it sounds like writing, rewrite it"), dialogue supremacy, criminal authenticity, minimalist dialogue tags, third-person shifting POV, cool matter-of-fact violence',
    audioAdaptation: 'Each character needs distinctive voice, minimal narration, fast pacing, criminal slang and authenticity'
  },
  'Shirley Jackson': {
    name: 'Shirley Jackson',
    description: 'The Poet of Domestic Horror',
    birth_year: 1916,
    death_year: 1965,
    living: false,
    techniques: 'Surface normality hiding horror, psychological ambiguity, social menace of conformity, controlled simple prose concealing dread, female consciousness and domestic entrapment, suggestion over showing',
    audioAdaptation: 'Build dread through tone shifts, ordinary sounds become menacing, end with ambiguity and unease'
  },
  'Edgar Allan Poe': {
    name: 'Edgar Allan Poe',
    description: 'The Master of Gothic Atmosphere',
    birth_year: 1809,
    death_year: 1849,
    living: false,
    techniques: 'Unreliable narrators, psychological descent, atmosphere of dread, rhythmic repetition, melancholy beauty, death and loss as central obsessions',
    audioAdaptation: 'Atmospheric soundscapes, narrator revealing instability gradually, music underlining emotional decay'
  },
  'Raymond Chandler': {
    name: 'Raymond Chandler',
    description: 'The Master of Hardboiled Noir',
    birth_year: 1888,
    death_year: 1959,
    living: false,
    techniques: 'Sharp descriptive metaphors, world-weary detective POV, corrupt urban landscape, morality in amoral world, witty cynical dialogue',
    audioAdaptation: 'Deep-voiced narrator with dry wit, gritty urban ambience, pacing that mirrors investigation'
  },
  'Rod Serling': {
    name: 'Rod Serling',
    description: 'The Master of the Moral Twist',
    birth_year: 1924,
    death_year: 1975,
    living: false,
    techniques: 'Socially conscious narrative, twist that subverts expectations, ordinary people in extraordinary circumstances, commentary on human nature and society',
    audioAdaptation: 'Narrator frames story with moral weight, unexpected reveals require surprise, end with lingering question'
  },
  'Neil Gaiman': {
    name: 'Neil Gaiman',
    description: 'The Master of Modern Mythology',
    birth_year: 1960,
    death_year: null,
    living: true,
    techniques: 'Mythological depth in mundane settings, wonder beneath ordinary surface, diverse cultural references, dark fairy tale logic, found family themes',
    audioAdaptation: 'Blend whimsy with darkness, treat magical elements as matter-of-fact, character voices carry emotional weight'
  },
  'Isaac Asimov': {
    name: 'Isaac Asimov',
    description: 'The Master of Science Fiction Ideas',
    birth_year: 1920,
    death_year: 1992,
    living: false,
    techniques: 'Explore single scientific concept deeply, rational problem-solving, accessible explanations, often optimistic future, focus on ideas over characters',
    audioAdaptation: 'Clear exposition of concepts, pacing allows listener to follow logic, technology treated as character element'
  },
  'H.P. Lovecraft': {
    name: 'H.P. Lovecraft',
    description: 'The Master of Cosmic Horror',
    birth_year: 1890,
    death_year: 1937,
    living: false,
    techniques: 'Cosmic insignificance of humanity, forbidden knowledge leading to madness, atmospheric dread, unreliable scholar narratives, eldritch atmosphere',
    audioAdaptation: 'Build incomprehensible menace, narrator reveals descent into cosmic awareness, sound design creates alienness'
  },
  'Margaret Atwood': {
    name: 'Margaret Atwood',
    description: 'The Master of Speculative Realism',
    birth_year: 1939,
    death_year: null,
    living: true,
    techniques: 'Feminist speculation, dystopian detail, psychological interiority, language as power, women navigating controlled systems',
    audioAdaptation: 'Female voice with interior complexity, sparse language, systemic oppression through dialogue and tone'
  },
  'Dan Brown': {
    name: 'Dan Brown',
    description: 'The Master of the Conspiracy Thriller',
    birth_year: 1964,
    death_year: null,
    living: true,
    techniques: 'Short punchy chapters ending on cliffhangers, high-concept historical conspiracy, protagonist in over their head, expert knowledge weaponized as plot, multiple antagonists with shifting loyalties, relentless pace with revelation every few pages',
    audioAdaptation: 'Fast chapter-by-chapter pacing, each scene ends on a hook, historical facts delivered as urgent discoveries, antagonist motivations revealed in layers'
  },
  'John Grisham': {
    name: 'John Grisham',
    description: 'The Master of the Legal Thriller',
    birth_year: 1955,
    death_year: null,
    living: true,
    techniques: 'Legal procedure as dramatic tension, ordinary protagonist thrust into dangerous system, institutional corruption, moral clarity in murky situations, accessible legal detail, Southern settings',
    audioAdaptation: 'Procedural pacing builds dread, courtroom scenes as performance, protagonist vulnerability drives listener investment'
  },
  'Gillian Flynn': {
    name: 'Gillian Flynn',
    description: 'The Master of Psychological Domestic Suspense',
    birth_year: 1971,
    death_year: null,
    living: true,
    techniques: 'Unreliable narrators, domestic settings turned dangerous, female protagonists with dark interiors, dual timelines, shocking reversals, unflinching psychological brutality',
    audioAdaptation: 'Dual narrator voices essential, keep listener off-balance, reveal character flaws gradually then all at once'
  },
  'Cormac McCarthy': {
    name: 'Cormac McCarthy',
    description: 'The Master of Violent American Prose',
    birth_year: 1933,
    death_year: 2023,
    living: false,
    techniques: 'Sparse punctuation creating relentless flow, biblical cadence, landscape as character, violence rendered with cold precision, moral weight without moralizing, sparse dialogue carrying enormous weight',
    audioAdaptation: 'Narrator voice like scripture, long silences, landscape SFX as emotional underscore, dialogue without attribution forces listener to track speakers'
  },
  'Toni Morrison': {
    name: 'Toni Morrison',
    description: 'The Master of American Memory and Myth',
    birth_year: 1931,
    death_year: 2019,
    living: false,
    techniques: 'Non-linear narrative, community as character, trauma surfacing through memory, poetic language, African American experience as universal myth, spiritual realism',
    audioAdaptation: 'Rich narrator voice with community warmth, non-linear structure requires strong audio anchoring, emotional weight carried in silence'
  },
};

// ============================================================================
// STAGE 1: CREATE STORY FORM
// ============================================================================

const CreateStoryStage: React.FC<{
  onSubmit: (prompt: StoryPrompt) => void;
  isLoading?: boolean;
  sunoCookie: string;
  setSunoCookie: (v: string) => void;
  showSunoSettings: boolean;
  setShowSunoSettings: (v: boolean) => void;
}> = ({ onSubmit, isLoading = false, sunoCookie, setSunoCookie, showSunoSettings, setShowSunoSettings }) => {
  const [genres, setGenres] = useState<string[]>([]);
  const [genresLoading, setGenresLoading] = useState(true);
  const authorStyleOptions = Object.keys(AUTHOR_STYLE_PROFILES);
  
  const [form, setForm] = useState<StoryPrompt>({
    concept: '',
    tone: '',
    wordCount: 1500,
    primaryGenre: '',
    secondaryGenre1: '',
    secondaryGenre2: '',
    series: '',
    episode: '',
    authorName: '',
    authorStyle: '',
    targetDestination: 'app',
    useOpus: false,
  });

  useEffect(() => {
    fetch('/api/asc3/genres')
      .then(res => res.json())
      .then(data => {
        if (data.data && Array.isArray(data.data)) {
          setGenres(data.data.map((g: any) => g.name));
        }
        setGenresLoading(false);
      })
      .catch(() => setGenresLoading(false));
  }, []);

  const isValid = form.primaryGenre && form.wordCount > 0 && form.concept && form.tone && form.authorName && form.authorStyle;
  
  const calculateDuration = (words: number) => {
    const minutes = Math.round(words / 150);
    return `${minutes} min`;
  };

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-black">✍️ Create Story</h2>
      <p className="text-sm text-gray-700">Fill out your story details. Claude will generate the title and complete script.</p>

      {/* Genres Selection */}
      <div>
        <label className="block text-sm font-semibold text-black mb-2">Primary Genre *</label>
        <select
          value={form.primaryGenre}
          onChange={(e) => setForm({ ...form, primaryGenre: e.target.value })}
          disabled={genresLoading || isLoading}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 text-black bg-white disabled:bg-gray-100"
        >
          <option value="">{genresLoading ? 'Loading genres...' : 'Select primary genre'}</option>
          {genres.map((g) => (
            <option key={g} value={g}>{g}</option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-semibold text-black mb-2">Secondary Genre 1 (optional)</label>
          <select
            value={form.secondaryGenre1 || ''}
            onChange={(e) => setForm({ ...form, secondaryGenre1: e.target.value || undefined })}
            disabled={genresLoading || isLoading}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 text-black bg-white disabled:bg-gray-100"
          >
            <option value="">Select secondary genre</option>
            {genres.map((g) => (
              <option key={g} value={g}>{g}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-semibold text-black mb-2">Secondary Genre 2 (optional)</label>
          <select
            value={form.secondaryGenre2 || ''}
            onChange={(e) => setForm({ ...form, secondaryGenre2: e.target.value || undefined })}
            disabled={genresLoading || isLoading}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 text-black bg-white disabled:bg-gray-100"
          >
            <option value="">Select secondary genre</option>
            {genres.map((g) => (
              <option key={g} value={g}>{g}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Word Count */}
      <div>
        <label className="block text-sm font-semibold text-black mb-2">Word Count * (Duration: {calculateDuration(form.wordCount)})</label>
        <input
          type="number"
          value={form.wordCount}
          onChange={(e) => setForm({ ...form, wordCount: parseInt(e.target.value) || 0 })}
          placeholder="e.g., 1500"
          disabled={isLoading}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 text-black bg-white disabled:bg-gray-100"
        />
        <p className="text-xs text-gray-600 mt-1">At 150 words per minute</p>
      </div>

      {/* Series & Episode */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-semibold text-black mb-2">Series (optional)</label>
          <input
            type="text"
            value={form.series}
            onChange={(e) => setForm({ ...form, series: e.target.value })}
            placeholder="e.g., Future Echoes"
            disabled={isLoading}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 text-black bg-white disabled:bg-gray-100"
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-black mb-2">Episode # (optional)</label>
          <input
            type="number"
            value={form.episode}
            onChange={(e) => setForm({ ...form, episode: e.target.value })}
            placeholder="1"
            disabled={isLoading}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 text-black bg-white disabled:bg-gray-100"
          />
        </div>
      </div>

      {/* Concept */}
      <div>
        <label className="block text-sm font-semibold text-black mb-2">Story Concept *</label>
        <textarea
          value={form.concept}
          onChange={(e) => setForm({ ...form, concept: e.target.value })}
          placeholder="2-3 sentences describing your story idea..."
          rows={4}
          disabled={isLoading}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 text-black bg-white resize-none disabled:bg-gray-100"
        />
      </div>

      {/* Tone */}
      <div>
        <label className="block text-sm font-semibold text-black mb-2">Tone *</label>
        <div className="grid grid-cols-3 gap-2">
          {['Warm', 'Dark', 'Suspenseful', 'Humorous', 'Dramatic', 'Uplifting'].map((t) => (
            <button
              key={t}
              onClick={() => setForm({ ...form, tone: t })}
              disabled={isLoading}
              className={`px-3 py-2 rounded text-sm font-medium transition ${
                form.tone === t
                  ? 'bg-orange-500 text-white'
                  : 'bg-gray-100 text-black hover:bg-gray-200 disabled:bg-gray-100'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Author Name & Style */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-semibold text-black mb-2">Author Name *</label>
          <input
            type="text"
            value={form.authorName}
            onChange={(e) => setForm({ ...form, authorName: e.target.value })}
            placeholder="e.g., Mark Holbrook"
            disabled={isLoading}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 text-black bg-white disabled:bg-gray-100"
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-black mb-2">Author Style to Follow *</label>
          <select
            value={form.authorStyle}
            onChange={(e) => setForm({ ...form, authorStyle: e.target.value })}
            disabled={isLoading}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 text-black bg-white disabled:bg-gray-100"
          >
            <option value="">Select style</option>
            {authorStyleOptions.map((style) => (
              <option key={style} value={style}>{style}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Author Style Profile Info */}
      {form.authorStyle && AUTHOR_STYLE_PROFILES[form.authorStyle as keyof typeof AUTHOR_STYLE_PROFILES] && (
        <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 space-y-2">
          <div className="flex items-start justify-between">
            <div>
              <h4 className="font-semibold text-black">
                {AUTHOR_STYLE_PROFILES[form.authorStyle as keyof typeof AUTHOR_STYLE_PROFILES].name}
              </h4>
              <p className="text-xs text-gray-600">
                {AUTHOR_STYLE_PROFILES[form.authorStyle as keyof typeof AUTHOR_STYLE_PROFILES].birth_year} 
                {AUTHOR_STYLE_PROFILES[form.authorStyle as keyof typeof AUTHOR_STYLE_PROFILES].living ? 
                  ' - Present' : 
                  ` - ${AUTHOR_STYLE_PROFILES[form.authorStyle as keyof typeof AUTHOR_STYLE_PROFILES].death_year}`}
              </p>
            </div>
            <span className={`px-2 py-1 rounded text-xs font-medium ${
              AUTHOR_STYLE_PROFILES[form.authorStyle as keyof typeof AUTHOR_STYLE_PROFILES].living
                ? 'bg-green-100 text-green-800'
                : 'bg-gray-200 text-gray-700'
            }`}>
              {AUTHOR_STYLE_PROFILES[form.authorStyle as keyof typeof AUTHOR_STYLE_PROFILES].living ? 'Living' : 'Deceased'}
            </span>
          </div>
          <p className="text-sm text-gray-700">
            <strong>Style:</strong> {AUTHOR_STYLE_PROFILES[form.authorStyle as keyof typeof AUTHOR_STYLE_PROFILES].description}
          </p>
          <p className="text-sm text-gray-700">
            <strong>Techniques:</strong> {AUTHOR_STYLE_PROFILES[form.authorStyle as keyof typeof AUTHOR_STYLE_PROFILES].techniques}
          </p>
          <p className="text-sm text-gray-700">
            <strong>Audio:</strong> {AUTHOR_STYLE_PROFILES[form.authorStyle as keyof typeof AUTHOR_STYLE_PROFILES].audioAdaptation}
          </p>
        </div>
      )}

      {/* Target Destination */}
      <div>
        <label className="block text-sm font-semibold text-black mb-2">Target Destination *</label>
        <select
          value={form.targetDestination}
          onChange={(e) => setForm({ ...form, targetDestination: e.target.value })}
          disabled={isLoading}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 text-black bg-white disabled:bg-gray-100"
        >
          <option value="app">📚 App Library</option>
          <option value="for-households">🏠 For Households</option>
          <option value="for-fitness">💪 For Fitness</option>
          <option value="for-commuters">🚗 For Commuters</option>
          <option value="for-audio-dramas">🎭 For Audio Dramas</option>
        </select>
      </div>

      {/* Submit */}
      <button
        onClick={() => onSubmit(form)}
        disabled={!isValid || isLoading}
        className={`w-full py-3 rounded-lg font-semibold transition ${
          isValid && !isLoading
            ? 'bg-orange-500 hover:bg-orange-600 text-white'
            : 'bg-gray-300 text-gray-600 cursor-not-allowed'
        }`}
      >
        {isLoading ? `🔄 Generating with ${form.useOpus ? 'Opus 4.6' : 'Sonnet 4.6'}...` : '🚀 Generate Story'}
      </button>

      {/* Model Toggle */}
      <div className="flex items-center justify-between bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 mt-3">
        <div>
          <p className="text-sm font-medium text-black">
            {form.useOpus ? '👑 Opus 4.6 — Top Quality' : '⚡ Sonnet 4.6 — Excellent Quality'}
          </p>
          <p className="text-xs text-gray-500 mt-0.5">
            {form.useOpus ? '$0.11/story • ~90-120 sec • Best for flagship stories' : '$0.07/story • ~45-60 sec • Recommended for most stories'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setForm(f => ({ ...f, useOpus: !f.useOpus }))}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${form.useOpus ? 'bg-orange-500' : 'bg-gray-300'}`}
        >
          <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${form.useOpus ? 'translate-x-6' : 'translate-x-1'}`} />
        </button>
      </div>

      {/* Suno Settings */}
      <div className="border border-gray-200 rounded-lg p-3">
        <button
          type="button"
          onClick={() => setShowSunoSettings(!showSunoSettings)}
          className="flex items-center justify-between w-full text-sm font-medium text-gray-700"
        >
          <span>🎵 Suno Music Settings</span>
          <span className="text-xs text-gray-400">
            {sunoCookie ? '✅ Cookie set' : '⚠️ No cookie — will use library'}
            {showSunoSettings ? ' ▲' : ' ▼'}
          </span>
        </button>
        {showSunoSettings && (
          <div className="mt-3 space-y-2">
            <p className="text-xs text-gray-500">
              Paste your Suno session cookie to generate custom music per story.
              Get it from: suno.com → DevTools (F12) → Application → Cookies → copy the value of the cookie named <strong>__session</strong> or the JWT token.
            </p>
            <textarea
              value={sunoCookie}
              onChange={(e) => {
                setSunoCookie(e.target.value)
                if (typeof window !== 'undefined') {
                  if (e.target.value) {
                    localStorage.setItem('sunoCookie', e.target.value)
                  } else {
                    localStorage.removeItem('sunoCookie')
                  }
                }
              }}
              placeholder="Paste Suno session cookie here..."
              className="w-full h-20 text-xs border border-gray-300 rounded p-2 font-mono bg-white text-black"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setSunoCookie('')
                  if (typeof window !== 'undefined') localStorage.removeItem('sunoCookie')
                }}
                className="text-xs text-red-500 hover:text-red-700"
              >
                Clear
              </button>
              <span className="text-xs text-gray-400 ml-auto">Stored in browser only — never sent to server except during generation</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// ============================================================================
// STAGE 2: STORIES TO TEST
// ============================================================================

const StoriesToTestStage: React.FC<{
  stories: Story[];
  onSelect: (story: Story) => void;
  onDelete: (storyId: string) => void;
}> = ({ stories, onSelect, onDelete }) => {
  const [search, setSearch] = React.useState('');
  const [statusFilter, setStatusFilter] = React.useState<string>('all');

  const calculateDuration = (words: number) => {
    const minutes = Math.round(words / 150);
    return `${minutes} min`;
  };

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'America/New_York' })
      + ' at ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'America/New_York' }) + ' ET';
  };

  const filtered = stories.filter(s => {
    const matchesSearch = !search || s.title.toLowerCase().includes(search.toLowerCase()) || (s.authorName || '').toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === 'all' || s.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const statusCounts = {
    all: stories.length,
    pending: stories.filter(s => s.status === 'pending').length,
    published: stories.filter(s => s.status === 'published').length,
    ready: stories.filter(s => s.status === 'ready').length,
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-black">📖 Stories To Test</h2>
        <span className="text-sm text-gray-500">{filtered.length} of {stories.length}</span>
      </div>

      {/* Search + filter bar */}
      <div className="flex gap-2">
        <input
          type="text"
          placeholder="🔍 Search by title or author..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm text-black bg-white focus:outline-none focus:border-orange-500"
        />
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm text-black bg-white focus:outline-none focus:border-orange-500"
        >
          <option value="all">All ({statusCounts.all})</option>
          <option value="pending">⏳ Pending ({statusCounts.pending})</option>
          <option value="ready">✅ Ready ({statusCounts.ready})</option>
          <option value="published">🚀 Published ({statusCounts.published})</option>
        </select>
      </div>

      {filtered.length === 0 ? (
        <div className="bg-orange-50 p-12 rounded-lg text-center border border-orange-200">
          <p className="text-orange-900 font-semibold">{stories.length === 0 ? 'No stories yet' : 'No matches'}</p>
          <p className="text-orange-800 text-sm">{stories.length === 0 ? 'Create your first story to get started' : 'Try a different search or filter'}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((story) => (
            <button
              key={story.id}
              onClick={() => onSelect(story)}
              className="w-full p-4 bg-white border border-gray-300 rounded-lg hover:border-orange-500 hover:bg-orange-50 transition text-left"
            >
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-semibold text-black">{story.title}</h3>
                  {story.series && <p className="text-sm text-gray-600">{story.series} • Ep {story.episode}</p>}
                  <p className="text-xs text-gray-500 mt-1">
                    {story.primaryGenre}
                    {story.secondaryGenre1 && ` • ${story.secondaryGenre1}`}
                    {story.secondaryGenre2 && ` • ${story.secondaryGenre2}`}
                    {' '} • {calculateDuration(story.wordCount)} • {story.wordCount} words • By {story.authorName}
                  </p>
                  <p className="text-xs text-gray-400 mt-1">🕐 {formatDate(story.createdAt)}</p>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <span className={`px-2 py-1 rounded text-xs font-medium whitespace-nowrap ${
                    story.status === 'published' ? 'bg-green-100 text-green-800' :
                    story.status === 'ready'     ? 'bg-teal-100 text-teal-800' :
                    story.status === 'in_review' ? 'bg-blue-100 text-blue-800' :
                    'bg-yellow-100 text-yellow-800'
                  }`}>
                    {story.status === 'published' ? '🚀 Published' :
                     story.status === 'ready'     ? '✅ Ready' :
                     story.status === 'in_review' ? '🔄 Reviewing' : '⏳ Pending'}
                  </span>
                  <button
                    onClick={(e) => { e.stopPropagation(); onDelete(story.id); }}
                    className="text-xs text-red-400 hover:text-red-600 px-2 py-0.5 border border-red-200 hover:border-red-400 rounded"
                  >🗑 Delete</button>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

// ============================================================================
// ============================================================================
const formatTime = (secs: number): string => {
  if (!secs || isNaN(secs)) return '0:00';
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
};

// STAGE 3: REVIEW & EDIT WITH AUDIO
// ============================================================================

const ReviewEditStage: React.FC<{
  story: Story;
  onBack: () => void;
  onNext: () => void;
  onUpdate: (story: Story) => void;
  sunoCookie: string;
}> = ({ story, onBack, onNext, onUpdate, sunoCookie }) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const musicRef = useRef<HTMLAudioElement | null>(null);       // background music (story segments only)
  const introMusicRef = useRef<HTMLAudioElement | null>(null);  // intro/outro dedicated music
  const INTRO_OUTRO_MUSIC = 'https://vmyhlfeouzslixtkmddy.supabase.co/storage/v1/object/public/audio/intro_outro_music.mp3';

  // Stop ALL audio when component unmounts (navigating away, switching stories)
  useEffect(() => {
    return () => {
      audioRef.current?.pause();
      if (musicRef.current) { musicRef.current.pause(); musicRef.current.src = ''; }
      if (introMusicRef.current) { introMusicRef.current.pause(); introMusicRef.current.src = ''; }
    };
  }, []);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [currentSegment, setCurrentSegment] = useState<'intro' | 'story' | 'outro'>('story');
  const [currentChunkIndex, setCurrentChunkIndex] = useState(0);
  const [musicVolume, setMusicVolume] = useState((story as any).music_volume ?? 0.30);
  const [ioVolume, setIoVolume] = useState((story as any).io_volume ?? 0.18);

  // Full story playback mode
  const [fullPlayMode, setFullPlayMode] = useState(false);
  const fullPlayQueueRef = useRef<string[]>([]);
  const fullPlayIndexRef = useRef(0);
  const fullPlaySectionLabels = useRef<{url: string, label: string}[]>([]);
  const segmentDurationsRef = useRef<number[]>([]);
  const [totalStoryDuration, setTotalStoryDuration] = useState(0);
  const [unifiedPosition, setUnifiedPosition] = useState(0);
  const [fullPlayLabel, setFullPlayLabel] = useState('');

  const buildFullPlayQueue = () => {
    const queue: {url: string, label: string}[] = [];
    if (story.introAudioUrl) queue.push({ url: story.introAudioUrl, label: '🎙️ Intro' });
    const chunks = story.storySegments?.length
      ? story.storySegments.map((s, i) => ({ url: s.audioUrl, label: `🎭 ${s.speaker || 'Story'} (${i+1}/${story.storySegments!.length})` }))
      : (story.storyAudioUrls?.length ? story.storyAudioUrls : story.storyAudioUrl ? [story.storyAudioUrl] : []).map((url, i, arr) => ({ url, label: `📖 Story (${i+1}/${arr.length})` }));
    queue.push(...chunks);
    if (story.outroAudioUrl) queue.push({ url: story.outroAudioUrl, label: '🎙️ Outro' });
    return queue;
  };

  const crossfadeAdminRef = useRef<NodeJS.Timeout | null>(null);
  const crossfadeDoneRef  = useRef(false); // prevent double-trigger per section

  // Smoothly fade a volume from current → target over durationMs
  const fadeVolume = (el: HTMLAudioElement, targetVol: number, durationMs = 2000) => {
    const steps = 40;
    const startVol = el.volume;
    const delta = (targetVol - startVol) / steps;
    let step = 0;
    const t = setInterval(() => {
      step++;
      el.volume = Math.max(0, Math.min(1, startVol + delta * step));
      if (step >= steps) {
        clearInterval(t);
        el.volume = targetVol;
      }
    }, durationMs / steps);
    return t;
  };

  // Cross-fade: fade outEl to 0 AND inEl from 0 to targetVol simultaneously over durationMs
  const crossfadeAudio = (
    outEl: HTMLAudioElement,
    inEl: HTMLAudioElement,
    inSrc: string,
    targetVol: number,
    durationMs = 2000
  ) => {
    if (crossfadeAdminRef.current) clearInterval(crossfadeAdminRef.current);
    // Start in-element
    if (!inEl.src || !inEl.src.includes(inSrc.split('/').pop()!)) {
      inEl.src = inSrc;
    }
    inEl.loop  = true;
    inEl.volume = 0;
    inEl.play().catch(console.error);
    const startOut = outEl.volume;
    const steps = 40;
    let step = 0;
    crossfadeAdminRef.current = setInterval(() => {
      step++;
      const p = step / steps;
      outEl.volume = Math.max(0, startOut * (1 - p));
      inEl.volume  = Math.min(targetVol, targetVol * p);
      if (step >= steps) {
        clearInterval(crossfadeAdminRef.current!);
        outEl.pause();
        outEl.currentTime = 0;
        outEl.volume = targetVol; // reset for next use
      }
    }, durationMs / steps);
  };

  const XF_SECS = 2;      // crossfade duration (seconds)
  const PRE_SECS = 3;     // IO music pre-roll before Belle B (seconds)
  const xfTriggeredRef = useRef(false);

  const startFullPlay = async () => {
    const queue = buildFullPlayQueue();
    if (!queue.length || !audioRef.current) return;
    fullPlaySectionLabels.current = queue;
    const urls = queue.map(q => q.url);
    fullPlayQueueRef.current = urls;
    fullPlayIndexRef.current = 0;
    setFullPlayMode(true);
    setFullPlayLabel(queue[0].label);
    setUnifiedPosition(0);
    xfTriggeredRef.current = false;
    crossfadeDoneRef.current = false;

    preloadDurations(urls).then(durations => {
      segmentDurationsRef.current = durations;
      setTotalStoryDuration(durations.reduce((a, b) => a + b, 0));
    });

    // ── Step 1: Start IO (intro/outro theme) music immediately ──────────────
    const ioEl = introMusicRef.current;
    if (ioEl) {
      ioEl.src    = INTRO_OUTRO_MUSIC;
      ioEl.loop   = true;
      ioEl.volume = 0;
      ioEl.play().catch(console.error);
      fadeVolume(ioEl, ioVolume, 1000); // fade in over 1s
    }

    // ── Step 2: After PRE_SECS, start Belle B intro ──────────────────────────
    setTimeout(() => {
      if (!audioRef.current) return;
      audioRef.current.src = urls[0];
      audioRef.current.load();
      audioRef.current.play().then(() => setIsPlaying(true)).catch(console.error);
    }, PRE_SECS * 1000);
  };

  // Called from onTimeUpdate on the main audio element during full play
  const handleFullPlayTimeUpdate = (currentTime: number, duration: number) => {
    const label = fullPlaySectionLabels.current[fullPlayIndexRef.current]?.label || '';
    const isIntro = label.includes('Intro');
    const timeLeft = duration - currentTime;

    // When intro is XF_SECS from ending → crossfade IO → BG music
    if (isIntro && timeLeft <= XF_SECS && !xfTriggeredRef.current) {
      xfTriggeredRef.current = true;
      const bgEl = musicRef.current;
      const ioEl = introMusicRef.current;
      if (bgEl && ioEl && effectiveMusicUrl) {
        crossfadeAudio(ioEl, bgEl, effectiveMusicUrl, musicVolume, XF_SECS * 1000);
      }
    }
  };

    const preloadDurations = (urls: string[]): Promise<number[]> => {
    return Promise.all(urls.map(url => new Promise<number>(resolve => {
      const a = new Audio();
      a.preload = 'metadata';
      a.onloadedmetadata = () => resolve(a.duration || 0);
      a.onerror = () => resolve(0);
      a.src = url;
    })));
  };

  // (old startFullPlay removed — replaced by version above with pre-roll + crossfades)

  const seekToUnifiedPosition = (targetPos: number) => {
    const durations = segmentDurationsRef.current;
    const urls = fullPlayQueueRef.current;
    if (!durations.length || !audioRef.current) return;
    let acc = 0;
    for (let i = 0; i < durations.length; i++) {
      const segEnd = acc + (durations[i] || 0);
      if (targetPos <= segEnd || i === durations.length - 1) {
        const offsetInSeg = targetPos - acc;
        fullPlayIndexRef.current = i;
        const label = fullPlaySectionLabels.current[i]?.label || '';
        setFullPlayLabel(label);
        audioRef.current.src = urls[i];
        audioRef.current.currentTime = Math.max(0, offsetInSeg);
        audioRef.current.play().then(() => {
          setIsPlaying(true);
          // Restore correct music layer when seeking
          const isIO = label.includes('Intro') || label.includes('Outro');
          if (isIO) {
            musicRef.current?.pause();
            if (introMusicRef.current) { introMusicRef.current.src = INTRO_OUTRO_MUSIC; introMusicRef.current.loop = true; introMusicRef.current.volume = ioVolume; introMusicRef.current.play().catch(console.error); }
          } else {
            introMusicRef.current?.pause();
            if (musicRef.current && effectiveMusicUrl) { musicRef.current.src = effectiveMusicUrl; musicRef.current.loop = true; musicRef.current.volume = musicVolume; musicRef.current.play().catch(console.error); }
          }
        }).catch(console.error);
        setUnifiedPosition(targetPos);
        return;
      }
      acc = segEnd;
    }
  };

  const stopFullPlay = () => {
    setFullPlayMode(false);
    setFullPlayLabel('');
    setIsPlaying(false);
    setUnifiedPosition(0);
    setTotalStoryDuration(0);
    audioRef.current?.pause();
    if (musicRef.current) { musicRef.current.pause(); musicRef.current.currentTime = 0; }
    if (introMusicRef.current) { introMusicRef.current.pause(); introMusicRef.current.currentTime = 0; }
  };
  
  const [introText, setIntroText] = useState(story.introText || '');
  const [outroText, setOutroText] = useState(story.outroText || '');
  const [editingIntro, setEditingIntro] = useState(false);
  const [editingOutro, setEditingOutro] = useState(false);
  const [savingChanges, setSavingChanges] = useState(false);
  const [isRegeneratingMusic, setIsRegeneratingMusic] = useState(false);
  const [isRegeneratingCover, setIsRegeneratingCover] = useState(false);
  const [isRegeneratingIntroAudio, setIsRegeneratingIntroAudio] = useState(false);
  const [isRegeneratingOutroAudio, setIsRegeneratingOutroAudio] = useState(false);
  const [isRenderingFinalMix, setIsRenderingFinalMix] = useState(false);
  const [finalMixUrl, setFinalMixUrl] = useState<string | null>(story.audioUrl || null);

  const calculateDuration = (words: number) => {
    const minutes = Math.round(words / 150);
    return `${minutes} min`;
  };

  // Multi-voice: use storySegments if available, fall back to storyAudioUrls
  const getStoryChunks = () => {
    if (story.storySegments?.length) return story.storySegments.map(s => s.audioUrl);
    if (story.storyAudioUrls?.length) return story.storyAudioUrls;
    return story.storyAudioUrl ? [story.storyAudioUrl] : [];
  };

  const getCurrentSpeaker = () => {
    if (currentSegment !== 'story') return null;
    if (story.storySegments?.length) {
      const seg = story.storySegments[currentChunkIndex];
      if (seg) {
        const charEntry = story.characterGuide?.find(c => c.name === seg.speaker);
        const voiceName = charEntry?.voiceName || '';
        return voiceName ? `${seg.speaker} — Voice: ${voiceName}` : seg.speaker;
      }
    }
    return null;
  };

  const getAudioUrl = () => {
    if (currentSegment === 'intro') return story.introAudioUrl || '';
    if (currentSegment === 'story') {
      const chunks = getStoryChunks();
      return chunks[currentChunkIndex] || chunks[0] || story.storyAudioUrl || '';
    }
    return story.outroAudioUrl || '';
  };

  const handlePlayPause = () => {
    if (!audioRef.current) return;
    const isIntroOutro = currentSegment === 'intro' || currentSegment === 'outro';
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
      musicRef.current?.pause();
      introMusicRef.current?.pause();
    } else {
      audioRef.current.play()
        .then(() => {
          setIsPlaying(true);
          if (isIntroOutro) {
            // Intro/outro: play IO (theme) music
            musicRef.current?.pause();
            const ioEl = introMusicRef.current;
            if (ioEl) {
              ioEl.src    = INTRO_OUTRO_MUSIC;
              ioEl.loop   = true;
              ioEl.volume = ioVolume;
              ioEl.play().catch(console.error);
            }
          } else {
            // Story segment: play background music
            introMusicRef.current?.pause();
            if (musicRef.current && effectiveMusicUrl) {
              if (!musicRef.current.src || musicRef.current.src === window.location.href) {
                musicRef.current.src = effectiveMusicUrl;
                musicRef.current.loop = true;
              }
              musicRef.current.volume = musicVolume;
              musicRef.current.play().catch(console.error);
            }
          }
        })
        .catch((err) => {
          console.error('Audio play error:', err);
          alert('Could not play audio. Check browser console for details.');
        });
    }
  };

  const handleStartOver = () => {
    if (audioRef.current) {
      audioRef.current.currentTime = 0;
      audioRef.current.play()
        .then(() => setIsPlaying(true))
        .catch(console.error);
      setIsPlaying(true);
    }
  };

  const handleSaveChanges = async () => {
    setSavingChanges(true);
    try {
      const updatedStory = {
        ...story,
        introText,
        outroText,
      };
      
      // Save to database
      const response = await fetch('/api/asc3/update-story', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedStory),
      });

      if (response.ok) {
        onUpdate(updatedStory);
        setEditingIntro(false);
        setEditingOutro(false);
        alert('✅ Changes saved!');
      } else {
        alert('❌ Failed to save changes');
      }
    } catch (error) {
      alert('❌ Error saving changes');
    } finally {
      setSavingChanges(false);
    }
  };

  const [sunoStatusMsg, setSunoStatusMsg] = React.useState('')
  const [sunoElapsed, setSunoElapsed] = React.useState(0)

  const handleRegenerateAnnouncerAudio = async (type: 'intro' | 'outro') => {
    const text = type === 'intro' ? introText : outroText
    if (!text.trim()) return alert('No text to generate from. Write the script first.')
    if (type === 'intro') setIsRegeneratingIntroAudio(true)
    else setIsRegeneratingOutroAudio(true)
    try {
      const res = await fetch('/api/asc3/regenerate-announcer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storyId: story.id, type, text }),
      })
      const data = await res.json()
      if (data.success && data.audioUrl) {
        const updated = {
          ...story,
          ...(type === 'intro' ? { introAudioUrl: data.audioUrl, introText: text } : { outroAudioUrl: data.audioUrl, outroText: text }),
        }
        onUpdate(updated)
        alert(`✅ ${type === 'intro' ? 'Intro' : 'Outro'} audio regenerated!`)
      } else {
        alert(`❌ Failed: ${data.error}`)
      }
    } catch {
      alert(`❌ Error regenerating ${type} audio`)
    } finally {
      if (type === 'intro') setIsRegeneratingIntroAudio(false)
      else setIsRegeneratingOutroAudio(false)
    }
  }

  const handleRenderFinalMix = async () => {
    if (isRenderingFinalMix) return
    setIsRenderingFinalMix(true)
    try {
      // Use local render route (runs Mac ffmpeg script) — Vercel can't run ffmpeg
      const res = await fetch('/api/asc3/render-local', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storyId: story.id }),
      })
      const data = await res.json()
      if (data.success) {
        const url = data.finalMixUrl || story.audioUrl
        setFinalMixUrl(url)
        onUpdate({ ...story, audioUrl: url })
        alert('✅ Final mix rendered! Hit ▶ Play Full Story to test.')
      } else {
        alert(`❌ Render failed: ${data.error}`)
      }
    } catch {
      alert('❌ Error rendering final mix')
    } finally {
      setIsRenderingFinalMix(false)
    }
  }

  const handleRegenerateCover = async () => {
    if (isRegeneratingCover) return
    setIsRegeneratingCover(true)
    try {
      const res = await fetch('/api/asc3/regenerate-cover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storyId: story.id, genre: story.primaryGenre }),
      })
      const data = await res.json()
      if (data.success && data.coverImageUrl) {
        onUpdate({ ...story, coverImageUrl: data.coverImageUrl })
      } else {
        alert(`❌ Cover regeneration failed: ${data.error || 'Unknown error'}`)
      }
    } catch {
      alert('❌ Cover regeneration error')
    } finally {
      setIsRegeneratingCover(false)
    }
  }

  const handleRegenerateSunoMusic = async () => {
    if (isRegeneratingMusic) return
    setIsRegeneratingMusic(true)
    setSunoStatusMsg('🎵 Submitting to Suno...')
    setSunoElapsed(0)

    // Live elapsed timer
    const startTime = Date.now()
    const timer = setInterval(() => {
      const secs = Math.round((Date.now() - startTime) / 1000)
      setSunoElapsed(secs)
      if (secs < 10) setSunoStatusMsg('🎵 Submitting to Suno...')
      else if (secs < 30) setSunoStatusMsg('🎵 Generating track...')
      else if (secs < 120) setSunoStatusMsg('🎵 Composing your soundtrack...')
      else if (secs < 300) setSunoStatusMsg('🎵 Almost there — Suno can take 3-5 min...')
      else setSunoStatusMsg('🎵 Still working — up to 8 min total, hang tight...')
    }, 1000)

    try {
      let sunoPrompt = ''
      if (story.generatedScript) {
        const m = story.generatedScript.match(/SUNO[_ ]PROMPT[:\s]+(.+?)(?:\n|$)/i)
        if (m) sunoPrompt = m[1].trim()
      }
      if (!sunoPrompt) sunoPrompt = `Cinematic ${story.primaryGenre || 'thriller'} instrumental, atmospheric, mysterious, no vocals`

      const res = await fetch('/api/asc3/generate-music', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storyId: story.id, sunoPrompt, title: story.title }),
      })
      const data = await res.json()
      if (data.success && data.musicUrl) {
        // Cache in localStorage so it survives page refresh
        localStorage.setItem(`music_${story.id}`, data.musicUrl)
        if (data.musicTitle) localStorage.setItem(`music_title_${story.id}`, data.musicTitle)
        const updatedStory = { ...story, backgroundMusicUrl: data.musicUrl, sunoStatus: 'suno' }
        onUpdate(updatedStory)
        if (musicRef.current) {
          musicRef.current.src = data.musicUrl
          musicRef.current.load()
        }
        setSunoStatusMsg('✅ Track ready!')
        setTimeout(() => setSunoStatusMsg(''), 3000)
      } else {
        setSunoStatusMsg('')
        alert(`❌ Suno failed: ${data.message || data.error}`)
      }
    } catch (e) {
      setSunoStatusMsg('')
      alert('❌ Suno generation error')
    } finally {
      clearInterval(timer)
      setIsRegeneratingMusic(false)
    }
  }

  const getMusicTrackName = (url: string): string => {
    const filename = url.split('/').pop()?.replace('.mp3', '').replace(/-/g, ' ') || 'Unknown Track';
    return filename.replace(/\b\w/g, c => c.toUpperCase());
  };

  // Fallback: pick music by genre if story doesn't have one set
  const BASE = 'https://vmyhlfeouzslixtkmddy.supabase.co/storage/v1/object/public/audio/music-library';
  const getEffectiveMusicUrl = (): string => {
    // Check localStorage cache first (persists until DB column is available)
    if (typeof window !== 'undefined') {
      const cached = localStorage.getItem(`music_${story.id}`)
      if (cached) return cached
    }
    if (story.backgroundMusicUrl) return story.backgroundMusicUrl;
    const g = (story.primaryGenre || '').toLowerCase();
    const t = (story.tone || '').toLowerCase();
    if (g.includes('horror') || t.includes('horrify')) return `${BASE}/hollow-crown-of-cinders.mp3`;
    if (g.includes('sci') || g.includes('cosmic') || g.includes('get smarter')) return `${BASE}/cosmic-bloom.mp3`;
    if (g.includes('drama') || t.includes('emotional')) return `${BASE}/heartbeats-between-chapters.mp3`;
    if (g.includes('comedy') || t.includes('warm') || t.includes('heartfelt')) return `${BASE}/flicker-old-porch-light.mp3`;
    if (g.includes('adventure') || g.includes('western')) return `${BASE}/dust-trail-omen.mp3`;
    return `${BASE}/midnight-red-5th-avenue.mp3`; // default: thriller
  };
  const effectiveMusicUrl = getEffectiveMusicUrl();

  const audioUrl = getAudioUrl();
  const currentSpeaker = getCurrentSpeaker();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-black">{story.title}</h2>
          <p className="text-sm text-gray-600 mt-1">
            By {story.authorName} • {story.primaryGenre}
            {story.secondaryGenre1 && ` • ${story.secondaryGenre1}`}
            {story.secondaryGenre2 && ` • ${story.secondaryGenre2}`}
            {' '} • {calculateDuration(story.wordCount)} • {story.wordCount} words
          </p>
        </div>
        <button onClick={onBack} className="px-4 py-2 bg-gray-200 text-black rounded hover:bg-gray-300">← Back</button>
      </div>

      {/* Character Guide */}
      {story.characterGuide && story.characterGuide.length > 0 && (
        <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
          <h3 className="font-semibold text-orange-900 mb-3">🎭 Character Voices</h3>
          <div className="grid grid-cols-1 gap-2">
            {story.characterGuide.map((char) => (
              <div key={char.name} className="flex items-center justify-between bg-white rounded px-3 py-2 border border-orange-100">
                <div>
                  <span className="font-semibold text-black text-sm">{char.name}</span>
                  {char.description && (
                    <span className="text-gray-500 text-xs ml-2">({char.description})</span>
                  )}
                </div>
                <span className="text-orange-600 text-sm font-medium">🎙️ {char.voiceName}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Background Music Info */}
      {effectiveMusicUrl && (
        <div className="bg-white border border-gray-300 rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <h4 className="font-semibold text-black">🎵 Background Music</h4>
            <button
              onClick={handleRegenerateSunoMusic}
              disabled={isRegeneratingMusic}
              className="px-3 py-1 bg-purple-600 text-white rounded text-sm hover:bg-purple-700 disabled:opacity-40"
            >
              {isRegeneratingMusic ? `⏳ ${sunoElapsed}s` : '🎵 Regenerate with Suno'}
            </button>
          </div>
          {sunoStatusMsg && (
            <div className="flex items-center gap-2 px-3 py-2 bg-purple-50 border border-purple-200 rounded text-sm text-purple-800 mb-2">
              <span className="animate-spin inline-block">⟳</span>
              <span>{sunoStatusMsg}</span>
              {sunoElapsed > 0 && <span className="ml-auto text-purple-500 font-mono">{sunoElapsed}s</span>}
            </div>
          )}
          <p className="text-sm text-gray-600 mb-1">
            {story.sunoStatus === 'suno'
              ? `🎵 ${typeof window !== 'undefined' && localStorage.getItem(`music_title_${story.id}`) ? localStorage.getItem(`music_title_${story.id}`) : 'Custom Suno track'}`
              : `🎵 Library: ${getMusicTrackName(effectiveMusicUrl)}`}
            {' '} — plays automatically under dialogue when you hit ▶ Play Full Story
          </p>
          {!sunoCookie && (
            <p className="text-xs text-gray-400 mb-2">Set a Suno cookie in Stage 1 to enable regeneration.</p>
          )}
          <audio
            controls
            src={effectiveMusicUrl}
            className="w-full"
          />
        </div>
      )}

      {/* Audio Player */}
      {audioUrl && (
        <div className="bg-white p-6 rounded-lg border border-gray-300">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-black">🎵 Audio Player</h3>
            <div className="flex items-center gap-2">
              <button
                onClick={handleRenderFinalMix}
                disabled={isRenderingFinalMix}
                className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition disabled:opacity-40"
                title={`Mixes all audio + music at ${Math.round(musicVolume * 100)}% volume into one publishable MP3`}
              >
                {isRenderingFinalMix ? '⏳ Rendering...' : '🎬 Render Final Mix'}
              </button>
              {!fullPlayMode ? (
                <button
                  onClick={startFullPlay}
                  className="flex items-center gap-2 bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold px-4 py-2 rounded-lg transition"
                >
                  ▶ Play Full Story
                </button>
              ) : (
                <button
                  onClick={stopFullPlay}
                  className="flex items-center gap-2 bg-red-500 hover:bg-red-600 text-white text-sm font-semibold px-4 py-2 rounded-lg transition"
                >
                  ⏹ Stop
                </button>
              )}
            </div>
          </div>
          {finalMixUrl && (
            <div className="mb-3 px-3 py-2 bg-green-50 border border-green-200 rounded text-sm font-medium text-green-800 flex items-center justify-between">
              <span>✅ Final mix ready — this is what gets published</span>
              <audio controls src={finalMixUrl} className="h-8 ml-3" />
            </div>
          )}

          {fullPlayMode && (
            <div className="mb-3 px-3 py-2 bg-orange-50 border border-orange-200 rounded text-sm font-medium text-orange-800">
              Now playing: {fullPlayLabel}
            </div>
          )}

          {/* Segment Selection */}
          <div className="flex gap-2 mb-4">
            {['intro', 'story', 'outro'].map((seg) => (
              <button
                key={seg}
                onClick={() => {
                  const newSeg = seg as 'intro' | 'story' | 'outro';
                  setCurrentSegment(newSeg);
                  setCurrentChunkIndex(0);
                  setIsPlaying(false);
                  setCurrentTime(0);
                  if (audioRef.current) {
                    audioRef.current.pause();
                    audioRef.current.currentTime = 0;
                  }
                  setIsPlaying(false);
                }}
                className={`px-4 py-2 rounded font-medium transition ${
                  currentSegment === seg
                    ? 'bg-orange-500 text-white'
                    : 'bg-gray-200 text-black hover:bg-gray-300'
                }`}
              >
                {seg.charAt(0).toUpperCase() + seg.slice(1)}
                {seg === 'story' && (story.storySegments?.length ?? 0) > 0 && (
                  <span className="ml-1 text-xs opacity-75">({story.storySegments!.length} segs)</span>
                )}
              </button>
            ))}
          </div>

          {/* Player Controls */}
          <div className="flex items-center gap-4">
            <button
              onClick={handlePlayPause}
              className="w-12 h-12 rounded-full bg-orange-500 text-white flex items-center justify-center hover:bg-orange-600"
            >
              {isPlaying ? <Pause size={24} /> : <Play size={24} />}
            </button>
            <div className="flex-1">
              {/* Unified full-story seek bar (fullPlayMode) or per-segment seek bar */}
              {fullPlayMode && totalStoryDuration > 0 ? (
                <>
                  <input
                    type="range"
                    min={0}
                    max={totalStoryDuration}
                    step={1}
                    value={unifiedPosition}
                    onChange={(e) => seekToUnifiedPosition(parseFloat(e.target.value))}
                    className="w-full accent-orange-500 cursor-pointer"
                  />
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-xs text-gray-600">{formatTime(unifiedPosition)}</span>
                    <span className="text-xs text-orange-600 font-medium truncate mx-2">{fullPlayLabel}</span>
                    <span className="text-xs text-gray-600">{formatTime(totalStoryDuration)}</span>
                  </div>
                </>
              ) : (
                <>
                  <input
                    type="range"
                    min={0}
                    max={duration || 0}
                    step={0.5}
                    value={currentTime}
                    onChange={(e) => {
                      const t = parseFloat(e.target.value);
                      if (audioRef.current) audioRef.current.currentTime = t;
                      setCurrentTime(t);
                    }}
                    className="w-full accent-orange-500 cursor-pointer"
                  />
                  <div className="flex items-center justify-between mt-1">
                    <p className="text-xs text-gray-600">
                      {formatTime(currentTime)} / {formatTime(duration)}
                      {currentSegment === 'story' && getStoryChunks().length > 1 && (
                        <span className="ml-2 text-gray-400">segment {currentChunkIndex + 1}/{getStoryChunks().length}</span>
                      )}
                    </p>
                  </div>
                </>
              )}
              {/* Now speaking indicator */}
              {currentSpeaker && isPlaying && (
                <p className="text-xs text-orange-600 font-medium mt-1">
                  🎙️ [{currentSpeaker}]
                </p>
              )}
            </div>
            <button
              onClick={handleStartOver}
              className="px-3 py-2 bg-gray-200 text-black rounded hover:bg-gray-300 text-sm font-medium"
            >
              🔄 Start Over
            </button>
          </div>

          {/* Hidden music audio element */}
          <audio ref={musicRef} loop className="hidden" />
          <audio ref={introMusicRef} loop className="hidden" />

          {/* Background Music Volume Control */}
          {effectiveMusicUrl && (
            <div className="mt-4 pt-4 border-t border-gray-200">
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium text-gray-700 whitespace-nowrap">🎵 Music Volume:</span>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={musicVolume}
                  onChange={(e) => {
                    const vol = parseFloat(e.target.value);
                    setMusicVolume(vol);
                    if (musicRef.current) musicRef.current.volume = vol;
                    fetch('/api/asc3/update-story', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ storyId: story.id, music_volume: vol }),
                    }).catch(() => {})
                  }}
                  className="flex-1 accent-orange-500"
                />
                <span className="text-sm text-gray-600 w-10 text-right">{Math.round(musicVolume * 100)}%</span>
              </div>
              <div className="flex items-center gap-3 mt-2">
                <span className="text-sm font-medium text-gray-700 whitespace-nowrap">🎼 Intro/Outro:</span>
                <input
                  type="range"
                  min="0"
                  max="0.5"
                  step="0.01"
                  value={ioVolume}
                  onChange={(e) => {
                    const vol = parseFloat(e.target.value);
                    setIoVolume(vol);
                    fetch('/api/asc3/update-story', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ storyId: story.id, io_volume: vol }),
                    }).catch(() => {})
                  }}
                  className="flex-1 accent-purple-500"
                />
                <span className="text-sm text-gray-600 w-10 text-right">{Math.round(ioVolume * 100)}%</span>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                🎵 Background: {getMusicTrackName(effectiveMusicUrl)} &nbsp;|&nbsp; 🎼 Intro/Outro theme
              </p>
            </div>
          )}

          {/* Hidden audio element */}
          <audio
            ref={audioRef}
            src={audioUrl}
            onTimeUpdate={(e) => {
              const t = e.currentTarget.currentTime;
              const dur = e.currentTarget.duration || 0;
              setCurrentTime(t);
              if (fullPlayMode && segmentDurationsRef.current.length) {
                const completedMs = segmentDurationsRef.current
                  .slice(0, fullPlayIndexRef.current)
                  .reduce((a, b) => a + b, 0);
                setUnifiedPosition(completedMs + t);
                // Trigger IO→BG crossfade 2s before intro ends
                if (dur > 0) handleFullPlayTimeUpdate(t, dur);
              }
            }}
            onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
            onEnded={() => {
              if (fullPlayMode) {
                const nextIndex = fullPlayIndexRef.current + 1;
                if (nextIndex < fullPlayQueueRef.current.length) {
                  fullPlayIndexRef.current = nextIndex;
                  const nextUrl = fullPlayQueueRef.current[nextIndex];
                  const nextLabel = fullPlaySectionLabels.current[nextIndex]?.label || '';
                  setFullPlayLabel(nextLabel);
                  setCurrentTime(0);
                  xfTriggeredRef.current = false; // reset for next section

                  // If transitioning into outro → crossfade BG → IO now
                  if (nextLabel.includes('Outro')) {
                    const bgEl = musicRef.current;
                    const ioEl = introMusicRef.current;
                    if (bgEl && ioEl) {
                      ioEl.src    = INTRO_OUTRO_MUSIC;
                      ioEl.loop   = true;
                      ioEl.volume = 0;
                      ioEl.play().catch(console.error);
                      crossfadeAudio(bgEl, ioEl, INTRO_OUTRO_MUSIC, ioVolume, XF_SECS * 1000);
                    }
                  }

                  if (audioRef.current) {
                    audioRef.current.src = nextUrl;
                    audioRef.current.load();
                    setTimeout(() => audioRef.current?.play().then(() => setIsPlaying(true)).catch(console.error), 150);
                  }
                } else {
                  // Story finished — fade out IO music over 3s then stop
                  if (introMusicRef.current) fadeVolume(introMusicRef.current, 0, 3000);
                  setTimeout(() => stopFullPlay(), 3500);
                }
              } else if (currentSegment === 'story') {
                const chunks = getStoryChunks();
                if (currentChunkIndex < chunks.length - 1) {
                  setCurrentChunkIndex(prev => prev + 1);
                  setCurrentTime(0);
                  setTimeout(() => audioRef.current?.play().then(() => setIsPlaying(true)).catch(console.error), 150);
                } else {
                  setIsPlaying(false);
                  setCurrentChunkIndex(0);
                }
              } else {
                setIsPlaying(false);
              }
            }}
            className="hidden"
            crossOrigin="anonymous"
          />
        </div>
      )}

      {/* Edit Intro */}
      <div className="bg-white border border-gray-300 rounded-lg p-4">
        <div className="flex items-center justify-between mb-2">
          <h4 className="font-semibold text-black">Edit Intro Text</h4>
          <div className="flex gap-2">
            {editingIntro && (
              <>
                <button
                  onClick={() => { setEditingIntro(false); handleSaveChanges(); }}
                  className="px-2 py-1 bg-orange-500 text-white rounded text-sm font-medium"
                >
                  💾 Save
                </button>
                <button
                  onClick={() => { setEditingIntro(false); setIntroText(story.introText || ''); }}
                  className="px-2 py-1 bg-gray-200 text-black rounded text-sm font-medium"
                >
                  ✕ Cancel
                </button>
              </>
            )}
            <button
              onClick={() => handleRegenerateAnnouncerAudio('intro')}
              disabled={isRegeneratingIntroAudio}
              className="px-2 py-1 bg-blue-600 text-white rounded text-sm font-medium disabled:opacity-40"
            >
              {isRegeneratingIntroAudio ? '⏳ Generating...' : '🎙️ Regen Audio'}
            </button>
          </div>
        </div>
        {editingIntro ? (
          <textarea
            value={introText}
            onChange={(e) => setIntroText(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded text-black bg-white"
            rows={3}
          />
        ) : (
          <div className="flex items-start justify-between">
            <p className="text-black flex-1">{introText || '(No intro text set)'}</p>
            <button
              onClick={() => setEditingIntro(true)}
              className="p-1 hover:bg-gray-100 rounded ml-2"
            >
              <Edit2 size={16} className="text-black" />
            </button>
          </div>
        )}
      </div>

      {/* Edit Outro */}
      <div className="bg-white border border-gray-300 rounded-lg p-4">
        <div className="flex items-center justify-between mb-2">
          <h4 className="font-semibold text-black">Edit Outro Text</h4>
          <div className="flex gap-2">
            {editingOutro && (
              <>
                <button
                  onClick={() => { setEditingOutro(false); handleSaveChanges(); }}
                  className="px-2 py-1 bg-orange-500 text-white rounded text-sm font-medium"
                >
                  💾 Save
                </button>
                <button
                  onClick={() => { setEditingOutro(false); setOutroText(story.outroText || ''); }}
                  className="px-2 py-1 bg-gray-200 text-black rounded text-sm font-medium"
                >
                  ✕ Cancel
                </button>
              </>
            )}
            <button
              onClick={() => handleRegenerateAnnouncerAudio('outro')}
              disabled={isRegeneratingOutroAudio}
              className="px-2 py-1 bg-blue-600 text-white rounded text-sm font-medium disabled:opacity-40"
            >
              {isRegeneratingOutroAudio ? '⏳ Generating...' : '🎙️ Regen Audio'}
            </button>
          </div>
        </div>
        {editingOutro ? (
          <textarea
            value={outroText}
            onChange={(e) => setOutroText(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded text-black bg-white"
            rows={3}
          />
        ) : (
          <div className="flex items-start justify-between">
            <p className="text-black flex-1">{outroText || '(No outro text set)'}</p>
            <button
              onClick={() => setEditingOutro(true)}
              className="p-1 hover:bg-gray-100 rounded ml-2"
            >
              <Edit2 size={16} className="text-black" />
            </button>
          </div>
        )}
      </div>

      {/* Cover Image */}
      {story.coverImageUrl && (
        <div className="bg-white border border-gray-300 rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="font-semibold text-black">📷 Cover Image</h4>
            <button
              onClick={handleRegenerateCover}
              disabled={isRegeneratingCover}
              className="px-3 py-1 bg-orange-500 text-white rounded text-sm hover:bg-orange-600 disabled:opacity-40"
            >
              {isRegeneratingCover ? '⏳ Generating...' : '🎨 Regenerate Cover'}
            </button>
          </div>
          <img
            src={story.coverImageUrl}
            alt="Cover"
            className="w-full aspect-square object-cover rounded"
          />
        </div>
      )}

      {/* Next Button */}
      <button
        onClick={onNext}
        className="w-full py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg font-semibold"
      >
        Next: Publish Story →
      </button>
    </div>
  );
};

// ============================================================================
// STAGE 4: PUBLISH
// ============================================================================

const PublishStage: React.FC<{
  story: Story;
  onBack: () => void;
  onComplete: () => void;
}> = ({ story, onBack, onComplete }) => {
  const [destinations, setDestinations] = useState<string[]>(['app']);
  const [publishing, setPublishing] = useState(false);

  const calculateDuration = (words: number) => {
    const minutes = Math.round(words / 150);
    return `${minutes} min`;
  };

  const toggleDestination = (dest: string) => {
    setDestinations((prev) =>
      prev.includes(dest) ? prev.filter((d) => d !== dest) : [...prev, dest]
    );
  };

  const handlePublish = async () => {
    setPublishing(true);
    try {
      const response = await fetch('/api/asc3/publish-story', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storyId: story.id,
          destinations,
        }),
      });

      const data = await response.json();
      if (response.ok && data.success) {
        alert('✅ Story published successfully!');
        onComplete();
      } else if (data.duplicate) {
        alert(`⚠️ Duplicate detected!\n\n${data.error}\n\nGo to Stage 2, delete the old published version first, then publish this one.`);
      } else {
        alert(`❌ Failed to publish: ${data.error || 'Unknown error'}`);
      }
    } catch (error) {
      alert('❌ Error publishing story');
    } finally {
      setPublishing(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-black">📤 Publish: {story.title}</h2>
          <p className="text-sm text-gray-600 mt-1">
            By {story.authorName} • {story.primaryGenre} • {calculateDuration(story.wordCount)}
          </p>
        </div>
        <button onClick={onBack} className="px-4 py-2 bg-gray-200 text-black rounded hover:bg-gray-300">← Back</button>
      </div>

      {/* Publish Destinations */}
      <div className="bg-orange-50 border border-orange-200 rounded-lg p-6 space-y-4">
        <h3 className="font-semibold text-orange-900 text-lg">Select Publishing Destinations</h3>

        <div className="space-y-2">
          {[
            { id: 'app', label: '📚 App Library' },
            { id: 'for-households', label: '🏠 For Households' },
            { id: 'for-fitness', label: '💪 For Fitness' },
            { id: 'for-commuters', label: '🚗 For Commuters' },
            { id: 'for-audio-dramas', label: '🎭 For Audio Dramas' },
          ].map((dest) => (
            <label key={dest.id} className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={destinations.includes(dest.id)}
                onChange={() => toggleDestination(dest.id)}
                className="w-4 h-4 rounded text-orange-600"
              />
              <span className="text-sm font-medium text-black">{dest.label}</span>
            </label>
          ))}
        </div>

        <button
          onClick={handlePublish}
          disabled={publishing || destinations.length === 0}
          className={`w-full py-3 rounded-lg font-semibold transition ${
            publishing || destinations.length === 0
              ? 'bg-gray-300 text-gray-600 cursor-not-allowed'
              : 'bg-orange-500 hover:bg-orange-600 text-white'
          }`}
        >
          {publishing ? '🔄 Publishing...' : `📤 Publish to ${destinations.length} ${destinations.length === 1 ? 'Destination' : 'Destinations'}`}
        </button>
      </div>
    </div>
  );
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function StoryCreationPage() {
  const [stage, setStage] = useState<Stage>('create');
  const [stories, setStories] = useState<Story[]>([]);
  const [selectedStory, setSelectedStory] = useState<Story | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [sunoCookie, setSunoCookie] = useState<string>(() => {
    if (typeof window !== 'undefined') return localStorage.getItem('sunoCookie') || ''
    return ''
  });
  const [showSunoSettings, setShowSunoSettings] = useState(false);

  // Persist stage + selected story ID in URL so refresh doesn't reset
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const savedStage = params.get('stage') as Stage | null;
    const savedStoryId = params.get('storyId');
    if (savedStage && ['create','to-test','review','publish'].includes(savedStage)) {
      setStage(savedStage);
    }
    // selectedStory will be set after stories load below
    if (savedStoryId) {
      sessionStorage.setItem('pendingStoryId', savedStoryId);
    }
  }, []);

  const navigateToStage = (newStage: Stage, storyId?: string) => {
    setStage(newStage);
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams();
      params.set('stage', newStage);
      if (storyId) params.set('storyId', storyId);
      window.history.replaceState({}, '', `?${params.toString()}`);
    }
  };

  // Load pending stories from DB on mount so refreshes don't wipe the list
  useEffect(() => {
    const loadStories = async () => {
      try {
        const res = await fetch('/api/asc3/list-stories?status=all');
        const data = await res.json();
        if (data.success && data.stories?.length > 0) {
          setStories(data.stories);
          // Restore selected story from URL — match by real UUID or by title fallback
          const pendingId = sessionStorage.getItem('pendingStoryId') || new URLSearchParams(window.location.search).get('storyId');
          if (pendingId) {
            const found = data.stories.find((s: Story) => s.id === pendingId)
              || data.stories.find((s: Story) => s.title === pendingId); // title fallback
            if (found) {
              setSelectedStory(found);
              // Fix URL if it had a stale temp ID
              if (pendingId !== found.id) {
                const params = new URLSearchParams(window.location.search);
                params.set('storyId', found.id);
                window.history.replaceState({}, '', `?${params.toString()}`);
              }
            }
            sessionStorage.removeItem('pendingStoryId');
          }
          // Also fix selectedStory if it's currently using a temp ID
          setSelectedStory(prev => {
            if (!prev) return prev;
            const match = data.stories.find((s: Story) => s.title === prev.title && s.id !== prev.id);
            return match ? { ...prev, ...match } : prev;
          });
        }
      } catch (e) {
        console.warn('Could not load stories from DB:', e);
      }
    };
    loadStories();
  }, []);

  const handleCreateSubmit = async (prompt: StoryPrompt) => {
    setIsGenerating(true);

    try {
      const authorProfile = AUTHOR_STYLE_PROFILES[prompt.authorStyle as keyof typeof AUTHOR_STYLE_PROFILES];
      
      if (!authorProfile) {
        alert('❌ Author style not found');
        setIsGenerating(false);
        return;
      }

      // Pre-generation EL cost estimate
      // ~5.5 chars/word average for audio drama dialogue × $0.30/1k chars
      const estChars = Math.round(prompt.wordCount * 5.5)
      const estCost = (estChars / 1000 * 0.30).toFixed(2)
      console.log(`💰 EL cost estimate: ~${estChars.toLocaleString()} chars = ~$${estCost}`)

      // Call generation API
      const response = await fetch('/api/asc3/generate-story-complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          concept: prompt.concept,
          tone: prompt.tone,
          wordCount: prompt.wordCount,
          primaryGenre: prompt.primaryGenre,
          secondaryGenre1: prompt.secondaryGenre1,
          secondaryGenre2: prompt.secondaryGenre2,
          authorName: prompt.authorName,
          authorStyle: prompt.authorStyle,
          authorTechniques: authorProfile.techniques,
          audioAdaptation: authorProfile.audioAdaptation,
          series: prompt.series,
          episode: prompt.episode,
          targetDestination: prompt.targetDestination,
          model: prompt.useOpus ? 'claude-opus-4-6' : 'claude-sonnet-4-6',
          sunoCookie: sunoCookie || undefined,
        }),
      });

      const result = await response.json();

      if (!result.success) {
        alert(`❌ Error: ${result.error}`);
        setIsGenerating(false);
        return;
      }

      // Create story with complete data
      const newStory: Story = {
        id: result.data.storyId,
        title: result.data.title,
        primaryGenre: prompt.primaryGenre,
        secondaryGenre1: prompt.secondaryGenre1,
        secondaryGenre2: prompt.secondaryGenre2,
        wordCount: result.data.wordCount,
        series: prompt.series,
        episode: prompt.episode,
        concept: prompt.concept,
        tone: prompt.tone,
        authorName: prompt.authorName,
        authorStyle: prompt.authorStyle,
        targetDestination: prompt.targetDestination,
        status: 'pending',
        createdAt: new Date().toISOString(),
        generatedScript: result.data.script,
        introAudioUrl: result.data.introAudioUrl,
        storyAudioUrl: result.data.storyAudioUrl,
        storyAudioUrls: result.data.storyAudioUrls || (result.data.storyAudioUrl ? [result.data.storyAudioUrl] : []),
        storySegments: result.data.storySegments || [],
        characterGuide: result.data.characterGuide || [],
        outroAudioUrl: result.data.outroAudioUrl,
        backgroundMusicUrl: result.data.backgroundMusicUrl,
        coverImageUrl: result.data.coverImageUrl,
        sfxMetadata: result.data.sfxMetadata || [],
        introText: result.data.introText,
        outroText: result.data.outroText,
        sunoStatus: result.data.sunoStatus,
      };

      setStories([newStory, ...stories]);
      
      alert(`✅ Story Generated!\n\n"${result.data.title}"\n${result.data.wordCount} words\nAudio, music, and cover generated!`);
      
      navigateToStage('to-test');
    } catch (error: any) {
      console.error('Error generating story:', error);
      const msg = error?.message || 'Unknown error'
      const isTimeout = msg.includes('timeout') || msg.includes('fetch')
      alert(isTimeout
        ? '❌ Request timed out. The server may still be generating — check Tab 2 in 30 seconds before trying again.'
        : `❌ Generation failed: ${msg}`)
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSelectStory = (story: Story) => {
    setSelectedStory(story);
    navigateToStage('review', story.id);
  };

  const handlePublishComplete = () => {
    setSelectedStory(null);
    navigateToStage('to-test'); // return to Stage 2, keep stories list intact
  };

  const handleUpdateStory = (updatedStory: Story) => {
    setSelectedStory(updatedStory);
    setStories(stories.map(s => s.id === updatedStory.id ? updatedStory : s));
  };

  return (
    <div className="p-6 md:p-10 max-w-4xl mx-auto bg-white min-h-screen">
      {/* Progress Indicator */}
      <div className="mb-8">
        <div className="flex items-center justify-between text-sm font-medium mb-2">
          <button onClick={() => navigateToStage('create')} className={stage === 'create' ? 'text-orange-600 font-bold' : 'text-gray-500 hover:text-orange-500 cursor-pointer'}>1. Create</button>
          <button onClick={() => stories.length > 0 && navigateToStage('to-test')} className={stage === 'to-test' ? 'text-orange-600 font-bold' : stories.length > 0 ? 'text-gray-500 hover:text-orange-500 cursor-pointer' : 'text-gray-300 cursor-not-allowed'}>
            2. Stories {stories.length > 0 && <span className="ml-1 bg-orange-500 text-white text-xs rounded-full px-1.5 py-0.5">{stories.length}</span>}
          </button>
          <button onClick={() => selectedStory && navigateToStage('review', selectedStory?.id)} className={stage === 'review' ? 'text-orange-600 font-bold' : selectedStory ? 'text-gray-500 hover:text-orange-500 cursor-pointer' : 'text-gray-300 cursor-not-allowed'}>3. Review</button>
          <button onClick={() => selectedStory && navigateToStage('publish', selectedStory?.id)} className={stage === 'publish' ? 'text-orange-600 font-bold' : selectedStory ? 'text-gray-500 hover:text-orange-500 cursor-pointer' : 'text-gray-300 cursor-not-allowed'}>4. Publish</button>
        </div>
        <div className="w-full bg-gray-300 rounded-full h-2">
          <div
            className="bg-orange-500 h-2 rounded-full transition-all"
            style={{
              width:
                stage === 'create'
                  ? '25%'
                  : stage === 'to-test'
                  ? '50%'
                  : stage === 'review'
                  ? '75%'
                  : '100%',
            }}
          />
        </div>
      </div>

      {/* Stages */}
      {stage === 'create' && (
        <CreateStoryStage
          onSubmit={handleCreateSubmit}
          isLoading={isGenerating}
          sunoCookie={sunoCookie}
          setSunoCookie={(v) => { setSunoCookie(v); if (typeof window !== 'undefined') { if (v) localStorage.setItem('sunoCookie', v); else localStorage.removeItem('sunoCookie'); } }}
          showSunoSettings={showSunoSettings}
          setShowSunoSettings={setShowSunoSettings}
        />
      )}

      {stage === 'to-test' && (
        <StoriesToTestStage
          stories={stories}
          onSelect={handleSelectStory}
          onDelete={async (id) => {
            if (!confirm('Delete this story?')) return;
            await fetch(`/api/asc3/update-story`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ id, status: 'archived' }),
            });
            setStories(stories.filter(s => s.id !== id));
          }}
        />
      )}

      {stage === 'review' && selectedStory && (
        <ReviewEditStage
          story={selectedStory}
          onBack={() => navigateToStage('to-test')}
          onNext={() => navigateToStage('publish', selectedStory?.id)}
          onUpdate={handleUpdateStory}
          sunoCookie={sunoCookie}
        />
      )}

      {stage === 'publish' && selectedStory && (
        <PublishStage
          story={selectedStory}
          onBack={() => navigateToStage('review', selectedStory?.id)}
          onComplete={handlePublishComplete}
        />
      )}
    </div>
  );
}
