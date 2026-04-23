'use client'

import { ReactNode, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { ArrowRight, Compass, FolderOpen, MessageCircle, X } from 'lucide-react'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { Button } from '@components/ui/button'
import { getUriWithOrg, routePaths } from '@services/config/config'
import { getOnboardingUserKey, useOrgOnboarding } from './orgOnboarding'

type ActionCardProps = {
  href: string
  icon: ReactNode
  title: string
  description: string
  onClick: () => void
}

function ActionCard({
  href,
  icon,
  title,
  description,
  onClick,
}: ActionCardProps) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className="group rounded-[6px] border border-black/8 bg-white p-3 transition-colors hover:bg-black/[0.02]"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-[6px] bg-black/[0.04] text-gray-700">
          {icon}
        </div>
        <ArrowRight className="mt-0.5 text-gray-300 transition-colors group-hover:text-gray-500" size={16} />
      </div>
      <h3 className="mt-3 text-[13px] font-semibold text-gray-900">{title}</h3>
      <p className="mt-1 text-xs leading-5 text-gray-500">{description}</p>
    </Link>
  )
}

export default function DashboardOnboardingBanner({
  orgslug,
}: {
  orgslug: string
}) {
  const session = useLHSession() as any
  const userKey = getOnboardingUserKey(session)
  const { state, dismissDashboardBanner } = useOrgOnboarding(orgslug, userKey)
  const [slide, setSlide] = useState(0)

  if (session?.status !== 'authenticated') {
    return null
  }

  if (state.dashboardBannerDismissed) {
    return null
  }

  const quickstartHref = getUriWithOrg(orgslug, routePaths.org.quickstart())
  const coursesHref = getUriWithOrg(orgslug, routePaths.org.courses())
  const communitiesHref = getUriWithOrg(orgslug, routePaths.org.communities())
  const resourcesHref = getUriWithOrg(orgslug, routePaths.org.resources())

  return (
    <section className="relative mb-6 overflow-visible rounded-[6px] border border-black/10 bg-[#fafafa] px-4 py-4 sm:px-5 sm:py-5">
      <div className="pointer-events-none absolute inset-y-0 right-0 hidden w-[623px] [clip-path:inset(-120px_-120px_0_-120px)] lg:block">
        <div className="absolute -right-[80px] -top-[30px] h-[339px] w-[623px] -rotate-[30deg]">
          <Image
            src="/jumping_man.png"
            alt=""
            fill
            className="object-contain"
            sizes="623px"
            priority
          />
        </div>
      </div>

      {slide === 1 && (
        <button
          type="button"
          onClick={dismissDashboardBanner}
          className="absolute right-3 top-3 z-10 flex h-7 w-7 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-black/[0.04] hover:text-gray-700"
          aria-label="Dismiss onboarding banner"
        >
          <X size={14} />
        </button>
      )}

      {slide === 0 ? (
        <div className="relative z-10 flex flex-col gap-4">
          <div className="min-w-0 flex-1 pr-0 lg:max-w-[calc(100%-190px)] lg:pr-6">
            <h2 className="text-base font-semibold tracking-tight text-gray-900 sm:text-lg">
              Learn here, talk here, and keep useful support close by.
            </h2>
            <p className="mt-1.5 max-w-2xl text-xs leading-5 text-gray-600 sm:text-[13px]">
              Courses give you structured progress, communities give you
              conversation and accountability, and resources give you quick tools
              to use whenever life launching gets messy or practical.
            </p>

            <div className="mt-3 flex items-center gap-3">
              <div className="flex gap-1.5">
                <span className="h-1.5 w-5 rounded-full bg-gray-900" />
                <span className="h-1.5 w-1.5 rounded-full bg-gray-300" />
              </div>
              <Button
                type="button"
                onClick={() => setSlide(1)}
                className="h-8 rounded-[6px] bg-gray-900 px-3 text-xs font-semibold text-white hover:bg-gray-800"
              >
                Next
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <div className="relative z-10 flex flex-col gap-4">
          <div className="min-w-0 flex-1 pr-0 lg:max-w-[calc(100%-190px)] lg:pr-6">
            <h2 className="pr-8 text-base font-semibold tracking-tight text-gray-900 sm:text-lg">
              Pick the part of the platform that feels most useful right now.
            </h2>
            <p className="mt-1.5 max-w-2xl text-xs leading-5 text-gray-600 sm:text-[13px]">
              You do not need to do everything at once. Choose the space that
              matches your energy today, and the rest will still be here when you
              need it.
            </p>

            <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
              <ActionCard
                href={quickstartHref}
                icon={<Compass size={16} />}
                title="Continue Quickstart"
                description="Return to the guided starting point and keep your momentum moving."
                onClick={dismissDashboardBanner}
              />
              <ActionCard
                href={coursesHref}
                icon={<ArrowRight size={16} />}
                title="Explore Courses"
                description="Open a collection or course and start learning in a more structured way."
                onClick={dismissDashboardBanner}
              />
              <ActionCard
                href={communitiesHref}
                icon={<MessageCircle size={16} />}
                title="Join Discussions"
                description="See what people are talking about and jump into the conversation."
                onClick={dismissDashboardBanner}
              />
              <ActionCard
                href={resourcesHref}
                icon={<FolderOpen size={16} />}
                title="Browse Resources"
                description="Find useful tools, guides, and support materials you can revisit anytime."
                onClick={dismissDashboardBanner}
              />
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
