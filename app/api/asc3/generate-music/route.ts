import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import WebSocket from 'ws'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const BROWSER_CDP = 'http://127.0.0.1:18800'

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)) }

interface CDPSession {
  ws: WebSocket
  msgId: number
  pending: Record<number, (result: any) => void>
  close: () => void
}

async function connectCDP(wsUrl: string): Promise<CDPSession> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl, { perMessageDeflate: false })
    const session: CDPSession = {
      ws,
      msgId: 0,
      pending: {},
      close: () => ws.close()
    }
    ws.on('open', () => resolve(session))
    ws.on('error', reject)
    ws.on('message', (data: Buffer) => {
      try {
        const msg = JSON.parse(data.toString())
        if (msg.id && session.pending[msg.id]) {
          session.pending[msg.id](msg.result)
          delete session.pending[msg.id]
        }
      } catch (e) {}
    })
  })
}

function cdpSend(session: CDPSession, method: string, params: any = {}): Promise<any> {
  return new Promise((resolve) => {
    const id = ++session.msgId
    session.pending[id] = resolve
    session.ws.send(JSON.stringify({ id, method, params }))
  })
}

async function getSunoSession(): Promise<CDPSession> {
  // Get list of open tabs
  const res = await fetch(`${BROWSER_CDP}/json/list`)
  const tabs = await res.json() as any[]

  let sunoTab = tabs.find((t: any) => t.url?.includes('suno.com') && t.webSocketDebuggerUrl)

  if (!sunoTab) {
    // Open a new tab and navigate to suno.com/create
    const newTab = tabs.find((t: any) => t.type === 'page' && t.webSocketDebuggerUrl)
    if (!newTab) {
      // Create a new target
      const createRes = await fetch(`${BROWSER_CDP}/json/new?https://suno.com/create`)
      sunoTab = await createRes.json()
      await sleep(5000)
      const tabs2 = await (await fetch(`${BROWSER_CDP}/json/list`)).json() as any[]
      sunoTab = tabs2.find((t: any) => t.url?.includes('suno.com') && t.webSocketDebuggerUrl)
    } else {
      const tmp = await connectCDP(newTab.webSocketDebuggerUrl)
      await cdpSend(tmp, 'Page.navigate', { url: 'https://suno.com/create' })
      tmp.close()
      await sleep(5000)
      const tabs2 = await (await fetch(`${BROWSER_CDP}/json/list`)).json() as any[]
      sunoTab = tabs2.find((t: any) => t.url?.includes('suno.com') && t.webSocketDebuggerUrl)
    }
  }

  if (!sunoTab) throw new Error('Could not open Suno tab in OpenClaw browser')
  return connectCDP(sunoTab.webSocketDebuggerUrl)
}

