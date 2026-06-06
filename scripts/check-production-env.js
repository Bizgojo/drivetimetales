#!/usr/bin/env node

const fs = require('fs')

require('dotenv').config({ path: '.env.local' })

function base64UrlJson(value) {
  return Buffer.from(JSON.stringify(value)).toString('base64url')
}

function decodeJwtPayload(token) {
  try {
    const part = String(token || '').split('.')[1]
    if (!part) return null
    return JSON.parse(Buffer.from(part.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'))
  } catch {
    return null
  }
}

function projectRefFromUrl(url) {
  try {
    return new URL(url).hostname.split('.')[0]
  } catch {
    return null
  }
}

function checkEnv(env) {
  const url = env.NEXT_PUBLIC_SUPABASE_URL || ''
  const serviceRole = env.SUPABASE_SERVICE_ROLE_KEY || ''
  const anon = env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
  const servicePayload = decodeJwtPayload(serviceRole)
  const anonPayload = decodeJwtPayload(anon)
  const urlRef = projectRefFromUrl(url)
  const failures = []

  if (!urlRef) failures.push('NEXT_PUBLIC_SUPABASE_URL must be a valid Supabase URL')
  if (!servicePayload) failures.push('SUPABASE_SERVICE_ROLE_KEY must be a JWT')
  if (servicePayload?.role !== 'service_role') failures.push('SUPABASE_SERVICE_ROLE_KEY must have role=service_role')
  if (urlRef && servicePayload?.ref && urlRef !== servicePayload.ref) failures.push('SUPABASE_SERVICE_ROLE_KEY project ref must match NEXT_PUBLIC_SUPABASE_URL')
  if (anon && !anonPayload) failures.push('NEXT_PUBLIC_SUPABASE_ANON_KEY is present but is not a JWT-shaped Supabase anon key')
  if (anonPayload?.role && anonPayload.role !== 'anon') failures.push('NEXT_PUBLIC_SUPABASE_ANON_KEY must have role=anon')
  if (urlRef && anonPayload?.ref && urlRef !== anonPayload.ref) failures.push('NEXT_PUBLIC_SUPABASE_ANON_KEY project ref must match NEXT_PUBLIC_SUPABASE_URL')

  return {
    success: failures.length === 0,
    failures,
    supabase: {
      urlPresent: Boolean(url),
      urlProjectRef: urlRef,
      serviceRolePresent: Boolean(serviceRole),
      serviceRoleLength: serviceRole.length,
      serviceRoleJwt: Boolean(servicePayload),
      serviceRoleRole: servicePayload?.role || null,
      serviceRoleProjectRef: servicePayload?.ref || null,
      serviceRoleExpiry: servicePayload?.exp ? new Date(servicePayload.exp * 1000).toISOString() : null,
      anonPresent: Boolean(anon),
      anonLength: anon.length,
      anonJwt: Boolean(anonPayload),
      anonRole: anonPayload?.role || null,
      anonProjectRef: anonPayload?.ref || null,
      anonExpiry: anonPayload?.exp ? new Date(anonPayload.exp * 1000).toISOString() : null,
    },
  }
}

function loadEnvFile(filePath) {
  const env = {}
  if (!fs.existsSync(filePath)) return env
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/)
    if (!match) continue
    env[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, '')
  }
  return env
}

function fakeJwt(payload) {
  return [
    base64UrlJson({ alg: 'HS256', typ: 'JWT' }),
    base64UrlJson(payload),
    'signature',
  ].join('.')
}

function runSelfTest() {
  const goodEnv = {
    NEXT_PUBLIC_SUPABASE_URL: 'https://projectref.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: fakeJwt({ ref: 'projectref', role: 'service_role', exp: 4102444800 }),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: fakeJwt({ ref: 'projectref', role: 'anon', exp: 4102444800 }),
  }
  const cases = [
    {
      name: 'matching supabase env passes',
      env: goodEnv,
      success: true,
    },
    {
      name: 'service role project mismatch fails',
      env: { ...goodEnv, SUPABASE_SERVICE_ROLE_KEY: fakeJwt({ ref: 'otherref', role: 'service_role' }) },
      success: false,
      failure: 'SUPABASE_SERVICE_ROLE_KEY project ref must match NEXT_PUBLIC_SUPABASE_URL',
    },
    {
      name: 'anon non-jwt fails',
      env: { ...goodEnv, NEXT_PUBLIC_SUPABASE_ANON_KEY: 'not-a-jwt' },
      success: false,
      failure: 'NEXT_PUBLIC_SUPABASE_ANON_KEY is present but is not a JWT-shaped Supabase anon key',
    },
    {
      name: 'service role role mismatch fails',
      env: { ...goodEnv, SUPABASE_SERVICE_ROLE_KEY: fakeJwt({ ref: 'projectref', role: 'anon' }) },
      success: false,
      failure: 'SUPABASE_SERVICE_ROLE_KEY must have role=service_role',
    },
    {
      name: 'invalid supabase url fails',
      env: { ...goodEnv, NEXT_PUBLIC_SUPABASE_URL: 'not-a-url' },
      success: false,
      failure: 'NEXT_PUBLIC_SUPABASE_URL must be a valid Supabase URL',
    },
  ]

  const failures = []
  for (const testCase of cases) {
    const report = checkEnv(testCase.env)
    if (report.success !== testCase.success || (testCase.failure && !report.failures.includes(testCase.failure))) {
      failures.push({
        name: testCase.name,
        expectedSuccess: testCase.success,
        expectedFailure: testCase.failure || null,
        actual: report,
      })
    }
  }

  if (failures.length) {
    console.error(JSON.stringify({ success: false, failures }, null, 2))
    process.exit(1)
  }

  console.log(JSON.stringify({ success: true, cases: cases.length }, null, 2))
}

function main() {
  const args = process.argv.slice(2)
  if (args.includes('--self-test')) {
    runSelfTest()
    return
  }

  const envFileIndex = args.findIndex((arg) => arg === '--env-path' || arg.startsWith('--env-path=') || arg === '--env-file' || arg.startsWith('--env-file='))
  let env = process.env
  let envFile = null
  if (envFileIndex !== -1) {
    const arg = args[envFileIndex]
    envFile = arg.includes('=') ? arg.split('=').slice(1).join('=') : args[envFileIndex + 1]
    if (!envFile || !fs.existsSync(envFile)) {
      console.error(JSON.stringify({
        success: false,
        envFile: envFile || null,
        failures: ['--env-path must point to an existing file'],
      }, null, 2))
      process.exit(1)
    }
    env = { ...process.env, ...loadEnvFile(envFile) }
  }

  const report = {
    success: true,
    envFile,
    ...checkEnv(env),
  }
  report.success = report.failures.length === 0
  console.log(JSON.stringify(report, null, 2))
  if (!report.success) process.exit(1)
}

main()
