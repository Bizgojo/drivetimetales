/*
================================================================================
📝 NEWS PROMPTS API
================================================================================
Location: ~/Projects/drivetimetales/app/api/admin/news-prompts/route.ts
Purpose: Read and edit news briefing prompts

GET: Returns prompt for a category
POST: Updates prompt for a category (writes to database, overrides file defaults)

================================================================================
*/

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { NEWS_PROMPTS, NewsPrompt } from '@/lib/news-prompts'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
const supabase = createClient(supabaseUrl, supabaseServiceKey)

// GET - Retrieve prompt for a category
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const category = searchParams.get('category')

    if (!category) {
      // Return all prompts
      const { data: dbPrompts } = await supabase
        .from('news_prompts')
        .select('*')

      // Merge database overrides with file defaults
      const mergedPrompts: Record<string, NewsPrompt> = { ...NEWS_PROMPTS }
      
      if (dbPrompts) {
        for (const dbPrompt of dbPrompts) {
          if (mergedPrompts[dbPrompt.category]) {
            mergedPrompts[dbPrompt.category] = {
              ...mergedPrompts[dbPrompt.category],
              prompt: dbPrompt.prompt,
              voice: dbPrompt.voice || '',
              tone: dbPrompt.tone || '',
              duration: dbPrompt.duration || '2 minutes',
              lastUpdated: dbPrompt.updated_at
            }
          }
        }
      }

      return NextResponse.json({ 
        success: true, 
        prompts: mergedPrompts 
      })
    }

    // Get specific category
    const filePrompt = NEWS_PROMPTS[category]
    if (!filePrompt) {
      return NextResponse.json({ 
        success: false, 
        error: 'Category not found' 
      }, { status: 404 })
    }

    // Check for database override
    const { data: dbPrompt } = await supabase
      .from('news_prompts')
      .select('*')
      .eq('category', category)
      .single()

    const prompt: NewsPrompt = dbPrompt ? {
      ...filePrompt,
      prompt: dbPrompt.prompt,
      voice: dbPrompt.voice || '',
      tone: dbPrompt.tone || '',
      duration: dbPrompt.duration || '2 minutes',
      lastUpdated: dbPrompt.updated_at
    } : filePrompt

    return NextResponse.json({ 
      success: true, 
      prompt,
      isCustom: !!dbPrompt
    })

  } catch (error) {
    console.error('[News Prompts] GET error:', error)
    return NextResponse.json({ 
      success: false, 
      error: 'Failed to fetch prompt' 
    }, { status: 500 })
  }
}

// POST - Update prompt for a category
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { category, prompt, voice, tone, duration } = body

    if (!category || !prompt) {
      return NextResponse.json({ 
        success: false, 
        error: 'Category and prompt are required' 
      }, { status: 400 })
    }

    // Verify category exists
    if (!NEWS_PROMPTS[category]) {
      return NextResponse.json({ 
        success: false, 
        error: 'Invalid category' 
      }, { status: 400 })
    }

    // Upsert to database
    const { error } = await supabase
      .from('news_prompts')
      .upsert({
        category,
        prompt,
        voice: voice || null,
        tone: tone || null,
        duration: duration || '2 minutes',
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'category'
      })

    if (error) {
      throw error
    }

    return NextResponse.json({ 
      success: true, 
      message: 'Prompt saved successfully' 
    })

  } catch (error) {
    console.error('[News Prompts] POST error:', error)
    return NextResponse.json({ 
      success: false, 
      error: 'Failed to save prompt' 
    }, { status: 500 })
  }
}

// DELETE - Reset prompt to default (removes database override)
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const category = searchParams.get('category')

    if (!category) {
      return NextResponse.json({ 
        success: false, 
        error: 'Category is required' 
      }, { status: 400 })
    }

    // Delete from database (reverts to file default)
    const { error } = await supabase
      .from('news_prompts')
      .delete()
      .eq('category', category)

    if (error) {
      throw error
    }

    return NextResponse.json({ 
      success: true, 
      message: 'Prompt reset to default',
      defaultPrompt: NEWS_PROMPTS[category]?.prompt
    })

  } catch (error) {
    console.error('[News Prompts] DELETE error:', error)
    return NextResponse.json({ 
      success: false, 
      error: 'Failed to reset prompt' 
    }, { status: 500 })
  }
}
