#!/usr/bin/env node
/**
 * suno-generate.js <prompt> <storyId>
 * Uses the OpenClaw browser (already logged into Suno) to:
 * 1. Navigate to suno.com/create
 * 2. Fill prompt + enable Instrumental
 * 3. Click Create
 * 4. Poll feed/v3 for the new clip
 * 5. Download + upload to Supabase
 *
 * The bearer token is captured from the browser's outgoing requests
 * and used to poll the API for the new clip.
 */

const path = require('path')
const { createClient } = require('@supabase/supabase-js')
const { execSync } = require('child_process')

require('dotenv').config({ path: path.join(__dirname, '../.env.local') })

const BROWSER_CDP = 'http://127.0.0.1:18800'
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function generateSunoTrack(prompt, storyId) {
  const cleanPrompt = prompt.replace(/\b(vocal|vocals|singing|singer|lyrics|with lyrics|song)\b/gi, '').trim()
    + ', instrumental only, no vocals'

  console.log(`🎵 Generating for story ${storyId}`)

  // Step 1: Capture Bearer token from OpenClaw browser
  const listRes = await fetch(`${BROWSER_CDP}/json/list`)
  const tabs = await listRes.json()
  const sunoTab = tabs.find(t => t.url && t.url.includes('suno.com'))
  if (!sunoTab) throw new Error('No Suno tab found in OpenClaw browser')

  // Step 2: Use CDP to interact with the page
  const ws = await connectCDP(sunoTab.webSocketDebuggerUrl)

  // Navigate to create page
  await cdpSend(ws, 'Page.navigate', { url: 'https://suno.com/create' })
  await sleep(4000)

  // Capture bearer token from network requests
  let bearerToken = null
  await cdpSend(ws, 'Network.enable', {})
  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data)
      if (msg.method === 'Network.requestWillBeSent') {
        const auth = msg.params?.request?.headers?.Authorization || msg.params?.request?.headers?.authorization
        if (auth && auth.startsWith('Bearer eyJ') && !bearerToken) {
          bearerToken = auth.split(' ')[1]
          console.log('✅ Bearer token captured')
        }
      }
    } catch (e) {}
  })

  // Fill the textarea using JavaScript in the browser
  await cdpSend(ws, 'Runtime.evaluate', {
    expression: `
      (function() {
        const all = Array.from(document.querySelectorAll('textarea'));
        const visible = all.find(el => window.getComputedStyle(el).visibility !== 'hidden' && el.getBoundingClientRect().width > 0);
        if (!visible) return 'NO_TEXTAREA';
        const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
        setter.call(visible, ${JSON.stringify(cleanPrompt)});
        visible.dispatchEvent(new Event('input', {bubbles:true}));
        visible.dispatchEvent(new Event('change', {bubbles:true}));
        return 'filled:' + visible.placeholder.slice(0, 30);
      })()
    `,
    awaitPromise: false
  })
  await sleep(500)

  // Enable instrumental mode
  await cdpSend(ws, 'Runtime.evaluate', {
    expression: `
      (function() {
        const btns = Array.from(document.querySelectorAll('button'));
        const instr = btns.find(b => b.textContent.includes('Instrumental') && !b.textContent.includes('Disable'));
        if (instr) { instr.click(); return 'clicked instrumental'; }
        return 'instrumental already on or not found';
      })()
    `,
    awaitPromise: false
  })
  await sleep(500)

  // Record timestamp before clicking Create
  const beforeCreate = Date.now()

  // Click Create
  await cdpSend(ws, 'Runtime.evaluate', {
    expression: `
      (function() {
        const btns = Array.from(document.querySelectorAll('button,[role="button"]'));
        const createBtn = btns.find(b => b.textContent.trim() === 'Create' && !b.disabled);
        if (createBtn) { createBtn.click(); return 'clicked'; }
        return 'not found or disabled: ' + btns.filter(b=>b.textContent.includes('Create')).map(b=>b.textContent.trim()+'/'+b.disabled).join(',');
      })()
    `,
    awaitPromise: false
  })
  console.log('🖱️ Clicked Create, waiting for generation...')
  await sleep(3000) // wait for request to fire so we capture the token

  ws.close()

  if (!bearerToken) {
    // Try to use saved token
    try {
      bearerToken = require('fs').readFileSync('/tmp/last_suno_token.txt', 'utf8').trim()
      console.log('⚠️ Using saved token')
    } catch (e) {
      throw new Error('No Bearer token captured and no saved token found')
    }
  }

  // Step 3: Poll for new clip (created after beforeCreate)
  const headers = { 'Authorization': `Bearer ${bearerToken}`, 'Content-Type': 'application/json', 'Origin': 'https://suno.com' }
  let audioUrl = null

  for (let i = 0; i < 48; i++) {
    await sleep(5000)
    process.stdout.write(`\r⏳ ${(i + 1) * 5}s...`)

    try {
      const res = await fetch('https://studio-api.prod.suno.com/api/feed/v3', {
        method: 'POST',
        headers,
        body: JSON.stringify({ page_size: 10, page: 0 })
      })
      const data = await res.json()
      const clips = data.clips || []
      const ready = clips.find(c => c.audio_url && c.status === 'complete' && new Date(c.created_at).getTime() > beforeCreate - 10000)
      if (ready) {
        audioUrl = ready.audio_url
        console.log(`\n✅ Clip ready: ${ready.title}`)
        break
      }
    } catch (e) {}
  }

  if (!audioUrl) throw new Error('Timed out waiting for Suno clip')

  // Step 4: Download + upload
  console.log('⬇️ Downloading...')
  const dlRes = await fetch(audioUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } })
  if (!dlRes.ok) throw new Error(`Download failed: ${dlRes.status}`)
  const buf = await dlRes.arrayBuffer()

  const storagePath = `asc3/${storyId}/background_music.mp3`
  const { error } = await supabase.storage.from('audio').upload(storagePath, buf, { contentType: 'audio/mpeg', upsert: true })
  if (error) throw new Error(`Upload failed: ${error.message}`)

  const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/audio/${storagePath}`
  console.log(`✅ Done: ${url}`)
  return url
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

async function connectCDP(wsUrl) {
  const WebSocket = require('ws')
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl)
    ws._msgId = 0
    ws._pending = {}
    ws.on('open', () => resolve(ws))
    ws.on('error', reject)
    ws.on('message', (data) => {
      const msg = JSON.parse(data)
      if (msg.id && ws._pending[msg.id]) {
        ws._pending[msg.id](msg.result)
        delete ws._pending[msg.id]
      }
    })
  })
}

function cdpSend(ws, method, params = {}) {
  return new Promise((resolve) => {
    const id = ++ws._msgId
    ws._pending[id] = resolve
    ws.send(JSON.stringify({ id, method, params }))
  })
}

const [,, prompt, storyId] = process.argv
if (!prompt || !storyId) { console.error('Usage: node suno-generate.js <prompt> <storyId>'); process.exit(1) }

generateSunoTrack(prompt, storyId)
  .then(url => { console.log('RESULT_URL:' + url); process.exit(0) })
  .catch(err => { console.error('ERROR:', err.message); process.exit(1) })
