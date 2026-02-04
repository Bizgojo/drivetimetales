import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Default knowledge if database is empty
const DEFAULT_KNOWLEDGE = `
# Drive Time Tales - Basic Info

Drive Time Tales (DTT) is a premium audio storytelling platform for drivers and commuters.

## Plans
- Free: 2 credits on signup
- Test Driver ($2.99/mo): 10 credits/month
- Commuter ($7.99/mo): 30 credits/month
- Road Warrior ($14.99/mo): Unlimited listening

## Credits
- Stories cost 1-4 credits based on length
- Credits charged after 3 minutes of listening
- Once unlocked, listen unlimited times
- Credits refresh monthly, don't roll over

## Support
- Email: m.postlewaite@gmail.com
- Response time: 24-48 hours
`;

export async function POST(request: NextRequest) {
  try {
    const { subject, message, userName, userPlan } = await request.json();

    if (!message) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 });
    }

    // Load knowledge base from database
    let knowledgeBase = DEFAULT_KNOWLEDGE;
    try {
      const { data } = await supabaseAdmin
        .from('dtt_settings')
        .select('value')
        .eq('key', 'support_knowledge_base')
        .single();
      
      if (data?.value) {
        knowledgeBase = data.value;
      }
    } catch (err) {
      console.log('[AI] Using default knowledge base');
    }

    const prompt = `You are a friendly customer support agent for Drive Time Tales. Use the following knowledge base to answer questions accurately:

${knowledgeBase}

---

A user named ${userName} (currently on the ${userPlan} plan) has sent a support message:

Subject: ${subject}
Message: ${message}

---

Write a helpful, friendly, and professional response based on the knowledge base above. 

Guidelines:
- Be concise but thorough (under 150 words)
- If it's a technical issue, offer specific troubleshooting steps from the knowledge base
- If it's about billing/credits, explain clearly using the actual plan details
- If it's feedback or a feature request, thank them warmly and say you'll pass it to the team
- If you don't know something specific, say you'll look into it and get back to them
- Don't make up features or policies not in the knowledge base

Start directly with the response (no greeting needed as the system adds "Hi ${userName},").

Sign off with:
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

    // Prepend greeting
    const fullResponse = `Hi ${userName},\n\n${suggestion}`;

    return NextResponse.json({ suggestion: fullResponse });

  } catch (error) {
    console.error('[AI Suggest] Error:', error);
    return NextResponse.json(
      { error: 'Failed to generate AI response' },
      { status: 500 }
    );
  }
}
