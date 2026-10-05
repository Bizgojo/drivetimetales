import { MONTHLY_PRICE_LABEL, ANNUAL_PRICE_LABEL } from '@/lib/pricing'

export const APP_BILLING_URL = 'https://app.endless-tales.com/account/billing'
/**
 * lib/emails/retentionTemplates.ts — RETENTION-PATH-001
 *
 * Shared HTML templates for the trial-retention email path:
 *  - Welcome email (sent immediately at signup by /api/user/create)
 *  - Day-1 install email (sent 24-48h after signup by /api/cron/trial-emails)
 *
 * Both emails carry a prominent app-link button and explicit
 * iPhone / Android home-screen install steps, because a trial user who
 * never installs the home-screen icon may never find the app again.
 */

export const APP_HOME_URL = 'https://app.endless-tales.com/home'

const LOGO_BLOCK = `
  <div style="text-align:center;margin-bottom:32px;">
    <img src="https://app.endless-tales.com/images/et-logo.png" alt="Endless Tales" style="height:48px;object-fit:contain;display:inline-block;" />
    <div style="font-size:22px;font-weight:900;color:#ffffff;letter-spacing:-0.5px;margin-top:8px;">Endless <span style="color:#f97316;">Tales</span></div>
  </div>`

/**
 * iPhone + Android home-screen install instructions.
 * Kept as one shared block so welcome and day-1 emails never drift apart.
 */
// ORION-EMAIL-AUDIT-001 (Marc, 2026-07-12): the old copy walked through
// Safari share-sheet steps ("must use Safari") — stale since the in-app
// install sheet shipped (ATL-INSTALL-SHEET-001). The app now detects the
// browser and walks the user through install itself, including the
// non-Safari-on-iOS copy-link flow. The email just needs to get them there.
export function installStepsBlock(): string {
  return `
    <div style="background:rgba(59,130,246,0.08);border:1px solid rgba(59,130,246,0.3);border-radius:10px;padding:16px 20px;margin-bottom:20px;">
      <div style="color:#60a5fa;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:10px;">📲 Save the app to your home screen</div>
      <div style="color:rgba(255,255,255,0.85);font-size:14px;line-height:1.8;">
        Open <a href="${APP_HOME_URL}" target="_blank" style="color:#f97316;text-decoration:underline;">app.endless-tales.com</a> on your phone and tap <strong>Install</strong> when the banner appears — it walks you through the rest. About 10 seconds, no app store, works on iPhone and Android.
      </div>
    </div>`
}

// ORION-EMAIL-AUDIT-001: the line under the button is now a REAL link (it
// was plain text) so there is always a tappable fallback if a mail client
// mangles the button anchor; target=_blank added for client compatibility.
function appLinkButton(label: string, url: string = APP_HOME_URL): string {
  return `
    <div style="text-align:center;margin-bottom:24px;">
      <a href="${url}" target="_blank" style="display:inline-block;background:#f97316;color:white;text-decoration:none;padding:16px 40px;border-radius:10px;font-size:16px;font-weight:800;letter-spacing:0.01em;">${label}</a>
      <div style="font-size:12px;margin-top:8px;"><a href="${url}" target="_blank" style="color:rgba(255,255,255,0.45);text-decoration:underline;">${url.replace('https://','')}</a></div>
    </div>`
}

/** Generalized CTA button — orange pill, any label, any URL. */
export function ctaButton(label: string, url: string): string {
  return `
    <div style="text-align:center;margin-bottom:24px;">
      <a href="${url}" target="_blank" style="display:inline-block;background:#f97316;color:white;text-decoration:none;padding:16px 40px;border-radius:10px;font-size:16px;font-weight:800;letter-spacing:0.01em;">${label}</a>
    </div>`
}

/**
 * REACH-REMINDERS-001 (CAN-SPAM): standard footer unsubscribe line.
 * When an unsubscribeUrl is supplied, the footer renders a real one-click
 * unsubscribe link (lib/emails/unsubscribe.ts). When it is omitted (e.g. the
 * transactional welcome email, or a caller without a user id), the footer keeps
 * the original account-notice copy so existing sends are unchanged.
 */
function footer(unsubscribeUrl?: string): string {
  const unsub = unsubscribeUrl
    ? `<br><a href="${unsubscribeUrl}" target="_blank" style="color:rgba(255,255,255,0.4);text-decoration:underline;">Unsubscribe from these emails</a>`
    : ''
  return `
    <div style="text-align:center;margin-top:28px;">
      <p style="color:rgba(255,255,255,0.3);font-size:12px;margin:0;line-height:1.6;">
        You're receiving this because you created an account at endless-tales.com.${unsub}
      </p>
    </div>`
}

