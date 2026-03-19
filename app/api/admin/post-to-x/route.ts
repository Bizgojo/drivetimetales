/**
 * POST /api/admin/post-to-x
 * Posts a tweet using OAuth 1.0a (User Context).
 * Requires: X_API_KEY, X_API_SECRET, X_ACCESS_TOKEN, X_ACCESS_TOKEN_SECRET
 */
import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'

function percentEncode(str: string) {
  return encodeURIComponent(str).replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase())
}

function buildOAuthHeader(method: string, url: string, oauthParams: Record<string, string>, secrets: { consumerSecret: string, tokenSecret: string }) {
  // Build base string from oauth params only (body is JSON, not form-encoded)
  const paramString = Object.keys(oauthParams).sort()
    .map(k => `${percentEncode(k)}=${percentEncode(oauthParams[k])}`)
    .join('&')

  const baseString = `${method}&${percentEncode(url)}&${percentEncode(paramString)}`
  const signingKey = `${percentEncode(secrets.consumerSecret)}&${percentEncode(secrets.tokenSecret)}`
  const signature = crypto.createHmac('sha1', signingKey).update(baseString).digest('base64')

  const allParams = { ...oauthParams, oauth_signature: signature }
  return 'OAuth ' + Object.keys(allParams).sort()
    .map(k => `${percentEncode(k)}="${percentEncode(allParams[k])}"`)
    .join(', ')
}

export async function POST(req: NextRequest) {
  const { text } = await req.json()
  if (!text) return NextResponse.json({ error: 'text required' }, { status: 400 })

  const apiKey = process.env.X_API_KEY
  const apiSecret = process.env.X_API_SECRET
  const accessToken = process.env.X_ACCESS_TOKEN
  const accessTokenSecret = process.env.X_ACCESS_TOKEN_SECRET

  if (!apiKey || !apiSecret || !accessToken || !accessTokenSecret) {
    return NextResponse.json({ error: 'X API credentials not configured.' }, { status: 503 })
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

  const authHeader = buildOAuthHeader('POST', url, oauthParams, {
    consumerSecret: apiSecret,
    tokenSecret: accessTokenSecret,
  })

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': authHeader,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ text }),
  })

  const data = await res.json()

  if (!res.ok) {
    console.error('[post-to-x] Error:', JSON.stringify(data))
    const errMsg = data?.detail || data?.errors?.[0]?.message || data?.title || JSON.stringify(data)
    return NextResponse.json({ error: errMsg }, { status: res.status })
  }

  return NextResponse.json({ success: true, id: data?.data?.id })
}
