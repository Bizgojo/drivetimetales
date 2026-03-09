"""
ASC3 Story Review & Edit
Complete story editing interface with audio controls, text editing, SFX management, and publishing
"""

'use client';

import React, { useState, useRef } from 'react';
import { Play, Pause, RotateCcw, Edit2, Save, X, Trash2, Plus, Volume2, Image as ImageIcon } from 'lucide-react';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

interface Story {
  id: string;
  title: string;
  series?: string;
  episode?: number;
  genre: string;
  duration: string;
  wordCount: number;
  introText?: string;
  outroText?: string;
  coverImageUrl?: string;
  backgroundMusicUrl?: string;
  sfxItems: Array<{
    id: string;
    time: string;
    description: string;
  }>;
  script: string;
}

interface AudioSegment {
  name: 'intro' | 'story' | 'outro';
  url: string;
  label: string;
}

// ============================================================================
// AUDIO PLAYER COMPONENT
// ============================================================================

const AudioPlayer: React.FC<{ segments: AudioSegment[] }> = ({ segments }) => {
  const [currentSegment, setCurrentSegment] = useState<'intro' | 'story' | 'outro'>('story');
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const audioRef = useRef<HTMLAudioElement>(null);

  const activeSegment = segments.find((s) => s.name === currentSegment);

  const togglePlay = () => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        audioRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const handleStartOver = () => {
    if (audioRef.current) {
      audioRef.current.currentTime = 0;
      audioRef.current.play();
      setIsPlaying(true);
    }
  };

  const formatTime = (time: number) => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  return (
    <div className="bg-gray-50 rounded-lg p-6 space-y-4">
      <h3 className="font-semibold text-gray-900">Audio Preview</h3>

      {/* Segment Selector */}
      <div className="flex gap-2">
        {segments.map((seg) => (
          <button
            key={seg.name}
            onClick={() => {
              setCurrentSegment(seg.name);
              setIsPlaying(false);
              if (audioRef.current) {
                audioRef.current.pause();
              }
            }}
            className={`px-4 py-2 rounded-lg font-medium transition ${
              currentSegment === seg.name
                ? 'bg-blue-600 text-white'
                : 'bg-white border border-gray-200 text-gray-700 hover:border-blue-300'
            }`}
          >
            {seg.label}
          </button>
        ))}
      </div>

      {/* Audio Player */}
      {activeSegment && (
        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <button
              onClick={togglePlay}
              className="w-12 h-12 rounded-full bg-blue-600 text-white flex items-center justify-center hover:bg-blue-700 transition flex-shrink-0"
            >
              {isPlaying ? <Pause size={24} /> : <Play size={24} />}
            </button>

            <div className="flex-1 space-y-2">
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-blue-600 h-2 rounded-full transition-all"
                  style={{
                    width: duration > 0 ? `${(currentTime / duration) * 100}%` : '0%',
                  }}
                />
              </div>
              <div className="flex justify-between text-sm text-gray-600">
                <span>{formatTime(currentTime)}</span>
                <span>{formatTime(duration)}</span>
              </div>
            </div>

            <button
              onClick={handleStartOver}
              className="px-3 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg transition flex items-center gap-2 text-sm font-medium"
            >
              <RotateCcw size={16} />
              Start Over
            </button>
          </div>

          <audio
            ref={audioRef}
            src={activeSegment.url}
            onTimeUpdate={() => audioRef.current && setCurrentTime(audioRef.current.currentTime)}
            onLoadedMetadata={() => audioRef.current && setDuration(audioRef.current.duration)}
            onEnded={() => setIsPlaying(false)}
          />
        </div>
      )}
    </div>
  );
};

// ============================================================================
// TEXT EDITOR COMPONENT
// ============================================================================

const TextEditor: React.FC<{
  title: string;
  value: string;
  onChange: (value: string) => void;
  onSave: () => void;
}> = ({ title, value, onChange, onSave }) => {
  const [isEditing, setIsEditing] = useState(false);

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <div className="flex items-center justify-between mb-3">
        <h4 className="font-semibold text-gray-900">{title}</h4>
        {isEditing ? (
          <div className="flex gap-2">
            <button
              onClick={() => {
                onSave();
                setIsEditing(false);
              }}
              className="px-3 py-1 bg-blue-600 text-white rounded text-sm font-medium hover:bg-blue-700 transition"
            >
              Save
            </button>
            <button
              onClick={() => setIsEditing(false)}
              className="px-3 py-1 bg-gray-200 text-gray-700 rounded text-sm font-medium hover:bg-gray-300 transition"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            onClick={() => setIsEditing(true)}
            className="p-1 hover:bg-gray-100 rounded transition"
          >
            <Edit2 size={16} className="text-gray-600" />
          </button>
        )}
      </div>

      {isEditing ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
          rows={3}
        />
      ) : (
        <p className="text-gray-700">{value || '(No text set)'}</p>
      )}
    </div>
  );
};

