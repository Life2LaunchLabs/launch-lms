'use client'
import React, { useEffect, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { getUriWithOrg, routePaths } from '@services/config/config'
import { getOrgLogoMediaDirectory } from '@services/media/media'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { useOrg } from '@components/Contexts/OrgContext'
import { SearchBar } from '@components/Objects/Search/SearchBar'
import { usePathname } from 'next/navigation'
import { useTranslation } from 'react-i18next'
import useAdminStatus from '@components/Hooks/useAdminStatus'
import { CaretDown, DotsThreeVertical, Question, SignOut, User } from '@phosphor-icons/react'
import { FeedbackModal } from '@components/Objects/Modals/FeedbackModal'
import { useJoinBannerVisible, JOIN_BANNER_HEIGHT } from '@components/Objects/Banners/OrgJoinBanner'
import { GuestHeader } from '@components/Objects/Menus/GuestHeader'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@components/ui/tooltip'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@components/ui/dropdown-menu'
import { signOut } from '@components/Contexts/AuthContext'
import UserAvatar from '@components/Objects/UserAvatar'
import {
  getAdministrativeOrgMenuItems,
  getPrimaryOrgMenuItems,
  OrgMenuNavItem,
} from './OrgMenuLinks'
import {
  getOnboardingUserKey,
  OnboardingFeatureKey,
  useOrgOnboarding,
} from '@components/Onboarding/orgOnboarding'

export const OrgMenu = (props: { orgslug: string }) => {
  const orgslug = props.orgslug
  const session = useLHSession() as any
  const org = useOrg() as any
  const pathname = usePathname()
  const { t } = useTranslation()
  const { rights } = useAdminStatus()
  const [, setFocusModeTick] = useState(0)
  const [feedbackModalOpen, setFeedbackModalOpen] = useState(false)
  const { isVisible: isJoinBannerVisible } = useJoinBannerVisible()
  const onboardingUserKey = getOnboardingUserKey(session)
  const { state: onboardingState, markFeatureVisited } = useOrgOnboarding(
    orgslug,
    onboardingUserKey
  )

  const topOffset = isJoinBannerVisible ? JOIN_BANNER_HEIGHT : 0
  const config = org?.config?.config
  const resolvedFeatures = config?.resolved_features
  const isActivityPage = pathname?.includes('/activity/')
  const isCoursePage = /^\/course\/[^/]+$/.test(pathname || '')
  const isPublicCourseExperience = isCoursePage || isActivityPage
  const isFocusMode =
    isActivityPage &&
    typeof window !== 'undefined' &&
    localStorage.getItem('globalFocusMode') === 'true'

  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'globalFocusMode' && isActivityPage) {
        setFocusModeTick((current) => current + 1)
      }
    }

    const handleFocusModeChange = (event: Event) => {
      if (isActivityPage) {
        const customEvent = event as CustomEvent<{ isFocusMode?: boolean }>
        if (typeof customEvent.detail?.isFocusMode === 'boolean') {
          setFocusModeTick((current) => current + 1)
        }
      }
    }

    window.addEventListener('storage', handleStorageChange)
    window.addEventListener('focusModeChange', handleFocusModeChange)

    return () => {
      window.removeEventListener('storage', handleStorageChange)
      window.removeEventListener('focusModeChange', handleFocusModeChange)
    }
  }, [isActivityPage])

  useEffect(() => {
    if (session?.status !== 'authenticated' || !pathname) {
      return
    }

    const featureMatchers: Array<{
      feature: OnboardingFeatureKey
      matches: boolean
    }> = [
      {
        feature: 'courses',
        matches:
          pathname.includes('/courses') ||
          pathname.includes('/course/') ||
          pathname.includes('/collection/'),
      },
      {
        feature: 'communities',
        matches:
          pathname.includes('/communities') || pathname.includes('/community/'),
      },
      {
        feature: 'resources',
        matches:
          pathname.includes('/resources') || pathname.includes('/resource/'),
      },
    ]

    featureMatchers.forEach(({ feature, matches }) => {
      if (matches && !onboardingState.visitedFeatures[feature]) {
        markFeatureVisited(feature)
      }
    })
  }, [markFeatureVisited, onboardingState.visitedFeatures, pathname, session?.status])

  if (isActivityPage && isFocusMode) {
    return null
  }

  if (session?.status === 'unauthenticated') {
    if (isPublicCourseExperience) {
      return null
    }
    return <GuestHeader orgslug={orgslug} />
  }

  const primaryNavItems = getPrimaryOrgMenuItems({
    pathname,
    resolvedFeatures,
    t,
  }).filter((item) => item.show)

  const adminNavItems = getAdministrativeOrgMenuItems({
    pathname,
    t,
    canAccessDashboard: rights?.dashboard?.action_access === true,
    isHelpOpen: feedbackModalOpen,
  }).filter((item) => item.show)

  return (
    <>
      <aside
        className="hidden md:flex md:self-start md:shrink-0 md:w-20 lg:w-[300px]"
        style={{
          top: topOffset,
          height: `calc(100vh - ${topOffset}px)`,
          position: 'sticky',
          zIndex: 'var(--z-sticky)',
        }}
      >
        <div
          className="flex h-full min-h-0 w-full flex-col px-4 py-6 lg:px-6 lg:py-7"
        >
          <div className="flex justify-center lg:justify-start">
            <Link href={getUriWithOrg(orgslug, '/')} className="flex items-center justify-center">
              <div className="md:flex lg:hidden">
                {org?.logo_image ? (
                  <img
                    src={getOrgLogoMediaDirectory(org.org_uuid, org.logo_image)}
                    alt="Logo"
                    className="h-10 w-10 rounded-xl object-cover"
                  />
                ) : (
                  <LaunchLMSIcon />
                )}
              </div>
              <div className="hidden h-10 w-auto items-center justify-start rounded-md py-1 lg:flex">
                {org?.logo_image ? (
                  <img
                    src={getOrgLogoMediaDirectory(org.org_uuid, org.logo_image)}
                    alt="Logo"
                    style={{ width: 'auto', height: '100%' }}
                    className="rounded-md"
                  />
                ) : (
                  <LaunchLMSLogo />
                )}
              </div>
            </Link>
          </div>

          <div className="mt-4 hidden lg:block">
            <SearchBar orgslug={orgslug} className="w-full" />
          </div>
          <div className="mt-4 flex justify-center lg:hidden">
            <SearchBar orgslug={orgslug} isMobile />
          </div>

          <div className="mt-6 min-h-0 flex-1 overflow-y-auto">
            <nav className="flex flex-col items-center gap-1 lg:items-stretch">
              {primaryNavItems.map((item) => (
                <SidebarItem
                  key={item.href || item.label}
                  item={item}
                  orgslug={orgslug}
                  showOnboardingBadge={
                    item.onboardingFeature
                      ? !onboardingState.visitedFeatures[item.onboardingFeature]
                      : false
                  }
                />
              ))}
            </nav>
          </div>

          <div className="mt-auto flex flex-col items-center pt-6 lg:items-stretch">
            <nav className="flex flex-col items-center gap-1 lg:items-stretch">
              {adminNavItems.filter((item) => item.actionKey !== 'help').map((item) => (
                <SidebarItem
                  key={item.href || item.label}
                  item={item}
                  orgslug={orgslug}
                  muted
                  onAction={(actionKey) => {
                    if (actionKey === 'help') {
                      setFeedbackModalOpen(true)
                    }
                  }}
                />
              ))}
            </nav>

            <div className="mt-6">
              <DesktopAccountLink orgslug={orgslug} onHelp={() => setFeedbackModalOpen(true)} />
            </div>
          </div>
        </div>
      </aside>

      <nav
        aria-label="Mobile navigation"
        className="fixed inset-x-0 bottom-4 z-[var(--z-nav)] flex justify-center px-4 md:hidden"
        style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 0px)' }}
      >
        <div className="pointer-events-auto flex items-center gap-1 rounded-full border border-black/5 bg-white/95 p-2 shadow-[0_20px_45px_rgba(15,23,42,0.16)] backdrop-blur-xl">
          {primaryNavItems.map((item) => (
            <MobileNavItem
              key={item.href || item.label}
              item={item}
              orgslug={orgslug}
              showOnboardingBadge={
                item.onboardingFeature
                  ? !onboardingState.visitedFeatures[item.onboardingFeature]
                  : false
              }
            />
          ))}
          <MobileMoreMenu
            adminNavItems={adminNavItems}
            orgslug={orgslug}
            onHelp={() => setFeedbackModalOpen(true)}
          />
        </div>
      </nav>

      <FeedbackModal
        open={feedbackModalOpen}
        onOpenChange={setFeedbackModalOpen}
        theme="light"
        userName={session?.data?.user?.username}
        userEmail={session?.data?.user?.email}
      />
    </>
  )
}

