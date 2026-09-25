const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function main() {
  // Get authors table columns
  const { data: authData, error: authErr } = await supabase
    .from('authors')
    .select('*')
    .limit(3);
  
  if (authErr) console.log('Authors table error:', authErr.message);
  else {
    console.log('Authors columns:', authData && authData[0] ? Object.keys(authData[0]) : 'empty');
    console.log('Sample authors:', JSON.stringify(authData?.slice(0,3)));
  }

  // Look for Dex Carver in authors
  const { data: dexAuth, error: dexErr } = await supabase
    .from('authors')
    .select('*')
    .limit(200);
  
  if (dexErr) console.log('Authors error:', dexErr.message);
  else {
    const dex = dexAuth?.filter(a => JSON.stringify(a).toLowerCase().includes('dex') || 
                                     JSON.stringify(a).toLowerCase().includes('carver') ||
                                     (a.id && a.id.toString().startsWith('db62ba17')));
    console.log('Dex matches in authors:', JSON.stringify(dex));
  }
}

main().catch(console.error);
