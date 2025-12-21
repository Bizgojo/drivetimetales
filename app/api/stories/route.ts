import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

// GET /api/stories - Fetch all stories
export async function GET(request: NextRequest) {
  try {
    const supabase = createServerClient()
    const { searchParams } = new URL(request.url)
    
    const genre = searchParams.get('genre')
    const featured = searchParams.get('featured')
    const limit = searchParams.get('limit')
    
    let query = supabase
      .from('stories')
      .select('*')
      .order('play_count', { ascending: false })
    
    if (genre && genre !== 'all') {
      query = query.eq('genre', genre)
    }
    
    if (featured === 'true') {
      query = query.eq('is_featured', true)
    }
    
    if (limit) {
      query = query.limit(parseInt(limit))
    }
    
    const { data, error } = await query
    
    if (error) {
      console.error('Error fetching stories:', error)
      return NextResponse.json({ error: 'Failed to fetch stories' }, { status: 500 })
    }
    
    return NextResponse.json(data)
  } catch (error) {
    console.error('Stories API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST /api/stories - Create a new story (from Audio Drama Maker)
export async function POST(request: NextRequest) {
  try {
    const supabase = createServerClient()
    const body = await request.json()
    
    // Validate required fields
    const required = ['title', 'author', 'genre', 'duration_mins', 'duration_label', 'credits']
    for (const field of required) {
      if (!body[field]) {
        return NextResponse.json({ error: `Missing required field: ${field}` }, { status: 400 })
      }
    }
    
    const { data, error } = await supabase
      .from('stories')
      .insert([{
        title: body.title,
        author: body.author,
        genre: body.genre,
        description: body.description || null,
        duration_mins: body.duration_mins,
        duration_label: body.duration_label,
        credits: body.credits,
        color: body.color || 'from-purple-600 to-purple-900',
        promo_text: body.promo_text || null,
        is_new: body.is_new ?? true,
        is_featured: body.is_featured ?? false,
        audio_url: body.audio_url || null,
        sample_url: body.sample_url || null,
      }])
      .select()
      .single()
    
    if (error) {
      console.error('Error creating story:', error)
      return NextResponse.json({ error: 'Failed to create story' }, { status: 500 })
    }
    
    return NextResponse.json(data, { status: 201 })
  } catch (error) {
    console.error('Stories POST error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
