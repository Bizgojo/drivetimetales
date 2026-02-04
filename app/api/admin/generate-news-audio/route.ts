import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY!;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function generateAudioFromText(text: string, voiceId: string): Promise<Buffer> {
  const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: 'POST',
    headers: {
      'Accept': 'audio/mpeg',
      'Content-Type': 'application/json',
      'xi-api-key': ELEVENLABS_API_KEY
    },
    body: JSON.stringify({
      text,
      model_id: 'eleven_multilingual_v2',
      voice_settings: { stability: 0.5, similarity_boost: 0.75 }
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`ElevenLabs API error: ${response.status} - ${errorText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

export async function POST(request: NextRequest) {
  try {
    const { category, state, voiceId, intro, body, outro } = await request.json();

    if (!category) {
      return NextResponse.json({ error: 'Category is required' }, { status: 400 });
    }
    if (!voiceId) {
      return NextResponse.json({ error: 'Voice ID is required' }, { status: 400 });
    }
    if (!intro || !body || !outro) {
      return NextResponse.json({ error: 'Intro, body, and outro are required' }, { status: 400 });
    }

    console.log('[Generate News Audio] Starting for category:', category, state ? `state: ${state}` : '');

    // Combine script parts
    const fullScript = `${intro}\n\n${body}\n\n${outro}`;
    
    // Generate audio
    console.log('[Generate News Audio] Calling ElevenLabs...');
    const audioBuffer = await generateAudioFromText(fullScript, voiceId);
    
    // Calculate approximate duration (rough estimate: 150 words per minute)
    const wordCount = fullScript.split(/\s+/).length;
    const durationMinutes = Math.round((wordCount / 150) * 10) / 10; // Round to 1 decimal
    
    // Upload to Supabase storage
    const timestamp = Date.now();
    const fileName = state 
      ? `news-briefings/${category}/${state.toLowerCase().replace(/\s+/g, '-')}-${timestamp}.mp3`
      : `news-briefings/${category}/${category}-${timestamp}.mp3`;
    
    console.log('[Generate News Audio] Uploading to storage:', fileName);
    
    const { error: uploadError } = await supabase.storage
      .from('news-audio')
      .upload(fileName, audioBuffer, { contentType: 'audio/mpeg', upsert: true });
    
    if (uploadError) {
      console.error('[Generate News Audio] Upload error:', uploadError);
      throw new Error(`Upload error: ${uploadError.message}`);
    }
    
    const { data: urlData } = supabase.storage.from('news-audio').getPublicUrl(fileName);
    const audioUrl = urlData.publicUrl;
    
    console.log('[Generate News Audio] Audio URL:', audioUrl);
    
    // Save episode to database
    const { data: episode, error: dbError } = await supabase
      .from('news_episodes')
      .insert({
        category,
        state: state || null,
        audio_url: audioUrl,
        duration: `${durationMinutes}`,
        script_intro: intro,
        script_body: body,
        script_outro: outro,
        created_at: new Date().toISOString()
      })
      .select()
      .single();
    
    if (dbError) {
      console.error('[Generate News Audio] DB error:', dbError);
      // Continue anyway - audio was generated
    }
    
    console.log('[Generate News Audio] Complete!');
    
    return NextResponse.json({
      success: true,
      episode: {
        id: episode?.id,
        audioUrl,
        duration: `${durationMinutes}`,
        createdAt: new Date().toISOString(),
        category,
        state
      }
    });
    
  } catch (error) {
    console.error('[Generate News Audio] Error:', error);
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'Audio generation failed' 
    }, { status: 500 });
  }
}
