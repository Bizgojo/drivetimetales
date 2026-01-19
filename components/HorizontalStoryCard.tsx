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
      href={`/player/${id}`}
      className="flex bg-slate-800 rounded-xl overflow-hidden hover:bg-slate-700 transition"
    >
      <div className="w-28 h-28 flex-shrink-0 p-2">
        <div className="w-full h-full rounded-lg overflow-hidden cover-glow">
          <img 
            src={cover_url || '/images/default-cover.png'} 
            alt={title}
            className="w-full h-full object-cover" 
          />
        </div>
      </div>
      <div className="flex-1 py-2 pr-3 flex flex-col justify-center">
        <h3 className="text-sm font-bold text-white line-clamp-1">{title}</h3>
        <p className="text-white text-xs">{genre}</p>
        <p className="text-white text-xs">by {author}</p>
        <p className="text-white text-xs">{duration_mins} min • {credits} credits</p>
        {rating !== undefined && (
          <p className="text-white text-xs flex items-center gap-1">
            {rating.toFixed(1)}/5{' '}
            {renderStars(rating)}{' '}
            {review_count || 0}
            {flag && (
              <span 
                className="font-bold rounded ml-1"
                style={{ 
                  backgroundColor: flag === 'free' ? '#22c55e' : '#f97316', 
                  color: 'white', 
                  fontSize: '9px',
                  padding: '0.125rem 0.375rem'
                }}
              >
                {flag === 'free' ? 'FREE' : 
                 flag === 'editors-pick' ? "EDITOR'S PICK" :
                 flag === 'readers-choice' ? "READER'S CHOICE" : 'TRENDING'}
              </span>
            )}
          </p>
        )}
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
