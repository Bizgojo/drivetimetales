'use client'

/*
ORION-HOME-WALK-001 (Marc walk feedback, 2026-07-12)

Post-signup /home leads with a "Continue listening" hero card for the story
the visitor was sampling on /go. A subscriber who converted mid-story must see
their story first, not a generic browse page.

How it works:
- /go writes throttled per-story progress to localStorage (lib/landing.ts).
- On mount we pick the freshest resumable sample that has a main-catalog
  counterpart (variants A/B today; Grave/control is fast-follow).
- We verify the catalog story is actually live (published + not hidden) before
  rendering — a pulled story must never produce a dead hero.
- Tapping the card deep-links /player/<catalogStoryId>?resume=<seconds> — the
  canonical player already honors the resume query param.
- onStoryId reports the catalog id up to /home so downstream sections
  (NewReleases / RecommendedForYou) can exclude the duplicate.
*/

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { loadFreshestResumableSample, type ResumableSample } from '@/lib/landing'

function formatPosition(seconds: number): string {
  const m = Math.floor(seconds / 60)
  if (m < 1) return 'Pick up where you left off'
  return `Pick up at ${m} min${m === 1 ? '' : 's'} in`
}

export default function ContinueSampleHero({ onStoryId }: { onStoryId?: (id: string) => void }) {
  const router = useRouter()
  const [sample, setSample] = useState<ResumableSample | null>(null)
  const [coverOk, setCoverOk] = useState(true)

  useEffect(() => {
    const candidate = loadFreshestResumableSample()
    if (!candidate) return
    let cancelled = false
    // Never render a dead hero: confirm the catalog story is live first.
    supabase
      .from('stories')
      .select('id,status,is_hidden')
      .eq('id', candidate.catalogStoryId)
      .eq('status', 'published')
      .eq('is_hidden', false)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled || error || !data) return
        setSample(candidate)
        onStoryId?.(candidate.catalogStoryId)
      })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!sample) return null

  const resumeSeconds = Math.max(0, Math.floor(sample.seconds))

  return (
    <section style={{ padding: '1rem 1rem 0' }}>
      <div
        role="button"
        tabIndex={0}
        aria-label={`Continue listening to ${sample.title}`}
        onClick={() => router.push(`/player/${sample.catalogStoryId}?resume=${resumeSeconds}`)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') router.push(`/player/${sample.catalogStoryId}?resume=${resumeSeconds}`) }}
        style={{
          display: 'flex', alignItems: 'center', gap: '14px',
          background: 'linear-gradient(135deg, #1e293b 0%, #172033 100%)',
          border: '1px solid rgba(249,115,22,0.45)',
          borderRadius: '16px', padding: '14px', cursor: 'pointer',
          boxShadow: '0 4px 24px rgba(249,115,22,0.12)',
        }}
      >
        {coverOk ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={sample.coverUrl}
            alt=""
            onError={() => setCoverOk(false)}
            style={{ width: '72px', height: '96px', objectFit: 'cover', borderRadius: '10px', flexShrink: 0 }}
          />
        ) : (
          <div style={{ width: '72px', height: '96px', borderRadius: '10px', flexShrink: 0, background: 'linear-gradient(160deg,#334155,#0f172a)' }} />
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ color: '#fb923c', fontSize: '12px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '4px' }}>
            Continue listening
          </div>
          <div style={{ color: 'white', fontSize: '17px', fontWeight: 800, lineHeight: 1.25, marginBottom: '4px', overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
            {sample.title}
          </div>
          <div style={{ color: '#94a3b8', fontSize: '13px' }}>
            {formatPosition(resumeSeconds)} · {sample.genre}
          </div>
        </div>
        <div
          aria-hidden
          style={{
            width: '44px', height: '44px', borderRadius: '50%', flexShrink: 0,
            backgroundColor: '#f97316', display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'white', fontSize: '18px', paddingLeft: '3px',
          }}
        >
          ▶
        </div>
      </div>
    </section>
  )
}
