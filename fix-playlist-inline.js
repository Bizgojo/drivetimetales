const fs = require('fs');
const f = 'app/library-playlist/page.tsx';
let c = fs.readFileSync(f, 'utf8');

// Replace the HorizontalStoryCard usage with a simple inline card (no Link)
c = c.replace(
  `                <div
                  key={story.id}
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); if (!inPlaylist) addToPlaylist(story); }}
                  style={{ opacity: inPlaylist ? 0.6 : 1, cursor: inPlaylist ? 'default' : 'pointer', outline: inPlaylist ? '2px solid #22c55e' : 'none', borderRadius: '14px', position: 'relative' }}
                >
                  <HorizontalStoryCard
                    id={story.id}
                    title={story.title}
                    genre={story.genre}
                    author={story.author}
                    duration_mins={story.duration_mins}
                    cover_url={story.cover_url}
                    flags={story.series_name ? ['series'] : []}
                    hidePill={true}
                  />
                  <div style={{ position: 'absolute', bottom: '14px', right: '14px', background: inPlaylist ? 'rgba(34,197,94,0.88)' : 'rgba(59,130,246,0.88)', borderRadius: '20px', padding: '4px 9px', display: 'flex', alignItems: 'center', gap: '4px', boxShadow: '0 2px 6px rgba(0,0,0,0.4)', pointerEvents: 'none' }}>
                    <span style={{ color: 'white', fontSize: '9px', fontWeight: 800, letterSpacing: '0.05em', textTransform: 'uppercase' }}>{inPlaylist ? '✓ Added' : '+ Add'}</span>
                  </div>
                </div>`,
  `                <div
                  key={story.id}
                  onClick={() => { if (!inPlaylist) addToPlaylist(story); }}
                  style={{ opacity: inPlaylist ? 0.6 : 1, cursor: inPlaylist ? 'default' : 'pointer', outline: inPlaylist ? '2px solid #22c55e' : 'none', borderRadius: '14px', position: 'relative', display: 'flex', background: '#1e293b', overflow: 'hidden', border: '1px solid rgba(148,163,184,0.06)', alignItems: 'stretch', minHeight: '90px' }}
                >
                  <div style={{ flexShrink: 0, width: '90px', height: '90px', position: 'relative' }}>
                    <img src={story.cover_url || '/images/default-cover.png'} alt={story.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    <div style={{ position: 'absolute', bottom: '6px', right: '6px', background: inPlaylist ? 'rgba(34,197,94,0.9)' : 'rgba(59,130,246,0.9)', borderRadius: '20px', padding: '3px 8px', boxShadow: '0 2px 6px rgba(0,0,0,0.4)' }}>
                      <span style={{ color: 'white', fontSize: '9px', fontWeight: 800, letterSpacing: '0.05em', textTransform: 'uppercase' }}>{inPlaylist ? '✓ Added' : '+ Add'}</span>
                    </div>
                  </div>
                  <div style={{ flex: 1, padding: '10px 12px', display: 'flex', flexDirection: 'column', justifyContent: 'center', minWidth: 0 }}>
                    <p style={{ color: 'white', fontSize: '14px', fontWeight: 700, margin: '0 0 4px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{story.title}</p>
                    <p style={{ color: '#94a3b8', fontSize: '12px', margin: '0 0 2px' }}>{story.author}</p>
                    <p style={{ color: '#64748b', fontSize: '11px', margin: 0 }}>{story.genre} · {story.duration_mins} min</p>
                  </div>
                </div>`
);

fs.writeFileSync(f, c);
console.log('done');
