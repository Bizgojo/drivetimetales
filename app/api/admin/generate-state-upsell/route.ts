import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const DEFAULT_UPSELL_TEXT = "Hi and welcome to Drive Time Tales! I'm Sarah Mitchell, and I'll be bringing you personalized news for your state, delivered fresh every day. State news is a subscriber benefit, so sign up for a free trial to get your local headlines. In the meantime, enjoy our national, world, business, sports, and science and technology briefings — they're all free to listen to right now. I look forward to welcoming you back once you've joined us on Drive Time Tales!";

// Tammy voice - warm, friendly, American female
const DEFAULT_VOICE_ID = 'CyHwTRKhXEYuSd7CbMwI';

async function generateAudioClip(text: string, voiceId: string): Promise<Buffer> {
  const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: 'POST',
    headers: {
      'Accept': 'audio/mpeg',
      'Content-Type': 'application/json',
      'xi-api-key': process.env.ELEVENLABS_API_KEY!
    },
    body: JSON.stringify({
      text: text,
      model_id: 'eleven_monolingual_v1',
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.75
      }
    }),
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
    const body = await request.json().catch(() => ({}));
    const { voiceId, forceRegenerate = false, scriptText } = body;

    // Use provided values or defaults
    const voice = voiceId || DEFAULT_VOICE_ID;
    const script = scriptText || DEFAULT_UPSELL_TEXT;

    console.log('[Generate State Upsell] Starting with voice:', voice);
    console.log('[Generate State Upsell] Script:', script.substring(0, 50) + '...');

    // Check if upsell clip already exists
    const { data: existingFiles } = await supabase.storage
      .from('news-audio')
      .list('welcome-clips', { search: 'state-upsell' });

    if (existingFiles && existingFiles.length > 0 && !forceRegenerate) {
      const { data: urlData } = supabase.storage
        .from('news-audio')
        .getPublicUrl(`welcome-clips/${existingFiles[0].name}`);
      
      return NextResponse.json({ 
        success: false, 
        message: 'State upsell clip already exists. Set forceRegenerate=true to regenerate.',
        audioUrl: urlData.publicUrl
      });
    }

    // Delete old upsell files if regenerating
    if (forceRegenerate && existingFiles && existingFiles.length > 0) {
      for (const file of existingFiles) {
        if (file.name.startsWith('state-upsell')) {
          await supabase.storage.from('news-audio').remove([`welcome-clips/${file.name}`]);
        }
      }
    }

    // Generate the audio clip
    console.log('[Generate State Upsell] Generating audio...');
    const audioBuffer = await generateAudioClip(script, voice);
    
    const fileName = `welcome-clips/state-upsell-${Date.now()}.mp3`;
    
    const { error: uploadError } = await supabase.storage
      .from('news-audio')
      .upload(fileName, audioBuffer, {
        contentType: 'audio/mpeg',
        upsert: true
      });

    if (uploadError) {
      throw new Error(`Upload error: ${uploadError.message}`);
    }

    const { data: urlData } = supabase.storage.from('news-audio').getPublicUrl(fileName);
    
    console.log('[Generate State Upsell] Complete!', urlData.publicUrl);

    return NextResponse.json({
      success: true,
      audioUrl: urlData.publicUrl,
      scriptText: script,
      voiceId: voice
    });

  } catch (error) {
    console.error('[Generate State Upsell] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Generation failed' },
      { status: 500 }
    );
  }
}
