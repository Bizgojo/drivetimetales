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
export function installStepsBlock(): string {
  return `
    <div style="background:rgba(59,130,246,0.08);border:1px solid rgba(59,130,246,0.3);border-radius:10px;padding:16px 20px;margin-bottom:20px;">
      <div style="color:#60a5fa;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:10px;">📲 Save the app to your home screen</div>
      <div style="color:rgba(255,255,255,0.85);font-size:14px;line-height:1.8;">
        <div style="margin-bottom:10px;">
          <strong style="color:#ffffff;">iPhone / iPad</strong> (must use Safari):<br>
          1. Open <a href="${APP_HOME_URL}" style="color:#f97316;text-decoration:underline;">app.endless-tales.com</a> in Safari<br>
          2. Tap the <strong>Share</strong> button (square with an arrow)<br>
          3. Scroll down and tap <strong>&ldquo;Add to Home Screen&rdquo;</strong>, then tap <strong>Add</strong>
        </div>
        <div>
          <strong style="color:#ffffff;">Android</strong> (Chrome):<br>
          1. Open <a href="${APP_HOME_URL}" style="color:#f97316;text-decoration:underline;">app.endless-tales.com</a> in Chrome<br>
          2. Tap the <strong>⋮ menu</strong> (top right)<br>
          3. Tap <strong>&ldquo;Add to Home Screen&rdquo;</strong> (or <strong>Install app</strong>), then confirm
        </div>
      </div>
    </div>`
}

function appLinkButton(label: string): string {
  return `
    <div style="text-align:center;margin-bottom:24px;">
      <a href="${APP_HOME_URL}" style="display:inline-block;background:#f97316;color:white;text-decoration:none;padding:16px 40px;border-radius:10px;font-size:16px;font-weight:800;letter-spacing:0.01em;">${label}</a>
      <div style="color:rgba(255,255,255,0.45);font-size:12px;margin-top:8px;">app.endless-tales.com</div>
    </div>`
}

function shell(inner: string): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0f0f1a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:560px;margin:0 auto;padding:40px 24px;">
    ${LOGO_BLOCK}
    <div style="background:#1a1a2e;border-radius:16px;padding:32px 28px;border:1px solid rgba(249,115,22,0.2);">
      ${inner}
    </div>
    <div style="text-align:center;margin-top:28px;">
      <p style="color:rgba(255,255,255,0.3);font-size:12px;margin:0;line-height:1.6;">
        You're receiving this because you created an account at endless-tales.com.
      </p>
    </div>
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
        After your trial, it's just $7.99/month. Questions? Reply to this email.
      </p>
    `),
  }
}

/** Day-1 email — dedicated home-screen install nudge, 24-48h post-signup. */
export function renderDay1InstallEmail(name: string): { subject: string; html: string } {
  const safeName = name || 'there'
  return {
    subject: 'One tap and your stories are always with you 📲',
    html: shell(`
      <div style="font-size:32px;text-align:center;margin-bottom:16px;">📲</div>
      <h1 style="color:#ffffff;font-size:22px;font-weight:800;text-align:center;margin:0 0 12px;">Put Endless Tales on your home screen</h1>
      <p style="color:rgba(255,255,255,0.75);font-size:15px;line-height:1.7;margin:0 0 20px;text-align:center;">
        Hey ${safeName} — the easiest way to get back to your stories is a one-tap icon on your phone. It takes about 10 seconds and works like a regular app. No app store needed.
      </p>
      ${appLinkButton('Open Endless Tales →')}
      ${installStepsBlock()}
      <p style="color:rgba(255,255,255,0.5);font-size:13px;line-height:1.6;margin:0;text-align:center;">
        Once it's on your home screen, your next story is always one tap away.<br>
        Questions? Reply to this email.
      </p>
    `),
  }
}
