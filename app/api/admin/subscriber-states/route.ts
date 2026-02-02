// app/api/admin/subscriber-states/route.ts
// Returns list of states that have subscribers

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET() {
  try {
    // Get distinct states from users who have a subscription
    const { data, error } = await supabase
      .from('users')
      .select('state')
      .not('state', 'is', null)
      .not('state', 'eq', '')
      .not('plan', 'is', null);

    if (error) {
      console.error('[Subscriber States] Error:', error);
      return NextResponse.json({ states: [] });
    }

    // Get unique states
    const states = [...new Set((data || []).map(u => u.state).filter(Boolean))].sort();
    
    return NextResponse.json({ states });
  } catch (error) {
    console.error('[Subscriber States] Error:', error);
    return NextResponse.json({ states: [] });
  }
}
