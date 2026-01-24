import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const ABBREV_TO_STATE: Record<string, string> = {
  'AL': 'Alabama', 'AK': 'Alaska', 'AZ': 'Arizona', 'AR': 'Arkansas', 'CA': 'California',
  'CO': 'Colorado', 'CT': 'Connecticut', 'DE': 'Delaware', 'FL': 'Florida', 'GA': 'Georgia',
  'HI': 'Hawaii', 'ID': 'Idaho', 'IL': 'Illinois', 'IN': 'Indiana', 'IA': 'Iowa',
  'KS': 'Kansas', 'KY': 'Kentucky', 'LA': 'Louisiana', 'ME': 'Maine', 'MD': 'Maryland',
  'MA': 'Massachusetts', 'MI': 'Michigan', 'MN': 'Minnesota', 'MS': 'Mississippi', 'MO': 'Missouri',
  'MT': 'Montana', 'NE': 'Nebraska', 'NV': 'Nevada', 'NH': 'New Hampshire', 'NJ': 'New Jersey',
  'NM': 'New Mexico', 'NY': 'New York', 'NC': 'North Carolina', 'ND': 'North Dakota', 'OH': 'Ohio',
  'OK': 'Oklahoma', 'OR': 'Oregon', 'PA': 'Pennsylvania', 'RI': 'Rhode Island', 'SC': 'South Carolina',
  'SD': 'South Dakota', 'TN': 'Tennessee', 'TX': 'Texas', 'UT': 'Utah', 'VT': 'Vermont',
  'VA': 'Virginia', 'WA': 'Washington', 'WV': 'West Virginia', 'WI': 'Wisconsin', 'WY': 'Wyoming'
};
const US_STATES = Object.values(ABBREV_TO_STATE);
const CATEGORIES = ['national', 'international', 'business', 'sports', 'science'];

export async function GET(request: NextRequest) {
  const results: { category: string;
cat > ~/Projects/drivetimetales/app/api/cron/generate-news/route.ts << 'ENDOFFILE'
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const ABBREV_TO_STATE: Record<string, string> = {
  'AL': 'Alabama', 'AK': 'Alaska', 'AZ': 'Arizona', 'AR': 'Arkansas', 'CA': 'California',
  'CO': 'Colorado', 'CT': 'Connecticut', 'DE': 'Delaware', 'FL': 'Florida', 'GA': 'Georgia',
  'HI': 'Hawaii', 'ID': 'Idaho', 'IL': 'Illinois', 'IN': 'Indiana', 'IA': 'Iowa',
  'KS': 'Kansas', 'KY': 'Kentucky', 'LA': 'Louisiana', 'ME': 'Maine', 'MD': 'Maryland',
  'MA': 'Massachusetts', 'MI': 'Michigan', 'MN': 'Minnesota', 'MS': 'Mississippi', 'MO': 'Missouri',
  'MT': 'Montana', 'NE': 'Nebraska', 'NV': 'Nevada', 'NH': 'New Hampshire', 'NJ': 'New Jersey',
  'NM': 'New Mexico', 'NY': 'New York', 'NC': 'North Carolina', 'ND': 'North Dakota', 'OH': 'Ohio',
  'OK': 'Oklahoma', 'OR': 'Oregon', 'PA': 'Pennsylvania', 'RI': 'Rhode Island', 'SC': 'South Carolina',
  'SD': 'South Dakota', 'TN': 'Tennessee', 'TX': 'Texas', 'UT': 'Utah', 'VT': 'Vermont',
  'VA': 'Virginia', 'WA': 'Washington', 'WV': 'West Virginia', 'WI': 'Wisconsin', 'WY': 'Wyoming'
};
const US_STATES = Object.values(ABBREV_TO_STATE);
const CATEGORIES = ['national', 'international', 'business', 'sports', 'science'];

export async function GET(request: NextRequest) {
  const results: { category: string; state?: string; success: boolean; error?: string }[] = [];
  try {
    const authHeader = request.headers.get('authorization');
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const { data: settingsRow } = await supabase.from('news_settings').select('settings').eq('id', '1').single();
    const settings = settingsRow?.settings || {};
    const isEnabled = settings.schedule?.enabled || settings.auto_generate || false;
    if (!isEnabled) {
      return NextResponse.json({ success: true, message: 'Auto-generation is disabled', skipped: true });
    }
    const categorySettings = settings.categories || {};
    const { data: usersData } = await supabase.from('users').select('state').not('state', 'is', null);
    const subscriberStates: string[] = [];
    usersData?.forEach(u => {
      if (u.state) {
        const fullName = ABBREV_TO_STATE[u.state.toUpperCase()] || u.state;
        if (US_STATES.includes(fullName) && !subscriberStates.includes(fullName)) {
          subscriberStates.push(fullName);
        }
      }
    });
    const baseUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    for (const category of CATEGORIES) {
      const catSettings = categorySettings[category];
      if (!catSettings?.voice_id) { results.push({ category, success: false, error: 'No voice configured' }); continue; }
      try {
        const res = await fetch(`${baseUrl}/api/admin/generate-news`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ category, voiceId: catSettings.voice_id, narratorName: catSettings.narrator_name || 'Your Host', state: null, storiesCount: 5, listenerName: 'listener' })
        });
        results.push({ category, success: res.ok, error: res.ok ? undefined : 'Generation failed' });
      } catch (e) { results.push({ category, success: false, error: String(e) }); }
    }
    const stateSettings = categorySettings['state'] || settings.state_news || {};
    if (stateSettings?.voice_id) {
      for (const state of subscriberStates) {
        try {
          const res = await fetch(`${baseUrl}/api/admin/generate-news`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ category: 'state', voiceId: stateSettings.voice_id, narratorName: stateSettings.narrator_name || 'Your Host', state, storiesCount: 5, listenerName: 'listener' })
          });
          results.push({ category: 'state', state, success: res.ok });
        } catch (e) { results.push({ category: 'state', state, success: false, error: String(e) }); }
      }
    }
    const successful = results.filter(r => r.success).length;
    return NextResponse.json({ success: true, message: `Generated ${successful} briefings`, results, generated: successful });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
