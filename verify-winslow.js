const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function main() {
  // Verify profile exists
  const { data: vp, error: vpErr } = await supabase
    .from('voice_profiles')
    .select('id, style_slug, display_name, version, created_at')
    .eq('id', '88b97709-c5af-46ee-84a3-7c5209808231')
    .single();
  
  if (vpErr) console.error('VP verify error:', vpErr);
  else console.log('Voice profile verified:', JSON.stringify(vp));

  // Verify stories linked
  const { count, error: cntErr } = await supabase
    .from('stories')
    .select('*', { count: 'exact', head: true })
    .eq('voice_profile_id', '88b97709-c5af-46ee-84a3-7c5209808231');
  
  if (cntErr) console.error('Count error:', cntErr);
  else console.log('Stories with winslow profile:', count);
}

main().catch(console.error);
