// app/api/admin/generate-user-clips/route.ts
// Generates 15 personalized intro and 15 outro clips for a user at signup

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// 15 intro templates - {NAME} will be replaced with user's first name
// {GREETING} will be replaced with time-appropriate greeting (Good morning/afternoon/evening)
const INTRO_TEMPLATES = [
  "{GREETING}, {NAME}! Welcome to Drive Time Tales. Here's your news briefing.",
  "Hey {NAME}! {GREETING}! Let's get you caught up on today's news.",
  "{GREETING}, {NAME}! I'm your host, and I've got your news update ready.",
  "Welcome back, {NAME}! {GREETING}! Time for your Drive Time Tales briefing.",
  "{GREETING}, {NAME}! Great to have you here. Let's dive into today's headlines.",
  "Hey there, {NAME}! {GREETING}! Here's what's happening in the world today.",
  "{GREETING}, {NAME}! Buckle up - here comes your news briefing.",
  "{NAME}! {GREETING}! Welcome to Drive Time Tales. Let's get started.",
  "{GREETING}, {NAME}! Your personalized news briefing starts now.",
  "Welcome, {NAME}! {GREETING}! I've got your news update right here.",
  "{GREETING}, {NAME}! Ready for today's headlines? Let's go.",
  "Hey {NAME}, {GREETING}! Time for your Drive Time Tales update.",
  "{GREETING}, {NAME}! Thanks for tuning in. Here's your news.",
  "{NAME}, {GREETING}! Welcome aboard. Let's catch you up on the news.",
  "{GREETING}, {NAME}! So glad you're here. Let's dive into your briefing."
];

// 15 outro templates
const OUTRO_TEMPLATES = [
  "That's your update, {NAME}. Thanks for listening, and drive safe!",
  "And that's the news, {NAME}. Have a great drive!",
  "That wraps it up, {NAME}. See you next time on Drive Time Tales!",
  "Thanks for tuning in, {NAME}. Until next time, drive safe!",
  "That's all for now, {NAME}. Enjoy your drive!",
  "And that's your briefing, {NAME}. Thanks for listening!",
  "{NAME}, thanks for joining me. Have a wonderful drive!",
  "That's the latest, {NAME}. Catch you next time!",
  "All caught up, {NAME}! Thanks for listening to Drive Time Tales.",
  "That's your news update, {NAME}. Drive safe out there!",
  "And we're done, {NAME}! Thanks for tuning in. Safe travels!",
  "That's a wrap, {NAME}. See you on the next Drive Time Tales!",
  "Thanks for listening, {NAME}. Have an awesome drive!",
  "{NAME}, that's your update. Until next time, take care!",
  "And that's all, {NAME}. Thanks for being part of Drive Time Tales!"
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

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, firstName, voiceId } = body;

    if (!userId || !firstName) {
      return NextResponse.json({ error: 'userId and firstName are required' }, { status: 400 });
    }

    // Default voice if not specified
    const voice = voiceId || '21m00Tcm4TlvDq8ikWAM'; // Rachel voice

    console.log(`[Generate User Clips] Starting for user: ${userId}, name: ${firstName}`);

    // Check if clips already exist for this user
    const { data: existingClips } = await supabase
      .from('user_audio_clips')
      .select('id')
      .eq('user_id', userId)
      .limit(1);

    if (existingClips && existingClips.length > 0) {
      return NextResponse.json({ 
        success: false, 
        message: 'Clips already exist for this user',
        userId 
      });
    }

    const results = {
      intros: [] as { clipNumber: number; audioUrl: string; scriptText: string }[],
      outros: [] as { clipNumber: number; audioUrl: string; scriptText: string }[]
    };

    // Generate 15 intro clips
    console.log('[Generate User Clips] Generating intros...');
    for (let i = 0; i < INTRO_TEMPLATES.length; i++) {
      const template = INTRO_TEMPLATES[i];
      
      // We'll generate 3 versions of each template (morning, afternoon, evening)
      // But store just the template with {GREETING} - actual greeting inserted at playback
      // Actually, let's generate with a neutral greeting for now and handle time-of-day separately
      
      const scriptText = template
        .replace(/{NAME}/g, firstName)
        .replace(/{GREETING}/g, 'Hello'); // Neutral - we'll handle time greetings differently

      try {
        const audioBuffer = await generateAudioClip(scriptText, voice);
        const fileName = `user-clips/${userId}/intro-${i + 1}-${Date.now()}.mp3`;
        
        const { error: uploadError } = await supabase.storage
          .from('news-audio')
          .upload(fileName, audioBuffer, {
            contentType: 'audio/mpeg',
            upsert: true
          });

        if (uploadError) {
          console.error(`[Generate User Clips] Upload error for intro ${i + 1}:`, uploadError);
          continue;
        }

        const { data: urlData } = supabase.storage.from('news-audio').getPublicUrl(fileName);
        
        // Save to database
        await supabase.from('user_audio_clips').insert({
          user_id: userId,
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

        console.log(`[Generate User Clips] Intro ${i + 1}/15 complete`);

        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 300));

      } catch (err) {
        console.error(`[Generate User Clips] Error generating intro ${i + 1}:`, err);
      }
    }

    // Generate 15 outro clips
    console.log('[Generate User Clips] Generating outros...');
    for (let i = 0; i < OUTRO_TEMPLATES.length; i++) {
      const template = OUTRO_TEMPLATES[i];
      const scriptText = template.replace(/{NAME}/g, firstName);

      try {
        const audioBuffer = await generateAudioClip(scriptText, voice);
        const fileName = `user-clips/${userId}/outro-${i + 1}-${Date.now()}.mp3`;
        
        const { error: uploadError } = await supabase.storage
          .from('news-audio')
          .upload(fileName, audioBuffer, {
            contentType: 'audio/mpeg',
            upsert: true
          });

        if (uploadError) {
          console.error(`[Generate User Clips] Upload error for outro ${i + 1}:`, uploadError);
          continue;
        }

        const { data: urlData } = supabase.storage.from('news-audio').getPublicUrl(fileName);
        
        // Save to database
        await supabase.from('user_audio_clips').insert({
          user_id: userId,
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

        console.log(`[Generate User Clips] Outro ${i + 1}/15 complete`);

        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 300));

      } catch (err) {
        console.error(`[Generate User Clips] Error generating outro ${i + 1}:`, err);
      }
    }

    console.log(`[Generate User Clips] Complete! Generated ${results.intros.length} intros and ${results.outros.length} outros`);

    return NextResponse.json({
      success: true,
      userId,
      firstName,
      generated: {
        intros: results.intros.length,
        outros: results.outros.length
      },
      results
    });

  } catch (error) {
    console.error('[Generate User Clips] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Generation failed' },
      { status: 500 }
    );
  }
}

// GET handler to check status or retrieve clips for a user
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get('userId');

  if (!userId) {
    return NextResponse.json({ error: 'userId is required' }, { status: 400 });
  }

  try {
    const { data: clips, error } = await supabase
      .from('user_audio_clips')
      .select('*')
      .eq('user_id', userId)
      .order('clip_type')
      .order('clip_number');

    if (error) throw error;

    const intros = clips?.filter(c => c.clip_type === 'intro') || [];
    const outros = clips?.filter(c => c.clip_type === 'outro') || [];

    return NextResponse.json({
      userId,
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
    console.error('[Get User Clips] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch clips' },
      { status: 500 }
    );
  }
}
