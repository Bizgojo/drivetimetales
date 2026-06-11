import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

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

    // Build email content based on type
    let subject = ''
    let body = ''

    switch (type) {
      case 'referral_opened':
        subject = '👀 Someone opened your referral link!'
        body = `Hey ${referrerName}!

Great news - someone just opened your Drive Time Tales referral link!

They're checking out the app right now. If they sign up and subscribe, you'll both get free time!

Keep sharing your link to earn more rewards.

Happy listening,
The Drive Time Tales Team`
        break

      case 'referral_signed_up':
        subject = '🎉 Your friend just signed up!'
        body = `Hey ${referrerName}!

Amazing news - ${referredName || 'Your friend'} just signed up using your referral link!

They're one step away from subscribing. When they do, you'll both get your reward!

Keep the momentum going,
The Drive Time Tales Team`
        break

      case 'referral_subscribed':
        subject = '💳 Almost there! Your friend subscribed!'
        body = `Hey ${referrerName}!

${referredName || 'Your friend'} just subscribed to Drive Time Tales using your link!

Your rewards will be activated after their first payment clears. You're so close!

Thanks for spreading the word,
The Drive Time Tales Team`
        break

      case 'referral_rewarded':
        subject = '🎁 You earned a reward!'
        body = `Hey ${referrerName}!

Congratulations! 🎉

${referredName || 'Your friend'} completed their first payment, so you've both earned ${rewardText || 'your reward'}!

Your reward has been automatically applied to your account.

Keep sharing to earn more rewards - there's no limit!

Happy listening,
The Drive Time Tales Team`
        break

      default:
        return NextResponse.json({ error: 'Invalid notification type' }, { status: 400 })
    }

    // Send email using Resend if configured
    if (process.env.RESEND_API_KEY) {
      const emailResponse = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          from: 'Endless Tales <hello@endless-tales.com>',
          to: referrerEmail,
          subject: subject,
          text: body
        })
      })

      if (!emailResponse.ok) {
        console.error('Email send failed:', await emailResponse.text())
      }
    } else {
      // Log for development
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
