#!/usr/bin/env node
/**
 * refresh-suno-token.js
 * Reads Suno auth cookies directly from Firefox's SQLite profile,
 * launches a headless Playwright browser with those cookies set,
 * captures the fresh Authorization Bearer token, saves to .env.local
 *
 * No credentials needed — uses Firefox session (valid until ~2027)
 */

const { chromium } = require('playwright')
const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')
const os = require('os')

const ENV_PATH = path.join(__dirname, '../.env.local')
const FIREFOX_PROFILE = 'dktuucuj.default-release'
const COOKIES_DB = path.join(os.homedir(), `Library/Application Support/Firefox/Profiles/${FIREFOX_PROFILE}/cookies.sqlite`)
const COOKIES_TMP = '/tmp/suno_refresh_cookies.sqlite'

function readEnv() {
  return fs.existsSync(ENV_PATH) ? fs.readFileSync(ENV_PATH, 'utf8') : ''
}

function writeEnv(key, value) {
  let content = readEnv()
  const regex = new RegExp(`^${key}=.*`, 'm')
  if (regex.test(content)) {
    content = content.replace(regex, `${key}=${value}`)
  } else {
    content += `\n${key}=${value}`
  }
  fs.writeFileSync(ENV_PATH, content)
}

function readSunoCookiesFromFirefox() {
  if (!fs.existsSync(COOKIES_DB)) {
    throw new Error(`Firefox profile not found at: ${COOKIES_DB}`)
  }

  // Copy DB (Firefox locks it)
  fs.copyFileSync(COOKIES_DB, COOKIES_TMP)

  const result = execSync(
    `sqlite3 "${COOKIES_TMP}" "SELECT name, value, host, path, isSecure, isHttpOnly, sameSite FROM moz_cookies WHERE host LIKE '%suno%' OR host LIKE '%clerk%';"`,
    { encoding: 'utf8' }
  )

  const cookies = []
  for (const line of result.split('\n')) {
    if (!line.trim()) continue
    const [name, value, host, cookiePath, isSecure, isHttpOnly, sameSite] = line.split('|')
    if (!name || !value) continue

    const sameSiteMap = { '0': 'None', '1': 'Lax', '2': 'Strict' }

    cookies.push({
      name,
      value,
      domain: host.startsWith('.') ? host : host,
      path: cookiePath || '/',
      secure: isSecure === '1',
      httpOnly: isHttpOnly === '1',
      sameSite: sameSiteMap[sameSite] || 'None',
    })
  }

  return cookies
}

async function refreshSunoToken() {
  console.log('🎵 Refreshing Suno token from Firefox session...')

  let cookies
  try {
    cookies = readSunoCookiesFromFirefox()
    console.log(`📦 Loaded ${cookies.length} Suno cookies from Firefox`)
  } catch (e) {
    console.error('❌ Could not read Firefox cookies:', e.message)
    process.exit(1)
  }

  let capturedToken = null

  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  })

  // Set all the Suno cookies
  for (const cookie of cookies) {
    try {
      await context.addCookies([cookie])
    } catch (e) {
      // Skip invalid cookies silently
    }
  }

  const page = await context.newPage()

  // Intercept Authorization headers
  page.on('request', (request) => {
    const auth = request.headers()['authorization']
    if (auth && auth.startsWith('Bearer eyJ') && !capturedToken) {
      const token = auth.replace('Bearer ', '')
      // Make sure it's a real token (not just any JWT)
      try {
        const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString())
        if (payload.aud === 'suno-api') {
          capturedToken = token
          console.log('✅ Captured fresh Suno API token')
        }
      } catch (e) { /* not a valid JWT */ }
    }
  })

  try {
    await page.goto('https://suno.com', { waitUntil: 'networkidle', timeout: 30000 })
    await page.waitForTimeout(3000)

    // Try calling Clerk's getToken if the session loaded
    if (!capturedToken) {
      const clerkToken = await page.evaluate(async () => {
        try {
          if (window.Clerk?.session) {
            return await window.Clerk.session.getToken()
          }
        } catch (e) { return null }
        return null
      })
      if (clerkToken && clerkToken.startsWith('eyJ')) capturedToken = clerkToken
    }

    // Try navigating to the explore page to trigger more API calls
    if (!capturedToken) {
      await page.goto('https://suno.com/explore', { waitUntil: 'networkidle', timeout: 20000 })
      await page.waitForTimeout(3000)
    }
  } catch (e) {
    console.log('Navigation note:', e.message)
  }

  await browser.close()

  if (!capturedToken) {
    console.error('❌ Could not capture a fresh token')
    console.error('   Firefox session may have expired. Visit suno.com in Firefox to re-authenticate.')
    process.exit(1)
  }

  // Decode and show expiry
  try {
    const payload = JSON.parse(Buffer.from(capturedToken.split('.')[1], 'base64url').toString())
    const exp = new Date(payload.exp * 1000)
    const minsLeft = Math.round((exp - new Date()) / 60000)
    console.log(`⏰ Token valid until ${exp.toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit' })} ET (${minsLeft} min from now)`)
  } catch (e) { /* ok */ }

  writeEnv('SUNO_COOKIE', capturedToken)
  console.log('✅ SUNO_COOKIE updated in .env.local')
}

refreshSunoToken().catch((err) => {
  console.error('❌ Fatal:', err.message)
  process.exit(1)
})
