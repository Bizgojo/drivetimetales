'use client'

import { Suspense } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import CanonicalPlayer from '@/components/player/CanonicalPlayer'

function PlayerContent() {
  const params = useParams()
  const searchParams = useSearchParams()
  const storyId = params.id as string
  const resumeParam = searchParams.get('resume')
  // MARC-PLAYLIST-AUTOADVANCE-001 (2026-10-05): a playlist's auto-advance
  // navigates here (not /player/playlist) so the dynamic [id] segment changes
  // and the player actually re-mounts for the next episode/story. Without
  // this, landing here always forced mode="story" and dropped playlist
  // queue tracking the moment one episode finished.
  const isPlaylist = searchParams.get('playlist') === '1'

  return <CanonicalPlayer storyId={storyId} resumeParam={resumeParam} mode={isPlaylist ? 'playlist' : 'story'} />
}

export default function PlayerPage() {
  return (
    <Suspense fallback={<div style={{ height:'100dvh', backgroundColor:'#020617', display:'flex', alignItems:'center', justifyContent:'center' }}><div style={{ width:'40px', height:'40px', border:'4px solid #f97316', borderTopColor:'transparent', borderRadius:'50%', animation:'spin 1s linear infinite' }} /><style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style></div>}>
      <PlayerContent />
    </Suspense>
  )
}
