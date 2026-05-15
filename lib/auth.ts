// GridWitness — lib/auth.ts
// Cognito configuration. Uses PKCE flow — no client secret stored in browser.

export const cognitoConfig = {
  Auth: {
    Cognito: {
      userPoolId:       process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID!,
      userPoolClientId: process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID!,
      loginWith: {
        oauth: {
          domain:            process.env.NEXT_PUBLIC_COGNITO_DOMAIN!,
          scopes:            ['openid', 'email', 'profile'],
          redirectSignIn:    [`${process.env.NEXT_PUBLIC_APP_URL}/auth/callback`],
          redirectSignOut:   [`${process.env.NEXT_PUBLIC_APP_URL}/auth/logout`],
          responseType:      'code' as const,
        }
      }
    }
  }
}

// Decode JWT claims without a library
export function parseJwt(token: string) {
  try {
    const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
    return JSON.parse(atob(base64))
  } catch {
    return null
  }
}

// Get tenant_id from Cognito JWT custom attribute
export function getTenantIdFromToken(idToken: string): string | null {
  const claims = parseJwt(idToken)
  return claims?.['custom:tenant_id'] || null
}
