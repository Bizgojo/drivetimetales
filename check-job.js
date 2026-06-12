const { createClient } = require('@supabase/supabase-js');
const sb = createClient('https://vmyhlfeouzslixtkmddy.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZteWhsZmVvdXpzbGl4dGttZGR5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjA4OTYxMiwiZXhwIjoyMDgxNjY1NjEyfQ.xa0VB5h-KgLMxmM_ZWwIDuSRPUOxOmxow-c-Ua_pdQ0');
(async () => {
  const { data: job } = await sb.from('production_jobs').select('status,current_step,error_json,updated_at').eq('id','7af6663e-5791-422a-8af8-7ae162669947').single();
  console.log('Job:', JSON.stringify(job, null, 2));
  // Also check storage for final_mix.mp3
  const { data: files } = await sb.storage.from('audio').list('asc3/ab184c26-a04a-4820-8488-0c703592ddf7', { limit: 100 });
  const finalMix = (files||[]).find(f => f.name === 'final_mix.mp3');
  console.log('final_mix.mp3 in storage:', finalMix ? `YES (${finalMix.metadata?.size} bytes)` : 'NO');
})();
