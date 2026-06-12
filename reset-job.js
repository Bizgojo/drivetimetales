const { createClient } = require('@supabase/supabase-js');
const sb = createClient('https://vmyhlfeouzslixtkmddy.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZteWhsZmVvdXpzbGl4dGttZGR5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjA4OTYxMiwiZXhwIjoyMDgxNjY1NjEyfQ.xa0VB5h-KgLMxmM_ZWwIDuSRPUOxOmxow-c-Ua_pdQ0');
(async () => {
  const { data: job, error } = await sb.from('production_jobs').select('state_json,status,current_step').eq('id','7af6663e-5791-422a-8af8-7ae162669947').single();
  if (error) { console.error('Fetch error:', error); return; }
  console.log('Current status:', job.status, '| current_step:', job.current_step);
  const s = { ...(job.state_json||{}) };
  delete s.renderFinalMix; delete s.packageCompletion; delete s.readyForReview;
  // Clear stale audio_url columns
  const { error: storyErr } = await sb.from('stories').update({ audio_url: null, story_audio_url: null }).eq('id','ab184c26-a04a-4820-8488-0c703592ddf7');
  if (storyErr) console.error('Story update error:', storyErr);
  const { error: jobErr } = await sb.from('production_jobs').update({ status:'queued', current_step:'render_final_mix', locked_at:null, error_json:null, state_json:s }).eq('id','7af6663e-5791-422a-8af8-7ae162669947');
  if (jobErr) { console.error('Job update error:', jobErr); return; }
  console.log('reset done');
})();
