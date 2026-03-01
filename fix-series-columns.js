const fs = require('fs');
const f = 'components/ContinueListening.tsx';
let c = fs.readFileSync(f, 'utf8');

// Fix series column names: name->title, episode_count->total_episodes
c = c.replace(
  'series(name, episode_count)',
  'series(title, total_episodes)'
);
c = c.replace(
  "s.series?.name || s.title",
  "s.series?.title || s.title"
);
c = c.replace(
  "s.series?.episode_count || 1",
  "s.series?.total_episodes || 1"
);

fs.writeFileSync(f, c);
console.log('Done - series columns fixed');
