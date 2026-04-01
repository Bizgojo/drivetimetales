// Preview version - uses mock data to show layout in Claude artifact panel

export default function NewReleasesPreview() {
  // Mock data for preview
  const stories = [
    {
      id: '1',
      title: 'The Midnight Detective',
      genre: 'Mystery',
      author: 'Sarah Johnson',
      duration_mins: 45,
      cover_url: 'https://picsum.photos/200?random=1',
      published_on: '2026-01-15',
    },
    {
      id: '2',
      title: 'Love in the Time of Algorithms',
      genre: 'Romance',
      author: 'Michael Chen',
      duration_mins: 32,
      cover_url: 'https://picsum.photos/200?random=2',
      published_on: '2026-01-14',
    },
  ];

  function getCredits(duration_mins) {
    return Math.max(1, Math.floor(duration_mins / 15));
  }

  function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric', 
      year: 'numeric' 
    });
  }

  return (
    <div style={{ backgroundColor: '#0f172a', minHeight: '100vh', padding: '1rem' }}>
      {/* Module container */}
      <section style={{ paddingLeft: '1rem', paddingRight: '1rem', paddingTop: '1.5rem', paddingBottom: '1rem' }}>
        <h2 style={{ fontSize: '1.125rem', fontWeight: 'bold', color: 'white', marginBottom: '1rem' }}>
          🆕 New Releases
        </h2>
        
        {/* 2-column grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.75rem' }}>
          {stories.map((story) => (
            <a 
              key={story.id} 
              href={`/player/${story.id}`}
              style={{ 
                display: 'block', 
                backgroundColor: '#1e293b', 
                borderRadius: '0.75rem', 
                padding: '0.5rem',
                textDecoration: 'none',
                cursor: 'pointer'
              }}
            >
              {/* Cover with glow */}
              <div style={{ 
                borderRadius: '0.5rem', 
                overflow: 'hidden',
                boxShadow: '0 0 15px rgba(255, 255, 255, 0.4)'
              }}>
                <img 
                  src={story.cover_url} 
                  alt={story.title}
                  style={{ width: '100%', aspectRatio: '1 / 1', objectFit: 'cover' }}
                />
              </div>
              
              {/* Metadata */}
              <div style={{ marginTop: '0.5rem' }}>
                <h3 style={{ 
                  fontSize: '0.75rem', 
                  fontWeight: 'bold', 
                  color: 'white', 
                  margin: 0,
                  lineHeight: '1.25',
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden'
                }}>
                  {story.title}
                </h3>
                <p style={{ color: 'white', fontSize: '0.75rem', margin: 0 }}>{story.genre}</p>
                <p style={{ color: 'white', fontSize: '0.75rem', margin: 0 }}>by {story.author}</p>
                <p style={{ color: 'white', fontSize: '0.75rem', margin: 0 }}>
                  {story.duration_mins} min • {getCredits(story.duration_mins)} cr
                </p>
                <p style={{ color: '#94a3b8', fontSize: '0.75rem', margin: 0 }}>{formatDate(story.published_on)}</p>
              </div>
            </a>
          ))}
        </div>
      </section>
      
      {/* Label showing this is a preview */}
      <div style={{ textAlign: 'center', color: '#64748b', fontSize: '0.75rem', marginTop: '2rem' }}>
        ↑ Preview of Module 07: NewReleases with inline styles ↑
        <br />
        2-column grid, square covers with glow
      </div>
    </div>
  );
}
