'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Shield, Loader2 } from 'lucide-react'

export default function CallbackPage() {
  const router = useRouter()
  const [error, setError] = useState('')

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const code   = params.get('code')

    if (!code) {
      setError('No authorisation code in callback URL.')
      return
    }

    const clientId   = process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID!
    const domain     = process.env.NEXT_PUBLIC_COGNITO_DOMAIN!
    const appUrl     = process.env.NEXT_PUBLIC_APP_URL!
    const redirectUri = `${appUrl}/auth/callback`

    fetch(`https://${domain}/oauth2/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type:   'authorization_code',
        client_id:    clientId,
        code,
        redirect_uri: redirectUri,
      }),
    })
      .then(r => r.json())
      .then(data => {
        if (data.error) throw new Error(data.error_description || data.error)

        const idToken = data.id_token as string
        const exp = new Date(Date.now() + 8 * 3600_000).toUTCString() // 8 h session
        document.cookie = `gw_session=${idToken}; expires=${exp}; path=/; SameSite=Lax`
        localStorage.setItem('gw_id_token', idToken)

        // Extract tenant from token claims
        let tenantId = ''
        try {
          const claims = JSON.parse(atob(idToken.split('.')[1]))
          tenantId = claims['custom:tenant_id'] || ''
        } catch { /* ignore */ }

        const dest = tenantId ? `/monitor?tenant_id=${tenantId}` : '/monitor'
        router.replace(dest)
      })
      .catch((e: unknown) => {
        const msg = e instanceof Error ? e.message : 'Token exchange failed'
        setError(msg)
      })
  }, [router])

  if (error) {
    return (
      <div className="min-h-screen bg-gw-dark flex flex-col items-center justify-center gap-4">
        <Shield className="w-8 h-8 text-red-400" />
        <p className="text-red-400 text-sm max-w-sm text-center">{error}</p>
        <a href="/auth" className="text-gw-green text-sm hover:underline">← Back to sign in</a>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gw-dark flex flex-col items-center justify-center gap-4">
      <Shield className="w-8 h-8 text-gw-green" />
      <Loader2 className="w-5 h-5 text-gw-muted animate-spin" />
      <p className="text-gw-muted text-sm">Completing sign-in…</p>
    </div>
  )
}
