import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// GET /api/reviews?storyId=xxx - Get reviews for a story
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const storyId = searchParams.get('storyId');

    if (!storyId) {
      return NextResponse.json({ error: 'Story ID required' }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from('reviews')
      .select(`
        *,
        user:users(display_name)
      `)
      .eq('story_id', storyId)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) throw error;

    // Calculate average rating
    const avgRating = data && data.length > 0
      ? data.reduce((sum, r) => sum + r.rating, 0) / data.length
      : 0;

    return NextResponse.json({
      reviews: data || [],
      averageRating: Math.round(avgRating * 10) / 10,
      totalReviews: data?.length || 0,
    });
  } catch (error) {
    console.error('Error fetching reviews:', error);
    return NextResponse.json({ error: 'Failed to fetch reviews' }, { status: 500 });
  }
}

// POST /api/reviews - Create a new review
export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.substring(7);
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    const body = await request.json();
    const { storyId, rating, title, content } = body;

    if (!storyId || !rating || rating < 1 || rating > 5) {
      return NextResponse.json({ error: 'Invalid review data' }, { status: 400 });
    }

    // Check if user already reviewed this story
    const { data: existing } = await supabaseAdmin
      .from('reviews')
      .select('id')
      .eq('user_id', user.id)
      .eq('story_id', storyId)
      .single();

    if (existing) {
      // Update existing review
      const { data, error } = await supabaseAdmin
        .from('reviews')
        .update({
          rating,
          title: title || null,
          content: content || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id)
        .select()
        .single();

      if (error) throw error;

      // Update story average rating
      await updateStoryRating(storyId);

      return NextResponse.json({ review: data, updated: true });
    } else {
      // Check if user owns the story (can only review owned stories)
      const { data: ownership } = await supabaseAdmin
        .from('user_stories')
        .select('id')
        .eq('user_id', user.id)
        .eq('story_id', storyId)
        .single();

      if (!ownership) {
        return NextResponse.json({ error: 'You can only review stories you own' }, { status: 403 });
      }

      // Create new review
      const { data, error } = await supabaseAdmin
        .from('reviews')
        .insert({
          user_id: user.id,
          story_id: storyId,
          rating,
          title: title || null,
          content: content || null,
        })
        .select()
        .single();

      if (error) throw error;

      // Update story average rating
      await updateStoryRating(storyId);

      return NextResponse.json({ review: data, created: true });
    }
  } catch (error) {
    console.error('Error creating review:', error);
    return NextResponse.json({ error: 'Failed to create review' }, { status: 500 });
  }
}

// DELETE /api/reviews?id=xxx - Delete a review
export async function DELETE(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.substring(7);
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const reviewId = searchParams.get('id');

    if (!reviewId) {
      return NextResponse.json({ error: 'Review ID required' }, { status: 400 });
    }

    // Get review to check ownership and get story_id
    const { data: review } = await supabaseAdmin
      .from('reviews')
      .select('user_id, story_id')
      .eq('id', reviewId)
      .single();

    if (!review || review.user_id !== user.id) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
    }

    const { error } = await supabaseAdmin
      .from('reviews')
      .delete()
      .eq('id', reviewId);

    if (error) throw error;

    // Update story average rating
    await updateStoryRating(review.story_id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting review:', error);
    return NextResponse.json({ error: 'Failed to delete review' }, { status: 500 });
  }
}

// Helper to update story's average rating
async function updateStoryRating(storyId: string) {
  const { data: reviews } = await supabaseAdmin
    .from('reviews')
    .select('rating')
    .eq('story_id', storyId);

  const avgRating = reviews && reviews.length > 0
    ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
    : 0;

  await supabaseAdmin
    .from('stories')
    .update({ rating: Math.round(avgRating * 10) / 10 })
    .eq('id', storyId);
}
