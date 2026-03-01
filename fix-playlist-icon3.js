const fs = require('fs');
const f = 'components/ContinueListening.tsx';
let c = fs.readFileSync(f, 'utf8');

c = c.replace(
  `<div style={{ width: 76, height: 76, flexShrink: 0, margin: '9px 0 9px 9px', borderRadius: 7, overflow: 'hidden', boxShadow: '0 0 10px rgba(255,255,255,0.18)', background: '#1a1a2e', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <img src="/images/playlist_icon.png" alt="Playlist" style={{ width: '90%', height: '90%', objectFit: 'contain' }} />
      </div>`,
  `<div style={{ width: 76, height: 76, flexShrink: 0, margin: '9px 0 9px 9px', borderRadius: 7, boxShadow: '0 0 10px rgba(255,255,255,0.18)', background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 2 }}>
        <span style={{ fontSize: 28 }}>🎧</span>
        <span style={{ fontSize: 8, fontWeight: 800, color: 'white', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Playlist</span>
      </div>`
);

fs.writeFileSync(f, c);
console.log('Done');
