const fs = require('fs');
const f = 'components/ContinueListening.tsx';
let c = fs.readFileSync(f, 'utf8');

const oldHeading = `    <section style={{ padding: '18px 14px 0' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 12 }}>
        <span style={{ fontSize: 13 }}>▶</span>
        <span style={{ fontFamily: 'var(--font-outfit, sans-serif)', fontSize: 11, fontWeight: 800, color: 'white', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
          Continue Listening
        </span>
      </div>`;

const newHeading = `    <section style={{ padding: '1.5rem 1rem 0' }}>
      <h2 className="text-lg font-bold text-white" style={{ marginBottom: '1rem' }}>▶️ CONTINUE LISTENING</h2>`;

if (c.includes(oldHeading)) {
  c = c.replace(oldHeading, newHeading);
  fs.writeFileSync(f, c);
  console.log('✅ Done - heading updated');
} else {
  console.log('❌ Old heading not found - check the file');
}
