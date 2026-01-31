import { NextRequest, NextResponse } from 'next/server';

// API Key for publishing from Audio Drama Maker
const VALID_API_KEY = '0d35da1c324ce568d61bcdf23b2e9505c8f064afcac01db289d12226f8e60e7e';

export async function GET(request: NextRequest) {
  // Test endpoint - just check if API key is valid
  const apiKey = request.headers.get('x-api-key') || request.nextUrl.searchParams.get('api_key');
  
  if (apiKey === VALID_API_KEY) {
    return NextResponse.json({ status: 'connected', message: 'Ready to publish' });
  }
  
  return NextResponse.json({ status: 'ok', message: 'Drive Time Tales API' });
}

export async function POST(request: NextRequest) {
  try {
    // Check API key
    const apiKey = request.headers.get('x-api-key');
    
    if (!apiKey || apiKey !== VALID_API_KEY) {
      return NextResponse.json(
        { error: 'Invalid API key' },
        { status: 401 }
      );
    }

    // Parse the form data
    const formData = await request.formData();
    
    const title = formData.get('title') as string;
    const author = formData.get('author') as string;
    const genre = formData.get('genre') as string;
    const description = formData.get('description') as string;
    const duration_seconds = formData.get('duration_seconds') as string;
    const credits = formData.get('credits') as string;
    const audioFile = formData.get('audio') as File | null;
    const coverFile = formData.get('cover') as File | null;

    console.log('Publishing story:', { title, author, genre, description, duration_seconds });

    // Validate required fields
    if (!title) {
      return NextResponse.json({ error: 'Title is required' }, { status: 400 });
    }

    // Calculate duration label
    const seconds = parseInt(duration_seconds) || 0;
    let duration_label = '30 min';
    let duration_category = '30min';
    if (seconds > 3600) {
      duration_label = `${Math.round(seconds / 3600)} hr`;
      duration_category = '3hr';
    } else if (seconds > 1800) {
      duration_label = '1 hr';
      duration_category = '1hr';
    } else {
      duration_label = `${Math.round(seconds / 60)} min`;
      duration_category = '30min';
    }

    // Calculate price based on duration
    let price_cents = 99; // Default 99 cents
    if (seconds <= 900) { // 15 min or less
      price_cents = 69;
    } else if (seconds <= 1800) { // 30 min or less
      price_cents = 129;
    } else if (seconds <= 3600) { // 1 hour or less
      price_cents = 249;
    } else { // Over 1 hour
      price_cents = 699;
    }

    // For now, just log success and return
    // In production, you would:
    // 1. Upload audio file to R2/S3
    // 2. Upload cover image to R2/S3
    // 3. Insert record into Supabase database

    const storyId = `story_${Date.now()}`;
    
    console.log('Story published successfully:', {
      id: storyId,
      title,
      author,
      genre,
      duration_label,
      price_cents,
      hasAudio: !!audioFile,
      hasCover: !!coverFile
    });

    return NextResponse.json({
      success: true,
      message: 'Story published successfully!',
      story: {
        id: storyId,
        title,
        author,
        genre,
        duration: duration_category,
        duration_label,
        price_cents,
        description,
        credits
      }
    });

  } catch (error) {
    console.error('Publish error:', error);
    return NextResponse.json(
      { error: 'Failed to publish story' },
      { status: 500 }
    );
  }
}
