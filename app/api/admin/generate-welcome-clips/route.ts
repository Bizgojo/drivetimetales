// app/api/admin/generate-welcome-clips/route.ts
// One-time generation of 15 generic intro and 15 outro clips for Welcome page visitors

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// 15 generic intro templates for Welcome page (no personal name, no time-of-day greeting)
const WELCOME_INTRO_TEMPLATES = [
  "Welcome to Drive Time Tales! Here's your news briefing for {DATE}.",
  "Hello and welcome to Drive Time Tales! Let's get you caught up on today's news for {DATE}.",
  "Welcome! You're listening to Drive Time Tales. Here's your briefing for {DATE}.",
  "Thanks for joining Drive Time Tales! Here's what's happening on {DATE}.",
  "Welcome to your Drive Time Tales news briefing for {DATE}. Let's dive in!",
  "Hello! Welcome to Drive Time Tales. Here's your news update for {DATE}.",
  "You're tuned in to Drive Time Tales! Here's your briefing for {DATE}.",
  "Welcome aboard Drive Time Tales! Let's catch you up on the news for {DATE}.",
  "Hello and thanks for listening! This is Drive Time Tales with your news for {DATE}.",
  "Welcome to Drive Time Tales! Ready for your news briefing? Today is {DATE}.",
  "Thanks for tuning in to Drive Time Tales! Here's your update for {DATE}.",
  "Welcome! This is your Drive Time Tales news briefing for {DATE}.",
  "Hello! You've reached Drive Time Tales. Here's what's news on {DATE}.",
  "Welcome to Drive Time Tales! Let's get started with your briefing for {DATE}.",
  "Thanks for choosing Drive Time Tales! Here's your news for {DATE}."
];

// 15 generic outro templates for Welcome page
const WELCOME_OUTRO_TEMPLATES = [
  "That's your Drive Time Tales update. Thanks for listening, and drive safe!",
  "And that's the news. Thanks for tuning in to Drive Time Tales!",
  "That wraps up your briefing. See you next time on Drive Time Tales!",
  "Thanks for listening to Drive Time Tales. Have a great drive!",
  "That's all for now. Thanks for joining us on Drive Time Tales!",
  "And that's your update. Drive safe, and thanks for listening!",
  "That concludes your Drive Time Tales briefing. Until next time!",
  "Thanks for tuning in. This has been Drive Time Tales. Drive safe!",
  "That's your news update. Thanks for listening to Drive Time Tales!",
  "And we're done! Thanks for choosing Drive Time Tales. Safe travels!",
  "That's a wrap on your briefing. See you next time on Drive Time Tales!",
  "Thanks for listening. Have a wonderful drive, and join us again soon!",
  "That's all the news for now. Thanks for tuning in to Drive Time Tales!",
  "And that's your update. Thanks for being part of Drive Time Tales!",
  "That concludes your briefing. Drive safe, and thanks for listening!"
];

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

