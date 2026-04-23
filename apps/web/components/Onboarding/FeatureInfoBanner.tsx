'use client'

import { X } from 'lucide-react'
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
  courses: {
    eyebrow: 'About Courses',
    title: 'Start with something that feels doable today.',
    description:
      'Courses are your guided learning path. Open a collection or course that matches where you are right now, make progress, and come back whenever you want your next step laid out clearly.',
  },
  communities: {
    eyebrow: 'About Communities',
    title: 'Ask questions, share wins, and learn in public.',
    description:
      'Communities are where momentum becomes social. Join a discussion, react to something useful, or introduce yourself so the platform feels like a place you belong, not just a place you visit.',
  },
  resources: {
    eyebrow: 'About Resources',
    title: 'Use resources when you need quick help between bigger steps.',
    description:
      'Resources are tools, guides, and helpful links you can return to anytime. Browse by channel, save what is useful, and treat this area like your practical support shelf while you launch.',
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

  return (
    <div className="relative mb-4 overflow-hidden rounded-[6px] border border-black/10 bg-[#fafafa] px-4 py-3 sm:px-5">
      <button
        type="button"
        onClick={() => dismissFeatureBanner(feature)}
        className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-black/[0.04] hover:text-gray-700"
        aria-label={`Dismiss ${copy.eyebrow}`}
      >
        <X size={14} />
      </button>

      <div className="max-w-3xl pr-9">
        <h2 className="text-sm font-semibold tracking-tight text-gray-900 sm:text-[15px]">
          {copy.title}
        </h2>
        <p className="mt-1 text-xs leading-5 text-gray-600 sm:text-[13px]">
          {copy.description}
        </p>
      </div>
    </div>
  )
}
