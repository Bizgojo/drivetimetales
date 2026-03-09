/*
Story Creation - Complete Workflow
All-in-one page for creating, reviewing, editing, and publishing stories
*/

'use client';

import React, { useState } from 'react';
import { Play, Pause, RotateCcw, Edit2, Save, X, Trash2, Plus, Volume2, Image as ImageIcon } from 'lucide-react';

// ============================================================================
// TYPES & CONSTANTS
// ============================================================================

type Stage = 'create' | 'to-test' | 'review' | 'publish';

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
    description: 'The Father of Modern Horror',
    birth_year: 1809,
    death_year: 1849,
    living: false,
    techniques: 'Gothic atmosphere (crumbling mansions, crypts, storms), unreliable narration (first-person voices that may be mad), psychological obsession (death, beauty, revenge, guilt), musical prose (rhythmic, repetitive), single unified effect',
    audioAdaptation: 'Hypnotic narrator rhythm, gothic ambient sounds, build to single overwhelming moment'
  },
  'Raymond Chandler': {
    name: 'Raymond Chandler',
    description: 'The Voice of Hardboiled Noir',
    birth_year: 1888,
    death_year: 1959,
    living: false,
    techniques: 'Poetic tough-talk (lyrical similes in street-smart cynicism), moral knight hero with personal code, atmospheric place (Los Angeles as character), snappy dialogue with subtext, first-person weariness',
    audioAdaptation: 'World-weary narrator voice, noir ambient sounds, dialogue-heavy scenes'
  },
  'Rod Serling': {
    name: 'Rod Serling',
    description: 'The Master of the Moral Twist',
    birth_year: 1924,
    death_year: 1975,
    living: false,
    techniques: 'Social commentary (science fiction examining prejudice, war, conformity), ironic justice (characters get what they deserve), tight structure, narrator framing, ordinary to extraordinary',
    audioAdaptation: 'Distinctive narrator framing, twist revelation with moral resonance'
  },
  'Neil Gaiman': {
    name: 'Neil Gaiman',
    description: 'The Mythmaker of Modern Fantasy',
    birth_year: 1960,
    death_year: null,
    living: true,
    techniques: 'Mythic resonance (ancient archetypes in contemporary settings), fairy tale logic, wonder and darkness (magic beautiful and dangerous), conversational voice, hidden world (magical underworld)',
    audioAdaptation: 'Warm intimate narrator, blend mundane and magical sounds, fairy tale pacing'
  }
};

interface StoryPrompt {
  id?: string;
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
  status: 'pending' | 'in_review' | 'ready';
  createdAt: string;
  introText?: string;
  outroText?: string;
  coverImageUrl?: string;
  backgroundMusicUrl?: string;
  sfxItems: Array<{ id: string; time: string; description: string }>;
}

// ============================================================================
// STAGE 1: CREATE STORY FORM
// ============================================================================

