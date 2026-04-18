'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// ============================================================================
// TYPE DEFINITIONS  
// ============================================================================

interface PremiseData {
  genre: string
  authorStyle: string
  runtime: string
  storyType: 'single' | 'series'
  seriesEpisodeCount?: number
  premise: string
  setting: string
  sfxEnabled: boolean
  additionalNotes?: string
}

interface StoryOption {
  id: string
  title: string
  hook: string
  plotSummary: string
  endingConclusion: string
  estimatedGrade: number
  musicPrompt: string
  sfxPlacements: SFXPlacement[]
  episodes?: SeriesEpisode[] // For series stories
}

interface SeriesEpisode {
  episodeNumber: number
  episodeTitle: string
  hook: string
  plotSummary: string
  cliffhanger?: string // Empty for finale episodes
}

interface SFXPlacement {
  id: string
  lineNumber: number
  description: string
  sfxType: 'environmental' | 'action' | 'atmospheric'
  enabled: boolean
  audioNote: string
}

interface QueueStory {
  id: string
  title: string
  author: string
  genre: string
  storyType: 'single' | 'series'
  episodeCount?: number
  status: 'generating_options' | 'awaiting_selection' | 'generating_script' | 'ready_for_review' | 'rewriting' | 'production_ready'
  script?: string
  grade?: GradingResult
  sfxPlacements?: SFXPlacement[]
  options?: StoryOption[]
  selectedOption?: string
  createdAt: string
}

interface GradingResult {
  total: number
  hook: number
  listenability: number
  dialogue: number
  clarity: number
  pacing: number
  audio: number
  topFixes: string[]
  policyPass: boolean
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function StoryProductionPage() {
  const [currentView, setCurrentView] = useState<'premise' | 'options' | 'queue'>('premise')
  const [queueStories, setQueueStories] = useState<QueueStory[]>([])
  const [selectedStory, setSelectedStory] = useState<QueueStory | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadingMessage, setLoadingMessage] = useState('')

  // Load existing queue stories on mount
  useEffect(() => {
    loadQueueStories()
  }, [])

