/*
Story Creation - Complete Workflow
All-in-one page for creating, reviewing, editing, and publishing stories
*/

'use client';

import React, { useState } from 'react';
import { Play, Pause, RotateCcw, Edit2, Save, X, Trash2, Plus, Volume2, Image as ImageIcon, ChevronDown, ChevronUp } from 'lucide-react';

// ============================================================================
// TYPES
// ============================================================================

type Stage = 'create' | 'to-test' | 'review' | 'publish';

interface StoryPrompt {
  id?: string;
  title: string;
  genre: string;
  duration: '3-5' | '10-15' | '15-20' | '20-30';
  series: string;
  episode: string;
  concept: string;
  tone: string;
  characters: Array<{ name: string; age: string; gender: string; role: string }>;
  targetDestination: string;
}

interface Story extends StoryPrompt {
  id: string;
  status: 'pending' | 'in_review' | 'ready';
  createdAt: string;
  wordCount: number;
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
  const [form, setForm] = useState<StoryPrompt>({
    title: '',
    genre: '',
    duration: '10-15',
    series: '',
    episode: '',
    concept: '',
    tone: '',
    characters: [{ name: '', age: '', gender: 'M', role: '' }],
    targetDestination: 'app',
  });

  const isValid = form.title && form.genre && form.concept && form.tone && form.characters.some(c => c.name);

  const addCharacter = () => {
    setForm({
      ...form,
      characters: [...form.characters, { name: '', age: '', gender: 'M', role: '' }],
    });
  };

  const updateCharacter = (idx: number, field: string, value: string) => {
    const updated = [...form.characters];
    updated[idx] = { ...updated[idx], [field]: value };
    setForm({ ...form, characters: updated });
  };

  const removeCharacter = (idx: number) => {
    if (form.characters.length > 1) {
      setForm({
        ...form,
        characters: form.characters.filter((_, i) => i !== idx),
      });
    }
  };

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Create Story</h2>

      {/* Title */}
      <div>
        <label className="block text-sm font-semibold mb-2">Story Title *</label>
        <input
          type="text"
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
          placeholder="e.g., The Last Transmission"
          className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Genre & Duration */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-semibold mb-2">Genre *</label>
          <select
            value={form.genre}
            onChange={(e) => setForm({ ...form, genre: e.target.value })}
            className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Select genre</option>
            <option value="Drama">Drama</option>
            <option value="Horror">Horror</option>
            <option value="Sci-Fi">Sci-Fi</option>
            <option value="Mystery">Mystery</option>
            <option value="Comedy">Comedy</option>
            <option value="Heartwarming">Heartwarming</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-semibold mb-2">Duration *</label>
          <select
            value={form.duration}
            onChange={(e) => setForm({ ...form, duration: e.target.value as any })}
            className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="3-5">3-5 min</option>
            <option value="10-15">10-15 min</option>
            <option value="15-20">15-20 min</option>
            <option value="20-30">20-30 min</option>
          </select>
        </div>
      </div>

      {/* Series & Episode */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-semibold mb-2">Series (optional)</label>
          <input
            type="text"
            value={form.series}
            onChange={(e) => setForm({ ...form, series: e.target.value })}
            placeholder="e.g., Future Echoes"
            className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm font-semibold mb-2">Episode # (optional)</label>
          <input
            type="number"
            value={form.episode}
            onChange={(e) => setForm({ ...form, episode: e.target.value })}
            placeholder="1"
            className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* Concept */}
      <div>
        <label className="block text-sm font-semibold mb-2">Story Concept *</label>
        <textarea
          value={form.concept}
          onChange={(e) => setForm({ ...form, concept: e.target.value })}
          placeholder="2-3 sentences describing your story..."
          rows={4}
          className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
        />
      </div>

