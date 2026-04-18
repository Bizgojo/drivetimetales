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
  premise: string
  setting: string
  musicStyle: string
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
  sfxPlacements: SFXPlacement[]
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
        .neq('is_hidden', true)
        .order('created_at', { ascending: false })
        .limit(20)

      if (error) throw error

      const mappedStories: QueueStory[] = (data || []).map(story => ({
        id: story.id,
        title: story.title || 'Untitled',
        author: story.author || 'Unknown',
        genre: story.genre || 'Drama',
        status: story.status || 'generating_options',
        script: story.script_text,
        grade: story.grading_result,
        sfxPlacements: story.sfx_settings || [],
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
            Complete story creation workflow: Premise → Options → Queue → Production
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

  // ============================================================================
  // EVENT HANDLERS
  // ============================================================================

  async function handlePremiseSubmit(premise: PremiseData) {
    setLoading(true)
    setLoadingMessage('Generating story options...')

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
        status: 'generating_options',
        createdAt: storyData.created_at
      }

      setQueueStories(prev => [newStory, ...prev])

      // Generate story options via Claude
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
    setLoadingMessage('Generating full script...')

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
    setLoadingMessage('Applying improvements...')

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
      alert('Failed to apply improvements. Please try again.')
    } finally {
      setLoading(false)
      setLoadingMessage('')
    }
  }

  async function handleApprove(storyId: string) {
    try {
      const { error } = await supabase
        .from('stories')
        .update({ status: 'production_ready' })
        .eq('id', storyId)

      if (error) throw error

      setQueueStories(prev => prev.map(story =>
        story.id === storyId ? { ...story, status: 'production_ready' } : story
      ))

      alert('Story approved! Ready for audio production.')
    } catch (error) {
      console.error('Error approving story:', error)
      alert('Failed to approve story.')
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

// ============================================================================
// PREMISE PICKER COMPONENT
// ============================================================================

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
    premise: '',
    setting: '',
    musicStyle: '',
    sfxEnabled: false
  })

  const genres = [
    'Horror', 'Mystery/Crime', 'Thriller', 'Romance', 'Sci-Fi',
    'Western', 'Comedy', 'Drama', 'Adventure', 'Family/Heartwarming'
  ]

  const authors = [
    'Silas Cutter (Horror)',
    'Caroline Drake (Mystery/Crime)',
    'Sara Keene (Thriller)',
    'Roman Steele (Thriller)',
    'Edmund Worth (Romance)',
    'Rex Bright (Comedy)',
    'Zara Storm (Sci-Fi)',
    'Marc Hobelman (Western)',
    'Daniel Wren (Family/Heartwarming)'
  ]

  const musicStyles = [
    'Tense procedural (low strings, urban atmosphere)',
    'Atmospheric dread (sparse, building tension)',
    'Warm melancholic (acoustic, bittersweet)',
    'Driving kinetic (pulse-based, forward momentum)',
    'Southern Gothic (muted strings, delta blues)',
    'Mournful atmospheric (church organ undertones)'
  ]

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
              >
                <option value="">Select Author</option>
                {authors.map(author => (
                  <option key={author} value={author}>{author}</option>
                ))}
              </select>
            </FormField>
          </div>

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

          <FormField label="Music Style *">
            <select
              style={{ backgroundColor: '#ffffff', border: '1px solid #000000', color: '#000000' }}
              className="w-full p-3 rounded"
              value={formData.musicStyle}
              onChange={(e) => setFormData({ ...formData, musicStyle: e.target.value })}
              required
            >
              <option value="">Select Music Style</option>
              {musicStyles.map(style => (
                <option key={style} value={style}>{style}</option>
              ))}
            </select>
          </FormField>

          {/* SFX Toggle - The Key Feature You Requested */}
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
            disabled={loading || !formData.genre || !formData.authorStyle || !formData.premise || !formData.setting || !formData.musicStyle}
            style={{
              backgroundColor: loading ? '#64748b' : '#f97316',
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

// ============================================================================
// STORY OPTIONS COMPONENT
// ============================================================================

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
        
        <div>
          <strong className="text-orange-600">Plot Development:</strong>
          <p className="mt-1">{option.plotSummary}</p>
        </div>
        
        <div>
          <strong className="text-orange-600">Ending Conclusion:</strong>
          <p className="mt-1">{option.endingConclusion}</p>
        </div>

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
          backgroundColor: disabled ? '#64748b' : '#f97316',
          color: '#ffffff',
          border: 'none'
        }}
        className="w-full py-3 px-4 rounded font-medium hover:bg-orange-600 disabled:cursor-not-allowed"
      >
        {disabled ? 'PROCESSING...' : 'SELECT THIS OPTION'}
      </button>
    </div>
  )
}

