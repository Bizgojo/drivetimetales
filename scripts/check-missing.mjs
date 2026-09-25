import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://vmyhlfeouzslixtkmddy.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZteWhsZmVvdXpzbGl4dGttZGR5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjA4OTYxMiwiZXhwIjoyMDgxNjY1NjEyfQ.xa0VB5h-KgLMxmM_ZWwIDuSRPUOxOmxow-c-Ua_pdQ0'
);

// Check all episodes in the series regardless of state
const { data, error } = await supabase
  .from('stories')
  .select('id, title, episode_number, workflow_state')
  .eq('series_id', 'e9f3ff76-9401-4bf5-bf5a-36d83b5398f7')
  .order('episode_number');

if (error) { console.error(error); process.exit(1); }

console.log('All episodes in series:');
for (const ep of data) {
  console.log(`  EP${ep.episode_number}: ${ep.title} — ${ep.workflow_state}`);
}
console.log(`\nTotal: ${data.length}`);
