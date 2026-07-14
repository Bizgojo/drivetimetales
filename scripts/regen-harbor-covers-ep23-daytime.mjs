/**
 * regen-harbor-covers-ep23-daytime.mjs
 * Regenerate "Harbor of Bitter Tea" eps 2-3 covers with daytime constraint.
 * Marc directive (2026-07-14 10:07 EDT): "REGEN to daytime — match ep1;
 * the cover brightness rule applies series-wide."
 * Pattern: scripts/regen-harbor-cover-daytime.mjs (ep1, approved live).
 * Keys: from .env.local (credentials governance — no hardcoded keys).
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

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const SHARED = [
  'HARD COVER CONSTRAINT (operator instruction, highest priority): DAYTIME SCENE ONLY. Bright outdoor daylight — clear blue sky, golden morning light, or midday sun. The scene must be set during the day. No darkness, no nighttime, no dim interior lighting, no shadows that obscure the subject. Full bright daylight throughout.',
  'Bright, high-key illustration with a light or daylight background and strong subject contrast.',
  'A thumbnail-first, story-specific background image for an audiobook cover, optimized for small streaming-app thumbnail readability.',
  'Hard priority: the cover must remain instantly readable at about 120px height while someone is scrolling.',
  'Genre: Historical (colonial Boston, 1773, era of the Boston Tea Party).',
  'Title reference: "Harbor of Bitter Tea" by Zara Osei. Do not render this text.',
  'Visual style: rich painterly historical illustration, but brightness-floor enforced — key subject must be clearly readable at thumbnail size in full daylight.',
];

const SHARED_TAIL = [
  'Avoid: nighttime; darkness; dim lighting; murky interiors; shadows obscuring subject; lettering of any kind on papers, sails, or signs; corpses or bodies; any dark or underexposed areas.',
  'Square format, fills entire canvas.',
  'Hard rendering floor: the image must be well-exposed with a minimum brightness floor — bright daylight throughout.',
  'IMPORTANT: absolutely no text, no words, no letters, no numbers anywhere in the image.',
  'Pure atmospheric visual scene only.',
];

const EPISODES = [
  {
    id: '7050430b-40e0-4b78-b99c-6fe6dab93db5',
    label: 'ep2 The Cipher on Cornhill',
    brief: [
      'Cover Direction Brief:',
      'Primary visual subject: A Black shipwright in 1770s working clothes (linen shirt, leather apron) standing on sunlit Cornhill street in colonial Boston, examining a coded broadside pinned to a printer\u2019s shop wall, alert and wary.',
      'Emotional promise: A cipher hiding in plain sight on a busy daylight street — one wrong reading away from danger.',
      'Key object or symbol: The coded broadside on the shop wall (no legible lettering — abstract cipher marks only); colonial print-shop facade.',
      'Setting/background: Cornhill street, colonial Boston, bright midday — blue sky, sunlit brick and timber shopfronts, townspeople in period dress passing in warm daylight.',
      'Lighting direction: Bright midday sun — strong warm key light, crisp short shadows, sunlit brick tones. Subject fully exposed in daylight.',
      'Composition/camera distance: Mid-shot — shipwright from waist up at the shop wall, street receding behind him.',
      'Thumbnail readability: Strong contrast between the shipwright and the sunlit shopfront; silhouette readable at 100px.',
      'Visual hierarchy must be obvious in one glance: sunlit shipwright + cipher broadside + bright colonial street.',
    ],
  },
  {
    id: 'afce3930-24e9-4022-bf45-8105d9813d65',
    label: 'ep3 Harbor Turned Black',
    brief: [
      'Cover Direction Brief:',
      'Primary visual subject: A Black shipwright in 1770s working clothes standing at the bow of a small boat in Boston Harbor in bright daylight, tea leaves scattering across the sunlit water surface around the hull, his posture urgent and determined.',
      'Emotional promise: The harbor itself turning against them in broad daylight — the tea crisis breaking into the open.',
      'Key object or symbol: Drifts of dark tea leaves swirling on bright sparkling water; tall ships behind.',
      'Setting/background: Boston Harbor at bright midday — blue sky with white clouds, sun-sparkled water dusted with floating tea, masts and rigging of tall ships, colonial wharf in warm daylight.',
      'Lighting direction: Bright midday sun — strong warm key light, sparkling water highlights, crisp shadows. Subject fully exposed in daylight. The tea on the water reads as dark texture on BRIGHT water, not as darkness.',
      'Composition/camera distance: Mid-shot — shipwright from waist up at the bow, harbor and ships receding behind him.',
      'Thumbnail readability: Strong contrast between the shipwright and the bright sky/water; silhouette readable at 100px.',
      'Visual hierarchy must be obvious in one glance: sunlit shipwright + tea-dusted bright water + colonial harbor.',
    ],
  },
];

async function generateCover(ep) {
  const prompt = [...SHARED, ...ep.brief, ...SHARED_TAIL].join(' ');
  console.log(`\n=== ${ep.label} (${ep.id}) ===`);
  const res = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${OPENAI_API_KEY}` },
    body: JSON.stringify({ model: 'gpt-image-1', prompt, size: '1024x1024', quality: 'high', n: 1 }),
  });
  if (!res.ok) throw new Error(`${ep.label}: image gen HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const json = await res.json();
  const b64 = json.data?.[0]?.b64_json;
  if (!b64) throw new Error(`${ep.label}: no image in response`);
  const buf = Buffer.from(b64, 'base64');
  const localPath = `/Users/williampostlewaite/.openclaw/workspace-orion/harbor-${ep.label.split(' ')[0]}-daytime.jpg`;
  fs.writeFileSync(localPath, buf);
  console.log(`Generated ${buf.length} bytes → ${localPath}`);

  const storagePath = `asc3/${ep.id}/cover_daytime_20260714.jpg`;
  const { error: upErr } = await supabase.storage.from('audio').upload(storagePath, buf, {
    contentType: 'image/jpeg',
    upsert: true,
  });
  if (upErr) throw new Error(`${ep.label}: upload failed: ${upErr.message}`);
  const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/audio/${storagePath}`;
  const head = await fetch(publicUrl, { method: 'HEAD' });
  console.log(`Uploaded: ${publicUrl} (HEAD ${head.status})`);
  if (head.status !== 200) throw new Error(`${ep.label}: HEAD ${head.status}`);

  const { error: dbErr } = await supabase.from('stories').update({ cover_url: publicUrl }).eq('id', ep.id);
  if (dbErr) throw new Error(`${ep.label}: DB update failed: ${dbErr.message}`);
  console.log('stories.cover_url updated ✓');
  return { id: ep.id, label: ep.label, publicUrl, localPath };
}

const results = [];
for (const ep of EPISODES) results.push(await generateCover(ep));
console.log('\nALL DONE');
results.forEach((r) => console.log(`${r.label}: ${r.publicUrl}`));
