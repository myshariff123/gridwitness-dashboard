'use client'
import { Shield, Lock, Globe } from 'lucide-react'

export default function AuthPage() {
  const cognitoDomain  = process.env.NEXT_PUBLIC_COGNITO_DOMAIN
  const clientId       = process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID
  const appUrl         = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  const redirectUri    = encodeURIComponent(`${appUrl}/auth/callback`)

  const loginUrl = `https://${cognitoDomain}/login?client_id=${clientId}&response_type=code&scope=openid+email+profile&redirect_uri=${redirectUri}`

  return (
    <div className="min-h-screen bg-gw-dark flex flex-col items-center justify-center p-6">

      {/* Logo */}
      <div className="flex items-center gap-3 mb-10">
        <Shield className="w-8 h-8 text-gw-green" />
        <div>
          <div className="text-xl font-bold text-white tracking-wide">GridWitness</div>
          <div className="text-xs text-gw-muted">by NimbleStride Inc.</div>
        </div>
      </div>

      {/* Card */}
      <div className="w-full max-w-sm bg-gw-panel border border-gw-border rounded-xl p-8">
        <h1 className="text-lg font-semibold text-white mb-1">Sign in to your account</h1>
        <p className="text-sm text-gw-muted mb-8">
          Hardware-verified ESG compliance for AI infrastructure
        </p>

        <a
          href={loginUrl}
          className="w-full flex items-center justify-center gap-2 bg-gw-green text-gw-dark font-semibold py-3 rounded-lg hover:bg-gw-green/90 transition-colors"
        >
          <Lock className="w-4 h-4" />
          Sign in with GridWitness SSO
        </a>

        <div className="mt-6 pt-6 border-t border-gw-border">
          <p className="text-xs text-gw-muted text-center mb-4">Compliance frameworks covered</p>
          <div className="flex flex-wrap gap-2 justify-center">
            {['OSFI B-15', 'Bill C-59', 'ISO 14064-1', 'GHG Protocol'].map(f => (
              <span key={f} className="text-xs border border-gw-border text-gw-muted px-2 py-1 rounded">
                {f}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Compliance badges */}
      <div className="mt-8 flex items-center gap-2 text-xs text-gw-muted">
        <Globe className="w-3.5 h-3.5" />
        <span>All data stored in AWS ca-central-1 · Canadian sovereign infrastructure</span>
      </div>

      <p className="mt-4 text-xs text-gw-muted">
        New customer?{' '}
        <a href="/onboarding" className="text-gw-green hover:underline">
          Get started free →
        </a>
      </p>
    </div>
  )
}
