const fs = require('fs');
const f = 'components/ContinueListening.tsx';
let c = fs.readFileSync(f, 'utf8');

// Revert to emoji icon since image transfer isn't working
c = c.replace(
  `<div style={{ width: 62, height: 62, flexShrink: 0, borderRadius: 8, overflow: 'hidden', marginRight: 10 }}>
          <img src="/images/playlist-icon.png" alt="Playlist" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        </div>`,
  `<div style={{ width: 62, height: 62, flexShrink: 0, borderRadius: 8, background: 'linear-gradient(135deg, #7c3aed, #4f46e5)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginRight: 10 }}>
          <span style={{ fontSize: 28 }}>🎧</span>
        </div>`
);

fs.writeFileSync(f, c);
console.log('Done');
