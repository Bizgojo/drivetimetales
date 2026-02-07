import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY!;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Intro templates - [narrator] gets replaced, [timegreeting] becomes static for recording
const INTRO_TEMPLATES = [
  { variant: 1, personalized: { part_a: "Good morning,", part_b: "! I'm [narrator], and I've got your news update ready. Let's dive in." }, generic: "Good morning! I'm [narrator], and I've got your news update ready. Let's dive in." },
  { variant: 2, personalized: { part_a: "Hey there,", part_b: "! [narrator] here with your daily briefing. Here's what you need to know." }, generic: "Hey there! [narrator] here with your daily briefing. Here's what you need to know." },
  { variant: 3, personalized: { part_a: "Good afternoon,", part_b: ". It's [narrator], bringing you today's headlines. Let's get started." }, generic: "Good afternoon. It's [narrator], bringing you today's headlines. Let's get started." },
  { variant: 4, personalized: { part_a: "Welcome back,", part_b: "! I'm [narrator], and here's what's making news right now." }, generic: "Welcome! I'm [narrator], and here's what's making news right now." },
  { variant: 5, personalized: { part_a: "Good evening,", part_b: "! [narrator] here. Got a lot to cover today, so let's jump right in." }, generic: "Good evening! [narrator] here. Got a lot to cover today, so let's jump right in." },
  { variant: 6, personalized: { part_a: "Hi,", part_b: "! It's [narrator] with your news briefing. Here are today's top stories." }, generic: "Hi there! It's [narrator] with your news briefing. Here are today's top stories." },
  { variant: 7, personalized: { part_a: "Good morning,", part_b: ". [narrator] here, ready to catch you up on what's happening. Let's go." }, generic: "Good morning. [narrator] here, ready to catch you up on what's happening. Let's go." },
  { variant: 8, personalized: { part_a: "Hey,", part_b: "! I'm [narrator]. Here's your quick look at today's news." }, generic: "Hey! I'm [narrator]. Here's your quick look at today's news." },
  { variant: 9, personalized: { part_a: "Good afternoon,", part_b: "! [narrator] coming to you with the latest. Let's see what's going on." }, generic: "Good afternoon! [narrator] coming to you with the latest. Let's see what's going on." },
  { variant: 10, personalized: { part_a: "Hello,", part_b: "! I'm [narrator], and I'm here to bring you up to speed. Here we go." }, generic: "Hello! I'm [narrator], and I'm here to bring you up to speed. Here we go." },
  { variant: 11, personalized: { part_a: "Good evening,", part_b: ". It's [narrator] with your news update. A lot happening today." }, generic: "Good evening. It's [narrator] with your news update. A lot happening today." },
  { variant: 12, personalized: { part_a: "Great to have you,", part_b: "! [narrator] here. Let me fill you in on what's new." }, generic: "Great to have you! [narrator] here. Let me fill you in on what's new." },
  { variant: 13, personalized: { part_a: "Good morning,", part_b: "! I'm [narrator], and I've got your headlines. Let's get into it." }, generic: "Good morning! I'm [narrator], and I've got your headlines. Let's get into it." },
  { variant: 14, personalized: { part_a: "Hi there,", part_b: "! [narrator] here with the stories that matter. Here's what's happening." }, generic: "Hi there! [narrator] here with the stories that matter. Here's what's happening." },
  { variant: 15, personalized: { part_a: "Good afternoon,", part_b: ". [narrator] checking in with your news. Let's take a look." }, generic: "Good afternoon. [narrator] checking in with your news. Let's take a look." }
];

const OUTRO_TEMPLATES = [
  { variant: 1, text: "That's your update for now. I'm [narrator]. Safe travels, and I'll catch you next time." },
  { variant: 2, text: "And that's the news. [narrator] here, wishing you a great rest of your drive." },
  { variant: 3, text: "That wraps things up. I'm [narrator]. Thanks for listening, and stay informed." },
  { variant: 4, text: "That's all for now. [narrator] signing off. Have a good one." },
  { variant: 5, text: "And there you have it. I'm [narrator]. Take care, and I'll talk to you soon." },
  { variant: 6, text: "That's your briefing. [narrator] here. Stay safe out there." },
  { variant: 7, text: "And that's a wrap. I'm [narrator]. Thanks for tuning in." },
  { variant: 8, text: "That's the latest. [narrator] signing off. Enjoy the rest of your day." },
  { variant: 9, text: "And that does it for now. I'm [narrator]. Until next time, take care." },
  { variant: 10, text: "That's your update. [narrator] here, hoping you have a smooth ride ahead." },
  { variant: 11, text: "And we're done for today. I'm [narrator]. Stay curious, stay informed." },
  { variant: 12, text: "That's all the news. [narrator] signing off. See you next time." },
  { variant: 13, text: "And there's your update. I'm [narrator]. Thanks for spending this time with me." },
  { variant: 14, text: "That covers it. [narrator] here. Wishing you safe travels." },
  { variant: 15, text: "And that's the news for now. I'm [narrator]. Until next time, take it easy." }
];