// ============================================================================
// QUEUE VIEW COMPONENT
// ============================================================================

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
                <p className="text-sm text-gray-700">{story.author} • {story.genre}</p>
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

// ============================================================================
// STORY DETAILS COMPONENT
// ============================================================================

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
            <p className="text-gray-700">{story.author} • {story.genre}</p>
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

        {/* SFX Management - The Key Feature You Requested */}
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
              {/* Top Fixes Button - The Feature You Requested */}
              {story.grade && story.grade.total < 24 && story.grade.topFixes.length > 0 && (
                <button
                  onClick={() => onRewrite(story.id)}
                  disabled={loading}
                  style={{
                    backgroundColor: loading ? '#64748b' : '#3b82f6',
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
                  backgroundColor: loading ? '#64748b' : '#10b981',
                  color: '#ffffff',
                  border: 'none'
                }}
                className="px-6 py-3 rounded font-medium hover:bg-green-700 disabled:cursor-not-allowed"
              >
                ✓ Approve & Produce
              </button>
              
              <button
                onClick={() => onReject(story.id)}
                disabled={loading}
                style={{
                  backgroundColor: loading ? '#64748b' : '#ef4444',
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
              ✓ In Production Pipeline
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// UTILITY COMPONENTS
// ============================================================================

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

// ============================================================================
// API FUNCTIONS
// ============================================================================

async function generateStoryOptions(premise: PremiseData): Promise<StoryOption[]> {
  const response = await fetch('/api/claude-proxy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: "claude-3-5-sonnet-20241022",
      max_tokens: 4000,
      messages: [{
        role: "user",
        content: `You are the story generation system for Endless Tales. Generate exactly 3 different story structure options based on this premise.

PREMISE DATA:
- Genre: ${premise.genre}
- Author Style: ${premise.authorStyle}
- Runtime: ${premise.runtime}
- Core Premise: ${premise.premise}
- Setting: ${premise.setting}
- Music Style: ${premise.musicStyle}
- SFX Enabled: ${premise.sfxEnabled}
- Additional Notes: ${premise.additionalNotes || 'None'}

For each option, provide:
1. A compelling title
2. Opening hook (how the first 2 minutes grab attention)
3. Plot summary (key story beats and developments)
4. Ending conclusion (how the central conflict resolves - be specific about the resolution)
5. Estimated grade (realistic score out of 25 based on Endless Tales quality standards)

${premise.sfxEnabled ? 'Include 3-5 strategic SFX placements that enhance the story.' : 'No SFX - voice and music only.'}

Respond ONLY in this JSON format:
{
  "options": [
    {
      "id": "option_1",
      "title": "Story Title Here",
      "hook": "Detailed description of opening 2 minutes...",
      "plotSummary": "Key story developments and revelations...",
      "endingConclusion": "Specific resolution of central conflict...",
      "estimatedGrade": 23,
      "sfxPlacements": [
        {
          "id": "sfx_1",
          "lineNumber": 15,
          "description": "Car door slam",
          "sfxType": "action",
          "enabled": true,
          "audioNote": "Sets arrival tension"
        }
      ]
    }
  ]
}`
      }]
    })
  })

  const result = await response.json()
  const content = result.content?.[0]?.text || result.choices?.[0]?.message?.content || ''
  
  try {
    const jsonStart = content.indexOf('{')
    const jsonEnd = content.lastIndexOf('}') + 1
    const jsonStr = content.substring(jsonStart, jsonEnd)
    const parsed = JSON.parse(jsonStr)
    return parsed.options
  } catch (error) {
    console.error('Error parsing Claude response:', error)
    throw new Error('Failed to parse story options')
  }
}

async function generateScript(option: StoryOption, story: QueueStory): Promise<{ script: string; title: string }> {
  const response = await fetch('/api/claude-proxy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: "claude-3-5-sonnet-20241022",
      max_tokens: 6000,
      messages: [{
        role: "user",
        content: `Write a complete Endless Tales audio drama script based on this approved story structure:

TITLE: ${option.title}
HOOK: ${option.hook}
PLOT: ${option.plotSummary}
ENDING: ${option.endingConclusion}
AUTHOR: ${story.author}
GENRE: ${story.genre}

Follow the Endless Tales format exactly:

BELLE B INTRO
---
BELLE B: [Write warm, specific intro line - no time references, no formal language]
---

AUTHOR: ${story.author}
GENRE: ${story.genre}
DESCRIPTION: [24-word present-tense hook for app display]
NARRATOR: [Assign American narrator based on genre]
ANNOUNCER: Belle B
NARRATIVE_VOICE: third_limited
NARRATOR_IS_CHARACTER: false
SUNO PROMPT: [Background music description]

CHARACTER GUIDE
---
[List each character with: NAME — age, gender, american accent, tone]
---

[START AUDIO DRAMA SCRIPT]

NARRATOR: [Begin story here - implement the exact hook, plot, and ending from the approved structure]

[CHARACTER]: [Dialogue]

[BEAT] [Use for pacing]

...

BELLE B: [Outro line - reference something specific from the story, credit author, say "an Endless Tales original"]

CRITICAL REQUIREMENTS:
- American setting and characters unless specified otherwise
- Definitive, satisfying ending that resolves the central conflict
- 15-minute target length (~2200 words)
- No SFX markers in script (music and voice only)
- Follow exact format shown above`
      }]
    })
  })

  const result = await response.json()
  const script = result.content?.[0]?.text || result.choices?.[0]?.message?.content || ''
  
  return { 
    script, 
    title: option.title
  }
}

