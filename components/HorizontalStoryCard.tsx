// =============================================================================
// MODULE 01: HorizontalStoryCard (PROTECTED)
// Title centered on top, cover bottom-aligned with stars
// =============================================================================
import Link from 'next/link'

interface HorizontalStoryCardProps {
  id: string
  title: string
  author: string
  genre: string
  duration_mins: number
  cover_url: string | null
  rating?: number
  reviews?: number
  flag?: string | null
  credits?: number
  series_number?: number | null
  series_total?: number | null
  play_status?: string | null
}

// Generate consistent random number based on string (story id)
function seededRandom(seed: string) {
  let hash = 0
  for (let i = 0; i < seed.length; i++) {
    const char = seed.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash
  }
  return Math.abs(hash)
}

export default function HorizontalStoryCard({
  id,
  title,
  author,
  genre,
  duration_mins,
  cover_url,
  rating,
  reviews,
  flag = null,
  credits,
  series_number,
  series_total,
  play_status
}: HorizontalStoryCardProps) {
  const displayCredits = credits ?? Math.ceil(duration_mins / 15)
  
  // Generate random rating 3.7-4.9 and reviews 3-99 based on story id
  const seed = seededRandom(id)
  const displayRating = rating ?? (3.7 + (seed % 13) / 10)
  const displayReviews = reviews ?? (3 + (seed % 97))

  return (
    <Link href={`/player/${id}`} style={{ textDecoration: 'none' }}>
      <div style={{ 
        cursor: 'pointer',
        backgroundColor: '#1e293b',
        padding: '0.75rem',
        borderRadius: '0.5rem'
      }}>
        {/* Title centered across top */}
        <h3
          style={{
            fontSize: '16px',
            fontWeight: 'bold',
            color: 'white',
            marginBottom: '0.5rem',
            textAlign: 'center',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap'
          }}
        >
          {title}
        </h3>
        
        {/* Content row: cover left (bottom-aligned), text right */}
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-end' }}>
          {/* Cover Image - 80px, bottom aligned */}
          <div style={{ position: 'relative', flexShrink: 0 }}>
            <img
              src={cover_url || '/images/default-cover.png'}
              alt={title}
              style={{
                width: '80px',
                height: '80px',
                objectFit: 'cover',
                borderRadius: '0.375rem',
                boxShadow: '0 0 15px rgba(251, 146, 60, 0.3)'
              }}
            />
            {(play_status === 'in_progress' || play_status === 'continue') && (
              <div
                style={{
                  position: 'absolute',
                  bottom: 0,
                  left: 0,
                  right: 0,
                  height: '3px',
                  backgroundColor: 'rgba(0,0,0,0.5)',
                  borderBottomLeftRadius: '0.375rem',
                  borderBottomRightRadius: '0.375rem'
                }}
              >
                <div style={{ width: '50%', height: '100%', backgroundColor: '#f97316' }} />
              </div>
            )}
          </div>

          {/* Text content */}
          <div style={{ flex: 1, minWidth: 0 }}>
            {/* Genre with flag */}
            <p style={{ fontSize: '14px', color: 'white', marginBottom: '0.125rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              {genre}
              {flag && (
                <span
                  style={{
                    backgroundColor: flag === 'free' ? '#22c55e' : '#f97316',
                    color: 'white',
                    fontSize: '9px',
                    fontWeight: 'bold',
                    padding: '0.125rem 0.375rem',
                    borderRadius: '0.25rem',
                    textTransform: 'uppercase'
                  }}
                >
                  {flag}
                </span>
              )}
            </p>
            
            <p style={{ fontSize: '14px', color: 'white', marginBottom: '0.125rem' }}>
              by {author}
            </p>
            
            <p style={{ fontSize: '14px', color: 'white', marginBottom: '0.25rem' }}>
              {duration_mins} min • {displayCredits} cr
              {series_number && series_total && ` • Part ${series_number}/${series_total}`}
            </p>
            
            {/* Rating row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontSize: '12px', color: 'white' }}>
                {displayRating.toFixed(1)}/5
              </span>
              <span style={{ display: 'flex' }}>
                {renderStars(displayRating)}
              </span>
              <span style={{ fontSize: '12px', color: 'white' }}>
                {displayReviews}
              </span>
            </div>
          </div>
        </div>
      </div>
    </Link>
  )
}

function renderStars(rating: number) {
  const stars = []
  const fullStars = Math.floor(rating)
  const hasHalf = rating % 1 >= 0.5
  for (let i = 0; i < 5; i++) {
    if (i < fullStars) {
      stars.push(<span key={i} className="text-yellow-400">★</span>)
    } else if (i === fullStars && hasHalf) {
      stars.push(<span key={i} className="star-half">★</span>)
    } else {
      stars.push(<span key={i} className="text-slate-600">★</span>)
    }
  }
  return stars
}
