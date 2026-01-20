'use client'

interface HorizontalStoryCardProps {
  id: string
  title: string
  genre: string
  author: string
  duration_mins: number
  credits: number
  cover_url: string | null
  series_number?: number | null
  series_total?: number | null
  play_status?: string
  flag?: string | null
}

export default function HorizontalStoryCard({
  id,
  title,
  genre,
  author,
  duration_mins,
  credits,
  cover_url,
  series_number,
  series_total,
  play_status,
  flag
}: HorizontalStoryCardProps) {

  return (
    <div style={{
      backgroundColor: '#1e293b',
      borderRadius: '8px',
      padding: '0.5rem',
      display: 'flex',
      gap: '0.6rem',
      alignItems: 'center'
    }}>
      <div style={{
        width: '70px',
        height: '70px',
        borderRadius: '6px',
        overflow: 'hidden',
        flexShrink: 0,
        backgroundColor: '#334155',
        boxShadow: '0 0 12px rgba(255, 255, 255, 0.3)'
      }}>
        {cover_url ? (
          <img src={cover_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px' }}>📖</div>
        )}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ color: 'white', fontSize: '14px', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', lineHeight: 1.2 }}>
          {title}
          {series_number && series_total && <span style={{ color: '#3b82f6', fontSize: '11px', marginLeft: '4px' }}>[{series_number}/{series_total}]</span>}
        </div>
        <div style={{ color: '#cbd5e1', fontSize: '12px', lineHeight: 1.3 }}>{genre}</div>
        <div style={{ color: '#cbd5e1', fontSize: '12px', lineHeight: 1.3 }}>by {author}</div>
        <div style={{ display: 'flex', alignItems: 'center', lineHeight: 1.3 }}>
          <span style={{ color: 'white', fontSize: '12px' }}>{duration_mins} min • {credits} {credits === 1 ? 'credit' : 'credits'}</span>
          {flag === 'free' && (
            <span style={{ backgroundColor: '#22c55e', color: 'white', fontSize: '9px', fontWeight: 600, padding: '1px 5px', borderRadius: '3px', marginLeft: 'auto' }}>FREE</span>
          )}
        </div>
      </div>
    </div>
  )
}