async function gradeScript(script: string): Promise<GradingResult> {
  const response = await fetch('/api/claude-proxy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: "claude-3-5-sonnet-20241022",
      max_tokens: 2000,
      messages: [{
        role: "user",
        content: `Grade this Endless Tales audio drama script using the 6-dimension rubric. Each dimension is scored 1-10.

SCRIPT TO GRADE:
${script}

GRADING RUBRIC:

**Dimension 1: Hook (1-10)**
Does the opening grab attention immediately? Is the listener engaged within 90 seconds?

**Dimension 2: Listenability (1-10)**
Is the prose controlled and imaginistic? Does it trust listener intelligence? No overwrought descriptions?

**Dimension 3: Dialogue (1-10)**
Is dialogue lean and character-specific? Does each character have a distinct voice?

**Dimension 4: Clarity (1-10)**
Can the listener follow the story easily? Are plot points clear? No confusing jumps?

**Dimension 5: Pacing (1-10)**
Does the story move well? Proper use of [BEAT]? Good three-act structure?

**Dimension 6: Audio (1-10)**
Belle B intro follows format? American narrator assigned? Proper script structure?

**Policy Check:**
- Definitive ending that resolves central conflict?
- No inappropriate content?
- Follows Endless Tales guidelines?

Respond ONLY in this JSON format:
{
  "hook": 8,
  "listenability": 9,
  "dialogue": 7,
  "clarity": 6,
  "pacing": 8,
  "audio": 9,
  "total": 47,
  "policyPass": true,
  "topFixes": [
    "Add bridge section between scenes X and Y",
    "Clarify the resolution in the final act"
  ]
}`
      }]
    })
  })

  const result = await response.json()
  const content = result.content?.[0]?.text || result.choices?.[0]?.message?.content || ''
  
  try {
    const jsonStart = content.indexOf('{')
    const jsonEnd = content.lastIndexOf('}') + 1
    const jsonStr = content.substring(jsonStart, jsonEnd)
    const parsed = JSON.parse(jsonStr)
    
    return {
      hook: parsed.hook,
      listenability: parsed.listenability,
      dialogue: parsed.dialogue,
      clarity: parsed.clarity,
      pacing: parsed.pacing,
      audio: parsed.audio,
      total: parsed.total,
      policyPass: parsed.policyPass,
      topFixes: parsed.topFixes || []
    }
  } catch (error) {
    console.error('Error parsing grading result:', error)
    throw new Error('Failed to parse grading result')
  }
}

async function applyTopFixes(script: string, fixes: string[]): Promise<string> {
  const response = await fetch('/api/claude-proxy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: "claude-3-5-sonnet-20241022",
      max_tokens: 6000,
      messages: [{
        role: "user",
        content: `Apply these specific improvements to this Endless Tales audio drama script:

IMPROVEMENTS TO MAKE:
${fixes.map((fix, i) => `${i + 1}. ${fix}`).join('\n')}

ORIGINAL SCRIPT:
${script}

Return the complete improved script with all fixes applied. Maintain the exact Endless Tales format. Only change what's necessary to address the specific improvements listed above.

Do not change:
- The core story concept
- Character names or personalities
- The overall plot structure
- The Belle B intro/outro format

Do improve:
- Story clarity and flow
- Missing narrative bridges
- Pacing issues
- Any structural problems identified`
      }]
    })
  })

  const result = await response.json()
  return result.content?.[0]?.text || result.choices?.[0]?.message?.content || script
}// Updated Sat Apr 18 14:52:26 EDT 2026
