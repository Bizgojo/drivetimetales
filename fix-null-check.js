const fs = require('fs');
const f = 'components/ContinueListening.tsx';
let c = fs.readFileSync(f, 'utf8');

// Fix null check on series rows filter
c = c.replace(
  `const validSeries = (seriesRows || []).filter(r => {
      const s = r.stories as any
      return r.progress > 0 && s?.series_id !== hiddenSeriesId
    })`,
  `const validSeries = (seriesRows || []).filter(r => {
      const s = r.stories as any
      return s != null && r.progress > 0 && s?.series_id !== hiddenSeriesId
    })`
);

fs.writeFileSync(f, c);
console.log('Done - null check added');
