import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET() {
  try {
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

    // Get unique states using filter (not Set spread to avoid TypeScript issues)
    const allStates = (data || []).map(u => u.state).filter(Boolean);
    const uniqueStates = allStates.filter((state, index) => allStates.indexOf(state) === index);
    const sortedStates = uniqueStates.sort();

    return NextResponse.json({ states: sortedStates });
  } catch (error) {
    console.error('[Subscriber States] Error:', error);
    return NextResponse.json({ states: [] });
  }
}
