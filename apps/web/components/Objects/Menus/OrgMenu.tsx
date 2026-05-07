'use client'
import React, { useEffect, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { getAPIUrl, getDefaultOrg, getUriWithOrg, routePaths } from '@services/config/config'
import { swrFetcher } from '@services/utils/ts/requests'
import useSWR from 'swr'
import { getOrgLogoMediaDirectory } from '@services/media/media'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { useOrg } from '@components/Contexts/OrgContext'
import { SearchBar } from '@components/Objects/Search/SearchBar'
import { usePathname } from 'next/navigation'
import { useTranslation } from 'react-i18next'
import { Buildings, CaretDown, Question, SignOut, User } from '@phosphor-icons/react'
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
import { cn } from '@/lib/utils'

const DESKTOP_NAV_COLLAPSED_WIDTH = '80px'
const DESKTOP_NAV_EXPANDED_WIDTH = '264px'

export const OrgMenu = (props: { orgslug: string; autoContractDesktopNav?: boolean }) => {
  const orgslug = props.orgslug
  const autoContractDesktopNav = props.autoContractDesktopNav ?? false
  const session = useLHSession() as any
  const org = useOrg() as any
  const pathname = usePathname()
  const { t } = useTranslation()
  const [, setFocusModeTick] = useState(0)
  const [isDesktopExpanded, setIsDesktopExpanded] = useState(false)
  const [feedbackModalOpen, setFeedbackModalOpen] = useState(false)
  const { isVisible: isJoinBannerVisible } = useJoinBannerVisible()
  const accessToken = session?.data?.tokens?.access_token
  const { data: adminOrgs } = useSWR(
    accessToken ? `${getAPIUrl()}orgs/user_admin/page/1/limit/100` : null,
    (url) => swrFetcher(url, accessToken),
    { revalidateOnFocus: false, revalidateOnMount: true }
  )
  const hasAdminOrgs = Array.isArray(adminOrgs) && adminOrgs.length > 0
  const adminPanelHref = getUriWithOrg(getDefaultOrg(), routePaths.owner.account.orgAdmin())
  const onboardingUserKey = getOnboardingUserKey(session)
  const { state: onboardingState, markFeatureVisited } = useOrgOnboarding(
    orgslug,
    onboardingUserKey
  )

  const topOffset = isJoinBannerVisible ? JOIN_BANNER_HEIGHT : 0
  const config = org?.config?.config
  const resolvedFeatures = config?.resolved_features
  const hideOrgName = config?.customization?.general?.hide_org_name || config?.general?.hide_org_name || false
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
    t,
    isHelpOpen: feedbackModalOpen,
  }).filter((item) => item.show)

  const isDesktopNavExpanded = !autoContractDesktopNav || isDesktopExpanded
  const desktopNavWidth = isDesktopNavExpanded
    ? DESKTOP_NAV_EXPANDED_WIDTH
    : DESKTOP_NAV_COLLAPSED_WIDTH

  const handleDesktopMouseEnter = () => {
    if (
      autoContractDesktopNav &&
      typeof window !== 'undefined' &&
      window.innerWidth >= 1024
    ) {
      setIsDesktopExpanded(true)
    }
  }

  const handleDesktopMouseLeave = () => {
    if (
      autoContractDesktopNav &&
      typeof window !== 'undefined' &&
      window.innerWidth >= 1024
    ) {
      setIsDesktopExpanded(false)
    }
  }

  return (
    <>
      <aside
        className={cn(
          'hidden md:flex md:self-start md:shrink-0',
          autoContractDesktopNav ? 'md:w-20 lg:w-[264px]' : 'md:w-[264px]'
        )}
        onMouseEnter={handleDesktopMouseEnter}
        onMouseLeave={handleDesktopMouseLeave}
        style={{
          top: topOffset,
          height: `calc(100dvh - ${topOffset}px)`,
          position: 'sticky',
          zIndex: 'var(--z-sticky)',
        }}
      >
        <div
          className="flex h-full min-h-0 w-full"
          style={{
            width: desktopNavWidth,
          }}
        >
          <div
            className="flex h-full min-h-0 flex-col overflow-hidden px-4 py-6 transition-[width] duration-200 ease-out"
            style={{
              width: desktopNavWidth,
            }}
          >
            <div className="flex h-10 items-center justify-center">
              <Link
                href={getUriWithOrg(orgslug, '/')}
                className={cn(
                  'flex h-10 items-center overflow-hidden',
                  isDesktopNavExpanded ? 'w-full gap-3 pl-1' : 'w-10 justify-center'
                )}
              >
                <div className="flex h-10 shrink-0 items-center justify-center">
                  {org?.logo_image ? (
                    <img
                      src={getOrgLogoMediaDirectory(org.org_uuid, org.logo_image)}
                      alt="Logo"
                      className={cn(
                        'h-10 w-auto object-contain',
                        isDesktopNavExpanded ? 'max-w-[120px]' : 'max-w-[40px]'
                      )}
                    />
                  ) : (
                    <LaunchLMSIcon />
                  )}
                </div>
                <div className={cn('min-w-0 items-center', isDesktopNavExpanded ? 'flex' : 'hidden')}>
                  {org?.logo_image ? (
                    !hideOrgName && (
                      <span className="truncate text-sm font-semibold text-gray-900">
                        {org?.name}
                      </span>
                    )
                  ) : (
                    <LaunchLMSLogo />
                  )}
                </div>
              </Link>
            </div>

            {isDesktopNavExpanded ? (
              <div className="mt-4 flex h-9 items-center">
                <SearchBar orgslug={orgslug} className="w-full" />
              </div>
            ) : (
              <div className="mt-4 flex h-9 items-center justify-center">
                <SearchBar orgslug={orgslug} isMobile />
              </div>
            )}

            <div className="mt-6 flex min-h-0 flex-1 flex-col justify-center">
              <nav className={cn('flex flex-col gap-1', isDesktopNavExpanded ? 'items-stretch' : 'items-center')}>
                {primaryNavItems.map((item) => (
                  <SidebarItem
                    key={item.href || item.label}
                    item={item}
                    orgslug={orgslug}
                    isExpanded={isDesktopNavExpanded}
                    showOnboardingBadge={
                      item.onboardingFeature
                        ? !onboardingState.visitedFeatures[item.onboardingFeature]
                        : false
                    }
                  />
                ))}
              </nav>
            </div>

            <div className={cn('mt-auto flex flex-col pt-6', isDesktopNavExpanded ? 'items-stretch' : 'items-center')}>
              <nav className={cn('flex flex-col gap-1', isDesktopNavExpanded ? 'items-stretch' : 'items-center')}>
                {adminNavItems.filter((item) => item.actionKey !== 'help').map((item) => (
                  <SidebarItem
                    key={item.href || item.label}
                    item={item}
                    orgslug={orgslug}
                    muted
                    isExpanded={isDesktopNavExpanded}
                    onAction={(actionKey) => {
                      if (actionKey === 'help') {
                        setFeedbackModalOpen(true)
                      }
                    }}
                  />
                ))}
              </nav>

              <div className="mt-6">
                <DesktopAccountLink orgslug={orgslug} onHelp={() => setFeedbackModalOpen(true)} hasAdminOrgs={hasAdminOrgs} adminPanelHref={adminPanelHref} isExpanded={isDesktopNavExpanded} />
              </div>
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
            hasAdminOrgs={hasAdminOrgs}
            adminPanelHref={adminPanelHref}
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
  isExpanded = false,
  onAction,
  showOnboardingBadge = false,
}: SidebarItemProps) {
  const baseClass = item.active
    ? 'bg-black/[0.07] text-gray-950 shadow-[inset_0_0_0_1px_rgba(15,23,42,0.04)]'
    : muted
      ? 'text-gray-400 hover:bg-black/[0.05] hover:text-gray-700'
      : 'text-gray-500 hover:bg-black/[0.05] hover:text-gray-900'

  const sharedClass = cn(
    'relative flex h-11 items-center rounded-2xl transition-colors',
    isExpanded
      ? 'w-full justify-start gap-1 pl-0.5 pr-3'
      : 'w-11 justify-center',
    baseClass
  )

  const content = (
    <>
      <span className="flex h-11 w-11 shrink-0 items-center justify-center">{item.icon}</span>
      <span
        className={cn(
          'truncate text-sm',
          isExpanded ? 'inline' : 'hidden',
          item.active ? 'font-semibold' : 'font-medium'
        )}
      >
        {item.label}
      </span>
      {showOnboardingBadge ? (
        <>
          <span className={cn('absolute h-2.5 w-2.5 rounded-full bg-[#f97316]', isExpanded ? 'right-2.5 top-2.5' : 'right-1.5 top-1.5')} />
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

  if (isExpanded) {
    return element
  }

  return (
    <TooltipProvider delayDuration={0}>
      <Tooltip>
        <TooltipTrigger asChild>{element}</TooltipTrigger>
        <TooltipContent side="right" className="text-xs">
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
  isExpanded?: boolean
  onAction?: React.Dispatch<string | undefined>
  showOnboardingBadge?: boolean
}

function DesktopAccountLink({
  orgslug,
  onHelp,
  hasAdminOrgs,
  adminPanelHref,
  isExpanded,
}: {
  orgslug: string
  onHelp: () => void
  hasAdminOrgs: boolean
  adminPanelHref: string
  isExpanded: boolean
}) {
  const session = useLHSession() as any
  const profileHref = getUriWithOrg(orgslug, routePaths.org.profile())
  const accountHref = getUriWithOrg(orgslug, routePaths.owner.account.security())

  return (
    <DropdownMenu>
      <TooltipProvider delayDuration={0}>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label="Account"
                className={cn(
                  'group/account flex h-11 items-center rounded-2xl text-gray-500 transition-colors hover:bg-black/[0.08] hover:text-gray-900',
                  isExpanded
                    ? 'w-full justify-start gap-1 pl-0.5 pr-3'
                    : 'w-11 justify-center'
                )}
              >
                <div className="flex h-11 w-11 shrink-0 items-center justify-center">
                  <UserAvatar border="border-2" rounded="rounded-xl" width={34} />
                </div>
                <div className={cn('min-w-0 flex-1 text-left leading-tight', isExpanded ? 'block' : 'hidden')}>
                  <p className="truncate text-sm font-semibold text-gray-900 capitalize">
                    {session?.data?.user?.username}
                  </p>
                  <p className="truncate text-xs text-gray-500">{session?.data?.user?.email}</p>
                </div>
                <CaretDown size={16} weight="bold" className={cn('shrink-0 text-gray-400 transition-colors group-hover/account:text-gray-700', isExpanded ? 'block' : 'hidden')} />
              </button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          {!isExpanded && (
            <TooltipContent side="right" className="text-xs">
              {session?.data?.user?.username || 'Account'}
            </TooltipContent>
          )}
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
        {hasAdminOrgs && (
          <DropdownMenuItem asChild>
            <Link href={adminPanelHref} className="flex items-center gap-2">
              <Buildings size={16} weight="fill" />
              <span>Admin panel</span>
            </Link>
          </DropdownMenuItem>
        )}
        <DropdownMenuItem asChild>
          <Link href={profileHref} className="flex items-center gap-2">
            <User size={16} weight="fill" />
            <span>Profile</span>
          </Link>
        </DropdownMenuItem>
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
  hasAdminOrgs,
  adminPanelHref,
}: {
  adminNavItems: OrgMenuNavItem[]
  orgslug: string
  onHelp: () => void
  hasAdminOrgs: boolean
  adminPanelHref: string
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="More"
          className="flex h-12 w-12 items-center justify-center rounded-full text-gray-500 transition-colors hover:bg-black/[0.08] hover:text-gray-900"
        >
          <User size={20} weight="bold" />
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

        {hasAdminOrgs && (
          <DropdownMenuItem asChild>
            <Link
              href={adminPanelHref}
              className="flex items-center gap-3 rounded-xl px-3 py-2"
            >
              <Buildings size={18} weight="fill" />
              <span>Admin panel</span>
            </Link>
          </DropdownMenuItem>
        )}
        <DropdownMenuItem asChild>
          <Link
            href={getUriWithOrg(orgslug, routePaths.org.profile())}
            className="flex items-center gap-3 rounded-xl px-3 py-2"
          >
            <User size={18} weight="fill" />
            <span>Profile</span>
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link
            href={getUriWithOrg(orgslug, routePaths.owner.account.security())}
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
