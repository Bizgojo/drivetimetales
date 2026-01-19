import Link from 'next/link'

interface StoryCardProps {
  id: string
  title: string
  genre: string
  author: string
  duration_mins: number
  credits: number
  cover_url: string | null
  rating?: number
  review_count?: number
  flag?: 'free' | 'editors-pick' | 'readers-choice' | 'trending' | null
}

export default function HorizontalStoryCard({
  id,
  title,
  genre,
  author,
  duration_mins,
  credits,
  cover_url,
  rating,
  review_count,
  flag,
}: StoryCardProps) {
  return (
    <Link 
      href={'/player/' + id}
      className="flex bg-slate-800 rounded-xl overflow-hidden hover:bg-slate-700 transition"
    >
      <div style={{ width: '145px', height: '145px', flexShrink: 0, padding: '0.5rem' }}>
        <div className="rounded-lg overflow-hidden cover-glow" style={{ width: '100%', height: '100%' }}>
          <img 
            src={cover_url || '/images/default-cover.png'} 
            alt={title}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        </div>
      </div>
      <div style={{ flex: 1, padding: '0.5rem 0.75rem', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        <h3 className="text-white font-bold line-clamp-1" style={{ fontSize: '20px', margin: 0 }}>{title}</h3>
        <p className="text-white" style={{ fontSize: '17px', margin: '3px 0' }}>{genre}</p>
        <p className="text-white" style={{ fontSize: '17px', margin: '3px 0' }}>by {author}</p>
        <p className="text-white" style={{ fontSize: '17px', margin: '3px 0' }}>{duration_mins} min • {credits} credits</p>
        <p className="text-white" style={{ fontSize: '17px', margin: '3px 0', display: 'flex', alignItems: 'center', gap: '4px' }}>
          {rating !== undefined ? rating.toFixed(1) : '4.0'}/5{' '}
          {renderStars(rating || 4.0)}{' '}
          {review_count || 0}
          {flag && (
            <span 
              className="font-bold rounded"
              style={{ 
                backgroundColor: flag === 'free' ? '#22c55e' : '#f97316', 
                color: 'white', 
                fontSize: '12px',
                padding: '3px 10px',
                marginLeft: '6px'
              }}
            >
              {flag === 'free' ? 'FREE' : 
               flag === 'editors-pick' ? "EDITOR'S PICK" :
               flag === 'readers-choice' ? "READER'S CHOICE" : 'TRENDING'}
            </span>
          )}
        </p>
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
