/**
 * POST /api/admin/post-to-x
 * Posts a tweet to X (Twitter) using OAuth 1.0a.
 * Requires env vars: X_API_KEY, X_API_SECRET, X_ACCESS_TOKEN, X_ACCESS_TOKEN_SECRET
 */
import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'

function oauthSign(method: string, url: string, params: Record<string, string>, secrets: { consumerSecret: string, tokenSecret: string }) {
  const sortedParams = Object.keys(params).sort().map(k =>
    `${encodeURIComponent(k)}=${encodeURIComponent(params[k])}`
  ).join('&')
  const base = `${method}&${encodeURIComponent(url)}&${encodeURIComponent(sortedParams)}`
  const signingKey = `${encodeURIComponent(secrets.consumerSecret)}&${encodeURIComponent(secrets.tokenSecret)}`
  return crypto.createHmac('sha1', signingKey).update(base).digest('base64')
}

export async function POST(req: NextRequest) {
  const { text } = await req.json()
  if (!text) return NextResponse.json({ error: 'text required' }, { status: 400 })
  if (text.length > 280) return NextResponse.json({ error: 'Tweet exceeds 280 characters' }, { status: 400 })

  const apiKey = process.env.X_API_KEY
  const apiSecret = process.env.X_API_SECRET
  const accessToken = process.env.X_ACCESS_TOKEN
  const accessTokenSecret = process.env.X_ACCESS_TOKEN_SECRET

  if (!apiKey || !apiSecret || !accessToken || !accessTokenSecret) {
    return NextResponse.json({
      error: 'X API credentials not configured. Add X_API_KEY, X_API_SECRET, X_ACCESS_TOKEN, X_ACCESS_TOKEN_SECRET to Vercel env vars.'
    }, { status: 503 })
  }

  const url = 'https://api.twitter.com/2/tweets'
  const oauthParams: Record<string, string> = {
    oauth_consumer_key: apiKey,
    oauth_nonce: crypto.randomBytes(16).toString('hex'),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: accessToken,
    oauth_version: '1.0',
  }
  oauthParams.oauth_signature = oauthSign('POST', url, oauthParams, { consumerSecret: apiSecret, tokenSecret: accessTokenSecret })

  const authHeader = 'OAuth ' + Object.keys(oauthParams).sort().map(k =>
    `${encodeURIComponent(k)}="${encodeURIComponent(oauthParams[k])}"`
  ).join(', ')

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  })

  const data = await res.json()
  if (!res.ok) {
    console.error('[post-to-x] Error:', data)
    return NextResponse.json({ error: data?.detail || data?.errors?.[0]?.message || 'X API error' }, { status: res.status })
  }

  return NextResponse.json({ success: true, id: data?.data?.id })
}
