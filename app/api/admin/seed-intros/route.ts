import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// 15 generic intro templates (no user name, includes [narrator_name] and [category] placeholders)
// [time_greeting] = "Good morning" / "Good afternoon" / "Good evening"
const INTRO_TEMPLATES = [
  `[time_greeting]. I'm [narrator_name], and here's your [category] update for [date].`,
  `[time_greeting]. I'm [narrator_name] with your [category] briefing for [date]. Let's get into it.`,
  `[time_greeting]. [narrator_name] here with your [category] for [date].`,
  `[time_greeting], and welcome. I'm [narrator_name], bringing you the latest [category] for [date].`,
  `[time_greeting]. This is [narrator_name] with your [category] update. Here's what's happening on [date].`,
  `[time_greeting]. [narrator_name] here. Let's jump right into your [category] for [date].`,
  `[time_greeting]. I'm [narrator_name]. Here's what you need to know in [category] for [date].`,
  `[time_greeting] and thanks for tuning in. I'm [narrator_name] with your [category] for [date].`,
  `[time_greeting]. It's [narrator_name] bringing you today's [category] headlines for [date].`,
  `[time_greeting]. [narrator_name] here with the stories that matter in [category] for [date].`,
  `[time_greeting]. I'm [narrator_name], and this is your [category] briefing for [date]. Let's dive in.`,
  `[time_greeting]. Welcome to your [category] update. I'm [narrator_name], and today is [date].`,
  `[time_greeting]. I'm [narrator_name]. Here are the top [category] stories for [date].`,
  `[time_greeting]. This is [narrator_name], and you're listening to your [category] briefing for [date].`,
  `[time_greeting]. [narrator_name] here. Let me catch you up on [category] for [date].`,
];

// 15 generic outro templates
const OUTRO_TEMPLATES = [
  `That's your update. I'm [narrator_name], and I'll see you next time.`,
  `And that's the latest. I'm [narrator_name]. Thanks for listening, and I'll be back with more soon.`,
  `That wraps up your [category] briefing. I'm [narrator_name]. Take care out there.`,
  `I'm [narrator_name]. Thanks for spending a few minutes with me. See you next time.`,
  `That's all for now. I'm [narrator_name], and I'll have another update for you soon.`,
  `And that's your [category] for today. I'm [narrator_name]. Stay informed, and I'll catch you later.`,
  `I'm [narrator_name]. That's your briefing. Thanks for listening, and drive safe.`,
  `That's the news. I'm [narrator_name], and I'll be back soon with your next update.`,
  `And there you have it. I'm [narrator_name]. Until next time, take it easy.`,
  `That's your [category] update. Thanks for tuning in. I'm [narrator_name], and I'll see you soon.`,
  `I'm [narrator_name], and that's a wrap on your [category] briefing. Stay safe out there.`,
  `And that does it for this update. I'm [narrator_name]. Thanks for listening.`,
  `That's your briefing. I'm [narrator_name]. I'll be back later with more. Take care.`,
  `I'm [narrator_name]. That's your [category] update for now. See you next time.`,
  `And that's what's happening. I'm [narrator_name]. Thanks for listening, and I'll catch you next time.`,
];

