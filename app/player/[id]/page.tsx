'use client'

import { Suspense } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import CanonicalPlayer from '@/components/player/CanonicalPlayer'

function PlayerContent() {
  const params = useParams()
  const searchParams = useSearchParams()
  const storyId = params.id as string
  const resumeParam = searchParams.get('resume')

  return <CanonicalPlayer storyId={storyId} resumeParam={resumeParam} mode="story" />
}

export default function PlayerPage() {
  return (
    <Suspense fallback={<div style={{ height:'100dvh', backgroundColor:'#020617', display:'flex', alignItems:'center', justifyContent:'center' }}><div style={{ width:'40px', height:'40px', border:'4px solid #f97316', borderTopColor:'transparent', borderRadius:'50%', animation:'spin 1s linear infinite' }} /><style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style></div>}>
      <PlayerContent />
    </Suspense>
  )
}
