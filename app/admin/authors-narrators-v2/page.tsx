'use client'

import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'

type Author = {
  id: string
  name: string
  primary_genre?: string | null
  secondary_genre?: string | null
  narrative_voice?: string | null
  style_reference?: string | null
  style_description?: string | null
  narrator_id?: string | null
  narrator_name?: string | null
  narrator_elevenlabs_voice_id?: string | null
  sort_order?: number | null
}

type Narrator = {
  id: string
  name: string
  bio?: string | null
  description?: string | null
  photo_url?: string | null
  avatar_url?: string | null
  gender?: string | null
  accent?: string | null
  tone?: string | null
  elevenlabs_voice_id?: string | null
  is_active?: boolean | null
}

type ElevenLabsVoice = {
  voice_id: string
  name: string
  labels?: Record<string, string>
  preview_url?: string | null
  category?: string | null
}

const BELLE_B_VOICE_ID = 'wewocdDkjSLm9ZwjO7TD'

export default function AuthorsNarratorsV2Page() {
  const [grouped, setGrouped] = useState<Record<string, Author[]>>({})
  const [genres, setGenres] = useState<string[]>([])
  const [narrators, setNarrators] = useState<Narrator[]>([])
  const [voices, setVoices] = useState<ElevenLabsVoice[]>([])
  const [voiceError, setVoiceError] = useState('')
  const [playingNarratorId, setPlayingNarratorId] = useState<string | null>(null)
  const [voiceSaveStatus, setVoiceSaveStatus] = useState<Record<string, string>>({})
  const [selectedGenre, setSelectedGenre] = useState('All')
  const [selectedAuthor, setSelectedAuthor] = useState<Author | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const audioRef = useRef<HTMLAudioElement | null>(null)

  useEffect(() => {
    let ignore = false

    async function load() {
      try {
        setLoading(true)
        setError('')
        const res = await fetch('/api/admin/featured-authors')
        const data = await res.json()
        if (!res.ok || !data.success) throw new Error(data.error || 'Failed to load featured authors')
        const { data: narratorRows, error: narratorError } = await supabase
          .from('narrator_voices')
          .select('*')
          .eq('is_active', true)
          .order('name', { ascending: true })
        if (narratorError) throw new Error(narratorError.message)
        if (!ignore) {
          setGrouped(data.grouped || {})
          setGenres(data.genres || [])
          setNarrators((narratorRows || []) as Narrator[])
        }
      } catch (e: any) {
        if (!ignore) setError(e.message || 'Unknown error')
      } finally {
        if (!ignore) setLoading(false)
      }
    }

    load()
    return () => {
      ignore = true
    }
  }, [])

  useEffect(() => {
    let ignore = false

    async function loadVoices() {
      try {
        setVoiceError('')
        const res = await fetch('/api/admin/elevenlabs-voices')
        const data = await res.json()
        if (!res.ok || !data.success) throw new Error(data.error || 'Failed to load ElevenLabs voices')
        if (!ignore) setVoices(data.voices || [])
      } catch (e: any) {
        if (!ignore) setVoiceError(e.message || 'Failed to load ElevenLabs voices')
      }
    }

    loadVoices()
    return () => {
      ignore = true
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current = null
      }
    }
  }, [])

  const visibleGenres = useMemo(() => {
    if (selectedGenre === 'All') return genres
    return genres.filter((g) => g === selectedGenre)
  }, [genres, selectedGenre])

  const visibleAuthorCount = useMemo(() => (
    visibleGenres.reduce((total, genre) => total + (grouped[genre] || []).length, 0)
  ), [grouped, visibleGenres])

  const voiceById = useMemo(() => {
    return Object.fromEntries(voices.map((voice) => [voice.voice_id, voice])) as Record<string, ElevenLabsVoice>
  }, [voices])

  const narratorById = useMemo(() => {
    return Object.fromEntries(narrators.map((narrator) => [narrator.id, narrator])) as Record<string, Narrator>
  }, [narrators])

  function stopPreview() {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.currentTime = 0
      audioRef.current = null
    }
    setPlayingNarratorId(null)
  }

  async function playPreview(narrator: Narrator) {
    const voice = narrator.elevenlabs_voice_id ? voiceById[narrator.elevenlabs_voice_id] : null
    if (!voice?.preview_url) return

    if (playingNarratorId === narrator.id) {
      stopPreview()
      return
    }

    stopPreview()
    const audio = new Audio(voice.preview_url)
    audioRef.current = audio
    setPlayingNarratorId(narrator.id)
    audio.onended = () => setPlayingNarratorId(null)
    audio.onerror = () => setPlayingNarratorId(null)
    await audio.play()
  }

  async function updateNarratorVoice(narrator: Narrator, elevenlabsVoiceId: string) {
    setVoiceSaveStatus((current) => ({ ...current, [narrator.id]: 'Saving…' }))
    try {
      const res = await fetch('/api/admin/narrator-voices/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ narrator_id: narrator.id, elevenlabs_voice_id: elevenlabsVoiceId }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to update narrator voice')

      setNarrators((current) => current.map((row) => row.id === narrator.id ? data.narrator : row))
      setGrouped((current) => {
        const next: Record<string, Author[]> = {}
        for (const [genre, authors] of Object.entries(current)) {
          next[genre] = authors.map((author) => author.narrator_id === narrator.id
            ? { ...author, narrator_elevenlabs_voice_id: elevenlabsVoiceId }
            : author
          )
        }
        return next
      })
      setSelectedAuthor((current) => current?.narrator_id === narrator.id
        ? { ...current, narrator_elevenlabs_voice_id: elevenlabsVoiceId }
        : current
      )
      setVoiceSaveStatus((current) => ({ ...current, [narrator.id]: 'Saved ✓' }))
      setTimeout(() => {
        setVoiceSaveStatus((current) => ({ ...current, [narrator.id]: '' }))
      }, 2000)
    } catch (e: any) {
      setVoiceSaveStatus((current) => ({ ...current, [narrator.id]: `Error: ${e.message || 'Save failed'}` }))
    }
  }

  function narratorForAuthor(author: Author | null): Narrator | null {
    if (!author?.narrator_id) return null
    const fullNarrator = narratorById[author.narrator_id]
    if (fullNarrator) return fullNarrator
    if (!author.narrator_name) return null
    return {
      id: author.narrator_id,
      name: author.narrator_name,
      elevenlabs_voice_id: author.narrator_elevenlabs_voice_id,
    }
  }

  function renderNarratorVoiceControls(narrator: Narrator, compact = false) {
    const currentVoice = narrator.elevenlabs_voice_id ? voiceById[narrator.elevenlabs_voice_id] : null
    const isBelleB = narrator.elevenlabs_voice_id === BELLE_B_VOICE_ID
    const previewMissing = !currentVoice?.preview_url

    if (isBelleB) {
      return (
        <div style={{ color: '#9a3412', background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 10, padding: compact ? '8px 10px' : '10px 12px', fontSize: compact ? 13 : 14, fontWeight: 800 }}>
          Belle B is locked for announcer use only.
        </div>
      )
    }

    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', marginTop: compact ? 10 : 0 }}>
        <button
          onClick={(event) => {
            event.stopPropagation()
            playPreview(narrator)
          }}
          disabled={previewMissing}
          style={{
            background: previewMissing ? '#d1d5db' : '#f97316',
            color: 'white',
            border: 'none',
            borderRadius: 10,
            padding: compact ? '9px 12px' : '10px 14px',
            fontSize: 15,
            fontWeight: 900,
            cursor: previewMissing ? 'not-allowed' : 'pointer',
            minWidth: 104,
          }}
        >
          {previewMissing ? 'No preview' : playingNarratorId === narrator.id ? '⏸ Stop' : '▶ Listen'}
        </button>

        <select
          value={narrator.elevenlabs_voice_id || ''}
          onClick={(event) => event.stopPropagation()}
          onChange={(event) => {
            event.stopPropagation()
            updateNarratorVoice(narrator, event.target.value)
          }}
          disabled={voices.length === 0}
          style={{
            background: '#fff',
            color: '#111827',
            border: '1px solid #d1d5db',
            borderRadius: 10,
            padding: '10px 12px',
            fontSize: 15,
            minWidth: compact ? 260 : 280,
          }}
        >
          <option value="">Choose voice…</option>
          {voices.filter((voice) => voice.voice_id !== BELLE_B_VOICE_ID).map((voice) => {
            const gender = voice.labels?.gender || ''
            const accent = voice.labels?.accent || ''
            const detail = [gender, accent].filter(Boolean).join(', ')
            return (
              <option key={voice.voice_id} value={voice.voice_id}>
                {voice.name}{detail ? ` (${detail})` : ''}
              </option>
            )
          })}
        </select>

        <div style={{ minWidth: 130, color: (voiceSaveStatus[narrator.id] || '').startsWith('Error') ? '#b91c1c' : '#166534', fontSize: 14, fontWeight: 800 }}>
          {voiceSaveStatus[narrator.id] || ''}
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: '#FAF9F6', padding: '32px 28px' }}>
      <div style={{ maxWidth: 1400, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 18 }}>
          <Link href="/admin" style={{ textDecoration: 'none', background: '#e5e7eb', color: '#111827', padding: '10px 16px', borderRadius: 12, fontWeight: 700 }}>
            ← Back
          </Link>
          <div>
            <h1 style={{ margin: 0, fontSize: 28, fontWeight: 900, color: '#111827' }}>Authors & Narrators V2</h1>
            <div style={{ color: '#6b7280', marginTop: 6 }}>{genres.length} database genres · 3 ET authors per genre</div>
          </div>
        </div>

        <div style={{ marginBottom: 20 }}>
          <select
            value={selectedGenre}
            onChange={(e) => setSelectedGenre(e.target.value)}
            style={{
              border: '1px solid #d1d5db',
              borderRadius: 10,
              padding: '10px 12px',
              background: 'white',
              color: '#111827',
              fontSize: 14,
              minWidth: 220,
            }}
          >
            <option value="All">All</option>
            {genres.map((g) => (
              <option key={g} value={g}>{g}</option>
            ))}
          </select>
        </div>

        {loading ? (
          <div style={{ color: '#374151' }}>Loading featured authors…</div>
        ) : error ? (
          <div style={{ color: '#b91c1c', fontWeight: 700 }}>{error}</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: selectedAuthor ? '1.3fr 0.9fr' : '1fr', gap: 24 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
              <div style={{ color: '#374151', fontSize: 13, fontWeight: 700 }}>
                Showing {visibleAuthorCount} assigned ET authors across {visibleGenres.length} genre{visibleGenres.length === 1 ? '' : 's'}.
              </div>
              {visibleGenres.map((genre) => (
                <div key={genre}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 10 }}>
                    <div style={{ fontSize: 13, fontWeight: 900, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      {genre}
                    </div>
                    <div style={{ color: (grouped[genre] || []).length === 3 ? '#166534' : '#b91c1c', background: (grouped[genre] || []).length === 3 ? '#dcfce7' : '#fee2e2', borderRadius: 999, padding: '4px 10px', fontSize: 12, fontWeight: 800 }}>
                      {(grouped[genre] || []).length}/3 assigned
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12 }}>
                    {(grouped[genre] || []).map((a) => {
                      const cardNarrator = narratorForAuthor(a)
                      return (
                        <div
                          key={a.id}
                          role="button"
                          tabIndex={0}
                          onClick={() => setSelectedAuthor(a)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ') setSelectedAuthor(a)
                          }}
                          style={{
                            textAlign: 'left',
                            background: 'white',
                            border: selectedAuthor?.id === a.id ? '2px solid #f97316' : '1px solid #d1d5db',
                            borderRadius: 16,
                            padding: 16,
                            cursor: 'pointer',
                            boxShadow: selectedAuthor?.id === a.id ? '0 10px 24px rgba(249,115,22,0.14)' : 'none',
                          }}
                        >
                          <div style={{ fontWeight: 900, fontSize: 18, color: '#111827', marginBottom: 6 }}>{a.name}</div>
                          <div style={{ color: '#6b7280', fontSize: 13, marginBottom: 8 }}>
                            {(a.primary_genre || 'Unknown')}{a.secondary_genre ? ` · ${a.secondary_genre}` : ''}
                          </div>
                          <div style={{ color: '#374151', fontSize: 13, marginBottom: 8 }}>✍️ {a.style_reference || 'Not set'}</div>
                          <div style={{ color: '#f97316', fontSize: 13, fontWeight: 700, marginBottom: cardNarrator ? 8 : 0 }}>🎙 {a.narrator_name || 'Not assigned'}</div>
                          {cardNarrator ? renderNarratorVoiceControls(cardNarrator, true) : null}
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>

            {selectedAuthor ? (
              <div style={{ background: 'white', border: '1px solid #d1d5db', borderRadius: 18, padding: 24, alignSelf: 'start' }}>
                <div style={{ fontWeight: 900, fontSize: 24, color: '#111827', marginBottom: 8 }}>{selectedAuthor.name}</div>
                <div style={{ color: '#6b7280', fontSize: 14, marginBottom: 18 }}>
                  {(selectedAuthor.primary_genre || 'Unknown')}{selectedAuthor.secondary_genre ? ` · ${selectedAuthor.secondary_genre}` : ''}
                </div>

                <div style={{ background: '#f9fafb', borderRadius: 12, padding: '14px 16px', marginBottom: 12 }}>
                  <div style={{ color: '#6b7280', fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
                    Real Author Style
                  </div>
                  <div style={{ color: '#111827', fontWeight: 800 }}>{selectedAuthor.style_reference || 'Not set'}</div>
                </div>

                <div style={{ background: '#f9fafb', borderRadius: 12, padding: '14px 16px', marginBottom: 12 }}>
                  <div style={{ color: '#6b7280', fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
                    Claude Writing Guide
                  </div>
                  <div style={{ color: '#111827', lineHeight: 1.6 }}>
                    {selectedAuthor.style_description || 'No Claude writing guide yet.'}
                  </div>
                </div>

                <div style={{ background: '#fff7ed', borderRadius: 12, padding: '14px 16px' }}>
                  <div style={{ color: '#9a3412', fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
                    Paired Narrator
                  </div>
                  <div style={{ color: '#c2410c', fontWeight: 800 }}>{selectedAuthor.narrator_name || 'Not assigned'}</div>
                  {narratorForAuthor(selectedAuthor) ? (
                    <div style={{ marginTop: 12 }}>
                      <div style={{ color: '#9a3412', fontSize: 13, fontWeight: 800, marginBottom: 8 }}>
                        Current EL voice: {narratorForAuthor(selectedAuthor)?.elevenlabs_voice_id ? voiceById[narratorForAuthor(selectedAuthor)!.elevenlabs_voice_id!]?.name || narratorForAuthor(selectedAuthor)?.elevenlabs_voice_id : 'No voice assigned'}
                      </div>
                      {renderNarratorVoiceControls(narratorForAuthor(selectedAuthor)!, true)}
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>
        )}

        {!loading && !error ? (
          <div style={{ marginTop: 28, background: 'white', border: '1px solid #d1d5db', borderRadius: 18, padding: 20 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginBottom: 16 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 22, fontWeight: 900, color: '#111827' }}>Narrator Voices</h2>
                <div style={{ color: '#6b7280', fontSize: 14, marginTop: 4 }}>
                  Listen to current ElevenLabs previews and change narrator voice assignments.
                </div>
              </div>
              <div style={{ color: voiceError ? '#b91c1c' : '#374151', fontSize: 13, fontWeight: 700 }}>
                {voiceError || `${voices.length} ElevenLabs voices loaded`}
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {narrators.map((narrator) => {
                const currentVoice = narrator.elevenlabs_voice_id ? voiceById[narrator.elevenlabs_voice_id] : null
                const snippet = narrator.bio || narrator.description || `${narrator.accent || 'Unknown accent'} ${narrator.gender || 'voice'}`
                const photo = narrator.photo_url || narrator.avatar_url

                return (
                  <div
                    key={narrator.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      border: '1px solid #e5e7eb',
                      borderRadius: 14,
                      padding: '12px',
                      background: '#fff',
                    }}
                  >
                    <div style={{ width: 52, height: 52, borderRadius: '50%', overflow: 'hidden', background: '#111827', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, fontWeight: 900, flexShrink: 0 }}>
                      {photo ? <img src={photo} alt={narrator.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : narrator.name.slice(0, 1)}
                    </div>

                    <div style={{ minWidth: 0, flex: '1 1 260px' }}>
                      <div style={{ color: '#111827', fontSize: 16, fontWeight: 900 }}>{narrator.name}</div>
                      <div style={{ color: '#6b7280', fontSize: 14, lineHeight: 1.35, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {snippet}
                      </div>
                    </div>

                    <div style={{ minWidth: 180, color: '#111827', fontSize: 14, fontWeight: 800 }}>
                      {currentVoice?.name || narrator.elevenlabs_voice_id || 'No voice assigned'}
                    </div>

                    <div style={{ minWidth: 520 }}>
                      {renderNarratorVoiceControls(narrator)}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}