// Personalized intro templates (includes [first_name])
const PERSONALIZED_INTRO_TEMPLATES = [
  `[time_greeting], [first_name]. I'm [narrator_name], and here's your [category] update for [date].`,
  `[time_greeting], [first_name]. I'm [narrator_name] with your [category] briefing for [date]. Let's get into it.`,
  `[time_greeting], [first_name]. [narrator_name] here with your [category] for [date].`,
  `[time_greeting], [first_name], and welcome back. I'm [narrator_name], bringing you the latest [category] for [date].`,
  `[time_greeting], [first_name]. This is [narrator_name] with your [category] update for [date].`,
  `Hey [first_name], [time_greeting]. [narrator_name] here. Let's jump into your [category] for [date].`,
  `[time_greeting], [first_name]. I'm [narrator_name]. Here's what you need to know in [category] for [date].`,
  `[time_greeting], [first_name], and thanks for tuning in. I'm [narrator_name] with your [category] for [date].`,
  `[time_greeting], [first_name]. It's [narrator_name] bringing you today's [category] headlines for [date].`,
  `[time_greeting], [first_name]. [narrator_name] here with the stories that matter in [category] for [date].`,
  `[time_greeting], [first_name]. I'm [narrator_name], and this is your [category] briefing for [date]. Let's dive in.`,
  `[time_greeting], [first_name]. Welcome to your [category] update. I'm [narrator_name], and today is [date].`,
  `[time_greeting], [first_name]. I'm [narrator_name]. Here are the top [category] stories for [date].`,
  `[time_greeting], [first_name]. This is [narrator_name], and you're listening to your [category] briefing for [date].`,
  `[time_greeting], [first_name]. [narrator_name] here. Let me catch you up on [category] for [date].`,
];

// Personalized outro templates
const PERSONALIZED_OUTRO_TEMPLATES = [
  `That's your update, [first_name]. I'm [narrator_name], and I'll see you next time.`,
  `And that's the latest, [first_name]. I'm [narrator_name]. Thanks for listening.`,
  `That wraps up your [category] briefing, [first_name]. I'm [narrator_name]. Take care out there.`,
  `[first_name], I'm [narrator_name]. Thanks for spending a few minutes with me. See you next time.`,
  `That's all for now, [first_name]. I'm [narrator_name], and I'll have another update for you soon.`,
  `And that's your [category] for today, [first_name]. I'm [narrator_name]. Stay informed.`,
  `[first_name], I'm [narrator_name]. That's your briefing. Thanks for listening, and drive safe.`,
  `That's the news, [first_name]. I'm [narrator_name], and I'll be back soon with your next update.`,
  `And there you have it, [first_name]. I'm [narrator_name]. Until next time, take it easy.`,
  `That's your [category] update, [first_name]. I'm [narrator_name], and I'll see you soon.`,
  `[first_name], I'm [narrator_name], and that's a wrap. Stay safe out there.`,
  `And that does it, [first_name]. I'm [narrator_name]. Thanks for listening.`,
  `That's your briefing, [first_name]. I'm [narrator_name]. I'll be back later with more.`,
  `[first_name], I'm [narrator_name]. That's your [category] update. See you next time.`,
  `And that's what's happening, [first_name]. I'm [narrator_name]. Catch you next time.`,
];

