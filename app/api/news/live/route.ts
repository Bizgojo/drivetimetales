// app/api/news/live/route.ts
// Public API endpoint to get the current live news episode

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Subscription tiers that get free news access
const NEWS_ELIGIBLE_TIERS = ['commuter', 'road_warrior'];

export async function GET(request: NextRequest) {
  try {
    // Get auth token if present
    const authHeader = request.headers.get('authorization');
    let userId: string | null = null;
    let userTier: string | null = null;
    let isNewcomer = false;

    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      const { data: { user } } = await supabase.auth.getUser(token);
      
      if (user) {
        userId = user.id;
        
        // Get user's subscription tier
        const { data: userData } = await supabase
          .from('users')
          .select('subscription_type, created_at')
          .eq('id', userId)
          .single();
        
        userTier = userData?.subscription_type || 'free';
        
        // Check if newcomer (registered in last 7 days)
        if (userData?.created_at) {
          const createdAt = new Date(userData.created_at);
          const daysSinceCreation = (Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24);
          isNewcomer = daysSinceCreation <= 7;
        }
      }
    }

    // Get the live news episode
    const { data: liveEpisode, error } = await supabase
      .from('news_episodes')
      .select('*')
      .eq('is_live', true)
      .eq('status', 'published')
      .single();

    if (error || !liveEpisode) {
      return NextResponse.json({
        hasLiveEpisode: false,
        message: 'No live news episode available'
      });
    }

    // Determine access level
    const hasEligibleSubscription = NEWS_ELIGIBLE_TIERS.includes(userTier || '');
    const canAccess = hasEligibleSubscription || isNewcomer;

    // Check if user already has access to this episode
    let alreadyHasAccess = false;
    if (userId) {
      const { data: existingAccess } = await supabase
        .from('news_access')
        .select('id')
        .eq('user_id', userId)
        .eq('episode_id', liveEpisode.id)
        .single();
      
      alreadyHasAccess = !!existingAccess;
    }

    // If user can access and doesn't have access yet, grant it
    if (canAccess && userId && !alreadyHasAccess) {
      await supabase
        .from('news_access')
        .insert({
          user_id: userId,
          episode_id: liveEpisode.id,
          acquired_via: isNewcomer ? 'newcomer_bonus' : 'subscription_perk'
        });
    }

    // Build response
    const response: any = {
      hasLiveEpisode: true,
      episode: {
        id: liveEpisode.id,
        title: liveEpisode.title,
        edition: liveEpisode.edition,
        date: liveEpisode.edition_date,
        durationMins: liveEpisode.duration_mins,
        coverUrl: liveEpisode.cover_url,
        publishedAt: liveEpisode.published_at
      },
      access: {
        canAccess,
        reason: canAccess 
          ? (isNewcomer ? 'newcomer_bonus' : 'subscription_perk')
          : 'subscription_required',
        eligibleTiers: NEWS_ELIGIBLE_TIERS
      }
    };

    // Only include audio URL if user has access
    if (canAccess) {
      response.episode.audioUrl = liveEpisode.audio_url;
    }

    return NextResponse.json(response);

  } catch (error) {
    console.error('[News Live API] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch news episode' },
      { status: 500 }
    );
  }
}
