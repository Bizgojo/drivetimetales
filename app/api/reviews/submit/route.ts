import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: NextRequest) {
  try {
    const { userId, storyId, rating, reviewText } = await request.json();

    if (!userId || !storyId || !rating) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    if (rating < 1 || rating > 5) {
      return NextResponse.json({ error: 'Rating must be between 1 and 5' }, { status: 400 });
    }

    // Check if user already reviewed this story
    const { data: existingReview } = await supabaseAdmin
      .from('reviews')
      .select('id')
      .eq('user_id', userId)
      .eq('story_id', storyId)
      .single();

    if (existingReview) {
      return NextResponse.json({ error: 'You have already reviewed this story' }, { status: 400 });
    }

    // Get review settings
    const { data: settings } = await supabaseAdmin
      .from('dtt_settings')
      .select('key, value')
      .in('key', ['review_credits_per_review', 'review_credits_max_reviews']);

    const creditsPerReview = parseInt(settings?.find(s => s.key === 'review_credits_per_review')?.value || '2');
    const maxReviews = parseInt(settings?.find(s => s.key === 'review_credits_max_reviews')?.value || '10');

    // Count user's credited reviews
    const { data: userReviews } = await supabaseAdmin
      .from('reviews')
      .select('id')
      .eq('user_id', userId)
      .eq('credited', true);

    const creditedCount = userReviews?.length || 0;
    const canEarnCredits = creditedCount < maxReviews;
    const creditsToAward = canEarnCredits ? creditsPerReview : 0;

    // Insert the review
    const { data: review, error: reviewError } = await supabaseAdmin
      .from('reviews')
      .insert({
        user_id: userId,
        story_id: storyId,
        rating,
        review_text: reviewText || null,
        credited: canEarnCredits,
        credits_earned: creditsToAward
      })
      .select()
      .single();

    if (reviewError) {
      console.error('[Review] Insert error:', reviewError);
      return NextResponse.json({ error: 'Failed to save review' }, { status: 500 });
    }

    // Award credits if eligible
    if (creditsToAward > 0) {
      const { data: user } = await supabaseAdmin
        .from('users')
        .select('credits')
        .eq('id', userId)
        .single();

      if (user) {
        const newCredits = (user.credits || 0) + creditsToAward;
        await supabaseAdmin
          .from('users')
          .update({ credits: newCredits })
          .eq('id', userId);
      }
    }

    console.log('[Review] Submitted:', { userId, storyId, rating, creditsAwarded: creditsToAward });

    return NextResponse.json({
      success: true,
      reviewId: review.id,
      creditsEarned: creditsToAward
    });

  } catch (error) {
    console.error('[Review] Error:', error);
    return NextResponse.json({ error: 'Failed to submit review' }, { status: 500 });
  }
}
