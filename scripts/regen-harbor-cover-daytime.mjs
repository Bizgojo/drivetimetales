/**
 * regen-harbor-cover-daytime.mjs
 * Regenerate "Harbor of Bitter Tea" ep1 cover (drives library series card) with daytime constraint.
 * Marc feedback (17:59 Jul 13): "This cover is too dark set in the daytime."
 *
 * Story: 3bfd586f — The Customs Man's Coffin (ep1), Zara Osei, Historical
 * Series: a3b08896 — Harbor of Bitter Tea (published, 3 eps)
 * Keys: read from drivetimetales/.env.local (credentials governance — no hardcoded keys)
 */

import { createRequire } from 'module';
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const require = createRequire(import.meta.url);
require('dotenv').config({ path: '/Users/williampostlewaite/Projects/drivetimetales/.env.local' });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
if (!SUPABASE_URL || !SUPABASE_KEY || !OPENAI_API_KEY) throw new Error('Missing env keys');

const STORY_ID = '3bfd586f-c18d-4616-861f-0820757f6b47';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const COVER_PROMPT = [
  'HARD COVER CONSTRAINT (operator instruction, highest priority): DAYTIME SCENE ONLY. Bright outdoor daylight — clear blue sky, golden morning light, or midday sun over the harbor. The scene must be set during the day. No darkness, no nighttime, no dim interior lighting, no shadows that obscure the subject. Full bright daylight throughout.',
  'Bright, high-key illustration with a light or daylight background and strong subject contrast.',
  'A thumbnail-first, story-specific background image for an audiobook cover, optimized for small streaming-app thumbnail readability.',
  'Hard priority: the cover must remain instantly readable at about 120px height while someone is scrolling.',
  'Genre: Historical (colonial Boston, 1773, era of the Boston Tea Party).',
  'Title reference: "Harbor of Bitter Tea" by Zara Osei. Do not render this text.',
  'Visual style: rich painterly historical illustration, but brightness-floor enforced — key subject must be clearly readable at thumbnail size in full daylight.',
  'Cover Direction Brief:',
  'Primary visual subject: A Black shipwright in 1770s working clothes (linen shirt, leather apron) standing on the deck of a wooden customs sloop in Boston Harbor, holding discovered coded papers, sunlit, alert expression.',
  'Emotional promise: Discovery and danger in broad daylight — one man holding secrets that could drown him.',
  'Key object or symbol: Coded parchment pages in his hand; tall ships and colonial waterfront behind him.',
  'Setting/background: Boston Harbor in bright daylight — blue sky with white clouds, sunlit water, masts and rigging of tall ships, colonial wharf buildings in warm daylight.',
  'Lighting direction: Bright morning or midday sun — strong warm key light, crisp short shadows, sparkling water highlights. Subject fully exposed in daylight.',
  'Composition/camera distance: Mid-shot — shipwright visible from waist up, harbor and ships receding behind him.',
  'Thumbnail readability: Strong contrast between the shipwright and the bright sky/water; silhouette readable at 100px.',
  'Avoid: nighttime; darkness; dim lighting; murky interiors; shadows obscuring subject; lettering of any kind on papers, sails, or signs; corpses or bodies; any dark or underexposed areas.',
  'Square format, fills entire canvas.',
  'Visual hierarchy must be obvious in one glance: sunlit shipwright + coded pages + bright colonial harbor.',
  'Hard rendering floor: the image must be well-exposed with a minimum brightness floor — bright daylight throughout.',
  'IMPORTANT: absolutely no text, no words, no letters, no numbers anywhere in the image.',
  'Pure atmospheric visual scene only.',
].join(' ');

async function main() {
  const { data: story, error } = await supabase
    .from('stories')
    .select('id, title, cover_url, status')
    .eq('id', STORY_ID)
    .single();
  if (error || !story) throw new Error('Story not found: ' + error?.message);
  console.log(`Story: ${story.title} (${story.id})`);
  console.log(`Current cover: ${story.cover_url}\n`);

  console.log('Calling gpt-image-1 (high, 1024x1024)...');
  const res = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'gpt-image-1', prompt: COVER_PROMPT.slice(0, 4000), n: 1, size: '1024x1024', quality: 'high' }),
  });
  if (!res.ok) throw new Error(`OpenAI error: ${res.status} — ${await res.text()}`);
  const json = await res.json();
  const b64 = json.data?.[0]?.b64_json;
  if (!b64) throw new Error('No b64_json in response');
  const buf = Buffer.from(b64, 'base64');
  console.log(`Image generated: ${buf.length} bytes`);

  const localPath = '/Users/williampostlewaite/.openclaw/workspace-orion/harbor-cover-daytime.jpg';
  fs.writeFileSync(localPath, buf);
  console.log(`Saved: ${localPath}`);

  const storageKey = `asc3/${STORY_ID}/cover_daytime_20260713.jpg`;
  const { error: upErr } = await supabase.storage.from('audio').upload(storageKey, buf, { contentType: 'image/jpeg', upsert: true });
  if (upErr) throw new Error(`Storage upload failed: ${upErr.message}`);

  const { data: urlData } = supabase.storage.from('audio').getPublicUrl(storageKey);
  const publicUrl = urlData?.publicUrl;
  const head = await fetch(publicUrl, { method: 'HEAD' });
  console.log(`Public URL: ${publicUrl} (HEAD ${head.status})`);
  if (!head.ok) { console.log('⚠️ URL not accessible — DB not updated.'); return; }

  const { error: dbErr } = await supabase.from('stories').update({ cover_url: publicUrl }).eq('id', STORY_ID);
  if (dbErr) throw new Error(`DB update failed: ${dbErr.message}`);
  console.log(`\n✅ stories.cover_url updated for ep1 → ${publicUrl}`);
  console.log('READY for Marc eyeball: harbor-cover-daytime.jpg');
}

main().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