function SidebarItem({
  item,
  orgslug,
  muted = false,
  onAction,
  showOnboardingBadge = false,
}: SidebarItemProps) {
  const baseClass = item.active
    ? 'bg-black/[0.07] text-gray-950 shadow-[inset_0_0_0_1px_rgba(15,23,42,0.04)]'
    : muted
      ? 'text-gray-400 hover:bg-black/[0.05] hover:text-gray-700'
      : 'text-gray-500 hover:bg-black/[0.05] hover:text-gray-900'

  const sharedClass = `relative flex h-11 w-11 items-center justify-center rounded-2xl transition-colors lg:h-auto lg:w-full lg:justify-start lg:gap-3 lg:px-3 lg:py-2.5 ${baseClass}`

  const content = (
    <>
      <span className="shrink-0">{item.icon}</span>
      <span className={`hidden truncate text-sm lg:inline ${item.active ? 'font-semibold' : 'font-medium'}`}>{item.label}</span>
      {showOnboardingBadge ? (
        <>
          <span className="absolute right-1.5 top-1.5 h-2.5 w-2.5 rounded-full bg-[#f97316] lg:hidden" />
          <span className="absolute right-2.5 top-2.5 hidden h-2.5 w-2.5 rounded-full bg-[#f97316] lg:block" />
        </>
      ) : null}
    </>
  )

  const element =
    item.kind === 'action' ? (
      <button
        type="button"
        onClick={() => onAction?.(item.actionKey)}
        aria-label={item.label}
        className={sharedClass}
      >
        {content}
      </button>
    ) : (
      <Link
        href={getUriWithOrg(orgslug, item.href || '/')}
        aria-label={item.label}
        className={sharedClass}
      >
        {content}
      </Link>
    )

  return (
    <TooltipProvider delayDuration={0}>
      <Tooltip>
        <TooltipTrigger asChild>{element}</TooltipTrigger>
        <TooltipContent side="right" className="text-xs lg:hidden">
          {item.label}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

type SidebarItemProps = {
  item: OrgMenuNavItem
  orgslug: string
  muted?: boolean
  onAction?: React.Dispatch<string | undefined>
  showOnboardingBadge?: boolean
}

function DesktopAccountLink({
  orgslug,
  onHelp,
}: {
  orgslug: string
  onHelp: () => void
}) {
  const session = useLHSession() as any
  const accountHref = getUriWithOrg(orgslug, routePaths.owner.account.general())

  return (
    <DropdownMenu>
      <TooltipProvider delayDuration={0}>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label="Account"
                className="group flex h-11 w-11 items-center justify-center rounded-2xl text-gray-500 transition-colors hover:bg-black/[0.08] hover:text-gray-900 lg:h-auto lg:w-full lg:justify-start lg:gap-3 lg:px-3 lg:py-3"
              >
                <UserAvatar border="border-2" rounded="rounded-xl" width={34} />
                <div className="hidden min-w-0 flex-1 text-left lg:block">
                  <p className="truncate text-sm font-semibold text-gray-900 capitalize">
                    {session?.data?.user?.username}
                  </p>
                  <p className="truncate text-xs text-gray-500">{session?.data?.user?.email}</p>
                </div>
                <CaretDown size={16} weight="bold" className="hidden shrink-0 text-gray-400 transition-colors group-hover:text-gray-700 lg:block" />
              </button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent side="right" className="text-xs lg:hidden">
            {session?.data?.user?.username || 'Account'}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <DropdownMenuContent side="top" align="start" className="mb-2 w-56">
        <DropdownMenuLabel>
          <div className="flex items-center gap-2">
            <UserAvatar border="border-2" rounded="rounded-full" width={24} shadow="" />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium capitalize">{session?.data?.user?.username}</p>
              <p className="truncate text-xs text-gray-500">{session?.data?.user?.email}</p>
            </div>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href={accountHref} className="flex items-center gap-2">
            <User size={16} weight="fill" />
            <span>Account settings</span>
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={onHelp}
          className="flex items-center gap-2"
        >
          <Question size={16} weight="fill" />
          <span>Help &amp; feedback</span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => signOut({ callbackUrl: '/' })}
          className="flex items-center gap-2 text-red-600 focus:text-red-600"
        >
          <SignOut size={16} weight="fill" />
          <span>Sign out</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function MobileNavItem({
  item,
  orgslug,
  showOnboardingBadge = false,
}: {
  item: OrgMenuNavItem
  orgslug: string
  showOnboardingBadge?: boolean
}) {
  return (
    <Link
      href={getUriWithOrg(orgslug, item.href || '/')}
      aria-label={item.label}
      className={`relative flex h-12 w-12 items-center justify-center rounded-full transition-colors ${
        item.active
          ? 'bg-black/[0.12] text-gray-950 shadow-[inset_0_0_0_1px_rgba(15,23,42,0.04)]'
          : 'text-gray-500 hover:bg-black/[0.08] hover:text-gray-900'
      }`}
    >
      {item.icon}
      {showOnboardingBadge ? (
        <span className="absolute right-1.5 top-1.5 h-2.5 w-2.5 rounded-full bg-[#f97316]" />
      ) : null}
    </Link>
  )
}

function MobileMoreMenu({
  adminNavItems,
  orgslug,
  onHelp,
}: {
  adminNavItems: OrgMenuNavItem[]
  orgslug: string
  onHelp: () => void
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="More"
          className="flex h-12 w-12 items-center justify-center rounded-full text-gray-500 transition-colors hover:bg-black/[0.08] hover:text-gray-900"
        >
          <DotsThreeVertical size={20} weight="bold" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" side="top" className="mb-3 w-48 rounded-2xl p-2">
        {adminNavItems.map((item) => {
          if (item.kind === 'action') {
            return (
              <DropdownMenuItem
                key={item.label}
                onClick={onHelp}
                className="flex items-center gap-3 rounded-xl px-3 py-2"
              >
                {item.icon}
                <span>{item.label}</span>
              </DropdownMenuItem>
            )
          }

          return (
            <DropdownMenuItem key={item.href} asChild>
              <Link
                href={getUriWithOrg(orgslug, item.href || '/')}
                className="flex items-center gap-3 rounded-xl px-3 py-2"
              >
                {item.icon}
                <span>{item.label}</span>
              </Link>
            </DropdownMenuItem>
          )
        })}

        <DropdownMenuItem asChild>
          <Link
            href={getUriWithOrg(orgslug, routePaths.owner.account.general())}
            className="flex items-center gap-3 rounded-xl px-3 py-2"
          >
            <UserAvatar border="border-2" rounded="rounded-full" width={18} shadow="" />
            <span>Account</span>
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => signOut({ callbackUrl: '/' })}
          className="flex items-center gap-3 rounded-xl px-3 py-2 text-red-600 focus:text-red-600"
        >
          <SignOut size={18} weight="fill" />
          <span>Sign out</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

const LaunchLMSLogo = () => {
  return (
    <Image
      src="/logo-text.svg"
      alt="Launch LMS logo"
      width={133}
      height={40}
      style={{ height: 'auto' }}
    />
  )
}

const LaunchLMSIcon = () => {
  return (
    <Image
      src="/logo-icon.svg"
      alt="Launch LMS logo"
      width={40}
      height={40}
      className="h-10 w-10"
    />
  )
}
