import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// POST /api/user/purchase - Purchase a story with credits
export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const token = authHeader.substring(7);
    const { storyId } = await request.json();

    if (!storyId) {
      return NextResponse.json(
        { error: 'Story ID is required' },
        { status: 400 }
      );
    }

    // Verify the token and get user
    const { data: { user: authUser }, error: authError } = await supabaseAdmin.auth.getUser(token);
    
    if (authError || !authUser) {
      return NextResponse.json(
        { error: 'Invalid token' },
        { status: 401 }
      );
    }

    // Get user profile
    const { data: user, error: userError } = await supabaseAdmin
      .from('users')
      .select('id, credits, subscription_type')
      .eq('id', authUser.id)
      .single();

    if (userError || !user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // Check if user already owns this story
    const { data: existingPurchase } = await supabaseAdmin
      .from('user_stories')
      .select('id')
      .eq('user_id', user.id)
      .eq('story_id', storyId)
      .single();

    if (existingPurchase) {
      return NextResponse.json(
        { error: 'You already own this story' },
        { status: 400 }
      );
    }

    // Get story details
    const { data: story, error: storyError } = await supabaseAdmin
      .from('stories')
      .select('id, title, credits')
      .eq('id', storyId)
      .single();

    if (storyError || !story) {
      return NextResponse.json(
        { error: 'Story not found' },
        { status: 404 }
      );
    }

    // Road Warrior gets unlimited access
    const isUnlimited = user.subscription_type === 'road_warrior';

    // Check if user has enough credits (unless unlimited)
    if (!isUnlimited && user.credits < story.credits) {
      return NextResponse.json(
        { 
          error: 'Insufficient credits',
          required: story.credits,
          available: user.credits 
        },
        { status: 400 }
      );
    }

    // Deduct credits (unless unlimited)
    if (!isUnlimited) {
      const { error: deductError } = await supabaseAdmin
        .from('users')
        .update({ credits: user.credits - story.credits })
        .eq('id', user.id);

      if (deductError) {
        throw deductError;
      }
    }

    // Add story to user's collection
    const { error: addError } = await supabaseAdmin
      .from('user_stories')
      .insert({
        user_id: user.id,
        story_id: storyId,
        progress_seconds: 0,
        completed: false,
        purchased_at: new Date().toISOString(),
      });

    if (addError) {
      // Rollback credit deduction
      if (!isUnlimited) {
        await supabaseAdmin
          .from('users')
          .update({ credits: user.credits })
          .eq('id', user.id);
      }
      throw addError;
    }

    return NextResponse.json({
      success: true,
      message: `Successfully purchased "${story.title}"`,
      creditsUsed: isUnlimited ? 0 : story.credits,
      remainingCredits: isUnlimited ? user.credits : user.credits - story.credits,
    });
  } catch (error) {
    console.error('Error purchasing story:', error);
    return NextResponse.json(
      { error: 'Failed to purchase story' },
      { status: 500 }
    );
  }
}
