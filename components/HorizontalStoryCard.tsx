// =============================================================================
// MODULE 01: HorizontalStoryCard (PROTECTED)
// Updated: 120px covers, all props for library-playlist compatibility
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

export default function HorizontalStoryCard({
  id,
  title,
  author,
  genre,
  duration_mins,
  cover_url,
  rating = 0,
  reviews = 0,
  flag = null,
  credits,
  series_number,
  series_total,
  play_status
}: HorizontalStoryCardProps) {
  const displayCredits = credits ?? Math.ceil(duration_mins / 15)

  return (
    <Link href={`/player/${id}`} style={{ textDecoration: 'none' }}>
      <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start', cursor: 'pointer' }}>
        {/* Cover Image - 120px for mobile */}
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <img
            src={cover_url || '/images/default-cover.png'}
            alt={title}
            style={{
              width: '120px',
              height: '120px',
              objectFit: 'cover',
              borderRadius: '0.5rem',
              boxShadow: '0 0 20px rgba(251, 146, 60, 0.3)'
            }}
          />
          {flag && (
            <span
              style={{
                position: 'absolute',
                top: '0.5rem',
                left: '0.5rem',
                backgroundColor: flag === 'free' ? '#22c55e' : '#f97316',
                color: 'white',
                fontSize: '10px',
                fontWeight: 'bold',
                padding: '0.125rem 0.375rem',
                borderRadius: '0.25rem',
                textTransform: 'uppercase'
              }}
            >
              {flag}
            </span>
          )}
          {(play_status === 'in_progress' || play_status === 'continue') && (
            <div
              style={{
                position: 'absolute',
                bottom: 0,
                left: 0,
                right: 0,
                height: '4px',
                backgroundColor: 'rgba(0,0,0,0.5)',
                borderBottomLeftRadius: '0.5rem',
                borderBottomRightRadius: '0.5rem'
              }}
            >
              <div style={{ width: '50%', height: '100%', backgroundColor: '#f97316' }} />
            </div>
          )}
        </div>

        {/* Content */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <h3
            style={{
              fontSize: '20px',
              fontWeight: 'bold',
              color: 'white',
              marginBottom: '0.25rem',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap'
            }}
          >
            {title}
          </h3>
          <p style={{ fontSize: '17px', color: '#94a3b8', marginBottom: '0.25rem' }}>
            {genre}
          </p>
          <p style={{ fontSize: '17px', color: '#94a3b8', marginBottom: '0.25rem' }}>
            by {author}
          </p>
          <p style={{ fontSize: '17px', color: '#94a3b8', marginBottom: '0.5rem' }}>
            {duration_mins} min • {displayCredits} credits
            {series_number && series_total && ` • Part ${series_number}/${series_total}`}
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontSize: '14px', color: 'white' }}>
              {rating.toFixed(1)}/5
            </span>
            <span style={{ display: 'flex' }}>
              {renderStars(rating)}
            </span>
            <span style={{ fontSize: '14px', color: '#64748b' }}>
              {reviews} reviews
            </span>
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
