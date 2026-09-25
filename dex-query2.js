const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function main() {
  // Try authors table if it exists
  const { data: authors, error: authErr } = await supabase
    .from('authors')
    .select('id, name, slug, author_id')
    .ilike('name', '%dex%');
  
  if (authErr) {
    console.log('No authors table or error:', authErr.message);
  } else {
    console.log('Authors with dex:', JSON.stringify(authors));
  }

  // Check stories for Dex Carver via author name or slug
  const { data: storyAuthors, error: saErr } = await supabase
    .from('stories')
    .select('author_id, author_name, author_slug')
    .ilike('author_name', '%dex%')
    .limit(5);
  
  if (saErr) console.log('stories author_name error:', saErr.message);
  else console.log('Stories with dex author_name:', JSON.stringify(storyAuthors));

  // Try ilike on author_id text
  const { data: byId, error: byIdErr } = await supabase
    .from('stories')
    .select('author_id, author_name')
    .ilike('author_id::text', 'db62ba17%')
    .limit(5);
  
  if (byIdErr) console.log('ilike author_id error:', byIdErr.message);
  else console.log('By ID:', JSON.stringify(byId));
}

main().catch(console.error);