async function generateAudio(text: string, voiceId: string): Promise<Buffer> {
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

async function uploadAudio(buffer: Buffer, fileName: string): Promise<string> {
  const { error: uploadError } = await supabase.storage
    .from('news-audio')
    .upload(fileName, buffer, { contentType: 'audio/mpeg', upsert: true });

  if (uploadError) {
    throw new Error(`Upload error: ${uploadError.message}`);
  }

  const { data: urlData } = supabase.storage.from('news-audio').getPublicUrl(fileName);
  return urlData.publicUrl;
}

export async function POST(request: NextRequest) {
  try {
    const { category, voiceId, narratorName } = await request.json();

    if (!category || !voiceId || !narratorName) {
      return NextResponse.json({ error: 'category, voiceId, and narratorName are required' }, { status: 400 });
    }

    console.log(`[Generate Intro/Outro] Starting for ${category} with narrator ${narratorName}`);

    // Delete existing entries for this category
    await supabase
      .from('intro_outro')
      .delete()
      .eq('category', category);

    const results = { intros: 0, outros: 0, errors: [] as string[] };

    // Generate intros
    for (const template of INTRO_TEMPLATES) {
      try {
        // Generate personalized intro (two parts)
        const partAText = template.personalized.part_a;
        const partBText = template.personalized.part_b.replace(/\[narrator\]/g, narratorName);
        
        const partABuffer = await generateAudio(partAText, voiceId);
        const partBBuffer = await generateAudio(partBText, voiceId);
        
        const partAUrl = await uploadAudio(partABuffer, `intro-outro/${category}/intro-${template.variant}-personalized-a.mp3`);
        const partBUrl = await uploadAudio(partBBuffer, `intro-outro/${category}/intro-${template.variant}-personalized-b.mp3`);

        await supabase.from('intro_outro').insert({
          type: 'intro',
          category,
          variant_number: template.variant,
          is_personalized: true,
          script_text: `${partAText} [name] ${partBText}`,
          audio_url_part_a: partAUrl,
          audio_url_part_b: partBUrl,
          voice_id: voiceId,
          narrator_name: narratorName
        });

        // Generate generic intro (single file)
        const genericText = template.generic.replace(/\[narrator\]/g, narratorName);
        const genericBuffer = await generateAudio(genericText, voiceId);
        const genericUrl = await uploadAudio(genericBuffer, `intro-outro/${category}/intro-${template.variant}-generic.mp3`);

        await supabase.from('intro_outro').insert({
          type: 'intro',
          category,
          variant_number: template.variant,
          is_personalized: false,
          script_text: genericText,
          audio_url: genericUrl,
          voice_id: voiceId,
          narrator_name: narratorName
        });

        results.intros++;
        console.log(`[Generate Intro/Outro] Intro ${template.variant} complete`);
      } catch (err) {
        const msg = `Intro ${template.variant}: ${err instanceof Error ? err.message : 'Unknown error'}`;
        results.errors.push(msg);
        console.error(`[Generate Intro/Outro] Error:`, msg);
      }
    }

    // Generate outros
    for (const template of OUTRO_TEMPLATES) {
      try {
        const outroText = template.text.replace(/\[narrator\]/g, narratorName);
        const outroBuffer = await generateAudio(outroText, voiceId);
        const outroUrl = await uploadAudio(outroBuffer, `intro-outro/${category}/outro-${template.variant}.mp3`);

        await supabase.from('intro_outro').insert({
          type: 'outro',
          category,
          variant_number: template.variant,
          is_personalized: false,
          script_text: outroText,
          audio_url: outroUrl,
          voice_id: voiceId,
          narrator_name: narratorName
        });

        results.outros++;
        console.log(`[Generate Intro/Outro] Outro ${template.variant} complete`);
      } catch (err) {
        const msg = `Outro ${template.variant}: ${err instanceof Error ? err.message : 'Unknown error'}`;
        results.errors.push(msg);
        console.error(`[Generate Intro/Outro] Error:`, msg);
      }
    }

    console.log(`[Generate Intro/Outro] Complete! Intros: ${results.intros}, Outros: ${results.outros}`);

    return NextResponse.json({
      success: true,
      category,
      narratorName,
      introsGenerated: results.intros,
      outrosGenerated: results.outros,
      errors: results.errors
    });

  } catch (error) {
    console.error('[Generate Intro/Outro] Error:', error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Generation failed'
    }, { status: 500 });
  }
}