// GET: Seed templates into the database
export async function GET() {
  try {
    // Clear existing templates
    await supabase.from('intro_outro_templates').delete().neq('id', '00000000-0000-0000-0000-000000000000');

    const rows: any[] = [];

    // Generic intros (for welcome page)
    INTRO_TEMPLATES.forEach((template, i) => {
      ['morning', 'afternoon', 'evening'].forEach(timePeriod => {
        rows.push({
          type: 'intro',
          variation: i + 1,
          time_period: timePeriod,
          category: 'generic',
          script_template: template,
          is_personalized: false,
        });
      });
    });

    // Generic outros (for welcome page)
    OUTRO_TEMPLATES.forEach((template, i) => {
      rows.push({
        type: 'outro',
        variation: i + 1,
        time_period: 'all',
        category: 'generic',
        script_template: template,
        is_personalized: false,
      });
    });

    // Personalized intros (for home page)
    PERSONALIZED_INTRO_TEMPLATES.forEach((template, i) => {
      ['morning', 'afternoon', 'evening'].forEach(timePeriod => {
        rows.push({
          type: 'intro',
          variation: i + 1,
          time_period: timePeriod,
          category: 'personalized',
          script_template: template,
          is_personalized: true,
        });
      });
    });

    // Personalized outros (for home page)
    PERSONALIZED_OUTRO_TEMPLATES.forEach((template, i) => {
      rows.push({
        type: 'outro',
        variation: i + 1,
        time_period: 'all',
        category: 'personalized',
        script_template: template,
        is_personalized: true,
      });
    });

    const { data, error } = await supabase.from('intro_outro_templates').insert(rows).select();

    if (error) {
      console.error('[Seed] Error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: `Seeded ${data?.length || 0} intro/outro templates`,
      breakdown: {
        genericIntros: INTRO_TEMPLATES.length * 3, // x3 for time periods
        genericOutros: OUTRO_TEMPLATES.length,
        personalizedIntros: PERSONALIZED_INTRO_TEMPLATES.length * 3,
        personalizedOutros: PERSONALIZED_OUTRO_TEMPLATES.length,
      }
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

// POST: Generate audio for all templates for a specific narrator
export async function POST(request: NextRequest) {
  try {
    const { narratorName, voiceId, category } = await request.json();

    if (!narratorName || !voiceId) {
      return NextResponse.json({ error: 'narratorName and voiceId required' }, { status: 400 });
    }

    // Get all templates
    const { data: templates, error } = await supabase
      .from('intro_outro_templates')
      .select('*')
      .eq('is_personalized', false); // Only generate generic versions

    if (error || !templates) {
      return NextResponse.json({ error: 'Failed to load templates' }, { status: 500 });
    }

    const categoryDisplayNames: Record<string, string> = {
      'state': 'state news', 'national': 'national news', 'world': 'world news',
      'business': 'business news', 'sports': 'sports news', 'science': 'science and tech news',
    };

    const targetCategory = category || 'national';
    const categoryDisplay = categoryDisplayNames[targetCategory] || 'news';
    const timeGreetings: Record<string, string> = {
      'morning': 'Good morning', 'afternoon': 'Good afternoon', 'evening': 'Good evening'
    };

    const results: any[] = [];
    let generated = 0;

    for (const template of templates) {
      const timeGreeting = timeGreetings[template.time_period] || 'Good morning';
      const today = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

      let script = template.script_template
        .replace(/\[narrator_name\]/g, narratorName)
        .replace(/\[time_greeting\]/g, timeGreeting)
        .replace(/\[category\]/g, categoryDisplay)
        .replace(/\[date\]/g, today);

      // Generate TTS
      try {
        const ttsResponse = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'xi-api-key': process.env.ELEVENLABS_API_KEY!,
          },
          body: JSON.stringify({
            text: script,
            model_id: 'eleven_turbo_v2',
            voice_settings: { stability: 0.5, similarity_boost: 0.75 },
          }),
        });

        if (ttsResponse.ok) {
          const audioBuffer = await ttsResponse.arrayBuffer();
          const fileName = `intros/${targetCategory}/${template.type}_${template.variation}_${template.time_period}_${voiceId.slice(0, 8)}.mp3`;

          const { error: uploadError } = await supabase.storage
            .from('audio')
            .upload(fileName, Buffer.from(audioBuffer), { contentType: 'audio/mpeg', upsert: true });

          if (!uploadError) {
            const { data: urlData } = supabase.storage.from('audio').getPublicUrl(fileName);

            // Update template with audio URL for this narrator
            await supabase.from('intro_outro_templates').update({
              [`voice_${voiceId.slice(0, 8)}_url`]: urlData.publicUrl,
              audio_url: urlData.publicUrl, // Also set generic audio_url
              voice_id: voiceId,
              narrator_name: narratorName,
            }).eq('id', template.id);

            generated++;
            results.push({ id: template.id, type: template.type, variation: template.variation, success: true });
          }
        }
      } catch (err) {
        results.push({ id: template.id, type: template.type, variation: template.variation, success: false, error: String(err) });
      }

      // Rate limit
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    return NextResponse.json({
      success: true,
      narrator: narratorName,
      voiceId,
      category: targetCategory,
      generated,
      total: templates.length,
      results,
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