export async function POST(req: NextRequest) {
  try {
    const { storyId, sunoPrompt, title } = await req.json()
    if (!storyId) return NextResponse.json({ error: 'storyId required' }, { status: 400 })

    const prompt = (sunoPrompt || 'cinematic atmospheric instrumental background music, no vocals')
      .replace(/\b(vocal|vocals|singing|singer|lyrics|with lyrics)\b/gi, '')
      .trim() + ', instrumental only, no vocals'

    console.log(`🎵 Starting Suno generation for story ${storyId}`)
    console.log(`📝 Prompt: ${prompt.slice(0, 80)}`)

    // Step 1: Connect to OpenClaw browser
    let session: CDPSession
    try {
      session = await getSunoSession()
    } catch (e: any) {
      return NextResponse.json({ error: `OpenClaw browser not available: ${e.message}` }, { status: 503 })
    }

    // Step 2: Enable network monitoring to capture Bearer token
    let bearerToken: string | null = null
    await cdpSend(session, 'Network.enable', {})

    // Listen for requests to capture the auth token
    const tokenCapture = new Promise<string>((resolve) => {
      session.ws.on('message', (data: Buffer) => {
        try {
          const msg = JSON.parse(data.toString())
          if (msg.method === 'Network.requestWillBeSent') {
            const auth = msg.params?.request?.headers?.Authorization || msg.params?.request?.headers?.authorization
            if (auth?.startsWith('Bearer eyJ') && !bearerToken) {
              const [, payload] = auth.split(' ')
              const decoded = JSON.parse(Buffer.from(payload.split('.')[1], 'base64url').toString())
              if (decoded.aud === 'suno-api') {
                bearerToken = payload
                resolve(payload)
              }
            }
          }
        } catch (e) {}
      })
    })

    // Step 3: Navigate to create page
    await cdpSend(session, 'Page.navigate', { url: 'https://suno.com/create' })
    await sleep(4000)

    // Step 4: Fill the prompt textarea using React's native value setter
    const fillResult = await cdpSend(session, 'Runtime.evaluate', {
      expression: `
        (function() {
          const all = Array.from(document.querySelectorAll('textarea'));
          const visible = all.find(el => {
            const s = window.getComputedStyle(el);
            return s.visibility !== 'hidden' && s.display !== 'none' && el.getBoundingClientRect().width > 0;
          });
          if (!visible) return 'NO_TEXTAREA';
          const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
          setter.call(visible, ${JSON.stringify(prompt)});
          visible.dispatchEvent(new Event('input', {bubbles:true}));
          visible.dispatchEvent(new Event('change', {bubbles:true}));
          visible.dispatchEvent(new KeyboardEvent('keyup', {bubbles:true}));
          return 'filled:' + visible.value.slice(0, 30);
        })()
      `,
      awaitPromise: false
    })
    console.log('Fill result:', fillResult?.result?.value)
    await sleep(800)

    // Step 5: Enable Instrumental mode
    await cdpSend(session, 'Runtime.evaluate', {
      expression: `
        (function() {
          const btns = Array.from(document.querySelectorAll('button, [role="button"]'));
          const instr = btns.find(b => b.textContent?.includes('Instrumental') && !b.textContent?.includes('Disable'));
          if (instr) { instr.click(); return 'clicked'; }
          return 'already enabled or not found';
        })()
      `,
      awaitPromise: false
    })
    await sleep(600)

    // Step 6: Record timestamp and click Create
    const beforeCreate = Date.now()
    const clickResult = await cdpSend(session, 'Runtime.evaluate', {
      expression: `
        (function() {
          const btns = Array.from(document.querySelectorAll('button, [role="button"]'));
          const createBtn = btns.find(b => b.textContent?.trim() === 'Create' && !b.disabled);
          if (createBtn) { createBtn.click(); return 'clicked'; }
          const all = btns.filter(b => b.textContent?.includes('Create')).map(b => b.textContent?.trim() + '/' + b.disabled);
          return 'not found: ' + all.join(', ');
        })()
      `,
      awaitPromise: false
    })
    console.log('Click result:', clickResult?.result?.value)

    // Wait briefly for the token to be captured in outgoing requests
    await Promise.race([tokenCapture, sleep(6000)])
    session.close()

    // Fall back to saved token if needed
    if (!bearerToken) {
      try {
        const fs = require('fs')
        bearerToken = fs.readFileSync('/tmp/last_suno_token.txt', 'utf8').trim()
        console.log('⚠️ Using saved bearer token')
      } catch (e) {
        return NextResponse.json({ error: 'Could not capture Suno auth token. Please reload the Suno tab in the OpenClaw browser.' }, { status: 500 })
      }
    } else {
      // Save for future use
      try {
        require('fs').writeFileSync('/tmp/last_suno_token.txt', bearerToken)
      } catch (e) {}
    }

    // Step 7: Poll feed/v3 for the new clip (up to 4 min)
    const headers = {
      'Authorization': `Bearer ${bearerToken}`,
      'Content-Type': 'application/json',
      'Origin': 'https://suno.com',
      'Referer': 'https://suno.com/create'
    }

    let audioUrl: string | null = null
    for (let i = 0; i < 48; i++) {
      await sleep(5000)
      process.stdout.write(`\r⏳ ${(i + 1) * 5}s...`)
      try {
        const feedRes = await fetch('https://studio-api.prod.suno.com/api/feed/v3', {
          method: 'POST',
          headers,
          body: JSON.stringify({ page_size: 10, page: 0 })
        })
        const data = await feedRes.json() as any
        const clips = data.clips || []
        const ready = clips.find((c: any) =>
          c.audio_url && c.status === 'complete' &&
          new Date(c.created_at).getTime() > beforeCreate - 15000
        )
        if (ready) {
          audioUrl = ready.audio_url
          console.log(`\n✅ Clip ready: ${ready.title}`)
          break
        }
      } catch (e) {}
    }

    if (!audioUrl) {
      return NextResponse.json({ error: 'Suno generation timed out after 4 minutes' }, { status: 500 })
    }

    // Step 8: Download the track
    console.log('⬇️ Downloading...')
    const dlRes = await fetch(audioUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } })
    if (!dlRes.ok) return NextResponse.json({ error: `Download failed: ${dlRes.status}` }, { status: 500 })
    const buf = await dlRes.arrayBuffer()

    // Step 9: Upload to Supabase
    const storagePath = `asc3/${storyId}/background_music.mp3`
    const { error: upErr } = await supabase.storage
      .from('audio')
      .upload(storagePath, buf, { contentType: 'audio/mpeg', upsert: true })

    if (upErr) return NextResponse.json({ error: `Upload failed: ${upErr.message}` }, { status: 500 })

    const musicUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/audio/${storagePath}`
    console.log(`✅ Music uploaded: ${musicUrl}`)

    // Save to DB (background_music_url column — add if missing: ALTER TABLE stories ADD COLUMN IF NOT EXISTS background_music_url TEXT)
    await supabase.from('stories').update({ background_music_url: musicUrl }).eq('id', storyId).then(({ error }) => {
      if (error) console.log('⚠️ Could not save music URL to DB (column may not exist yet):', error.message)
      else console.log('✅ Music URL saved to DB')
    })

    return NextResponse.json({ success: true, musicUrl, message: 'Suno music generated successfully' })

  } catch (err: any) {
    console.error('generate-music error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