// ============================================================================
// SFX MANAGEMENT
// ============================================================================

const SFXManager: React.FC<{
  sfxItems: Story['sfxItems'];
  onRemove: (id: string) => void;
}> = ({ sfxItems, onRemove }) => {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4 space-y-3">
      <h4 className="font-semibold text-gray-900">Sound Effects (SFX)</h4>

      {sfxItems.length === 0 ? (
        <p className="text-gray-600 text-sm">(No sound effects)</p>
      ) : (
        <div className="space-y-2">
          {sfxItems.map((sfx) => (
            <div key={sfx.id} className="flex items-center justify-between p-3 bg-gray-50 rounded border border-gray-200">
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-900">{sfx.description}</p>
                <p className="text-xs text-gray-600">{sfx.time}</p>
              </div>
              <button
                onClick={() => onRemove(sfx.id)}
                className="p-1 hover:bg-red-100 rounded transition text-red-600"
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ============================================================================
// MUSIC SELECTION
// ============================================================================

const MusicSelector: React.FC<{
  currentMusic?: string;
  onSelect: (musicUrl: string) => void;
  onDelete: () => void;
}> = ({ currentMusic, onSelect, onDelete }) => {
  const [showSelector, setShowSelector] = useState(false);

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="font-semibold text-gray-900">Background Music</h4>
        {currentMusic && (
          <button
            onClick={onDelete}
            className="p-1 hover:bg-red-100 rounded transition text-red-600"
            title="Delete music"
          >
            <Trash2 size={16} />
          </button>
        )}
      </div>

      {currentMusic ? (
        <div className="p-3 bg-blue-50 border border-blue-200 rounded flex items-center gap-2 justify-between">
          <div className="flex items-center gap-2">
            <Volume2 size={16} className="text-blue-600" />
            <span className="text-sm font-medium text-blue-900">Music selected</span>
          </div>
          <button
            onClick={() => setShowSelector(true)}
            className="text-blue-600 hover:text-blue-700 text-sm font-medium"
          >
            Change
          </button>
        </div>
      ) : (
        <button
          onClick={() => setShowSelector(true)}
          className="w-full py-3 border-2 border-dashed border-gray-300 rounded-lg text-gray-600 hover:border-blue-500 hover:text-blue-600 font-medium transition flex items-center justify-center gap-2"
        >
          <Plus size={16} />
          Select Music
        </button>
      )}

      {showSelector && (
        <div className="bg-gray-50 p-4 rounded-lg space-y-2 text-sm">
          <p className="text-gray-700 font-medium">Available Music:</p>
          <button
            onClick={() => {
              onSelect('https://example.com/music1.mp3');
              setShowSelector(false);
            }}
            className="w-full p-2 text-left bg-white border border-gray-200 rounded hover:bg-blue-50 transition"
          >
            🎵 Warm Welcome
          </button>
          <button
            onClick={() => {
              onSelect('https://example.com/music2.mp3');
              setShowSelector(false);
            }}
            className="w-full p-2 text-left bg-white border border-gray-200 rounded hover:bg-blue-50 transition"
          >
            🎵 Dramatic Strings
          </button>
          <p className="text-gray-500 text-xs mt-2">💡 More music options coming soon</p>
        </div>
      )}
    </div>
  );
};

// ============================================================================
// COVER IMAGE SELECTOR
// ============================================================================

const CoverImageSelector: React.FC<{
  currentImage?: string;
  storyTitle: string;
  onGenerate: () => void;
}> = ({ currentImage, storyTitle, onGenerate }) => {
  const [isGenerating, setIsGenerating] = useState(false);

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4 space-y-3">
      <h4 className="font-semibold text-gray-900">Cover Image</h4>

      <div className="w-full aspect-video bg-gradient-to-br from-gray-200 to-gray-300 rounded-lg flex items-center justify-center overflow-hidden">
        {currentImage ? (
          <img src={currentImage} alt={storyTitle} className="w-full h-full object-cover" />
        ) : (
          <div className="text-gray-400">
            <ImageIcon size={48} />
          </div>
        )}
      </div>

      <button
        onClick={onGenerate}
        disabled={isGenerating}
        className="w-full py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded-lg font-medium transition"
      >
        {isGenerating ? 'Generating...' : 'Generate New Cover'}
      </button>
    </div>
  );
};

// ============================================================================
// PUBLISHING SECTION
// ============================================================================

const PublishingSection: React.FC<{ storyId: string }> = ({ storyId }) => {
  const [selectedDestinations, setSelectedDestinations] = useState<string[]>(['app']);

  const destinations = [
    { id: 'app', label: '📚 App Library' },
    { id: 'for-households', label: '🏠 For Households' },
    { id: 'for-fitness', label: '💪 For Fitness' },
    { id: 'for-commuters', label: '🚗 For Commuters' },
    { id: 'for-audio-dramas', label: '🎭 For Audio Dramas' },
  ];

  const toggleDestination = (id: string) => {
    setSelectedDestinations((prev) =>
      prev.includes(id) ? prev.filter((d) => d !== id) : [...prev, id]
    );
  };

  return (
    <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 space-y-4">
      <h3 className="font-semibold text-blue-900 text-lg">Publish Story</h3>

      <div className="space-y-2">
        <p className="text-sm text-blue-800">Select destinations:</p>
        <div className="space-y-2">
          {destinations.map((dest) => (
            <label key={dest.id} className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={selectedDestinations.includes(dest.id)}
                onChange={() => toggleDestination(dest.id)}
                className="w-4 h-4 rounded text-blue-600"
              />
              <span className="text-sm font-medium text-blue-900">{dest.label}</span>
            </label>
          ))}
        </div>
      </div>

      <button className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold transition">
        📤 Publish to {selectedDestinations.length} {selectedDestinations.length === 1 ? 'Destination' : 'Destinations'}
      </button>
    </div>
  );
};

// ============================================================================
// MAIN STORY REVIEW PAGE
// ============================================================================

interface StoryReviewPageProps {
  storyId: string;
  initialStory: Story;
}

export default function StoryReviewPage({ storyId, initialStory }: StoryReviewPageProps) {
  const [story, setStory] = useState<Story>(initialStory);
  const [introText, setIntroText] = useState(initialStory.introText || '');
  const [outroText, setOutroText] = useState(initialStory.outroText || '');

  const audioSegments: AudioSegment[] = [
    { name: 'intro', url: 'https://example.com/intro.mp3', label: 'Intro (1:45)' },
    { name: 'story', url: 'https://example.com/story.mp3', label: `Story (${story.duration})` },
    { name: 'outro', url: 'https://example.com/outro.mp3', label: 'Outro (1:45)' },
  ];

  const handleRemoveSFX = (sfxId: string) => {
    setStory((prev) => ({
      ...prev,
      sfxItems: prev.sfxItems.filter((s) => s.id !== sfxId),
    }));
  };

  const handleSaveIntro = () => {
    // Save to database
    console.log('Saving intro:', introText);
  };

  const handleSaveOutro = () => {
    // Save to database
    console.log('Saving outro:', outroText);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-4xl font-bold text-gray-900">{story.title}</h1>
          {story.series && (
            <p className="text-gray-600 mt-1">
              {story.series} {story.episode && `• Episode ${story.episode}`}
            </p>
          )}
        </div>
        <div className="text-right">
          <p className="text-sm text-gray-600">{story.genre}</p>
          <p className="text-sm text-gray-600">{story.wordCount} words</p>
        </div>
      </div>

      {/* Audio Player */}
      <AudioPlayer segments={audioSegments} />

      {/* Two Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Editing */}
        <div className="lg:col-span-2 space-y-6">
          {/* Intro Text */}
          <TextEditor
            title="Edit Intro Text"
            value={introText}
            onChange={setIntroText}
            onSave={handleSaveIntro}
          />

          {/* Outro Text */}
          <TextEditor
            title="Edit Outro Text"
            value={outroText}
            onChange={setOutroText}
            onSave={handleSaveOutro}
          />

          {/* SFX Manager */}
          <SFXManager sfxItems={story.sfxItems} onRemove={handleRemoveSFX} />

          {/* Music Selector */}
          <MusicSelector
            currentMusic={story.backgroundMusicUrl}
            onSelect={(url) => setStory((prev) => ({ ...prev, backgroundMusicUrl: url }))}
            onDelete={() => setStory((prev) => ({ ...prev, backgroundMusicUrl: undefined }))}
          />
        </div>

        {/* Right Column - Preview & Publishing */}
        <div className="space-y-6">
          {/* Cover Image */}
          <CoverImageSelector
            currentImage={story.coverImageUrl}
            storyTitle={story.title}
            onGenerate={() => console.log('Generate new cover')}
          />

          {/* Story Card Preview */}
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <div className="w-full h-48 bg-gradient-to-br from-gray-200 to-gray-300">
              {story.coverImageUrl && (
                <img
                  src={story.coverImageUrl}
                  alt={story.title}
                  className="w-full h-full object-cover"
                />
              )}
            </div>
            <div className="p-4">
              <h4 className="font-semibold text-gray-900 line-clamp-2">{story.title}</h4>
              <p className="text-sm text-gray-600 mt-2">How story appears on landing pages</p>
            </div>
          </div>

          {/* Publishing */}
          <PublishingSection storyId={storyId} />
        </div>
      </div>
    </div>
  );
}
