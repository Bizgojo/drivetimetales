/*
================================================================================
  /go — Ad Landing Page (server component entry point)
================================================================================

GO-ACCURACY-001 (Marc authorization, msg 3691, 2026-07-22):
· Social proof corrected to '60+ stories for your ears'
· generateMetadata added: story-specific OG/Twitter tags per ?v= param.

CTA-INSTRUMENTATION-001 (2026-07-22): converted to a server component shell
so that GoVariantConfig can be fetched from Supabase at render time (server-
side, before the client component hydrates). Client logic lives in
GoLandingContent.tsx.

HARD RULES (unchanged):
- NO auth calls of any kind. '/go' is in PUBLIC_ROUTES (middleware.ts).
- fetchGoVariantConfig never throws; null → GoLandingContent uses hardcoded
  fallbacks. The page will never crash because the table isn't migrated yet.
================================================================================
*/

import { Suspense } from 'react'
import type { Metadata } from 'next'
import { resolveGoStory, GO_LIVE_VARIANTS } from '@/lib/landing'
import GoLandingContent from './GoLandingContent'
import GoInvitationContent from './GoInvitationContent'
import { fetchGoVariantConfig } from '@/lib/goVariantConfig'

function LoadingFallback() {
  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#0f0f1a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: '40px', height: '40px', border: '4px solid #f97316', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
      <style dangerouslySetInnerHTML={{ __html: '@keyframes spin { to { transform: rotate(360deg); } }' }} />
    </div>
  )
}

// GO-ACCURACY-001: Story-specific OG + Twitter card meta tags for /go.
// resolveGoStory is called server-side with the same logic the client
// component uses at runtime, so the crawler always sees the correct story
// for a given ?v= variant. The default (bare /go or unknown v=) resolves
// to GO_SAMPLE_STORY. coverUrl drives the social card image (1200×630 crop).
export async function generateMetadata({
  searchParams,
}: {
  searchParams: { v?: string; arm?: string }
}): Promise<Metadata> {
  // LANDING-GATE-001: Bell Beneath Falls Park funnel meta tags
  if (searchParams.arm === '1' || searchParams.arm === '2' || searchParams.arm === '3') {
    const bellTitle  = 'The Bell Beneath Falls Park — Listen Free | Endless Tales'
    const bellDesc   = 'Something answered from under the water. And it knew her name.'
    const bellCover  = 'https://vmyhlfeouzslixtkmddy.supabase.co/storage/v1/object/public/audio/asc3/a8c8b8d0-f717-44c4-a6a5-39c3a65d9c2e/cover_1785337095142.jpg'
    return {
      title: bellTitle,
      description: bellDesc,
      openGraph: {
        title: bellTitle,
        description: bellDesc,
        url: `https://app.endless-tales.com/go?arm=${searchParams.arm}`,
        images: [{ url: bellCover, width: 1200, height: 630, alt: 'The Bell Beneath Falls Park' }],
        type: 'website',
      },
      twitter: { card: 'summary_large_image', title: bellTitle, description: bellDesc, images: [bellCover] },
    }
  }

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

export default async function GoLandingPage({
  searchParams,
}: {
  searchParams: { v?: string; arm?: string }
}) {
  // LANDING-GATE-001: ?arm=1/2/3 → Bell Beneath Falls Park invitation-gate funnel.
  // All three arms use GoInvitationContent (email-only capture → EP2).
  // Existing ?v= trial flow is preserved for bare /go and ?v= variants.
  const armParam = searchParams?.arm
  if (armParam === '1' || armParam === '2' || armParam === '3') {
    const arm = Number(armParam) as 1 | 2 | 3
    return (
      <Suspense fallback={<LoadingFallback />}>
        <GoInvitationContent arm={arm} />
      </Suspense>
    )
  }

  // BUILD 2: fetch variant config server-side. Never throws (lib guarantees).
  // null = table pre-migration or no row → GoLandingContent uses hardcoded fallbacks.
  const variantConfig = await fetchGoVariantConfig(searchParams?.v ?? null)

  return (
    <Suspense fallback={<LoadingFallback />}>
      <GoLandingContent variantConfig={variantConfig} />
    </Suspense>
  )
}
