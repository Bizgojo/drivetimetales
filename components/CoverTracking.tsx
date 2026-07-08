'use client'

import { useEffect } from 'react'
import { initCoverTracking } from '@/lib/coverTracking'

/**
 * C6 Cover Performance Tracking — mount once per page that renders story cards.
 * Watches `[data-cover-track]` elements for viewport impressions and taps.
 * Renders nothing; purely additive instrumentation.
 */
export default function CoverTracking() {
  useEffect(() => initCoverTracking(), [])
  return null
}
