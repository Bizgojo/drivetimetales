const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function main() {
  // Find Dex Carver's full UUID using raw SQL
  const { data: authorData, error: authorErr } = await supabase.rpc('exec_sql', {
    sql: "SELECT DISTINCT CAST(author_id AS text) as author_id FROM stories WHERE CAST(author_id AS text) LIKE 'db62ba17%' LIMIT 1"
  });
  if (authorErr) {
    // Try direct approach
    const { data, error } = await supabase
      .from('stories')
      .select('author_id')
      .limit(100);
    if (error) { console.error('stories error:', error); return; }
    const dex = data.filter(r => r.author_id && r.author_id.toString().startsWith('db62ba17'));
    console.log('Dex Carver matches:', dex.slice(0, 3));
    console.log('Dex Carver count:', dex.length);
  } else {
    console.log('Author data:', JSON.stringify(authorData));
  }

  // Check existing voice_profiles for winslow
  const { data: vpData, error: vpErr } = await supabase
    .from('voice_profiles')
    .select('id, style_slug, display_name')
    .eq('style_slug', 'winslow-systemic-crime');
  if (vpErr) console.error('VP query error:', vpErr);
  else console.log('Existing winslow profile:', JSON.stringify(vpData));
}

main().catch(console.error);
