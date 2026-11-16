/*
================================================================================
🏠 LANDING PAGE - Endless Tales
Location: app/page.tsx

Public landing page. Layout, wording, colours and type follow the approved
reference design (mobile-first, 480px column, dark navy #09090e with amber
#e8520a buttons, Playfair Display headings + DM Sans body + DM Mono labels).

This page is standalone — it does not reuse the previous app landing page or
its components. Series art, episode counts and preview audio are resolved
from the database per request.
================================================================================
*/

import type { Metadata } from 'next'
import { createClient } from '@supabase/supabase-js'
import LandingClient, { type SeriesCardData } from './LandingClient'

export const dynamic = 'force-dynamic'
export const revalidate = 300

const SITE_URL = 'https://www.endless-tales.com'
const OG_IMAGE = `${SITE_URL}/images/og-share.png`

export const metadata: Metadata = {
  title: 'Endless Tales — Press play. Get lost in a story.',
  description:
    'Original audio dramas with full casts, original scores and sound design. Short stories, big productions, made for your me-time.',
  metadataBase: new URL(SITE_URL),
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    url: '/',
    siteName: 'Endless Tales',
    title: 'Endless Tales — Press play. Get lost in a story.',
    description:
      'Original audio dramas with full casts, original scores and sound design. Short stories, big productions, made for your me-time.',
    images: [{ url: OG_IMAGE, width: 1024, height: 1024, alt: 'Endless Tales' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Endless Tales — Press play. Get lost in a story.',
    description:
      'Original audio dramas with full casts, original scores and sound design. Short stories, big productions, made for your me-time.',
    images: [OG_IMAGE],
  },
}

// LANDING-CARDS-001: the four series shown on the page, each anchored to its
// EP1 story because covers are stored per-episode (series has no cover
// column). Episode counts are counted from published stories.
const FEATURED: {
  seriesId: string
  anchorStoryId: string
  genre: string
  description: string
}[] = [
  {
    seriesId: '78882d57-fd50-4095-99ab-0a577472eb9a',
    anchorStoryId: '3b4509ba-b4f3-4e21-a5e4-27b589ca307c',
    genre: 'Mystery · Series',
    description:
      'A widow hears her late husband\u2019s voice on a voicemail recorded after he died \u2014 and starts counting who else in town already knew.',
  },
  {
    seriesId: 'd1f90c2a-44c2-4b3c-b489-fb10882490bd',
    anchorStoryId: '92587140-6371-4bed-875c-548fdbb9abc7',
    genre: 'Drama · Series',
    description:
      'A bakery, a debt, and a second chance that only exists if she can prove the first one was never really over.',
  },
  {
    seriesId: 'd6af80a4-1ac9-48ae-8e7a-1fb71357e4ad',
    anchorStoryId: '9d8f6c00-fbe1-4919-85bd-86a085f45e71',
    genre: 'Thriller · Series',
    description:
      'One weekend in Miami. Two people with different plans. A suite key that opens far more than a hotel room.',
  },
  {
    seriesId: '8a7ab253-f1d7-4b22-95df-e27da9423ff7',
    anchorStoryId: '7a8c7ba5-d0a8-4f43-886a-368c8aa96b83',
    genre: 'Drama · Series',
    description:
      'The nanny knows the house better than the family does \u2014 including where everything is hidden.',
  },
]

async function loadSeries(): Promise<SeriesCardData[]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) return []

  const supabase = createClient(url, key, { auth: { persistSession: false } })

  const { data: anchors } = await supabase
    .from('stories')
    .select('id,title,cover_url,audio_url')
    .in('id', FEATURED.map(f => f.anchorStoryId))

  const anchorById = new Map((anchors || []).map(a => [a.id, a]))

  const out: SeriesCardData[] = []
  for (const f of FEATURED) {
    const anchor = anchorById.get(f.anchorStoryId)
    if (!anchor) continue

    const { data: series } = await supabase
      .from('series')
      .select('id,title')
      .eq('id', f.seriesId)
      .maybeSingle()
    if (!series) continue

    const { count } = await supabase
      .from('stories')
      .select('id', { count: 'exact', head: true })
      .eq('series_id', f.seriesId)
      .eq('status', 'published')

    out.push({
      id: series.id,
      title: series.title,
      genre: f.genre,
      description: f.description,
      episodeCount: count ?? 0,
      coverUrl: anchor.cover_url || null,
      audioUrl: anchor.audio_url || null,
    })
  }
  return out
}

export default async function HomePage() {
  const series = await loadSeries()
  return <LandingClient series={series} signupHref="/signup" />
}
