import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: NextRequest) {
  try {
    const { id, email, name, subject, response } = await request.json();

    if (!id || !email || !response) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
    }

    // Update the message in database with response
    const { error: dbError } = await supabaseAdmin
      .from('support_messages')
      .update({ 
        status: 'answered',
        admin_response: response,
        responded_at: new Date().toISOString()
      })
      .eq('id', id);

    if (dbError) {
      console.error('[Support Reply] DB Error:', dbError);
      return NextResponse.json({ error: 'Failed to save response' }, { status: 500 });
    }

    // Send email notification to user
    // Using a simple mailto link opened server-side won't work
    // For now, we'll just save the response and you can manually email
    // In the future, integrate with SendGrid, Resend, or AWS SES
    
    // Log the reply for manual follow-up
    console.log('[Support Reply] Response saved for:', email);
    console.log('[Support Reply] Subject:', `Re: ${subject}`);
    console.log('[Support Reply] Response:', response);

    // TODO: Integrate email service (SendGrid, Resend, etc.)
    // For now, the admin can copy the response and send manually
    // or we can set up an email service integration

    return NextResponse.json({ 
      success: true,
      message: 'Response saved. Please send email manually to: ' + email
    });
  } catch (error) {
    console.error('[Support Reply] Error:', error);
    return NextResponse.json({ error: 'Failed to send reply' }, { status: 500 });
  }
}
