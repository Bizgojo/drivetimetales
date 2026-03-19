import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// Admin email allowlist — restored before public launch
// const ADMIN_EMAILS = new Set([
//   'marc@endless-tales.com',
//   'hello.endlesstales@gmail.com',
//   'williampostlewaite@icloud.com',
//   'm.postlewaite@gmail.com',
// ])

export async function middleware(request: NextRequest) {
  // Middleware auth guard temporarily disabled for /admin.
  // The admin pages handle their own client-side auth.
  // Re-enable server-side guard before public launch.
  return NextResponse.next()
}

export const config = {
  matcher: ['/admin/:path*'],
}
