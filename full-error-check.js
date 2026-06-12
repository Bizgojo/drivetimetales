const { createClient } = require('@supabase/supabase-js');
const sb = createClient('https://vmyhlfeouzslixtkmddy.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZteWhsZmVvdXpzbGl4dGttZGR5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjA4OTYxMiwiZXhwIjoyMDgxNjY1NjEyfQ.xa0VB5h-KgLMxmM_ZWwIDuSRPUOxOmxow-c-Ua_pdQ0');
(async () => {
  const { data: job } = await sb.from('production_jobs').select('error_json,state_json').eq('id','7af6663e-5791-422a-8af8-7ae162669947').single();
  console.log('=== ERROR ===');
  console.log(JSON.stringify(job.error_json, null, 2));
  console.log('\n=== RENDER STATE (if exists) ===');
  console.log(JSON.stringify(job.state_json?.renderFinalMix, null, 2));
})();
