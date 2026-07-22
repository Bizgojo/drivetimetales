/*
================================================================================
  /go — Ad Landing Page (server component entry point)
================================================================================

  GO-PREVIEW-001 (Marc authorization 13:11 EDT, 2026-07-22):
  Muted autoplay preview clip (Murder at Falls Park, 2:02–2:18).
  GoPreviewOverlay component lives in components/GoPreviewOverlay.tsx.
  Preview variant gated by go_variant_config.preview_clip_url (NULL = no preview).
  CTA slides at 45s (GO_CTA_REVEAL_LISTEN_SEC). preview_continue_sec=138 (2:18).

  GO-ACCURACY-001 (Marc authorization, msg 3691, 2026-07-22):
  · Social proof corrected to '60+ stories for your ears'
  · generateMetadata added: story-specific OG/Twitter tags per ?v= param.
    Client component extracted to GoLandingPageClient.tsx; this file is
    now a server component so Next.js can call generateMetadata at request
    time. Page render behaviour is identical.
================================================================================
*/

import type { Metadata } from 'next'
import { resolveGoStory, GO_LIVE_VARIANTS } from '@/lib/landing'
import GoLandingPage from './GoLandingPageClient'

// GO-ACCURACY-001 (Marc authorization, msg 3691, 2026-07-22):
// Story-specific OG + Twitter card meta tags for /go. resolveGoStory is called
// server-side with the same logic the client component uses at runtime, so the
// crawler always sees the correct story for a given ?v= variant. The default
// (bare /go or unknown v=) resolves to GO_SAMPLE_STORY ("The Grave He Dug
// Himself"). coverUrl drives the social card image (1200×630 crop target).
export async function generateMetadata({
  searchParams,
}: {
  searchParams: { v?: string }
}): Promise<Metadata> {
  const story = resolveGoStory(
    new URLSearchParams(searchParams as Record<string, string>).toString(),
    GO_LIVE_VARIANTS,
  )

  return {
    title: `${story.title} — Listen Free | Endless Tales`,
    description: story.hook,
    openGraph: {
      title: `${story.title} — Listen Free | Endless Tales`,
      description: story.hook,
      url: `https://app.endless-tales.com/go?v=${searchParams.v ?? ''}`,
      images: story.coverUrl
        ? [{ url: story.coverUrl, width: 1200, height: 630, alt: story.title }]
        : undefined,
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title: `${story.title} — Listen Free | Endless Tales`,
      description: story.hook,
      images: story.coverUrl ? [story.coverUrl] : undefined,
    },
  }
}

export default GoLandingPage
