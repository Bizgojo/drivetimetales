const { createClient } = require('@supabase/supabase-js');
const sb = createClient('https://vmyhlfeouzslixtkmddy.supabase.co','eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZteWhsZmVvdXpzbGl4dGttZGR5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjA4OTYxMiwiZXhwIjoyMDgxNjY1NjEyfQ.xa0VB5h-KgLMxmM_ZWwIDuSRPUOxOmxow-c-Ua_pdQ0');
(async () => {
  const { data: job, error } = await sb.from('production_jobs').select('state_json').eq('id','7af6663e-5791-422a-8af8-7ae162669947').single();
  if (error) { console.error('fetch error:', error); process.exit(1); }
  const s = { ...(job.state_json||{}) };
  delete s.renderFinalMix; delete s.packageCompletion; delete s.readyForReview;
  const { error: e1 } = await sb.from('stories').update({ audio_url: null, story_audio_url: null }).eq('id','ab184c26-a04a-4820-8488-0c703592ddf7');
  if (e1) console.error('stories update error:', e1);
  const { error: e2 } = await sb.from('production_jobs').update({ status:'queued', current_step:'render_final_mix', locked_at:null, error_json:null, state_json:s }).eq('id','7af6663e-5791-422a-8af8-7ae162669947');
  if (e2) console.error('job update error:', e2);
  console.log('reset done');
})();