export function shell(inner: string, unsubscribeUrl?: string): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0f0f1a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:560px;margin:0 auto;padding:40px 24px;">
    ${LOGO_BLOCK}
    <div style="background:#1a1a2e;border-radius:16px;padding:32px 28px;border:1px solid rgba(249,115,22,0.2);">
      ${inner}
    </div>
    ${footer(unsubscribeUrl)}
  </div>
</body>
</html>`
}

/** Welcome email — fires immediately at signup (see app/api/user/create/route.ts). */
export function renderWelcomeEmail(displayName: string): { subject: string; html: string } {
  const greetName = displayName && displayName !== 'Friend' ? `, ${displayName}` : ''
  return {
    subject: 'Welcome to Endless Tales 🎧',
    html: shell(`
      <div style="font-size:32px;text-align:center;margin-bottom:16px;">🎧</div>
      <h1 style="color:#ffffff;font-size:22px;font-weight:800;text-align:center;margin:0 0 12px;">Welcome${greetName}!</h1>
      <p style="color:rgba(255,255,255,0.75);font-size:15px;line-height:1.7;margin:0 0 20px;text-align:center;">
        Your free trial has started. Dive in and discover original audio dramas made for people on the move.
      </p>
      ${appLinkButton('Start Listening →')}
      ${installStepsBlock()}
      <div style="background:rgba(249,115,22,0.1);border:1px solid rgba(249,115,22,0.3);border-radius:10px;padding:16px 20px;margin-bottom:20px;">
        <div style="color:#f97316;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:8px;">Your trial includes</div>
        <div style="color:rgba(255,255,255,0.85);font-size:14px;line-height:1.8;">
          ✓ Full access to all audio stories<br>
          ✓ New stories added weekly<br>
          ✓ Listen anywhere — commute, gym, road trip<br>
          ✓ Cancel anytime before your trial ends — no charge
        </div>
      </div>
      <p style="color:rgba(255,255,255,0.5);font-size:13px;line-height:1.6;margin:0;text-align:center;">
        After your trial, it's just ${MONTHLY_PRICE_LABEL}. Questions? Reply to this email.
      </p>
    `),
  }
}

/**
 * CARD-ON-FILE-001 (2026-10-05, Marc GO) — warm trial-ending reminder.
 *
 * Sent ONCE from the Stripe webhook `customer.subscription.trial_will_end`
 * (~3 days before trial end) for CARD-ON-FILE trials only. Unlike the legacy
 * no-card trial emails (app/api/cron/trial-emails), these users DO have a card
 * on file and WILL be charged at trial end — so the copy is honest about the
 * upcoming charge and gives a clear, friendly cancel path. Warm/lenient tone:
 * no pressure, easy to cancel, "we hope you stay".
 *
 * No double-emailing: the cron no-card emails only reach subscriptions that do
 * NOT exist in Stripe (no-card trials), while this fires only on real Stripe
 * subscriptions — the two populations do not overlap.
 *
 * @param name       First/display name (falls back to 'there').
 * @param priceLabel e.g. '$9.99/month' or '$79.99/year' (lib/pricing labels).
 * @param daysLeft   Days until the card is charged (Stripe fires ~3 days out).
 */
export function renderTrialEndingReminderEmail(
  name: string,
  priceLabel: string = MONTHLY_PRICE_LABEL,
  daysLeft: number = 3,
): { subject: string; html: string } {
  const safeName = name || 'there'
  const dayWord = daysLeft === 1 ? 'day' : 'days'
  return {
    subject: `Your free trial ends in ${daysLeft} ${dayWord}`,
    html: shell(`
      <h1 style="color:#ffffff;font-size:22px;font-weight:800;text-align:center;margin:0 0 12px;">A quick heads-up, ${safeName}</h1>
      <p style="color:rgba(255,255,255,0.8);font-size:15px;line-height:1.7;margin:0 0 16px;">
        We hope you've been enjoying Endless Tales. Your free trial ends in
        <strong style="color:#ffffff;">${daysLeft} ${dayWord}</strong>, and after that your
        subscription starts at <strong style="color:#f97316;">${priceLabel}</strong> — nothing
        changes, your whole library just stays open.
      </p>
      <p style="color:rgba(255,255,255,0.8);font-size:15px;line-height:1.7;margin:0 0 20px;">
        No action needed if you'd like to keep listening. If now isn't the right
        time, you can cancel in a couple of taps before the trial ends and you
        won't be charged — no hard feelings, and you're always welcome back.
      </p>
      ${ctaButton('Keep listening', APP_HOME_URL)}
      <p style="color:rgba(255,255,255,0.5);font-size:13px;line-height:1.6;margin:0;text-align:center;">
        Need to cancel or manage your plan? <a href="${APP_BILLING_URL}" target="_blank" style="color:#f97316;text-decoration:underline;">Manage your subscription</a>.<br>
        Questions? Just reply to this email — a real person reads these.
      </p>
    `),
  }
}

/**
 * REACH-REMINDERS-001 (Marc GO, 2026-10-05) — EP2-reach reminder email.
 *
 * Nudges a signed-up Bell user back to the EP2 player. Sent from the extended
 * trial-emails cron on day-offsets +1/+3/+6 from trial_started_at (max 3),
 * segment recomputed at each send:
 *
 *   segment='never'   → never opened EP2  → "ride the hook, press play"
 *   segment='partway' → started, unfinished → "you're partway, finish it"
 *
 * Every CTA deep-links to BELL_EP2_PLAYER_URL (passed in as ctaUrl). The footer
 * carries a one-click unsubscribe link (CAN-SPAM) when unsubscribeUrl is given.
 * Belle voice, matched to the existing day-2/5/6 trial copy.
 */
export function renderReachEp2Email(
  name: string,
  segment: 'never' | 'partway',
  ctaUrl: string,
  unsubscribeUrl?: string,
): { subject: string; html: string } {
  const safeName = name || 'there'
  const P = 'color:rgba(255,255,255,0.8);font-size:15px;line-height:1.7;margin:0 0 16px;'
  const P_SIG = 'color:rgba(255,255,255,0.6);font-size:15px;font-style:italic;margin:20px 0 0;'
  if (segment === 'partway') {
    return {
      subject: `You're partway through Episode 2, ${safeName}`,
      html: shell(`
        <p style="${P}">Hi ${safeName}, it's Belle.</p>
        <p style="${P}">You started <strong style="color:#ffffff;">Episode 2</strong> — and then life happened. It's still cued up, right where you left off.</p>
        <p style="${P}">It's a short one to finish, and the ending is the part that stays with people. No card, nothing to cancel — just press play.</p>
        ${ctaButton('Finish Episode 2 →', ctaUrl)}
        <p style="${P_SIG}">— Belle</p>
      `, unsubscribeUrl),
    }
  }
  // segment === 'never'
  return {
    subject: `Your story is waiting, ${safeName}`,
    html: shell(`
      <p style="${P}">Hi ${safeName}, it's Belle.</p>
      <p style="${P}">You signed up, but you haven't pressed play on <strong style="color:#ffffff;">Episode 2</strong> yet — and that's the one that hooks everyone.</p>
      <p style="${P}">It's cued up and ready. Give it the first few minutes on your next drive or walk; if it doesn't grab you, nothing's lost. No card, nothing to cancel.</p>
      ${ctaButton('Start Episode 2 →', ctaUrl)}
      <p style="${P_SIG}">— Belle</p>
    `, unsubscribeUrl),
  }
}

/** Day-1 email — dedicated home-screen install nudge, 24-48h post-signup. */
export function renderDay1InstallEmail(name: string, ctaUrl?: string): { subject: string; html: string } {
  const safeName = name || 'there'
  const ctaTarget = ctaUrl || APP_HOME_URL
  return {
    subject: 'One tap and your stories are always with you 📲',
    html: shell(`
      <div style="font-size:32px;text-align:center;margin-bottom:16px;">📲</div>
      <h1 style="color:#ffffff;font-size:22px;font-weight:800;text-align:center;margin:0 0 12px;">Put Endless Tales on your home screen</h1>
      <p style="color:rgba(255,255,255,0.75);font-size:15px;line-height:1.7;margin:0 0 20px;text-align:center;">
        Hey ${safeName} — the easiest way to get back to your stories is a one-tap icon on your phone. It takes about 10 seconds and works like a regular app. No app store needed.
      </p>
      ${appLinkButton('Open Endless Tales →', ctaTarget)}
      ${installStepsBlock()}
      <p style="color:rgba(255,255,255,0.5);font-size:13px;line-height:1.6;margin:0;text-align:center;">
        Once it's on your home screen, your next story is always one tap away.<br>
        Questions? Reply to this email.
      </p>
    `),
  }
}
