const fs = require('fs');
const f = 'app/library-playlist/page.tsx';
let c = fs.readFileSync(f, 'utf8');

// Wrap the card div to intercept clicks and prevent Link navigation
c = c.replace(
  `                <div
                  key={story.id}
                  onClick={() => !inPlaylist && addToPlaylist(story)}
                  style={{ opacity: inPlaylist ? 0.6 : 1, cursor: inPlaylist ? 'default' : 'pointer', outline: inPlaylist ? '2px solid #22c55e' : 'none', borderRadius: '14px', position: 'relative' }}
                >`,
  `                <div
                  key={story.id}
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); if (!inPlaylist) addToPlaylist(story); }}
                  style={{ opacity: inPlaylist ? 0.6 : 1, cursor: inPlaylist ? 'default' : 'pointer', outline: inPlaylist ? '2px solid #22c55e' : 'none', borderRadius: '14px', position: 'relative' }}
                >`
);

fs.writeFileSync(f, c);
console.log('done');
