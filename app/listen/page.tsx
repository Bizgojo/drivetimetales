// app/listen/page.tsx — GVL-EAVESDROP-001
// Eavesdrop acquisition landing page for the Wearing My Face / Cass Greenville series.
// Spec: ACQUISITION-RETENTION-001 Part E2 + A3 + A3b.
//
// Server component: fetches story data from Supabase at render time.
// Client component (EavesdropClient) handles all UX interaction.
//
// Route: /listen?arm=1|2|3&utm_source=...&utm_campaign=...&promo=...
// - arm=1: play Ep1 → wall
// - arm=2: play Ep1+Ep2 → wall
// - arm=3: play Ep1+Ep2+Ep3 → wall
// After wall submit → auto-continue Ep4 (Belle welcome baked in)

import { Suspense } from 'react'
import { createClient } from '@supabase/supabase-js'
import EavesdropClient from './EavesdropClient'

// Wearing My Face episode IDs (Cass Greenville series)
const EP1_ID = 'd07bfe28-a550-4d19-8d84-a8e977b60a39'
const EP2_ID = '081298a2-0e17-474d-bb2d-42ee02df1372'
const EP3_ID = '6f7656ad-904e-4ba5-89bd-14729b245eda'
const EP4_ID = 'eac2b1ef-6456-46b1-8c17-bbdf32d8ff5d'

const EPISODE_IDS = [EP1_ID, EP2_ID, EP3_ID, EP4_ID]

export type EpisodeData = {
  id: string
  title: string
  episodeTitle: string | null
  description: string | null
  storyAudioUrl: string | null
  coverImageUrl: string | null
  coverUrl: string | null
  episodeNumber: number | null
}

function LoadingFallback() {
  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#0f0f1a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: '40px', height: '40px', border: '4px solid #f97316', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
      <style dangerouslySetInnerHTML={{ __html: '@keyframes spin { to { transform: rotate(360deg); } }' }} />
    </div>
  )
}

async function fetchEpisodes(): Promise<EpisodeData[]> {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
    const { data, error } = await supabase
      .from('stories')
      .select('id,title,episode_title,description,story_audio_url,cover_image_url,cover_url,series_episode_number')
      .in('id', EPISODE_IDS)

    if (error || !data) {
      console.error('[listen/page] fetchEpisodes error:', error)
      return []
    }

    // Map to typed shape, preserving order by EPISODE_IDS
    const byId = Object.fromEntries(data.map((r: Record<string, unknown>) => [r.id, r]))
    return EPISODE_IDS.map(id => {
      const r = byId[id] ?? {}
      return {
        id,
        title: (r.title as string) ?? 'Wearing My Face',
        episodeTitle: (r.episode_title as string) ?? null,
        description: (r.description as string) ?? null,
        storyAudioUrl: (r.story_audio_url as string) ?? null,
        coverImageUrl: (r.cover_image_url as string) ?? null,
        coverUrl: (r.cover_url as string) ?? null,
        episodeNumber: (r.series_episode_number as number) ?? null,
      }
    })
  } catch (err) {
    console.error('[listen/page] fetchEpisodes unexpected error:', err)
    return []
  }
}

export default async function ListenPage({
  searchParams,
}: {
  searchParams: { arm?: string; utm_source?: string; utm_campaign?: string; promo?: string }
}) {
  const episodes = await fetchEpisodes()

  const arm = Math.min(3, Math.max(1, Number(searchParams?.arm ?? '1') || 1)) as 1 | 2 | 3
  const utmSource = searchParams?.utm_source ?? null
  const utmCampaign = searchParams?.utm_campaign ?? null
  const promo = searchParams?.promo ?? null

  return (
    <Suspense fallback={<LoadingFallback />}>
      <EavesdropClient
        episodes={episodes}
        arm={arm}
        utmSource={utmSource}
        utmCampaign={utmCampaign}
        promo={promo}
      />
    </Suspense>
  )
}
