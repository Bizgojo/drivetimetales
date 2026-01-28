import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export async function POST(request: NextRequest) {
  try {
    const { subject, message, userName, userPlan } = await request.json();

    if (!message) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 });
    }

    const prompt = `You are a friendly customer support agent for Drive Time Tales, an audio storytelling app for drivers and commuters. 

A user named ${userName} (${userPlan} plan) has sent a support message:

Subject: ${subject}
Message: ${message}

Write a helpful, friendly, and professional response. Be concise but thorough. If it's a technical issue, offer to help troubleshoot. If it's about billing, explain clearly. If it's feedback, thank them warmly.

Keep the response under 150 words. Start directly with the response (no "Dear" or greeting needed as that will be added). Sign off with:

Best regards,
The Drive Time Tales Team`;

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 500,
      messages: [
        { role: 'user', content: prompt }
      ]
    });

    const suggestion = response.content[0].type === 'text' 
      ? response.content[0].text 
      : 'Unable to generate response';

    return NextResponse.json({ suggestion });

  } catch (error) {
    console.error('[AI Suggest] Error:', error);
    return NextResponse.json(
      { error: 'Failed to generate AI response' },
      { status: 500 }
    );
  }
}