  async function loadQueueStories() {
    try {
      const { data, error } = await supabase
        .from('stories')
        .select('*')
        .in('status', ['generating_options', 'awaiting_selection', 'generating_script', 'ready_for_review', 'rewriting'])
        .order('created_at', { ascending: false })
        .limit(50)

      if (error) throw error

      const mappedStories: QueueStory[] = (data || []).map(story => ({
        id: story.id,
        title: story.title || 'Generating...',
        author: story.author || 'Unknown',
        genre: story.genre || 'Drama',
        storyType: story.story_type || 'single',
        episodeCount: story.episode_count,
        status: story.status || 'generating_options',
        script: story.script_text,
        grade: story.grading_result,
        sfxPlacements: story.sfx_settings || [],
        options: story.options,
        selectedOption: story.selected_option_id,
        createdAt: story.created_at
      }))

      setQueueStories(mappedStories)
    } catch (error) {
      console.error('Error loading queue stories:', error)
    }
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#FAF9F6', color: '#000000' }}>
      <div className="container mx-auto px-4 py-6">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-black mb-2">
            Story Production System v4.0
          </h1>
          <p className="text-gray-700">
            Claude-powered story creation: Premise → Options → Script → Grade → Publish
          </p>
        </div>

        {/* Navigation Tabs */}
        <nav className="border-b border-gray-300 mb-8">
          <div className="flex space-x-8">
            <TabButton
              active={currentView === 'premise'}
              onClick={() => setCurrentView('premise')}
            >
              PREMISE PICKER
            </TabButton>
            <TabButton
              active={currentView === 'options'}
              onClick={() => setCurrentView('options')}
            >
              STORY OPTIONS
            </TabButton>
            <TabButton
              active={currentView === 'queue'}
              onClick={() => setCurrentView('queue')}
            >
              PRODUCTION QUEUE ({queueStories.length})
            </TabButton>
          </div>
        </nav>

        {/* Content Views */}
        {currentView === 'premise' && (
          <PremisePickerView
            onSubmit={handlePremiseSubmit}
            loading={loading}
            loadingMessage={loadingMessage}
          />
        )}

        {currentView === 'options' && (
          <StoryOptionsView
            stories={queueStories.filter(s => s.status === 'awaiting_selection')}
            onSelectOption={handleOptionSelection}
            loading={loading}
          />
        )}

        {currentView === 'queue' && (
          <QueueView
            stories={queueStories}
            selectedStory={selectedStory}
            onSelectStory={setSelectedStory}
            onRewrite={handleRewrite}
            onApprove={handleApprove}
            onReject={handleReject}
            loading={loading}
          />
        )}

        {/* Loading Overlay */}
        {loading && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white p-6 rounded-lg border border-gray-300">
              <div className="flex items-center space-x-3">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-orange-500"></div>
                <span className="text-black">{loadingMessage || 'Processing...'}</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )

  // =============================================================================
  // EVENT HANDLERS
  // =============================================================================

  async function handlePremiseSubmit(premise: PremiseData) {
    setLoading(true)
    setLoadingMessage('Claude is generating 3 story options...')

    try {
      // Create new story record
      const { data: storyData, error: storyError } = await supabase
        .from('stories')
        .insert({
          title: 'Generating...',
          author: premise.authorStyle.split(' (')[0],
          genre: premise.genre,
          status: 'generating_options',
          premise_data: premise,
          story_type: premise.storyType,
          episode_count: premise.seriesEpisodeCount,
          created_at: new Date().toISOString()
        })
        .select()
        .single()

      if (storyError) throw storyError

      const newStory: QueueStory = {
        id: storyData.id,
        title: 'Generating...',
        author: premise.authorStyle.split(' (')[0],
        genre: premise.genre,
        storyType: premise.storyType,
        episodeCount: premise.seriesEpisodeCount,
        status: 'generating_options',
        createdAt: storyData.created_at
      }

      setQueueStories(prev => [newStory, ...prev])

      // Generate story options via Claude API
      const options = await generateStoryOptions(premise)

      // Update story with options
      const { error: updateError } = await supabase
        .from('stories')
        .update({
          status: 'awaiting_selection',
          options: options
        })
        .eq('id', storyData.id)

      if (updateError) throw updateError

      // Update local state
      setQueueStories(prev => prev.map(story =>
        story.id === storyData.id
          ? { ...story, options, status: 'awaiting_selection' }
          : story
      ))

      setCurrentView('options')
    } catch (error) {
      console.error('Error generating options:', error)
      alert('Failed to generate story options. Please try again.')
    } finally {
      setLoading(false)
      setLoadingMessage('')
    }
  }

  async function handleOptionSelection(storyId: string, optionId: string) {
    setLoading(true)
    setLoadingMessage('Claude is writing the full script...')

    try {
      // Update story status
      const { error: updateError } = await supabase
        .from('stories')
        .update({
          status: 'generating_script',
          selected_option_id: optionId
        })
        .eq('id', storyId)

      if (updateError) throw updateError

      // Update local state
      setQueueStories(prev => prev.map(story =>
        story.id === storyId
          ? { ...story, selectedOption: optionId, status: 'generating_script' }
          : story
      ))

      setCurrentView('queue')

      // Generate script from selected option
      const story = queueStories.find(s => s.id === storyId)
      const option = story?.options?.find(o => o.id === optionId)
      
      if (!story || !option) throw new Error('Story or option not found')

      const result = await generateScript(option, story)
      const grade = await gradeScript(result.script)

      // Update story with script and grade
      const { error: finalUpdateError } = await supabase
        .from('stories')
        .update({
          title: result.title,
          script_text: result.script,
          grading_result: grade,
          sfx_settings: option.sfxPlacements,
          status: 'ready_for_review'
        })
        .eq('id', storyId)

      if (finalUpdateError) throw finalUpdateError

      // Update local state
      setQueueStories(prev => prev.map(s =>
        s.id === storyId
          ? {
              ...s,
              title: result.title,
              script: result.script,
              grade,
              sfxPlacements: option.sfxPlacements,
              status: 'ready_for_review'
            }
          : s
      ))

    } catch (error) {
      console.error('Error generating script:', error)
      alert('Failed to generate script. Please try again.')
    } finally {
      setLoading(false)
      setLoadingMessage('')
    }
  }

  async function handleRewrite(storyId: string) {
    const story = queueStories.find(s => s.id === storyId)
    if (!story || !story.script || !story.grade?.topFixes) return

    setLoading(true)
    setLoadingMessage('Claude is applying improvements...')

    try {
      // Update status
      const { error: statusError } = await supabase
        .from('stories')
        .update({ status: 'rewriting' })
        .eq('id', storyId)

      if (statusError) throw statusError

      setQueueStories(prev => prev.map(s =>
        s.id === storyId ? { ...s, status: 'rewriting' } : s
      ))

      // Apply fixes
      const improvedScript = await applyTopFixes(story.script, story.grade.topFixes)
      const newGrade = await gradeScript(improvedScript)

      // Update with improved script
      const { error: updateError } = await supabase
        .from('stories')
        .update({
          script_text: improvedScript,
          grading_result: newGrade,
          status: 'ready_for_review'
        })
        .eq('id', storyId)

      if (updateError) throw updateError

      setQueueStories(prev => prev.map(s =>
        s.id === storyId
          ? { ...s, script: improvedScript, grade: newGrade, status: 'ready_for_review' }
          : s
      ))

    } catch (error) {
      console.error('Error applying fixes:', error)
      alert('Failed to apply improvements.')
    } finally {
      setLoading(false)
      setLoadingMessage('')
    }
  }

  async function handleApprove(storyId: string) {
    setLoading(true)
    setLoadingMessage('Publishing story...')

    try {
      const { error } = await supabase
        .from('stories')
        .update({ 
          status: 'production_ready',
          is_hidden: false,
          published_on: new Date().toISOString()
        })
        .eq('id', storyId)

      if (error) throw error

      setQueueStories(prev => prev.map(story =>
        story.id === storyId ? { ...story, status: 'production_ready' } : story
      ))

      alert('Story approved and published!')
    } catch (error) {
      console.error('Error approving story:', error)
      alert('Failed to approve story.')
    } finally {
      setLoading(false)
      setLoadingMessage('')
    }
  }

  async function handleReject(storyId: string) {
    try {
      const { error } = await supabase
        .from('stories')
        .update({ is_hidden: true })
        .eq('id', storyId)

      if (error) throw error

      setQueueStories(prev => prev.filter(story => story.id !== storyId))
    } catch (error) {
      console.error('Error rejecting story:', error)
      alert('Failed to reject story.')
    }
  }
}

// =============================================================================
// PREMISE PICKER COMPONENT
// =============================================================================

function PremisePickerView({
  onSubmit,
  loading,
  loadingMessage
}: {
  onSubmit: (premise: PremiseData) => void
  loading: boolean
  loadingMessage: string
}) {
  const [formData, setFormData] = useState<PremiseData>({
    genre: '',
    authorStyle: '',
    runtime: '15min',
    storyType: 'single',
    premise: '',
    setting: '',
    sfxEnabled: false
  })

  const [authors, setAuthors] = useState<Array<{id: string; name: string; primary_genre: string}>>([])
  const [availableAuthors, setAvailableAuthors] = useState<Array<{id: string; name: string; primary_genre: string}>>([])

  const genres = [
    'Horror', 'Mystery/Crime', 'Thriller', 'Romance', 'Sci-Fi',
    'Western', 'Comedy', 'Drama', 'Adventure', 'Family/Heartwarming'
  ]

  // Load authors on mount
  useEffect(() => {
    loadAuthors()
  }, [])

  // Filter authors when genre changes
  useEffect(() => {
    if (formData.genre) {
      const filtered = authors.filter(author => 
        author.primary_genre === formData.genre
      )
      setAvailableAuthors(filtered)
      // Reset author selection when genre changes
      setFormData(prev => ({ ...prev, authorStyle: '' }))
    }
  }, [formData.genre, authors])

  async function loadAuthors() {
    try {
      const { data, error } = await supabase
        .from('authors')
        .select('id, name, primary_genre')
        .order('name')

      if (error) throw error
      setAuthors(data || [])
    } catch (error) {
      console.error('Error loading authors:', error)
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSubmit(formData)
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div style={{ backgroundColor: '#ffffff', border: '1px solid #000000' }} className="rounded-lg p-8">
        <h2 className="text-2xl font-bold mb-4 text-black">Story Premise Picker</h2>
        <p className="text-gray-700 mb-8">
          Define your story concept - Claude will generate 3 options for your approval
        </p>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Basic Settings */}
          <div className="grid grid-cols-2 gap-6">
            <FormField label="Genre *">
              <select
                style={{ backgroundColor: '#ffffff', border: '1px solid #000000', color: '#000000' }}
                className="w-full p-3 rounded"
                value={formData.genre}
                onChange={(e) => setFormData({ ...formData, genre: e.target.value })}
                required
              >
                <option value="">Select Genre</option>
                {genres.map(genre => (
                  <option key={genre} value={genre}>{genre}</option>
                ))}
              </select>
            </FormField>

            <FormField label="Author Style *">
              <select
                style={{ backgroundColor: '#ffffff', border: '1px solid #000000', color: '#000000' }}
                className="w-full p-3 rounded"
                value={formData.authorStyle}
                onChange={(e) => setFormData({ ...formData, authorStyle: e.target.value })}
                required
                disabled={!formData.genre}
              >
                <option value="">
                  {formData.genre ? 'Select Author' : 'Select Genre First'}
                </option>
                {availableAuthors.map(author => (
                  <option key={author.id} value={author.name}>
                    {author.name}
                  </option>
                ))}
              </select>
              {formData.genre && availableAuthors.length === 0 && (
                <p className="text-sm text-red-600 mt-1">
                  No authors available for {formData.genre}
                </p>
              )}
            </FormField>
          </div>

          {/* Story Type Selection */}
          <FormField label="Story Type *">
            <div className="flex space-x-4">
              {(['single', 'series'] as const).map(type => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setFormData({ ...formData, storyType: type, seriesEpisodeCount: type === 'series' ? 3 : undefined })}
                  style={{
                    backgroundColor: formData.storyType === type ? '#f97316' : '#ffffff',
                    color: formData.storyType === type ? '#ffffff' : '#000000',
                    border: '1px solid #000000'
                  }}
                  className="px-6 py-3 rounded font-medium"
                >
                  {type === 'single' ? 'Single Episode' : 'Series'}
                </button>
              ))}
            </div>
          </FormField>

