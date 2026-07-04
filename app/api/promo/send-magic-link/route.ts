/**
 * POST /api/promo/send-magic-link
 * Creates user account, applies promo, stores first_name,
 * generates one-click magic link, sends branded email.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'

export const runtime = 'nodejs'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
const resend = new Resend(process.env.RESEND_API_KEY)
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://app.endless-tales.com'

export async function POST(req: NextRequest) {
  try {
    const { email, firstName, lastName, phone, promoCode, subscription_days, channel, personalNote } = await req.json()
    const sendChannel: 'email' | 'sms' = channel === 'sms' ? 'sms' : 'email'
    const trimmedNote = String(personalNote || '').trim()
    if (!email || !firstName) {
      return NextResponse.json({ error: 'email and firstName are required' }, { status: 400 })
    }

    const trimmedEmail = email.trim().toLowerCase()
    const trimmedName = firstName.trim()
    const trimmedLastName = String(lastName || '').trim()
    const trimmedPhone = String(phone || '').trim()
    const requestedDays = Number(subscription_days || 30)
    const safeDays = [14, 30, 90, 180, 365].includes(requestedDays) ? requestedDays : 30
    let upperCode = promoCode ? String(promoCode).trim().toUpperCase() : ''

    if (!upperCode) {
      const generatedCode = 'MAGIC-' + safeDays + '-' + crypto.randomUUID().slice(0, 8).toUpperCase()
      const { data: createdPromo, error: createPromoError } = await supabase
        .from('promo_codes')
        .insert({
          code: generatedCode,
          description: 'Magic link invite for ' + trimmedEmail,
          campaign: 'magic-link',
          label: [trimmedName, trimmedLastName].filter(Boolean).join(' ') || trimmedEmail,
          subscription_days: safeDays,
          max_uses: 1,
          uses_count: 0,
          is_active: true,
          is_redeemed: false,
          subscription_type: 'active',
          notes: trimmedPhone || null,
        })
        .select('*')
        .single()

      if (createPromoError || !createdPromo) {
        return NextResponse.json({ error: 'Failed to create invite access code: ' + createPromoError?.message }, { status: 500 })
      }
      upperCode = createdPromo.code
    }

    // 1. Validate promo code
    const { data: promo, error: promoError } = await supabase
      .from('promo_codes').select('*').eq('code', upperCode).single()
    if (promoError || !promo) return NextResponse.json({ error: 'Invalid promo code' }, { status: 404 })
    if (!promo.is_active) return NextResponse.json({ error: 'Code no longer active' }, { status: 400 })
    if (promo.max_uses !== null && promo.uses_count >= promo.max_uses)
      return NextResponse.json({ error: 'Code usage limit reached' }, { status: 400 })

    // 2. Create or find user
    let userId: string
    const { data: { users: allUsers } } = await supabase.auth.admin.listUsers({ perPage: 1000 })
    const existingUser = (allUsers as Array<{ id: string; email?: string }> | undefined)?.find(u => u.email === trimmedEmail)

    if (existingUser) {
      userId = existingUser.id
    } else {
      const randomPw = crypto.randomUUID() + crypto.randomUUID()
      const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
        email: trimmedEmail,
        password: randomPw,
        email_confirm: true,
        user_metadata: { first_name: trimmedName, last_name: trimmedLastName },
      })
      if (createError || !newUser.user)
        return NextResponse.json({ error: 'Failed to create user: ' + createError?.message }, { status: 500 })
      userId = newUser.user.id
    }

    // 3. Store name + apply subscription
    const now = new Date()
    const { data: userData } = await supabase
      .from('users').select('subscription_ends_at, plan').eq('id', userId).single()

    const base = userData?.subscription_ends_at && new Date(userData.subscription_ends_at) > now
      ? new Date(userData.subscription_ends_at) : now
    const newEndsAt = new Date(base.getTime() + promo.subscription_days * 24 * 60 * 60 * 1000)

    // Always UPDATE existing users (reliable) — upsert can silently fail on unknown columns
    const coreUpdate: Record<string, any> = {
      first_name: trimmedName,
      subscription_type: 'active',
      subscription_ends_at: newEndsAt.toISOString(),
      plan: userData?.plan && userData.plan !== 'free' ? userData.plan : 'standard',
    }
    if (trimmedLastName) coreUpdate.last_name = trimmedLastName

    const { error: updateError } = await supabase.from('users').update(coreUpdate).eq('id', userId)
    if (updateError) {
      // Fallback: retry without optional fields
      await supabase.from('users').update({
        first_name: trimmedName,
        subscription_type: 'active',
        subscription_ends_at: newEndsAt.toISOString(),
        plan: coreUpdate.plan,
      }).eq('id', userId)
    }

    // 4. Log redemption + update code
    await supabase.from('promo_redemptions').insert({
      promo_code_id: promo.id, code: upperCode, user_id: userId, email: trimmedEmail,
      redeemed_at: now.toISOString(), days_granted: promo.subscription_days,
      campaign: promo.campaign, label: promo.label,
    })
    const newCount = (promo.uses_count || 0) + 1
    await supabase.from('promo_codes').update({
      uses_count: newCount,
      is_redeemed: promo.max_uses === 1,
      sent_to_email: trimmedEmail, sent_to_name: trimmedName, sent_at: now.toISOString(),
    }).eq('id', promo.id)

    // 5. Generate one-click magic link
    const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
      type: 'magiclink',
      email: trimmedEmail,
      options: { redirectTo: APP_URL + '/auth/confirm?next=/home' },
    })
    if (linkError || !linkData?.properties?.hashed_token)
      return NextResponse.json({ error: 'Failed to generate link: ' + linkError?.message }, { status: 500 })

    const magicUrl = APP_URL + '/auth/confirm?token_hash=' + linkData.properties.hashed_token + '&type=magiclink&next=/home'

    // 6. Send via selected channel
    if (sendChannel === 'sms') {
      // SMS: return the magic link so the frontend can open an sms: deep link
      console.log('[promo/send-magic-link] SMS channel — returning link for ' + trimmedEmail + ' (' + trimmedName + '), code ' + upperCode)
      const smsText = `Hi ${trimmedName}! Marc here — I wanted to personally invite you to try Endless Tales free for ${promo.subscription_days} days.${trimmedNote ? '\n\n' + trimmedNote : ''}\n\nTap to start listening: ${magicUrl}`
      return NextResponse.json({ success: true, email: trimmedEmail, firstName: trimmedName, daysGranted: promo.subscription_days, subscriptionEndsAt: newEndsAt.toISOString(), magicUrl, smsText, channel: 'sms' })
    }

    // Email (default)
    await resend.emails.send({
      from: 'Marc at Endless Tales <hello@endless-tales.com>',
      to: trimmedEmail,
      subject: trimmedName + ', you are invited to Endless Tales',
      html: '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="margin:0;padding:0;background:#0f0f1a;font-family:-apple-system,sans-serif;"><div style="max-width:560px;margin:0 auto;padding:40px 24px;"><div style="text-align:center;margin-bottom:32px;"><img src="https://app.endless-tales.com/images/et-logo.png" alt="Endless Tales" style="height:48px;" /><div style="font-size:22px;font-weight:900;color:#fff;margin-top:8px;">Endless <span style="color:#f97316;">Tales</span></div></div><div style="background:#1a1a2e;border-radius:16px;padding:32px 28px;border:1px solid rgba(249,115,22,0.2);"><div style="color:rgba(255,255,255,0.85);font-size:16px;line-height:1.8;">Hi ' + trimmedName + ',<br><br>I wanted to personally invite you to try Endless Tales \u2014 original audio dramas made for people on the move. Mystery, thriller, sci-fi, horror, romance, and more. Perfect for your commute or road trip.' + (trimmedNote ? '<br><br><span style="color:#fff;font-style:italic;">' + trimmedNote + '</span>' : '') + '<br><br>I\'m giving you <strong style="color:#f97316;">' + promo.subscription_days + ' days completely free</strong>. No credit card needed. Just click below and you\'re in.</div><div style="text-align:center;margin-top:28px;"><a href="' + magicUrl + '" style="display:inline-block;background:#f97316;color:white;text-decoration:none;padding:16px 40px;border-radius:12px;font-size:17px;font-weight:800;">Start Listening Free</a></div><div style="color:rgba(255,255,255,0.4);font-size:12px;text-align:center;margin-top:16px;">One click. No password. No credit card.</div></div><p style="color:rgba(255,255,255,0.3);font-size:12px;margin-top:28px;text-align:center;">Questions? Reply to this email.<br>\u2014 Marc</p></div></body></html>',
    })

    console.log('[promo/send-magic-link] Email sent to ' + trimmedEmail + ' (' + trimmedName + '), code ' + upperCode)
    return NextResponse.json({ success: true, email: trimmedEmail, firstName: trimmedName, daysGranted: promo.subscription_days, subscriptionEndsAt: newEndsAt.toISOString(), channel: 'email' })
  } catch (err) {
    console.error('[promo/send-magic-link] Error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
