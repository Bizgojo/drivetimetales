const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function main() {
  const DEX_ID = 'db62ba17-be3c-4f4e-a105-90449ef84a25';
  
  const { count, error } = await supabase
    .from('stories')
    .select('*', { count: 'exact', head: true })
    .eq('author_id', DEX_ID);
  
  if (error) console.error('Count error:', error);
  else console.log('Dex Carver story count:', count);
  
  // Also generate a UUID for the new profile
  const { data: uuidData } = await supabase.rpc('gen_random_uuid');
  console.log('New profile UUID (rpc):', uuidData);
}

main().catch(console.error);