          {/* Series Episode Count - Only show if Series is selected */}
          {formData.storyType === 'series' && (
            <FormField label="Number of Episodes *">
              <div className="flex space-x-4 flex-wrap">
                {([3, 4, 5, 6, 7, 8] as const).map(count => (
                  <button
                    key={count}
                    type="button"
                    onClick={() => setFormData({ ...formData, seriesEpisodeCount: count })}
                    style={{
                      backgroundColor: formData.seriesEpisodeCount === count ? '#f97316' : '#ffffff',
                      color: formData.seriesEpisodeCount === count ? '#ffffff' : '#000000',
                      border: '1px solid #000000'
                    }}
                    className="px-4 py-2 rounded font-medium mb-2"
                  >
                    {count} Episodes
                  </button>
                ))}
              </div>
            </FormField>
          )}

          {/* Runtime */}
          <FormField label="Target Runtime *">
            <div className="flex space-x-4">
              {(['10min', '15min', '20min', '25min'] as const).map(runtime => (
                <button
                  key={runtime}
                  type="button"
                  onClick={() => setFormData({ ...formData, runtime })}
                  style={{
                    backgroundColor: formData.runtime === runtime ? '#f97316' : '#ffffff',
                    color: formData.runtime === runtime ? '#ffffff' : '#000000',
                    border: '1px solid #000000'
                  }}
                  className="px-6 py-3 rounded font-medium"
                >
                  {runtime}
                </button>
              ))}
            </div>
          </FormField>

