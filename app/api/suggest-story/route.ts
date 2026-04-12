import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const COOLDOWN_DAYS = 7;

async function getLastSubmission(email: string) {
  const since = new Date(Date.now() - COOLDOWN_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { data } = await supabaseAdmin
    .from('support_messages')
    .select('created_at')
    .eq('email', email)
    .like('subject', '[Story Idea]%')
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(1);
  return data?.[0] ?? null;
}

// GET — check eligibility for this email
export async function GET(request: NextRequest) {
  const email = request.nextUrl.searchParams.get('email');
  if (!email) return NextResponse.json({ eligible: true });

  try {
    const last = await getLastSubmission(email);
    if (!last) return NextResponse.json({ eligible: true });

    const nextAvailable = new Date(new Date(last.created_at).getTime() + COOLDOWN_DAYS * 24 * 60 * 60 * 1000);
    return NextResponse.json({ eligible: false, nextAvailable: nextAvailable.toISOString(), lastSubmitted: last.created_at });
  } catch {
    return NextResponse.json({ eligible: true });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { name, email, genre, title, idea, userId } = await request.json();

    if (!name || !email || !genre || !title || !idea) {
      return NextResponse.json({ error: 'All fields are required' }, { status: 400 });
    }

    const wordCount = idea.trim().split(/\s+/).filter(Boolean).length;
    if (wordCount > 50) {
      return NextResponse.json({ error: 'Story idea must be 50 words or less' }, { status: 400 });
    }

    // Enforce one submission per 7 days
    const last = await getLastSubmission(email);
    if (last) {
      const nextAvailable = new Date(new Date(last.created_at).getTime() + COOLDOWN_DAYS * 24 * 60 * 60 * 1000);
      return NextResponse.json(
        { error: 'You can only submit one story idea per week.', nextAvailable: nextAvailable.toISOString() },
        { status: 429 }
      );
    }

    // Store in support_messages with a [Story Idea] subject prefix
    // message field holds JSON with structured submission data
    const { error: dbError } = await supabaseAdmin
      .from('support_messages')
      .insert({
        user_id: userId || null,
        name,
        email,
        subject: `[Story Idea] ${title}`,
        message: JSON.stringify({ genre, title, idea, wordCount }),
        status: 'new',
      });

    if (dbError) {
      console.error('[SuggestStory] DB insert error:', dbError);
      return NextResponse.json({ error: 'Failed to save submission' }, { status: 500 });
    }

    // Also fire off an email to Marc
    if (process.env.RESEND_API_KEY) {
      const emailBody = `New Story Idea Submission
=========================
From:   ${name} <${email}>
Genre:  ${genre}
Title:  ${title}

Story Idea (${wordCount} words):
${idea}

---
Review it at: https://endless-tales.com/admin/story-ideas`;

      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'Endless Tales <hello@endless-tales.com>',
          to: 'hello@endless-tales.com',
          reply_to: email,
          subject: `💡 Story Idea: ${title} (${genre})`,
          text: emailBody,
        }),
      }).catch(err => console.error('[SuggestStory] Email send failed:', err));
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[SuggestStory] Error:', error);
    return NextResponse.json({ error: 'Failed to submit story idea' }, { status: 500 });
  }
}