const CreateStoryStage: React.FC<{
  onSubmit: (prompt: StoryPrompt) => void;
}> = ({ onSubmit }) => {
  const [genres, setGenres] = useState<string[]>([]);
  const [genresLoading, setGenresLoading] = useState(true);
  const authorStyleOptions = Object.keys(AUTHOR_STYLE_PROFILES);
  
  const [form, setForm] = useState<StoryPrompt>({
    title: '',
    primaryGenre: '',
    secondaryGenre1: '',
    secondaryGenre2: '',
    wordCount: 1500,
    series: '',
    episode: '',
    concept: '',
    tone: '',
    authorName: '',
    authorStyle: '',
    targetDestination: 'app',
  });

  // Fetch genres from API
  React.useEffect(() => {
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

  const isValid = form.title && form.primaryGenre && form.wordCount > 0 && form.concept && form.tone && form.authorName && form.authorStyle;
  
  const calculateDuration = (words: number) => {
    const minutes = Math.round(words / 150);
    return `${minutes} min`;
  };

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-black">Create Story</h2>

      {/* Title */}
      <div>
        <label className="block text-sm font-semibold text-black mb-2">Story Title *</label>
        <input
          type="text"
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
          placeholder="e.g., The Last Transmission"
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-black bg-white"
        />
      </div>

      {/* Genres Selection */}
      <div>
        <label className="block text-sm font-semibold text-black mb-2">Primary Genre *</label>
        <select
          value={form.primaryGenre}
          onChange={(e) => setForm({ ...form, primaryGenre: e.target.value })}
          disabled={genresLoading}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-black bg-white disabled:bg-gray-100"
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
            disabled={genresLoading}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-black bg-white disabled:bg-gray-100"
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
            disabled={genresLoading}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-black bg-white disabled:bg-gray-100"
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
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-black bg-white"
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
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-black bg-white"
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-black mb-2">Episode # (optional)</label>
          <input
            type="number"
            value={form.episode}
            onChange={(e) => setForm({ ...form, episode: e.target.value })}
            placeholder="1"
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-black bg-white"
          />
        </div>
      </div>

      {/* Concept */}
      <div>
        <label className="block text-sm font-semibold text-black mb-2">Story Concept *</label>
        <textarea
          value={form.concept}
          onChange={(e) => setForm({ ...form, concept: e.target.value })}
          placeholder="2-3 sentences describing your story..."
          rows={4}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-black bg-white resize-none"
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
              className={`px-3 py-2 rounded text-sm font-medium transition ${
                form.tone === t
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-black hover:bg-gray-200'
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
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-black bg-white"
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-black mb-2">Author Style to Follow *</label>
          <select
            value={form.authorStyle}
            onChange={(e) => setForm({ ...form, authorStyle: e.target.value })}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-black bg-white"
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
        <div className="bg-gradient-to-r from-purple-50 to-blue-50 border border-purple-200 rounded-lg p-4 space-y-2">
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

      <p className="text-sm text-gray-600 bg-blue-50 p-3 rounded border border-blue-200">
        💡 <strong>Note:</strong> Characters will be determined by Claude when writing the script based on the author style and story concept.
      </p>

      {/* Target Destination */}
      <div>
        <label className="block text-sm font-semibold text-black mb-2">Target Destination *</label>
        <select
          value={form.targetDestination}
          onChange={(e) => setForm({ ...form, targetDestination: e.target.value })}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-black bg-white"
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
        disabled={!isValid}
        className={`w-full py-3 rounded-lg font-semibold transition ${
          isValid
            ? 'bg-blue-600 hover:bg-blue-700 text-white'
            : 'bg-gray-300 text-gray-600 cursor-not-allowed'
        }`}
      >
        Generate Story
      </button>
    </div>
  );
};

// ============================================================================
// STAGE 2: STORIES TO TEST
// ============================================================================

const StoriesToTestStage: React.FC<{
  stories: Story[];
  onSelect: (story: Story) => void;
}> = ({ stories, onSelect }) => {
  const calculateDuration = (words: number) => {
    const minutes = Math.round(words / 150);
    return `${minutes} min`;
  };

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-black">Stories To Test</h2>

      {stories.length === 0 ? (
        <div className="bg-blue-50 p-12 rounded-lg text-center border border-blue-200">
          <p className="text-blue-900 font-semibold">No stories yet</p>
          <p className="text-blue-800 text-sm">Create your first story to get started</p>
        </div>
      ) : (
        <div className="space-y-3">
          {stories.map((story) => (
            <button
              key={story.id}
              onClick={() => onSelect(story)}
              className="w-full p-4 bg-white border border-gray-300 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition text-left"
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
                </div>
                <div className="text-right">
                  <span className={`px-2 py-1 rounded text-xs font-medium ${
                    story.status === 'ready' ? 'bg-green-100 text-green-800' :
                    story.status === 'in_review' ? 'bg-blue-100 text-blue-800' :
                    'bg-yellow-100 text-yellow-800'
                  }`}>
                    {story.status === 'ready' ? '✅ Ready' : story.status === 'in_review' ? '🔄 Reviewing' : '⏳ Pending'}
                  </span>
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
// STAGE 3: REVIEW & EDIT
// ============================================================================

const ReviewEditStage: React.FC<{
  story: Story;
  onBack: () => void;
  onNext: () => void;
}> = ({ story, onBack, onNext }) => {
  const [introText, setIntroText] = useState(story.introText || '');
  const [outroText, setOutroText] = useState(story.outroText || '');
  const [editingIntro, setEditingIntro] = useState(false);
  const [editingOutro, setEditingOutro] = useState(false);

  const calculateDuration = (words: number) => {
    const minutes = Math.round(words / 150);
    return `${minutes} min`;
  };

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

      {/* Audio Player */}
      <div className="bg-white p-6 rounded-lg border border-gray-300">
        <h3 className="font-semibold text-black mb-4">Audio Preview</h3>
        <div className="flex gap-2 mb-4">
          {['Intro', 'Story', 'Outro'].map((seg) => (
            <button key={seg} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
              ▶ {seg}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-4">
          <button className="w-12 h-12 rounded-full bg-blue-600 text-white flex items-center justify-center hover:bg-blue-700">
            <Play size={24} />
          </button>
          <div className="flex-1 bg-gray-300 h-2 rounded-full"></div>
          <button className="px-3 py-2 bg-gray-200 text-black rounded hover:bg-gray-300 text-sm font-medium">🔄 Start Over</button>
        </div>
      </div>

      {/* Edit Intro */}
      <div className="bg-white border border-gray-300 rounded-lg p-4">
        <div className="flex items-center justify-between mb-2">
          <h4 className="font-semibold text-black">Edit Intro Text</h4>
          {editingIntro ? (
            <div className="flex gap-2">
              <button onClick={() => setEditingIntro(false)} className="px-2 py-1 bg-blue-600 text-white rounded text-sm">Save</button>
              <button onClick={() => setEditingIntro(false)} className="px-2 py-1 bg-gray-200 text-black rounded text-sm">Cancel</button>
            </div>
          ) : (
            <button onClick={() => setEditingIntro(true)} className="p-1 hover:bg-gray-100 rounded">
              <Edit2 size={16} className="text-black" />
            </button>
          )}
        </div>
        {editingIntro ? (
          <textarea value={introText} onChange={(e) => setIntroText(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded text-black bg-white" rows={3} />
        ) : (
          <p className="text-black">{introText || '(No intro text set)'}</p>
        )}
      </div>

      {/* Edit Outro */}
      <div className="bg-white border border-gray-300 rounded-lg p-4">
        <div className="flex items-center justify-between mb-2">
          <h4 className="font-semibold text-black">Edit Outro Text</h4>
          {editingOutro ? (
            <div className="flex gap-2">
              <button onClick={() => setEditingOutro(false)} className="px-2 py-1 bg-blue-600 text-white rounded text-sm">Save</button>
              <button onClick={() => setEditingOutro(false)} className="px-2 py-1 bg-gray-200 text-black rounded text-sm">Cancel</button>
            </div>
          ) : (
            <button onClick={() => setEditingOutro(true)} className="p-1 hover:bg-gray-100 rounded">
              <Edit2 size={16} className="text-black" />
            </button>
          )}
        </div>
        {editingOutro ? (
          <textarea value={outroText} onChange={(e) => setOutroText(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded text-black bg-white" rows={3} />
        ) : (
          <p className="text-black">{outroText || '(No outro text set)'}</p>
        )}
      </div>

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

  const calculateDuration = (words: number) => {
    const minutes = Math.round(words / 150);
    return `${minutes} min`;
  };

  const toggleDestination = (dest: string) => {
    setDestinations((prev) =>
      prev.includes(dest) ? prev.filter((d) => d !== dest) : [...prev, dest]
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-black">Publish: {story.title}</h2>
          <p className="text-sm text-gray-600 mt-1">
            By {story.authorName} • {story.primaryGenre}
            {story.secondaryGenre1 && ` • ${story.secondaryGenre1}`}
            {story.secondaryGenre2 && ` • ${story.secondaryGenre2}`}
            {' '} • {calculateDuration(story.wordCount)} • {story.wordCount} words
          </p>
        </div>
        <button onClick={onBack} className="px-4 py-2 bg-gray-200 text-black rounded hover:bg-gray-300">← Back</button>
      </div>

      {/* Publish Destinations */}
      <div className="bg-blue-50 border border-blue-300 rounded-lg p-6 space-y-4">
        <h3 className="font-semibold text-blue-900 text-lg">Select Publishing Destinations</h3>

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
                className="w-4 h-4 rounded text-blue-600"
              />
              <span className="text-sm font-medium text-blue-900">{dest.label}</span>
            </label>
          ))}
        </div>

        <button
          onClick={onComplete}
          className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold"
        >
          📤 Publish to {destinations.length} {destinations.length === 1 ? 'Destination' : 'Destinations'}
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

  const handleCreateSubmit = (prompt: StoryPrompt) => {
    const newStory: Story = {
      id: `story_${Date.now()}`,
      title: prompt.title,
      primaryGenre: prompt.primaryGenre,
      secondaryGenre1: prompt.secondaryGenre1,
      secondaryGenre2: prompt.secondaryGenre2,
      wordCount: prompt.wordCount,
      series: prompt.series,
      episode: prompt.episode,
      concept: prompt.concept,
      tone: prompt.tone,
      authorName: prompt.authorName,
      authorStyle: prompt.authorStyle,
      targetDestination: prompt.targetDestination,
      status: 'pending',
      createdAt: new Date().toISOString(),
      sfxItems: [],
    };
    setStories([...stories, newStory]);
    setStage('to-test');
  };

  const handleSelectStory = (story: Story) => {
    setSelectedStory(story);
    setStage('review');
  };

  const handlePublishComplete = () => {
    alert('✅ Story published successfully!');
    setStage('create');
    setSelectedStory(null);
  };

  return (
    <div className="p-6 md:p-10 max-w-4xl mx-auto bg-white">
      {/* Progress Indicator */}
      <div className="mb-8">
        <div className="flex items-center justify-between text-sm font-medium mb-2">
          <div className={stage === 'create' ? 'text-blue-600 font-bold' : 'text-gray-600'}>1. Create</div>
          <div className={stage === 'to-test' ? 'text-blue-600 font-bold' : 'text-gray-600'}>2. Stories</div>
          <div className={stage === 'review' ? 'text-blue-600 font-bold' : 'text-gray-600'}>3. Review</div>
          <div className={stage === 'publish' ? 'text-blue-600 font-bold' : 'text-gray-600'}>4. Publish</div>
        </div>
        <div className="w-full bg-gray-300 rounded-full h-2">
          <div
            className="bg-blue-600 h-2 rounded-full transition-all"
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
      {stage === 'create' && <CreateStoryStage onSubmit={handleCreateSubmit} />}

      {stage === 'to-test' && (
        <StoriesToTestStage
          stories={stories}
          onSelect={handleSelectStory}
        />
      )}

      {stage === 'review' && selectedStory && (
        <ReviewEditStage
          story={selectedStory}
          onBack={() => setStage('to-test')}
          onNext={() => setStage('publish')}
        />
      )}

      {stage === 'publish' && selectedStory && (
        <PublishStage
          story={selectedStory}
          onBack={() => setStage('review')}
          onComplete={handlePublishComplete}
        />
      )}
    </div>
  );
}