          {/* Story Content */}
          <FormField label="Core Premise *">
            <textarea
              style={{ backgroundColor: '#ffffff', border: '1px solid #000000', color: '#000000' }}
              className="w-full p-3 rounded h-24 resize-vertical"
              placeholder="2-4 sentences: Who is the protagonist? What do they want? What's standing in their way? What's at stake?"
              value={formData.premise}
              onChange={(e) => setFormData({ ...formData, premise: e.target.value })}
              required
            />
          </FormField>

          <FormField label="Setting *">
            <input
              type="text"
              style={{ backgroundColor: '#ffffff', border: '1px solid #000000', color: '#000000' }}
              className="w-full p-3 rounded"
              placeholder="Time period, location, key environmental details"
              value={formData.setting}
              onChange={(e) => setFormData({ ...formData, setting: e.target.value })}
              required
            />
          </FormField>

          {/* SFX Toggle */}
          <FormField label="Sound Effects">
            <div className="flex space-x-6">
              <label className="flex items-center text-black">
                <input
                  type="radio"
                  name="sfx"
                  checked={!formData.sfxEnabled}
                  onChange={() => setFormData({ ...formData, sfxEnabled: false })}
                  className="mr-2"
                />
                No SFX (voice and music only)
              </label>
              <label className="flex items-center text-black">
                <input
                  type="radio"
                  name="sfx"
                  checked={formData.sfxEnabled}
                  onChange={() => setFormData({ ...formData, sfxEnabled: true })}
                  className="mr-2"
                />
                Include SFX (will be reviewable)
              </label>
            </div>
          </FormField>

          {/* Additional Notes */}
          <FormField label="Additional Notes (Optional)">
            <textarea
              style={{ backgroundColor: '#ffffff', border: '1px solid #000000', color: '#000000' }}
              className="w-full p-3 rounded h-20 resize-vertical"
              placeholder="Any specific requirements, themes, or constraints..."
              value={formData.additionalNotes || ''}
              onChange={(e) => setFormData({ ...formData, additionalNotes: e.target.value })}
            />
          </FormField>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading || !formData.genre || !formData.authorStyle || !formData.premise || !formData.setting}
            style={{
              backgroundColor: loading ? '#6474bc' : '#f97316',
              color: '#ffffff',
              border: 'none'
            }}
            className="w-full py-4 px-6 rounded font-bold text-lg hover:bg-orange-600 disabled:cursor-not-allowed"
          >
            {loading ? loadingMessage || 'PROCESSING...' : 'GENERATE STORY OPTIONS'}
          </button>

          {/* Workflow Info */}
          <div style={{ backgroundColor: '#f3f4f6', border: '1px solid #000000' }} className="p-4 rounded mt-6">
            <p className="text-sm text-black">
              <strong>Next Step:</strong> Claude will generate 3 story structure options showing hook, plot development, and ending conclusions. You'll select one and it will automatically enter the production queue.
            </p>
          </div>
        </form>
      </div>
    </div>
  )
}

// =============================================================================
// STORY OPTIONS COMPONENT
// =============================================================================

