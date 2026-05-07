'use client'

import { X } from 'lucide-react'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { useOrg } from '@components/Contexts/OrgContext'
import {
  recordSuggestedActionEvent,
  SuggestedAction,
  useSuggestedActions,
} from '@services/suggested-actions/suggested-actions'
import { useEffect, useMemo, useRef, useState } from 'react'
import { getOnboardingUserKey, OnboardingFeatureKey, useOrgOnboarding } from './orgOnboarding'

const FEATURE_COPY: Record<
  OnboardingFeatureKey,
  {
    eyebrow: string
    title: string
    description: string
  }
> = {
  courses: {
    eyebrow: 'About Courses',
    title: 'Dive into our curated collection of courses.',
    description:
      'Gain skills, learn about yourself, and plan your target lifestyle.',
  },
  communities: {
    eyebrow: 'About Communities',
    title: 'Connect with other launchers.',
    description:
      'Got a question, resource to share, or just looking to chat? You\'re in the right place.',
  },
  resources: {
    eyebrow: 'About Resources',
    title: 'All the resources you need in one place.',
    description:
      'Quickly find any information, tools, and support you need for life launching.',
  },
}

export default function FeatureInfoBanner({
  orgslug,
  feature,
}: {
  orgslug: string
  feature: OnboardingFeatureKey
}) {
  const session = useLHSession() as any
  const org = useOrg() as any
  const accessToken = session?.data?.tokens?.access_token
  const orgId = org?.id
  const userKey = getOnboardingUserKey(session)
  const { state, dismissFeatureBanner } = useOrgOnboarding(orgslug, userKey)
  const [dismissedLocally, setDismissedLocally] = useState(false)
  const [backendDismissedActionKey, setBackendDismissedActionKey] = useState<string | null>(null)
  const viewedKeysRef = useRef<Set<string>>(new Set())
  const { data: backendActions, error, isLoading } = useSuggestedActions({
    orgId,
    accessToken,
    surface: 'feature_page',
    slot: 'banner',
    context: feature,
    limit: 1,
    enabled: session?.status === 'authenticated',
  })
  const backendAction = useMemo(
    () => backendActions?.find((action) => action.key !== backendDismissedActionKey),
    [backendActions, backendDismissedActionKey]
  )
  const useLocalFallback = isLoading || Boolean(error) || !orgId || !accessToken
  const localBannerDismissed = dismissedLocally || state.dismissedFeatureBanners[feature]
  const copy = FEATURE_COPY[feature]
  const title = backendAction?.title || copy.title
  const description = backendAction?.subtext || copy.description
  const actionForEvents: SuggestedAction | undefined = backendAction

  useEffect(() => {
    if (!orgId || !accessToken || !actionForEvents) return
    if (viewedKeysRef.current.has(actionForEvents.key)) return
    viewedKeysRef.current.add(actionForEvents.key)
    recordSuggestedActionEvent({
      orgId,
      actionKey: actionForEvents.key,
      eventType: 'viewed',
      surface: 'feature_page',
      context: feature,
      metadata: { source: actionForEvents.source, kind: actionForEvents.kind },
      accessToken,
    }).catch(() => {})
  }, [accessToken, actionForEvents, feature, orgId])

  if (session?.status !== 'authenticated') {
    return null
  }

  if (localBannerDismissed) {
    return null
  }

  if (!useLocalFallback && !backendAction) {
    return null
  }

  const handleDismiss = () => {
    setDismissedLocally(true)
    dismissFeatureBanner(feature)

    if (!actionForEvents || !orgId || !accessToken) {
      return
    }

    setBackendDismissedActionKey(actionForEvents.key)
    recordSuggestedActionEvent({
      orgId,
      actionKey: actionForEvents.key,
      eventType: 'dismissed',
      surface: 'feature_page',
      context: feature,
      metadata: {
        source: actionForEvents.source,
        kind: actionForEvents.kind,
        target_href: actionForEvents.targetHref || actionForEvents.href,
      },
      accessToken,
    }).catch(() => {
      setBackendDismissedActionKey(null)
    })
  }

  return (
    <div
      className="relative mb-4 overflow-hidden rounded-[6px] border border-white/20 bg-blue-900 bg-cover bg-center px-4 py-3 text-white shadow-sm sm:px-5"
      style={{ backgroundImage: 'url(/rough_blue_background.png)' }}
    >
      <div className="pointer-events-none absolute inset-0 bg-white/25" />
      <button
        type="button"
        onClick={handleDismiss}
        className="absolute right-2 top-2 z-10 flex h-7 w-7 items-center justify-center rounded-full text-white/70 transition-colors hover:bg-white/15 hover:text-white"
        aria-label={`Dismiss ${copy.eyebrow}`}
      >
        <X size={14} />
      </button>

      <div className="relative z-10 max-w-3xl pr-9">
        <h2 className="text-sm font-semibold tracking-tight text-white sm:text-[15px]">
          {title}
        </h2>
        <p className="mt-1 text-xs leading-5 text-white/82 sm:text-[13px]">
          {description}
        </p>
      </div>
    </div>
  )
}
