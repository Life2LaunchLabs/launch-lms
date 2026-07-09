'use client'

import React from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

type WelcomePayload = {
  org: any
  collection?: any
  badge?: any
  activity: any
  activity_id: string
  badge_uuid: string
  redirect_url: string
}

type VerificationState = {
  email: string
  redirectUrl: string
  claimToken: string
}

const welcomeSignupPasswordKey = (email: string) => `launchlms_welcome_signup_password:${email}`
const welcomeClaimKey = (email: string) => `launchlms_welcome_claim:${email}`

const CLAIM_POLL_INTERVAL_MS = 3500

export default function WelcomeClient() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const email = React.useMemo(() => searchParams.get('email')?.trim() || '', [searchParams])
  const [error, setError] = React.useState('')
  const [verification, setVerification] = React.useState<VerificationState | null>(null)
  const [claimExpired, setClaimExpired] = React.useState(false)
  const [resendState, setResendState] = React.useState<'idle' | 'sending' | 'sent' | 'error'>('idle')

  React.useEffect(() => {
    let cancelled = false
    setError('')

    async function startOnboarding() {
      try {
        if (email) {
          const password = window.sessionStorage.getItem(welcomeSignupPasswordKey(email))
          if (!password) {
            // Page was refreshed while waiting for verification — resume polling
            const storedClaim = window.sessionStorage.getItem(welcomeClaimKey(email))
            if (storedClaim) {
              const parsed = JSON.parse(storedClaim) as VerificationState
              if (!cancelled) setVerification(parsed)
              return
            }
            throw new Error('Your signup session expired. Please start signup again.')
          }

          const res = await fetch('/api/auth/signup/welcome', {
            method: 'POST',
            credentials: 'include',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ email, password }),
          })
          const data = await res.json().catch(() => null)
          if (!res.ok) {
            throw new Error(data?.detail || 'Unable to complete signup')
          }
          window.sessionStorage.removeItem(welcomeSignupPasswordKey(email))
          if (data?.verification_required) {
            const state: VerificationState = {
              email,
              redirectUrl: data?.onboarding?.redirect_url || '/',
              claimToken: data?.claim_token || '',
            }
            window.sessionStorage.setItem(welcomeClaimKey(email), JSON.stringify(state))
            if (!cancelled) setVerification(state)
            return
          }
          window.location.href = data?.onboarding?.redirect_url || '/'
          return
        }

        const res = await fetch('/api/auth/onboarding/welcome', {
          method: 'GET',
          credentials: 'include',
        })
        const data: any = await res.json().catch(() => null) as WelcomePayload | null
        if (!res.ok) {
          throw new Error(data?.detail || 'Unable to load onboarding')
        }
        if (!data?.redirect_url) {
          throw new Error('Onboarding is not ready')
        }
        window.location.href = data.redirect_url
      } catch (err: any) {
        if (!cancelled) setError(err?.message || 'Unable to load onboarding')
      }
    }

    startOnboarding()

    return () => {
      cancelled = true
    }
  }, [email, router])

  // While waiting for the user to click the verification link, poll the claim
  // endpoint. Once the email is verified it issues the session cookies and we
  // continue straight into the onboarding activity.
  React.useEffect(() => {
    if (!verification?.claimToken || claimExpired) return

    let cancelled = false
    let polling = false

    const poll = async () => {
      if (polling || cancelled) return
      polling = true
      try {
        const res = await fetch('/api/auth/signup/welcome/claim', {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ claim_token: verification.claimToken }),
        })
        if (res.status === 410) {
          if (!cancelled) setClaimExpired(true)
          return
        }
        if (!res.ok) return
        const data = await res.json().catch(() => null)
        if (data?.status === 'ready' && !cancelled) {
          window.sessionStorage.removeItem(welcomeClaimKey(verification.email))
          window.location.href = data?.redirect_url || verification.redirectUrl
        }
      } catch {
        // Transient network error — keep polling
      } finally {
        polling = false
      }
    }

    poll()
    const interval = window.setInterval(poll, CLAIM_POLL_INTERVAL_MS)

    return () => {
      cancelled = true
      window.clearInterval(interval)
    }
  }, [verification, claimExpired])

  const handleResend = async () => {
    if (!verification || resendState === 'sending') return
    setResendState('sending')
    try {
      const res = await fetch('/api/auth/resend-verification', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email: verification.email }),
      })
      setResendState(res.ok ? 'sent' : 'error')
    } catch {
      setResendState('error')
    }
  }

  if (verification) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-card px-6">
        <div className="w-full max-w-md text-center">
          <h1 className="text-2xl font-semibold text-foreground">Check your email</h1>
          {claimExpired ? (
            <>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                This page waited too long for verification. If you have verified{' '}
                <span className="font-medium text-foreground">{verification.email}</span>, just log in to continue.
              </p>
              <button
                type="button"
                onClick={() => router.push(`/login?next=${encodeURIComponent(verification.redirectUrl)}`)}
                className="mt-6 inline-flex min-h-10 w-full items-center justify-center rounded-lg bg-gray-950 px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-gray-800"
              >
                Continue to login
              </button>
            </>
          ) : (
            <>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                We sent a verification link to <span className="font-medium text-foreground">{verification.email}</span>.
                Click it, and this page will continue automatically — no need to come back and log in.
              </p>
              <div className="mt-6 flex items-center justify-center gap-2 text-sm text-muted-foreground">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-border border-t-gray-950" />
                Waiting for verification…
              </div>
              <div className="mt-6 flex flex-col items-center gap-3">
                <button
                  type="button"
                  onClick={handleResend}
                  disabled={resendState === 'sending' || resendState === 'sent'}
                  className="inline-flex min-h-10 w-full items-center justify-center rounded-lg border border-border px-5 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-muted disabled:opacity-60"
                >
                  {resendState === 'sending'
                    ? 'Sending…'
                    : resendState === 'sent'
                      ? 'Verification email sent'
                      : 'Resend verification email'}
                </button>
                {resendState === 'error' && (
                  <p className="text-sm text-red-600">Could not resend the email. Please try again in a few minutes.</p>
                )}
                <button
                  type="button"
                  onClick={() => router.push(`/login?next=${encodeURIComponent(verification.redirectUrl)}`)}
                  className="text-sm text-muted-foreground underline underline-offset-2 hover:text-foreground"
                >
                  Or log in manually
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-card px-6">
        <div className="w-full max-w-md text-center">
          <h1 className="text-2xl font-semibold text-foreground">We could not start onboarding</h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">{error}</p>
          <button
            type="button"
            onClick={() => router.push('/signup')}
            className="mt-6 inline-flex min-h-10 items-center justify-center rounded-lg bg-gray-950 px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-gray-800"
          >
            Back to signup
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-card">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-border border-t-gray-950" />
    </div>
  )
}