function StoryOptionsView({
  stories,
  onSelectOption,
  loading
}: {
  stories: QueueStory[]
  onSelectOption: (storyId: string, optionId: string) => void
  loading: boolean
}) {
  if (stories.length === 0) {
    return (
      <div className="max-w-4xl mx-auto">
        <div style={{ backgroundColor: '#ffffff', border: '1px solid #000000' }} className="rounded-lg p-8 text-center">
          <p className="text-black text-lg">
            No story options awaiting selection.
          </p>
          <p className="text-gray-600 mt-2">
            Create a new story in the Premise Picker to see options here.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      {stories.map(story => (
        <div key={story.id} style={{ backgroundColor: '#ffffff', border: '1px solid #000000' }} className="rounded-lg">
          <div className="p-6 border-b border-gray-300">
            <h2 className="text-xl font-bold text-black">{story.author} • {story.genre}</h2>
            <p className="text-gray-700">Choose your preferred story structure:</p>
          </div>
          
          <div className="p-6 space-y-6">
            {story.options?.map(option => (
              <OptionCard
                key={option.id}
                option={option}
                onSelect={() => onSelectOption(story.id, option.id)}
                disabled={loading}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function OptionCard({
  option,
  onSelect,
  disabled
}: {
  option: StoryOption
  onSelect: () => void
  disabled: boolean
}) {
  return (
    <div style={{ border: '1px solid #000000' }} className="rounded-lg p-4 hover:border-orange-500 transition-colors">
      <div className="flex justify-between items-start mb-4">
        <h3 className="text-lg font-semibold text-black">{option.title}</h3>
        <span style={{ backgroundColor: '#f3f4f6', border: '1px solid #000000' }} className="text-sm px-2 py-1 rounded text-black">
          Est: {option.estimatedGrade}/25
        </span>
      </div>
      
      <div className="space-y-3 text-black mb-4">
        <div>
          <strong className="text-orange-600">Opening Hook:</strong>
          <p className="mt-1">{option.hook}</p>
        </div>
        
        {/* Series Episodes Display */}
        {option.episodes ? (
          <div>
            <strong className="text-orange-600">Episode Structure ({option.episodes.length} episodes):</strong>
            <div className="mt-2 space-y-2">
              {option.episodes.map((episode, index) => (
                <div key={episode.episodeNumber} style={{ backgroundColor: '#f9fafb', border: '1px solid #e5e7eb' }} className="p-3 rounded">
                  <div className="font-medium text-black">
                    Episode {episode.episodeNumber}: {episode.episodeTitle}
                  </div>
                  <p className="text-sm text-gray-700 mt-1">{episode.plotSummary}</p>
                  {episode.cliffhanger && (
                    <p className="text-sm text-orange-600 mt-1">
                      <strong>Cliffhanger:</strong> {episode.cliffhanger}
                    </p>
                  )}
                  {index === option.episodes.length - 1 && !episode.cliffhanger && (
                    <p className="text-sm text-green-600 mt-1">
                      <strong>Finale:</strong> Complete resolution and satisfaction
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        ) : (
          <>
            <div>
              <strong className="text-orange-600">Plot Development:</strong>
              <p className="mt-1">{option.plotSummary}</p>
            </div>
            
            <div>
              <strong className="text-orange-600">Ending Conclusion:</strong>
              <p className="mt-1">{option.endingConclusion}</p>
            </div>
          </>
        )}

        {option.sfxPlacements.length > 0 && (
          <div>
            <strong className="text-orange-600">SFX Preview:</strong>
            <div className="mt-1 flex flex-wrap gap-2">
              {option.sfxPlacements.slice(0, 3).map(sfx => (
                <span key={sfx.id} style={{ backgroundColor: '#f3f4f6', border: '1px solid #000000' }} className="text-xs px-2 py-1 rounded text-black">
                  {sfx.description}
                </span>
              ))}
              {option.sfxPlacements.length > 3 && (
                <span className="text-xs text-gray-600">
                  +{option.sfxPlacements.length - 3} more
                </span>
              )}
            </div>
          </div>
        )}
      </div>
     
      <button
        onClick={onSelect}
        disabled={disabled}
        style={{
          backgroundColor: disabled ? '#6474bc' : '#f97316',
          color: '#ffffff',
          border: 'none'
        }}
        className="w-full py-3 px-4 rounded font-medium hover:bg-orange-600 disabled:cursor-not-allowed"
      >
        {disabled ? 'PROCESSING...' : `SELECT THIS ${option.episodes ? 'SERIES' : 'STORY'}`}
      </button>
    </div>
  )
}

// =============================================================================
// QUEUE VIEW COMPONENT
// =============================================================================

function QueueView({
  stories,
  selectedStory,
  onSelectStory,
  onRewrite,
  onApprove,
  onReject,
  loading
}: {
  stories: QueueStory[]
  selectedStory: QueueStory | null
  onSelectStory: (story: QueueStory) => void
  onRewrite: (storyId: string) => void
  onApprove: (storyId: string) => void
  onReject: (storyId: string) => void
  loading: boolean
}) {
  return (
    <div className="grid grid-cols-3 gap-6">
      {/* Queue List */}
      <div className="col-span-1">
        <div style={{ backgroundColor: '#ffffff', border: '1px solid #000000' }} className="rounded-lg h-full">
          <div className="p-4 border-b border-gray-300">
            <h2 className="text-xl font-bold text-black">Production Queue</h2>
          </div>
          
          <div className="p-4 space-y-3">
            {stories.map(story => (
              <div
                key={story.id}
                onClick={() => onSelectStory(story)}
                style={{
                  border: selectedStory?.id === story.id ? '2px solid #f97316' : '1px solid #000000',
                  backgroundColor: selectedStory?.id === story.id ? '#fff7ed' : '#ffffff'
                }}
                className="p-3 rounded cursor-pointer transition-colors"
              >
                <h3 className="font-semibold text-black truncate">{story.title}</h3>
                <p className="text-sm text-gray-700">
                  {story.author} • {story.genre} • {story.storyType === 'series' ? `Series (${story.episodeCount} episodes)` : 'Single Episode'}
                </p>
                <div className="flex items-center justify-between mt-2">
                  <StatusBadge status={story.status} />
                  {story.grade && (
                    <span style={{ backgroundColor: '#f3f4f6', border: '1px solid #000000' }} className="text-xs px-2 py-1 rounded text-black">
                      {story.grade.total}/25
                    </span>
                  )}
                </div>
              </div>
            ))}
            
            {stories.length === 0 && (
              <p className="text-gray-600 text-center py-8">
                No stories in queue
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Story Details */}
      <div className="col-span-2">
        {selectedStory ? (
          <StoryDetailsPanel
            story={selectedStory}
            onRewrite={onRewrite}
            onApprove={onApprove}
            onReject={onReject}
            loading={loading}
          />
        ) : (
          <div style={{ backgroundColor: '#ffffff', border: '1px solid #000000' }} className="rounded-lg h-full flex items-center justify-center">
            <p className="text-gray-600">Select a story from the queue to view details</p>
          </div>
        )}
      </div>
    </div>
  )
}

// =============================================================================
// STORY DETAILS COMPONENT
// =============================================================================

function StoryDetailsPanel({
  story,
  onRewrite,
  onApprove,
  onReject,
  loading
}: {
  story: QueueStory
  onRewrite: (storyId: string) => void
  onApprove: (storyId: string) => void
  onReject: (storyId: string) => void
  loading: boolean
}) {
  const [showScript, setShowScript] = useState(false)
  const [sfxSettings, setSfxSettings] = useState(story.sfxPlacements || [])

  return (
    <div style={{ backgroundColor: '#ffffff', border: '1px solid #000000' }} className="rounded-lg h-full overflow-hidden">
      <div className="p-6 border-b border-gray-300">
        <div className="flex justify-between items-start">
          <div>
            <h2 className="text-xl font-bold text-black">{story.title}</h2>
            <p className="text-gray-700">
              {story.author} • {story.genre} • {story.storyType === 'series' ? `Series (${story.episodeCount} episodes)` : 'Single Episode'}
            </p>
          </div>
          <StatusBadge status={story.status} />
        </div>
      </div>
      
      <div className="p-6 h-full overflow-y-auto">
        {/* Grading Results */}
        {story.grade && (
          <div className="mb-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-black">Quality Assessment</h3>
              <div className="text-2xl font-bold text-black">
                {story.grade.total}/25
                {story.grade.total >= 24 && <span className="text-yellow-600 ml-2">⭐</span>}
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-4 mb-4">
              {[
                ['Hook', story.grade.hook],
                ['Listenability', story.grade.listenability],
                ['Dialogue', story.grade.dialogue],
                ['Clarity', story.grade.clarity],
                ['Pacing', story.grade.pacing],
                ['Audio', story.grade.audio]
              ].map(([dimension, score]) => (
                <div key={dimension} className="flex justify-between">
                  <span className="text-gray-700">{dimension}:</span>
                  <span className={`font-semibold ${
                    score >= 9 ? 'text-green-600' :
                    score >= 7 ? 'text-yellow-600' : 'text-red-600'
                  }`}>
                    {score}/10
                  </span>
                </div>
              ))}
            </div>

            {story.grade.topFixes.length > 0 && (
              <div style={{ backgroundColor: '#f3f4f6', border: '1px solid #000000' }} className="p-4 rounded mb-4">
                <h4 className="font-semibold text-orange-600 mb-2">Recommended Improvements:</h4>
                <ul className="list-disc list-inside space-y-1 text-black">
                  {story.grade.topFixes.map((fix, index) => (
                    <li key={index} className="text-sm">{fix}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* SFX Management */}
        {sfxSettings.length > 0 && (
          <div className="mb-6">
            <h3 className="text-lg font-semibold text-black mb-3">Sound Effects Review</h3>
            <div className="space-y-2">
              {sfxSettings.map(sfx => (
                <div key={sfx.id} style={{ backgroundColor: '#f3f4f6', border: '1px solid #000000' }} className="flex items-center justify-between p-3 rounded">
                  <div>
                    <span className="text-black">{sfx.description}</span>
                    <span className="text-xs text-gray-600 ml-2">Line {sfx.lineNumber}</span>
                  </div>
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={sfx.enabled}
                      onChange={(e) => {
                        const updated = sfxSettings.map(s =>
                          s.id === sfx.id ? { ...s, enabled: e.target.checked } : s
                        )
                        setSfxSettings(updated)
                      }}
                      className="mr-2"
                    />
                    <span className="text-sm text-black">Include</span>
                  </label>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Script View Toggle */}
        {story.script && (
          <div className="mb-6">
            <button
              onClick={() => setShowScript(!showScript)}
              style={{ backgroundColor: '#f3f4f6', border: '1px solid #000000', color: '#000000' }}
              className="px-4 py-2 rounded hover:bg-gray-200"
            >
              {showScript ? 'Hide Script' : 'View Script'}
            </button>
            
            {showScript && (
              <div style={{ backgroundColor: '#f9fafb', border: '1px solid #000000' }} className="mt-4 p-4 rounded max-h-96 overflow-y-auto">
                <pre className="text-sm text-black whitespace-pre-wrap">
                  {story.script}
                </pre>
              </div>
            )}
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex space-x-4 pt-4 border-t border-gray-300">
          {story.status === 'ready_for_review' && (
            <>
              {/* Top Fixes Button */}
              {story.grade && story.grade.total < 24 && story.grade.topFixes.length > 0 && (
                <button
                  onClick={() => onRewrite(story.id)}
                  disabled={loading}
                  style={{
                    backgroundColor: loading ? '#6474bc' : '#3b82f6',
                    color: '#ffffff',
                    border: 'none'
                  }}
                  className="px-6 py-3 rounded font-medium hover:bg-blue-700 disabled:cursor-not-allowed"
                >
                  🔧 Apply Top Fixes
                </button>
              )}
              
              <button
                onClick={() => onApprove(story.id)}
                disabled={loading}
                style={{
                  backgroundColor: loading ? '#6474bc' : '#10b981',
                  color: '#ffffff',
                  border: 'none'
                }}
                className="px-6 py-3 rounded font-medium hover:bg-green-700 disabled:cursor-not-allowed"
              >
                ✓ Approve & Publish
              </button>
              
              <button
                onClick={() => onReject(story.id)}
                disabled={loading}
                style={{
                  backgroundColor: loading ? '#6474bc' : '#ef4444',
                  color: '#ffffff',
                  border: 'none'
                }}
                className="px-6 py-3 rounded font-medium hover:bg-red-700 disabled:cursor-not-allowed"
              >
                ✗ Reject
              </button>
            </>
          )}
          
          {story.status === 'production_ready' && (
            <div style={{ backgroundColor: '#10b981', color: '#ffffff' }} className="px-6 py-3 rounded font-medium">
              ✓ Published & Live
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// =============================================================================
// UTILITY COMPONENTS
// =============================================================================

function TabButton({
  children,
  active,
  onClick
}: {
  children: React.ReactNode
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`px-6 py-3 font-medium border-b-2 transition-colors ${
        active
          ? 'border-orange-500 text-orange-500'
          : 'border-transparent text-gray-600 hover:text-gray-800'
      }`}
    >
      {children}
    </button>
  )
}

function StatusBadge({ status }: { status: QueueStory['status'] }) {
  const statusConfig = {
    generating_options: { label: 'Generating Options', color: '#3b82f6' },
    awaiting_selection: { label: 'Awaiting Selection', color: '#f59e0b' },
    generating_script: { label: 'Writing Script', color: '#3b82f6' },
    ready_for_review: { label: 'Ready for Review', color: '#f97316' },
    rewriting: { label: 'Applying Fixes', color: '#8b5cf6' },
    production_ready: { label: 'Production Ready', color: '#10b981' }
  }

  const config = statusConfig[status]
  
  return (
    <span 
      style={{ backgroundColor: config.color, color: '#ffffff' }} 
      className="text-xs px-2 py-1 rounded"
    >
      {config.label}
    </span>
  )
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-black mb-2">
        {label}
      </label>
      {children}
    </div>
  )
}

// =============================================================================
// API FUNCTIONS
// =============================================================================

async function generateStoryOptions(premise: PremiseData): Promise<StoryOption[]> {
  const prompt = createStoryOptionsPrompt(premise)
  
  const response = await fetch('/api/claude-proxy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 4000
    })
  })
  
  if (!response.ok) throw new Error('Failed to generate options')
  
  const data = await response.json()
  return parseStoryOptions(data.text, premise)
}

async function generateScript(option: StoryOption, story: QueueStory): Promise<{ title: string; script: string }> {
  const prompt = createScriptPrompt(option, story)
  
  const response = await fetch('/api/claude-proxy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 4000
    })
  })
  
  if (!response.ok) throw new Error('Failed to generate script')
  
  const data = await response.json()
  const script = data.text
  
  return {
    title: option.title,
    script: script
  }
}

async function gradeScript(script: string): Promise<GradingResult> {
  const prompt = createGradingPrompt(script)
  
  const response = await fetch('/api/claude-proxy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 2000
    })
  })
  
  if (!response.ok) throw new Error('Failed to grade script')
  
  const data = await response.json()
  return parseGradingResult(data.text)
}

async function applyTopFixes(script: string, fixes: string[]): Promise<string> {
  const prompt = `Apply these improvements to this Endless Tales script:

IMPROVEMENTS TO APPLY:
${fixes.map((fix, i) => `${i + 1}. ${fix}`).join('\n')}

CURRENT SCRIPT:
${script}

IMPROVED SCRIPT:`
  
  const response = await fetch('/api/claude-proxy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 4000
    })
  })
  
  if (!response.ok) throw new Error('Failed to apply fixes')
  
  const data = await response.json()
  return data.text
}

// =============================================================================
// PROMPT BUILDERS
// =============================================================================

function createStoryOptionsPrompt(premise: PremiseData): string {
  const isSeriesPrompt = premise.storyType === 'series' 
    ? `This is a SERIES with ${premise.seriesEpisodeCount} episodes. Generate episode structures with proper cliffhangers for episodes 1-${(premise.seriesEpisodeCount || 3) - 1} and a complete resolution for the finale.`
    : 'This is a STANDALONE story. It must have a complete, satisfying ending.'

  return `You are generating story structure options for Endless Tales. Generate exactly 3 different story structure options based on this premise:

PREMISE DETAILS:
- Genre: ${premise.genre}
- Author: ${premise.authorStyle}
- Story Type: ${premise.storyType}
- Runtime: ${premise.runtime} ${premise.storyType === 'series' ? 'per episode' : 'total'}
- Core Premise: ${premise.premise}
- Setting: ${premise.setting}
- SFX Enabled: ${premise.sfxEnabled}
${premise.additionalNotes ? `- Additional Notes: ${premise.additionalNotes}` : ''}

${isSeriesPrompt}

For each option, provide:
1. Title
2. Opening Hook (first 2 minutes)
3. Plot Development/Structure
4. Ending Conclusion (specific resolution)
5. Estimated Quality Grade (out of 25)
6. Music Prompt for Suno
7. ${premise.sfxEnabled ? 'SFX placements with descriptions' : 'No SFX (voice and music only)'}

${premise.storyType === 'series' ? `For series, break down all ${premise.seriesEpisodeCount} episodes with titles, plot summaries, and cliffhangers (except finale).` : ''}

Format as JSON with this structure:
{
  "options": [
    {
      "id": "option_1",
      "title": "Story Title",
      "hook": "Opening hook description",
      "plotSummary": "Plot development",
      "endingConclusion": "How it ends specifically",
      "estimatedGrade": 22,
      "musicPrompt": "Suno prompt for background music",
      "sfxPlacements": [],
      ${premise.storyType === 'series' ? '"episodes": [...episode objects with episodeNumber, episodeTitle, plotSummary, cliffhanger]' : ''}
    }
  ]
}`
}

function createScriptPrompt(option: StoryOption, story: QueueStory): string {
  return `Write a complete Endless Tales audio drama script based on this approved story option.

STORY OPTION:
Title: ${option.title}
Author: ${story.author}
Genre: ${story.genre}
Story Type: ${story.storyType}
${story.episodeCount ? `Episode Count: ${story.episodeCount}` : ''}
Hook: ${option.hook}
Plot: ${option.plotSummary}
Ending: ${option.endingConclusion}

SERIES EPISODES:
${option.episodes ? option.episodes.map(ep => 
  `Episode ${ep.episodeNumber}: ${ep.episodeTitle}
  Plot: ${ep.plotSummary}
  ${ep.cliffhanger ? `Cliffhanger: ${ep.cliffhanger}` : 'FINALE: Complete resolution'}`
).join('\n\n') : 'N/A - Standalone story'}

MUSIC PROMPT: ${option.musicPrompt}

SFX: ${option.sfxPlacements.length > 0 ? option.sfxPlacements.map(sfx => sfx.description).join(', ') : 'No SFX - voice and music only'}

Follow all Endless Tales writing rules:
- Use proper script format with header block
- Follow the author's voice profile and narrative style
- ${story.storyType === 'series' ? 'Each episode except finale MUST end with a cliffhanger' : 'Must have a complete, satisfying ending'}
- Belle B intro and outro following ET specs
- Character guide with voice casting info
- American accents default unless specified otherwise

Write the complete script now:`
}

function createGradingPrompt(script: string): string {
  return `Grade this Endless Tales script using the official 25-point rubric:

GRADING DIMENSIONS (each scored 1-5):
1. Hook - Does it grab attention in first 2 minutes?
2. Listenability - Clear, engaging audio storytelling?
3. Dialogue - Natural, distinct character voices?
4. Clarity - Easy to follow story progression?
5. Pacing - Proper rhythm and momentum?

ADDITIONAL CHECKS:
- Audio Quality (production readiness)
- Policy compliance (content guidelines)

Provide specific top fixes for any dimension scoring below 4.

SCRIPT TO GRADE:
${script}

Return JSON format:
{
  "total": 22,
  "hook": 4,
  "listenability": 5,
  "dialogue": 4,
  "clarity": 4,
  "pacing": 5,
  "audio": 4,
  "topFixes": ["Specific improvement 1", "Specific improvement 2"],
  "policyPass": true
}`
}

// =============================================================================
// RESPONSE PARSERS
// =============================================================================

function parseStoryOptions(response: string, premise: PremiseData): StoryOption[] {
  try {
    const cleaned = response.replace(/```json|```/g, '').trim()
    const parsed = JSON.parse(cleaned)
    
    return parsed.options.map((opt: any, index: number) => ({
      id: `option_${index + 1}`,
      title: opt.title || `Option ${index + 1}`,
      hook: opt.hook || '',
      plotSummary: opt.plotSummary || '',
      endingConclusion: opt.endingConclusion || '',
      estimatedGrade: opt.estimatedGrade || 20,
      musicPrompt: opt.musicPrompt || '',
      sfxPlacements: (opt.sfxPlacements || []).map((sfx: any, sfxIndex: number) => ({
        id: `sfx_${index}_${sfxIndex}`,
        lineNumber: sfx.lineNumber || 0,
        description: sfx.description || '',
        sfxType: sfx.sfxType || 'atmospheric',
        enabled: true,
        audioNote: sfx.audioNote || ''
      })),
      episodes: opt.episodes || undefined
    }))
  } catch (error) {
    console.error('Failed to parse story options:', error)
    throw new Error('Failed to parse Claude response')
  }
}

function parseGradingResult(response: string): GradingResult {
  try {
    const cleaned = response.replace(/```json|```/g, '').trim()
    const parsed = JSON.parse(cleaned)
    
    return {
      total: parsed.total || 0,
      hook: parsed.hook || 0,
      listenability: parsed.listenability || 0,
      dialogue: parsed.dialogue || 0,
      clarity: parsed.clarity || 0,
      pacing: parsed.pacing || 0,
      audio: parsed.audio || 0,
      topFixes: parsed.topFixes || [],
      policyPass: parsed.policyPass || false
    }
  } catch (error) {
    console.error('Failed to parse grading result:', error)
    throw new Error('Failed to parse grading response')
  }
}
