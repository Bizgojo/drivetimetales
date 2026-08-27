import * as Sentry from '@sentry/nextjs'

// DSN must be set in environment (.env.local → NEXT_PUBLIC_SENTRY_DSN).
// If unset, Sentry initializes in no-op mode (no events sent, no errors thrown).
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NODE_ENV,
  // Capture 100% of sessions in development; tune in production
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
  // Enable Replay for session investigation (sample only errors in production)
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: process.env.NODE_ENV === 'production' ? 1.0 : 0,
  // Tag all events with service name
  initialScope: {
    tags: { service: 'endless-tales-player' },
  },
})