      {/* Tone */}
      <div>
        <label className="block text-sm font-semibold mb-2">Tone *</label>
        <div className="grid grid-cols-3 gap-2">
          {['Warm', 'Dark', 'Suspenseful', 'Humorous', 'Dramatic', 'Uplifting'].map((t) => (
            <button
              key={t}
              onClick={() => setForm({ ...form, tone: t })}
              className={`px-3 py-2 rounded text-sm font-medium transition ${
                form.tone === t
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Characters */}
      <div>
        <div className="flex justify-between items-center mb-3">
          <label className="block text-sm font-semibold">Characters *</label>
          <button
            onClick={addCharacter}
            className="text-blue-600 text-sm font-medium flex items-center gap-1"
          >
            <Plus size={16} /> Add
          </button>
        </div>

        <div className="space-y-2">
          {form.characters.map((char, idx) => (
            <div key={idx} className="bg-gray-50 p-3 rounded border flex items-end gap-2">
              <div className="flex-1 grid grid-cols-4 gap-2">
                <input
                  placeholder="Name"
                  value={char.name}
                  onChange={(e) => updateCharacter(idx, 'name', e.target.value)}
                  className="px-2 py-1 border rounded text-sm"
                />
                <input
                  placeholder="Age"
                  value={char.age}
                  onChange={(e) => updateCharacter(idx, 'age', e.target.value)}
                  className="px-2 py-1 border rounded text-sm"
                />
                <select
                  value={char.gender}
                  onChange={(e) => updateCharacter(idx, 'gender', e.target.value)}
                  className="px-2 py-1 border rounded text-sm"
                >
                  <option value="M">M</option>
                  <option value="F">F</option>
                  <option value="Other">Other</option>
                </select>
                <input
                  placeholder="Role"
                  value={char.role}
                  onChange={(e) => updateCharacter(idx, 'role', e.target.value)}
                  className="px-2 py-1 border rounded text-sm"
                />
              </div>
              {form.characters.length > 1 && (
                <button
                  onClick={() => removeCharacter(idx)}
                  className="p-1 hover:bg-red-100 rounded text-red-600"
                >
                  <Trash2 size={16} />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Target Destination */}
      <div>
        <label className="block text-sm font-semibold mb-2">Target Destination *</label>
        <select
          value={form.targetDestination}
          onChange={(e) => setForm({ ...form, targetDestination: e.target.value })}
          className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
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
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Stories To Test</h2>

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
              className="w-full p-4 bg-white border rounded-lg hover:border-blue-500 hover:bg-blue-50 transition text-left"
            >
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-semibold text-gray-900">{story.title}</h3>
                  {story.series && <p className="text-sm text-gray-600">{story.series} • Ep {story.episode}</p>}
                  <p className="text-xs text-gray-500 mt-1">{story.genre} • {story.duration} min • {story.wordCount} words</p>
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">{story.title}</h2>
        <button onClick={onBack} className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300">← Back</button>
      </div>

      {/* Audio Player */}
      <div className="bg-gray-50 p-6 rounded-lg border">
        <h3 className="font-semibold mb-4">Audio Preview</h3>
        <div className="flex gap-2 mb-4">
          {['Intro', 'Story', 'Outro'].map((seg) => (
            <button key={seg} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
              ▶ {seg}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-4">
          <button className="w-12 h-12 rounded-full bg-blue-600 text-white flex items-center justify-center">
            <Play size={24} />
          </button>
          <div className="flex-1 bg-gray-300 h-2 rounded-full"></div>
          <button className="px-3 py-2 bg-gray-200 rounded hover:bg-gray-300 text-sm font-medium">🔄 Start Over</button>
        </div>
      </div>

      {/* Edit Intro */}
      <div className="bg-white border rounded-lg p-4">
        <div className="flex items-center justify-between mb-2">
          <h4 className="font-semibold">Edit Intro Text</h4>
          {editingIntro ? (
            <div className="flex gap-2">
              <button onClick={() => setEditingIntro(false)} className="px-2 py-1 bg-blue-600 text-white rounded text-sm">Save</button>
              <button onClick={() => setEditingIntro(false)} className="px-2 py-1 bg-gray-200 rounded text-sm">Cancel</button>
            </div>
          ) : (
            <button onClick={() => setEditingIntro(true)} className="p-1 hover:bg-gray-100 rounded">
              <Edit2 size={16} />
            </button>
          )}
        </div>
        {editingIntro ? (
          <textarea value={introText} onChange={(e) => setIntroText(e.target.value)} className="w-full px-3 py-2 border rounded" rows={3} />
        ) : (
          <p className="text-gray-700">{introText || '(No intro text set)'}</p>
        )}
      </div>

      {/* Edit Outro */}
      <div className="bg-white border rounded-lg p-4">
        <div className="flex items-center justify-between mb-2">
          <h4 className="font-semibold">Edit Outro Text</h4>
          {editingOutro ? (
            <div className="flex gap-2">
              <button onClick={() => setEditingOutro(false)} className="px-2 py-1 bg-blue-600 text-white rounded text-sm">Save</button>
              <button onClick={() => setEditingOutro(false)} className="px-2 py-1 bg-gray-200 rounded text-sm">Cancel</button>
            </div>
          ) : (
            <button onClick={() => setEditingOutro(true)} className="p-1 hover:bg-gray-100 rounded">
              <Edit2 size={16} />
            </button>
          )}
        </div>
        {editingOutro ? (
          <textarea value={outroText} onChange={(e) => setOutroText(e.target.value)} className="w-full px-3 py-2 border rounded" rows={3} />
        ) : (
          <p className="text-gray-700">{outroText || '(No outro text set)'}</p>
        )}
      </div>

      {/* Remove SFX */}
      <div className="bg-white border rounded-lg p-4">
        <h4 className="font-semibold mb-3">Remove SFX</h4>
        {story.sfxItems.length === 0 ? (
          <p className="text-gray-600 text-sm">(No sound effects)</p>
        ) : (
          <div className="space-y-2">
            {story.sfxItems.map((sfx) => (
              <div key={sfx.id} className="flex items-center justify-between p-2 bg-gray-50 rounded border">
                <div>
                  <p className="text-sm font-medium">{sfx.description}</p>
                  <p className="text-xs text-gray-600">{sfx.time}</p>
                </div>
                <button className="p-1 hover:bg-red-100 rounded text-red-600">
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Change Music */}
      <div className="bg-white border rounded-lg p-4">
        <div className="flex items-center justify-between mb-3">
          <h4 className="font-semibold">Background Music</h4>
          {story.backgroundMusicUrl && (
            <button className="p-1 hover:bg-red-100 rounded text-red-600">
              <Trash2 size={16} />
            </button>
          )}
        </div>
        {story.backgroundMusicUrl ? (
          <div className="flex items-center justify-between p-2 bg-blue-50 rounded border border-blue-200">
            <div className="flex items-center gap-2">
              <Volume2 size={16} className="text-blue-600" />
              <span className="text-sm text-blue-900">Music selected</span>
            </div>
            <button className="text-blue-600 text-sm font-medium">Change</button>
          </div>
        ) : (
          <button className="w-full py-3 border-2 border-dashed border-gray-300 rounded text-gray-600 font-medium hover:border-blue-500">
            + Select Music
          </button>
        )}
      </div>

      {/* Cover Image */}
      <div className="bg-white border rounded-lg p-4">
        <h4 className="font-semibold mb-3">Cover Image</h4>
        <div className="w-full aspect-video bg-gray-200 rounded-lg flex items-center justify-center mb-3">
          <ImageIcon size={48} className="text-gray-400" />
        </div>
        <button className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white rounded font-medium">
          Generate New Cover
        </button>
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

  const toggleDestination = (dest: string) => {
    setDestinations((prev) =>
      prev.includes(dest) ? prev.filter((d) => d !== dest) : [...prev, dest]
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Publish: {story.title}</h2>
        <button onClick={onBack} className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300">← Back</button>
      </div>

      {/* Preview */}
      <div className="bg-white border rounded-lg overflow-hidden">
        <div className="w-full h-48 bg-gray-200"></div>
        <div className="p-4">
          <h4 className="font-semibold text-gray-900">{story.title}</h4>
          <p className="text-sm text-gray-600 mt-1">How story appears on landing pages</p>
        </div>
      </div>

      {/* Publish Destinations */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 space-y-4">
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
      ...prompt,
      id: `story_${Date.now()}`,
      status: 'pending',
      createdAt: new Date().toISOString(),
      wordCount: 1500,
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
    <div className="p-6 md:p-10 max-w-4xl mx-auto">
      {/* Progress Indicator */}
      <div className="mb-8">
        <div className="flex items-center justify-between text-sm font-medium mb-2">
          <div className={stage === 'create' ? 'text-blue-600' : 'text-gray-600'}>1. Create</div>
          <div className={stage === 'to-test' ? 'text-blue-600' : 'text-gray-600'}>2. Stories</div>
          <div className={stage === 'review' ? 'text-blue-600' : 'text-gray-600'}>3. Review</div>
          <div className={stage === 'publish' ? 'text-blue-600' : 'text-gray-600'}>4. Publish</div>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2">
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
