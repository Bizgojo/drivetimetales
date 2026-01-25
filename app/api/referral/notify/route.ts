import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Email templates
const templates = {
  referral_opened: {
    subject: '👀 Someone opened your referral link!',
    body: (referrerName: string, referredEmail: string) => `
      Hey ${referrerName}!

      Great news - someone just opened your Drive Time Tales referral link!

      They're checking out the app right now. If they sign up and subscribe, you'll both get free time!

      Keep sharing your link to earn more rewards.

      Happy listening,
      The Drive Time Tales Team
    `
  },
  referral_signed_up: {
    subject: '🎉 Your friend just signed up!',
    body: (referrerName: string, referredName: string) => `
      Hey ${referrerName}!

      Amazing news - ${referredName} just signed up using your referral link!

      They're one step away from subscribing. When they do, you'll both get your reward!

      Keep the momentum going,
      The Drive Time Tales Team
    `
  },
  referral_subscribed: {
    subject: '💳 Almost there! Your friend subscribed!',
    body: (referrerName: string, referredName: string) => `
      Hey ${referrerName}!

      ${referredName} just subscribed to Drive Time Tales using your link!

      Your rewards will be activated after their first payment clears. You're so close!

      Thanks for spreading the word,
      The Drive Time Tales Team
    `
  },
  referral_rewarded: {
    subject: '🎁 You earned a reward!',
    body: (referrerName: string, referredName: string, rewardText: string) => `
      Hey ${referrerName}!

      Congratulations! 🎉

      ${referredName} completed their first payment, so you've both earned ${rewardText}!

      Your reward has been automatically applied to your account.

      Keep sharing to earn more rewards - there's no limit!

      Happy listening,
      The Drive Time Tales Team
    `
  }
}

export async function POST(req: NextRequest) {
  try {
    const { referralId, type, referrerEmail, referrerName, referredEmail, referredName, rewardText } = await req.json()

    if (!referralId || !type || !referrerEmail) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Check if we already sent this notification
    const { data: existing } = await supabase
      .from('referral_notifications')
      .select('id')
      .eq('referral_id', referralId)
      .eq('type', type)
      .single()

    if (existing) {
      return NextResponse.json({ message: 'Notification already sent' })
    }

    // Get template
    const template = templates[type as keyof typeof templates]
    if (!template) {
      return NextResponse.json({ error: 'Invalid notification type' }, { status: 400 })
    }

    // Build email content
    const subject = template.subject
    let body = ''
    
    if (type === 'referral_opened') {
      body = template.body(referrerName, referredEmail || 'Someone')
    } else if (type === 'referral_rewarded') {
      body = (template.body as (a: string, b: string, c: string) => string)(referrerName, referredName || 'Your friend', rewardText || 'your reward')
    } else {
      body = template.body(referrerName, referredName || 'Your friend')
    }

    // Send email using your email service
    // For now, we'll use a simple fetch to a hypothetical email endpoint
    // You can replace this with SendGrid, Resend, AWS SES, etc.
    
    // Option 1: Using Resend (recommended)
    if (process.env.RESEND_API_KEY) {
      const emailResponse = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          from: 'Drive Time Tales <noreply@drivetimetales.com>',
          to: referrerEmail,
          subject: subject,
          text: body.trim()
        })
      })

      if (!emailResponse.ok) {
        console.error('Email send failed:', await emailResponse.text())
        // Don't fail the whole request if email fails
      }
    }
    
    // Option 2: Log for now if no email service configured
    else {
      console.log('=== EMAIL NOTIFICATION ===')
      console.log('To:', referrerEmail)
      console.log('Subject:', subject)
      console.log('Body:', body)
      console.log('========================')
    }

    // Log the notification
    await supabase.from('referral_notifications').insert({
      referral_id: referralId,
      type: type,
      sent_to: referrerEmail
    })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Notification error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