function getFormattedDate(): string {
  const now = new Date();
  const easternString = now.toLocaleString('en-US', { timeZone: 'America/New_York' });
  const eastern = new Date(easternString);
  return eastern.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { voiceId, forceRegenerate = false } = body;

    // Default voice if not specified
    const voice = voiceId || '21m00Tcm4TlvDq8ikWAM'; // Rachel voice

    console.log('[Generate Welcome Clips] Starting...');

    // Check if clips already exist
    const { data: existingClips } = await supabase
      .from('welcome_audio_clips')
      .select('id')
      .limit(1);

    if (existingClips && existingClips.length > 0 && !forceRegenerate) {
      return NextResponse.json({ 
        success: false, 
        message: 'Welcome clips already exist. Set forceRegenerate=true to regenerate.',
      });
    }

    // If forcing regenerate, delete existing clips
    if (forceRegenerate) {
      await supabase.from('welcome_audio_clips').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      console.log('[Generate Welcome Clips] Deleted existing clips');
    }

    const results = {
      intros: [] as { clipNumber: number; audioUrl: string; scriptText: string }[],
      outros: [] as { clipNumber: number; audioUrl: string; scriptText: string }[]
    };

    // Note: For intros with {DATE}, we generate without date - date will be handled differently
    // Or we generate with a placeholder date understanding these are templates
    const sampleDate = getFormattedDate();

    // Generate 15 intro clips
    console.log('[Generate Welcome Clips] Generating intros...');
    for (let i = 0; i < WELCOME_INTRO_TEMPLATES.length; i++) {
      const template = WELCOME_INTRO_TEMPLATES[i];
      // For now, generate without specific date - the intro mentions Drive Time Tales
      // The actual date is in the news body
      const scriptText = template.replace(/{DATE}/g, 'today');

      try {
        const audioBuffer = await generateAudioClip(scriptText, voice);
        const fileName = `welcome-clips/intro-${i + 1}-${Date.now()}.mp3`;
        
        const { error: uploadError } = await supabase.storage
          .from('news-audio')
          .upload(fileName, audioBuffer, {
            contentType: 'audio/mpeg',
            upsert: true
          });

        if (uploadError) {
          console.error(`[Generate Welcome Clips] Upload error for intro ${i + 1}:`, uploadError);
          continue;
        }

        const { data: urlData } = supabase.storage.from('news-audio').getPublicUrl(fileName);
        
        // Save to database
        await supabase.from('welcome_audio_clips').insert({
          clip_type: 'intro',
          clip_number: i + 1,
          audio_url: urlData.publicUrl,
          script_text: scriptText
        });

        results.intros.push({
          clipNumber: i + 1,
          audioUrl: urlData.publicUrl,
          scriptText
        });

        console.log(`[Generate Welcome Clips] Intro ${i + 1}/15 complete`);

        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 300));

      } catch (err) {
        console.error(`[Generate Welcome Clips] Error generating intro ${i + 1}:`, err);
      }
    }

    // Generate 15 outro clips
    console.log('[Generate Welcome Clips] Generating outros...');
    for (let i = 0; i < WELCOME_OUTRO_TEMPLATES.length; i++) {
      const scriptText = WELCOME_OUTRO_TEMPLATES[i];

      try {
        const audioBuffer = await generateAudioClip(scriptText, voice);
        const fileName = `welcome-clips/outro-${i + 1}-${Date.now()}.mp3`;
        
        const { error: uploadError } = await supabase.storage
          .from('news-audio')
          .upload(fileName, audioBuffer, {
            contentType: 'audio/mpeg',
            upsert: true
          });

        if (uploadError) {
          console.error(`[Generate Welcome Clips] Upload error for outro ${i + 1}:`, uploadError);
          continue;
        }

        const { data: urlData } = supabase.storage.from('news-audio').getPublicUrl(fileName);
        
        // Save to database
        await supabase.from('welcome_audio_clips').insert({
          clip_type: 'outro',
          clip_number: i + 1,
          audio_url: urlData.publicUrl,
          script_text: scriptText
        });

        results.outros.push({
          clipNumber: i + 1,
          audioUrl: urlData.publicUrl,
          scriptText
        });

        console.log(`[Generate Welcome Clips] Outro ${i + 1}/15 complete`);

        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 300));

      } catch (err) {
        console.error(`[Generate Welcome Clips] Error generating outro ${i + 1}:`, err);
      }
    }

    console.log(`[Generate Welcome Clips] Complete! Generated ${results.intros.length} intros and ${results.outros.length} outros`);

    return NextResponse.json({
      success: true,
      generated: {
        intros: results.intros.length,
        outros: results.outros.length
      },
      results
    });

  } catch (error) {
    console.error('[Generate Welcome Clips] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Generation failed' },
      { status: 500 }
    );
  }
}

// GET handler to retrieve welcome clips
export async function GET(request: NextRequest) {
  try {
    const { data: clips, error } = await supabase
      .from('welcome_audio_clips')
      .select('*')
      .order('clip_type')
      .order('clip_number');

    if (error) throw error;

    const intros = clips?.filter(c => c.clip_type === 'intro') || [];
    const outros = clips?.filter(c => c.clip_type === 'outro') || [];

    return NextResponse.json({
      hasClips: clips && clips.length > 0,
      counts: {
        intros: intros.length,
        outros: outros.length
      },
      clips: {
        intros,
        outros
      }
    });

  } catch (error) {
    console.error('[Get Welcome Clips] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch clips' },
      { status: 500 }
    );
  }
}
