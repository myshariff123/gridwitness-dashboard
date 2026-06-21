import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// Paths that don't require a session
const PUBLIC = ['/', '/auth', '/onboarding', '/verify', '/health', '/attest']

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (PUBLIC.some(p => pathname === p || pathname.startsWith(p + '/'))) {
    return NextResponse.next()
  }

  const session = request.cookies.get('gw_session')
  if (!session?.value) {
    const loginUrl = new URL('/auth', request.url)
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
}

export const config = {
  // Run on all routes except Next.js internals and static files
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.png|.*\\.svg).*)'],
}
