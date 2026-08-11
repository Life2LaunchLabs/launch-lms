'use client'

import { Award, FolderOpen, X } from 'lucide-react'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { getOnboardingUserKey, OnboardingFeatureKey, useOrgOnboarding } from './orgOnboarding'

const FEATURE_COPY: Record<
  OnboardingFeatureKey,
  {
    eyebrow: string
    title: string
    description: string
  }
> = {
  badges: {
    eyebrow: 'About Badges',
    title: 'Dive into our curated collection of badges.',
    description:
      'Gain skills, learn about yourself, and plan your target lifestyle.',
  },
  resources: {
    eyebrow: 'About Resources',
    title: 'Find what helps, right when you need it',
    description:
      'Browse practical guides, tools, and support for whatever comes next.',
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
  const userKey = getOnboardingUserKey(session)
  const { state, dismissFeatureBanner } = useOrgOnboarding(orgslug, userKey)

  if (session?.status !== 'authenticated') {
    return null
  }

  if (state.dismissedFeatureBanners[feature]) {
    return null
  }

  const copy = FEATURE_COPY[feature]
  const Icon = feature === 'resources' ? FolderOpen : Award

  return (
    <div className="mb-4 grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-xl bg-[var(--org-primary-color)] px-4 py-3 text-[var(--org-on-primary-color)] shadow-sm">
      <Icon className="h-5 w-5" aria-hidden="true" />
      <div className="min-w-0">
        <h2 className="truncate text-sm font-black">{copy.title}</h2>
        <p className="mt-0.5 truncate text-xs opacity-80">{copy.description}</p>
      </div>
      <button
        type="button"
        onClick={() => dismissFeatureBanner(feature)}
        className="flex h-9 w-9 items-center justify-center rounded-full text-[var(--org-on-primary-color)] opacity-75 transition hover:bg-white/10 hover:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--org-on-primary-color)]"
        aria-label={`Dismiss ${copy.eyebrow}`}
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}
