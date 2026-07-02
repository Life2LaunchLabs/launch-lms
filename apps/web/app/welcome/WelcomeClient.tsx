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

const welcomeSignupPasswordKey = (email: string) => `launchlms_welcome_signup_password:${email}`

export default function WelcomeClient() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const email = React.useMemo(() => searchParams.get('email')?.trim() || '', [searchParams])
  const [error, setError] = React.useState('')

  React.useEffect(() => {
    let cancelled = false
    setError('')

    async function startOnboarding() {
      try {
        if (email) {
          const password = window.sessionStorage.getItem(welcomeSignupPasswordKey(email))
          if (!password) {
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

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white px-6">
        <div className="w-full max-w-md text-center">
          <h1 className="text-2xl font-semibold text-gray-950">We could not start onboarding</h1>
          <p className="mt-3 text-sm leading-6 text-gray-500">{error}</p>
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
    <div className="flex min-h-screen items-center justify-center bg-white">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-200 border-t-gray-950" />
    </div>
  )
}
