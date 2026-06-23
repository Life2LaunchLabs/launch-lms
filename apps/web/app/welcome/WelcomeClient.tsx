'use client'

import React from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { OrgProvider } from '@components/Contexts/OrgContext'
import ActivityClient from '../orgs/[orgslug]/(withmenu)/course/[courseuuid]/activity/[activityid]/activity'

type WelcomePayload = {
  org: any
  course: any
  chapter: any
  activity: any
  activity_id: string
  course_uuid: string
}

function cleanId(value: string | null | undefined, prefix: string) {
  return String(value || '').replace(prefix, '')
}

export default function WelcomeClient() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const email = React.useMemo(() => searchParams.get('email')?.trim() || '', [searchParams])
  const [payload, setPayload] = React.useState<WelcomePayload | null>(null)
  const [error, setError] = React.useState('')
  const [isCompleting, setIsCompleting] = React.useState(false)

  React.useEffect(() => {
    if (!email) {
      router.replace('/signup')
      return
    }

    let cancelled = false
    setError('')

    fetch('/api/auth/onboarding/welcome', {
      method: 'GET',
      credentials: 'include',
    })
      .then(async (res) => {
        const data = await res.json().catch(() => null)
        if (!res.ok) {
          throw new Error(data?.detail || 'Unable to load onboarding')
        }
        return data as WelcomePayload
      })
      .then((data) => {
        if (!cancelled) setPayload(data)
      })
      .catch((err) => {
        if (!cancelled) setError(err?.message || 'Unable to load onboarding')
      })

    return () => {
      cancelled = true
    }
  }, [email, router])

  const completeOnboarding = React.useCallback(async (quizResult: any) => {
    setIsCompleting(true)
    setError('')

    const res = await fetch('/api/auth/signup/welcome', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email,
        quiz_result: quizResult,
      }),
    })
    const data = await res.json().catch(() => null)

    if (!res.ok) {
      setIsCompleting(false)
      const message = data?.detail || 'Unable to complete signup'
      setError(message)
      throw new Error(message)
    }

    window.location.href = '/'
  }, [email])

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

  if (!payload) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-200 border-t-gray-950" />
      </div>
    )
  }

  const orgslug = payload.org?.slug
  const courseuuid = cleanId(payload.course_uuid || payload.course?.course_uuid, 'course_')
  const activityid = cleanId(payload.activity_id || payload.activity?.activity_uuid, 'activity_')
  const chapterid = cleanId(payload.chapter?.chapter_uuid, 'chapter_')

  if (!orgslug || !courseuuid || !activityid || !chapterid) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white px-6">
        <div className="w-full max-w-md text-center">
          <h1 className="text-2xl font-semibold text-gray-950">Onboarding is not ready</h1>
          <p className="mt-3 text-sm leading-6 text-gray-500">
            The welcome activity is missing required setup details.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-white">
      {isCompleting && (
        <div className="fixed inset-x-0 top-0 z-50 flex justify-center pt-4">
          <div className="rounded-full bg-gray-950 px-4 py-2 text-sm font-semibold text-white shadow-lg">
            Creating your account...
          </div>
        </div>
      )}
      <OrgProvider orgslug={orgslug}>
        <ActivityClient
          activityid={activityid}
          courseuuid={courseuuid}
          orgslug={orgslug}
          activity={payload.activity}
          course={payload.course}
          unauthenticated
          guestMode
          onboardingMode
          chapterid={chapterid}
          onOnboardingComplete={completeOnboarding}
        />
      </OrgProvider>
    </div>
  )
}
