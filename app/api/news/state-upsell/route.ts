import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// GET - Return existing upsell audio URL
export async function GET() {
  try {
    const { data, error } = await supabase
      .from('news_settings')
      .select('upsell_audio_url')
      .eq('category', 'state')
      .single();

    if (error || !data?.upsell_audio_url) {
      return NextResponse.json({ exists: false, audioUrl: null });
    }

    return NextResponse.json({ exists: true, audioUrl: data.upsell_audio_url });
  } catch (error) {
    console.error('[State Upsell GET] Error:', error);
    return NextResponse.json({ exists: false, audioUrl: null });
  }
}

// POST - Generate new upsell audio
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
      voice_settings: { stability: 0.5, similarity_boost: 0.75 }
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
    const { narratorName, voiceId, scriptText } = body;

    if (!voiceId) return NextResponse.json({ error: 'Voice ID is required' }, { status: 400 });
    if (!scriptText) return NextResponse.json({ error: 'Script text is required' }, { status: 400 });

    console.log('[Generate State Upsell] Voice:', voiceId, 'Narrator:', narratorName);

    // Delete old upsell files
    const { data: existingFiles } = await supabase.storage.from('news-audio').list('welcome-clips', { search: 'state-upsell' });
    if (existingFiles && existingFiles.length > 0) {
      for (const file of existingFiles) {
        if (file.name.startsWith('state-upsell')) {
          await supabase.storage.from('news-audio').remove([`welcome-clips/${file.name}`]);
        }
      }
    }

    // Generate the audio
    const audioBuffer = await generateAudioClip(scriptText, voiceId);
    const fileName = `welcome-clips/state-upsell-${Date.now()}.mp3`;
    
    const { error: uploadError } = await supabase.storage.from('news-audio').upload(fileName, audioBuffer, { contentType: 'audio/mpeg', upsert: true });
    if (uploadError) throw new Error(`Upload error: ${uploadError.message}`);

    const { data: urlData } = supabase.storage.from('news-audio').getPublicUrl(fileName);
    console.log('[Generate State Upsell] Complete!', urlData.publicUrl);

    return NextResponse.json({ success: true, audioUrl: urlData.publicUrl, scriptText, voiceId, narratorName });
  } catch (error) {
    console.error('[Generate State Upsell] Error:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Generation failed' }, { status: 500 });
  }
}
