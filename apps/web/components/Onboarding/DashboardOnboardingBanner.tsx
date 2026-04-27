'use client'

import { ReactNode, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { ArrowRight, FolderOpen, MessageCircle, X } from 'lucide-react'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { Button } from '@components/ui/button'
import { getUriWithOrg, routePaths } from '@services/config/config'
import { getOnboardingUserKey, useOrgOnboarding } from './orgOnboarding'

type ActionCardProps = {
  href: string
  icon: ReactNode
  title: string
  onClick: () => void
}

function ActionCard({
  href,
  icon,
  title,
  onClick,
}: ActionCardProps) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className="group relative z-10 rounded-[6px] border border-white/25 bg-white/12 p-3 text-white backdrop-blur-sm transition-colors hover:bg-white/20"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-[6px] bg-white/15 text-white">
          {icon}
        </div>
        <ArrowRight className="mt-0.5 text-white/55 transition-colors group-hover:text-white" size={16} />
      </div>
      <h3 className="mt-3 text-[13px] font-semibold text-white">{title}</h3>
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

  const coursesHref = getUriWithOrg(orgslug, routePaths.org.courses())
  const communitiesHref = getUriWithOrg(orgslug, routePaths.org.communities())
  const resourcesHref = getUriWithOrg(orgslug, routePaths.org.resources())

  return (
    <section
      className="relative mb-6 overflow-visible rounded-[6px] border border-white/20 bg-blue-900 bg-cover bg-center px-4 py-4 text-white shadow-sm sm:px-5 sm:py-5"
      style={{ backgroundImage: 'url(/rough_blue_background.png)' }}
    >
      <div className="pointer-events-none absolute inset-0 rounded-[6px] bg-white/25" />
      <div className="pointer-events-none absolute inset-y-0 right-0 hidden w-[623px] [clip-path:inset(-120px_-120px_0_-120px)] lg:block">
        <div className="absolute -right-[80px] -top-[30px] h-[339px] w-[623px] -rotate-[30deg]">
          <Image
            src="/jumping_man.png"
            alt=""
            fill
            className="object-contain opacity-95"
            sizes="623px"
            priority
          />
        </div>
      </div>

      {slide === 1 && (
        <button
          type="button"
          onClick={dismissDashboardBanner}
          className="absolute right-3 top-3 z-10 flex h-7 w-7 items-center justify-center rounded-full text-white/70 transition-colors hover:bg-white/15 hover:text-white"
          aria-label="Dismiss onboarding banner"
        >
          <X size={14} />
        </button>
      )}

      {slide === 0 ? (
        <div className="relative z-10 flex flex-col gap-4">
          <div className="min-w-0 flex-1 pr-0 lg:max-w-[calc(100%-190px)] lg:pr-6">
            <h1 className="text-base font-semibold tracking-tight text-white sm:text-lg">
              Everything you need for life launching in one place.
            </h1>
            <p className="mt-1.5 max-w-2xl text-xs leading-5 text-white/82 sm:text-[13px]">
              Finding your target lifestyle starts with understanding yourself. Jump into the Life2launch CORE courses to start your journey!
            </p>

            <div className="mt-3 flex items-center gap-3">
              <div className="flex gap-1.5">
                <span className="h-1.5 w-5 rounded-full bg-white" />
                <span className="h-1.5 w-1.5 rounded-full bg-white/40" />
              </div>
              <Button
                type="button"
                onClick={() => setSlide(1)}
                className="h-8 rounded-[6px] bg-white px-3 text-xs font-semibold text-blue-900 hover:bg-white/90"
              >
                Get Started
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <div className="relative z-10 flex flex-col gap-4">
          <div className="min-w-0 flex-1 pr-0 lg:max-w-[calc(100%-190px)] lg:pr-6">
            <h2 className="pr-8 text-base font-semibold tracking-tight text-white sm:text-lg">
              Pick the part of the platform that feels most useful right now.
            </h2>
            <p className="mt-1.5 max-w-2xl text-xs leading-5 text-white/82 sm:text-[13px]">
              You do not need to do everything at once. Choose the space that
              matches your energy today, and the rest will still be here when you
              need it.
            </p>

            <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              <ActionCard
                href={coursesHref}
                icon={<ArrowRight size={16} />}
                title="Explore Courses"
                onClick={dismissDashboardBanner}
              />
              <ActionCard
                href={communitiesHref}
                icon={<MessageCircle size={16} />}
                title="Join Discussions"
                onClick={dismissDashboardBanner}
              />
              <ActionCard
                href={resourcesHref}
                icon={<FolderOpen size={16} />}
                title="Browse Resources"
                onClick={dismissDashboardBanner}
              />
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
