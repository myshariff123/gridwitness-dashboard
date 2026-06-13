import { NextResponse } from 'next/server'

export function GET() {
  const res = NextResponse.redirect(
    new URL('/auth', process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000')
  )
  // Expire the session cookie
  res.cookies.set('gw_session', '', { expires: new Date(0), path: '/' })
  return res
}
