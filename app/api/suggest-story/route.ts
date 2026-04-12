import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { name, email, genre, title, idea } = await request.json();

    if (!name || !email || !genre || !title || !idea) {
      return NextResponse.json({ error: 'All fields are required' }, { status: 400 });
    }

    const wordCount = idea.trim().split(/\s+/).filter(Boolean).length;
    if (wordCount > 50) {
      return NextResponse.json({ error: 'Story idea must be 50 words or less' }, { status: 400 });
    }

    if (process.env.RESEND_API_KEY) {
      const emailBody = `
New Story Idea Submission
=========================

From:   ${name} <${email}>
Genre:  ${genre}
Title:  ${title}

Story Idea (${wordCount} words):
${idea}

---
Submitted via the Endless Tales app.
      `.trim();

      const res = await fetch('https://api.resend.com/emails', {
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
      });

      if (!res.ok) {
        const err = await res.text();
        console.error('[SuggestStory] Resend error:', err);
        return NextResponse.json({ error: 'Failed to send submission' }, { status: 500 });
      }
    } else {
      console.log('[SuggestStory] No RESEND_API_KEY — logging submission:');
      console.log({ name, email, genre, title, idea });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[SuggestStory] Error:', error);
    return NextResponse.json({ error: 'Failed to submit story idea' }, { status: 500 });
  }
}
