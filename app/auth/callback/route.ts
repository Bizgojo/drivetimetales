import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const next = requestUrl.searchParams.get('next') || '/home'
  const error = requestUrl.searchParams.get('error')

  // If there's an error, redirect to signin
  if (error) {
    return NextResponse.redirect(new URL('/signin?error=auth_failed', requestUrl.origin))
  }

  // If there's a code, pass it to the client-side reset password page
  if (code) {
    // Redirect to reset-password with the code as a query param
   return NextResponse.redirect(new URL(`${next}?code=${code}`, requestUrl.origin))
  }

  // No code, redirect to signin
  return NextResponse.redirect(new URL('/signin?error=auth_failed', requestUrl.origin))
}
