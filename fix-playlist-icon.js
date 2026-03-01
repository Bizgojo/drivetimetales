const fs = require('fs');
const f = 'components/ContinueListening.tsx';
let c = fs.readFileSync(f, 'utf8');

c = c.replace(
  `<div style={{ width: 52, height: 52, flexShrink: 0, borderRadius: 8, background: '#7c3aed', display: 'flex', alignItems: 'center', justifyContent: 'center', marginRight: 10 }}>
          <span style={{ fontSize: 22 }}>🎵</span>
        </div>`,
  `<div style={{ width: 62, height: 62, flexShrink: 0, borderRadius: 8, overflow: 'hidden', marginRight: 10 }}>
          <img src="/images/playlist-icon.png" alt="Playlist" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        </div>`
);

fs.writeFileSync(f, c);
console.log('Done - playlist icon updated');
