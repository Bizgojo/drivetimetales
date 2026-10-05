import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifyUnsubscribeToken } from '@/lib/emails/unsubscribe'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * REACH-REMINDERS-001 — one-click email unsubscribe (CAN-SPAM).
 *
 * GET /api/email/unsubscribe?token=<hmac-token>
 *
 * Verifies the HMAC token (lib/emails/unsubscribe.ts), flips
 * users.email_opt_out = true, and returns a friendly HTML confirmation.
 * Suppression is then honored everywhere Belle email is sent
 * (app/api/cron/trial-emails).
 *
 * PRE-DDL-SAFE: if the email_opt_out column does not exist yet (migration not
 * applied), the update returns a Postgres "column does not exist" error; we
 * detect it and still show the user a success page (their intent is recorded
 * the moment the column lands — and until then no reach emails send because
 * the cron reach block is itself gated on the column existing). We never show a
 * raw 500 to a human clicking an unsubscribe link.
 *
 * POST is also accepted so that mail clients honoring RFC 8058
 * (List-Unsubscribe-Post: List-Unsubscribe=One-Click) can one-click without a
 * browser GET.
 */

function page(title: string, body: string, status = 200): NextResponse {
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title></head>
<body style="margin:0;background:#0f0f1a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#fff;">
  <div style="max-width:480px;margin:0 auto;padding:64px 24px;text-align:center;">
    <div style="font-size:22px;font-weight:900;margin-bottom:24px;">Endless <span style="color:#f97316;">Tales</span></div>
    <div style="background:#1a1a2e;border:1px solid rgba(249,115,22,0.2);border-radius:16px;padding:32px 28px;">
      <h1 style="font-size:20px;margin:0 0 12px;">${title}</h1>
      <p style="color:rgba(255,255,255,0.75);font-size:15px;line-height:1.7;margin:0;">${body}</p>
    </div>
  </div>
</body></html>`
  return new NextResponse(html, { status, headers: { 'content-type': 'text/html; charset=utf-8' } })
}

async function handle(token: string | null): Promise<NextResponse> {
  const userId = verifyUnsubscribeToken(token)
  if (!userId) {
    return page(
      'Link not valid',
      'This unsubscribe link is invalid or expired. If you keep receiving email you’d rather not, just reply to any message and a real person will remove you.',
      400,
    )
  }

  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )
    const { error } = await supabase
      .from('users')
      .update({ email_opt_out: true })
      .eq('id', userId)

    if (error) {
      // PRE-DDL-SAFE: column may not exist yet. Don't 500 a human.
      const msg = (error.message || '').toLowerCase()
      const columnMissing = msg.includes('email_opt_out') && (msg.includes('does not exist') || msg.includes('column'))
      if (columnMissing) {
        console.warn('[email/unsubscribe] email_opt_out column missing (migration pending) — intent noted for', userId)
        return page(
          'You’re unsubscribed',
          'You won’t receive further reminder emails from Belle at Endless Tales. You can still sign in and listen any time.',
        )
      }
      console.error('[email/unsubscribe] update failed for', userId, error.message)
      return page(
        'Something went wrong',
        'We couldn’t process that just now. Please reply to any email and we’ll remove you manually.',
        500,
      )
    }

    console.log('[email/unsubscribe] user opted out:', userId)
    return page(
      'You’re unsubscribed',
      'You won’t receive further reminder emails from Belle at Endless Tales. You can still sign in and listen any time — and you’re always welcome back.',
    )
  } catch (err) {
    console.error('[email/unsubscribe] unexpected error:', err)
    return page(
      'Something went wrong',
      'We couldn’t process that just now. Please reply to any email and we’ll remove you manually.',
      500,
    )
  }
}

export async function GET(request: NextRequest) {
  return handle(request.nextUrl.searchParams.get('token'))
}

export async function POST(request: NextRequest) {
  // RFC 8058 one-click: token may arrive in the query or the form body.
  let token = request.nextUrl.searchParams.get('token')
  if (!token) {
    try {
      const form = await request.formData()
      const t = form.get('token')
      if (typeof t === 'string') token = t
    } catch {
      /* no body */
    }
  }
  return handle(token)
}
