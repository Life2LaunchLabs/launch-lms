'use client'
import React, { useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { getUriWithOrg, routePaths } from '@services/config/config'
import { getOrgLogoMediaDirectory } from '@services/media/media'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { useOrg } from '@components/Contexts/OrgContext'
import { usePathname } from 'next/navigation'
import { Buildings, CaretDown, ChatCircleDots, Envelope, SidebarSimple, SignOut, Sun, User } from '@phosphor-icons/react'
import { openCandidatePanel } from '@components/Candidate/CandidateExperience'
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
import { getPrimaryOrgMenuItems, OrgMenuNavItem } from './OrgMenuLinks'
import OrgMenuMobile, { NavItemControl, NAV_ACTIVE_CLASS } from './OrgMenuMobile'
import { useHub } from '@components/Hub/HubContext'
import { cn } from '@/lib/utils'
import { Z_INDEX } from '@/lib/z-index'
import useInboxMessages from '@components/Hooks/useInboxMessages'
import { useConnectCounts } from '@components/Connect/useConnect'

const DESKTOP_NAV_COLLAPSED_WIDTH = '44px'
const DESKTOP_NAV_EXPANDED_WIDTH = '264px'
const DESKTOP_NAV_STORAGE_KEY = 'org-menu-collapsed'

export const OrgMenu = (props: { orgslug: string; compact?: boolean }) => {
  const orgslug = props.orgslug
  const session = useLHSession() as any
  const org = useOrg() as any
  const pathname = usePathname()
  const hub = useHub()
  const [isDesktopExpanded, setIsDesktopExpanded] = useState(() => {
    if (typeof window === 'undefined') return true
    return window.localStorage.getItem(DESKTOP_NAV_STORAGE_KEY) !== 'true'
  })
  const { isVisible: isJoinBannerVisible } = useJoinBannerVisible()
  const { unreadCount } = useInboxMessages()
  const connect = useConnectCounts()
  const topOffset = isJoinBannerVisible ? JOIN_BANNER_HEIGHT : 0
  const config = org?.config?.config
  const resolvedFeatures = config?.resolved_features
  const hideOrgName = config?.customization?.general?.hide_org_name || config?.general?.hide_org_name || false
  const isActivityPage = pathname?.includes('/activity/')
  const isCoursePage = /^\/course\/[^/]+$/.test(pathname || '')
  const isPublicCourseExperience = isCoursePage || isActivityPage
  if (session?.status === 'unauthenticated') {
    if (isPublicCourseExperience) {
      return null
    }
    return <GuestHeader orgslug={orgslug} />
  }

  const primaryNavItems = getPrimaryOrgMenuItems({
    pathname,
    resolvedFeatures,
    hubOpen: hub?.state === 'open',
    connectWaiting: connect.unread + connect.requests > 0,
  }).filter((item) => item.show)

  const isDesktopNavExpanded = isDesktopExpanded && !props.compact
  const desktopNavWidth = isDesktopNavExpanded
    ? DESKTOP_NAV_EXPANDED_WIDTH
    : DESKTOP_NAV_COLLAPSED_WIDTH

  const setDesktopExpanded = (expanded: boolean) => {
    setIsDesktopExpanded(expanded)
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(DESKTOP_NAV_STORAGE_KEY, String(!expanded))
    }
  }
  const openFeedback = () => {
    openCandidatePanel('feedback')
  }

  return (
    <>
      <aside
        className={cn(
          'group/sidebar hidden overflow-hidden md:flex md:self-start md:shrink-0 transition-[width,opacity,transform] duration-300 ease-out',
          isActivityPage
            ? 'pointer-events-none md:w-0 -translate-x-4 opacity-0'
            : isDesktopNavExpanded
              ? 'md:w-[264px] translate-x-0 opacity-100'
              : 'md:w-11 translate-x-0 opacity-100'
        )}
        style={{
          top: topOffset,
          height: `calc(100dvh - ${topOffset}px - var(--candidate-experience-height, 0px) - var(--demo-bar-height, 0px))`,
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
            className={cn(
              'flex h-full min-h-0 flex-col overflow-hidden py-6 transition-[width] duration-200 ease-out',
              isDesktopNavExpanded ? 'px-4' : 'px-0'
            )}
            style={{
              width: desktopNavWidth,
            }}
          >
            <div className={cn('flex h-10 items-center', isDesktopNavExpanded ? 'justify-between gap-2' : 'justify-center')}>
              {isDesktopNavExpanded ? (
                <Link
                  href={getUriWithOrg(orgslug, '/')}
                  data-sidebar-logo
                  className="flex h-10 w-full items-center gap-3 overflow-hidden pl-1"
                >
                  <div className="flex h-10 shrink-0 items-center justify-center">
                    {org?.logo_image ? (
                      <img
                        src={getOrgLogoMediaDirectory(org.org_uuid, org.logo_image)}
                        alt="Logo"
                        className="h-10 w-auto max-w-[120px] object-contain"
                      />
                    ) : (
                      <LaunchLMSIcon />
                    )}
                  </div>
                  <div className="flex min-w-0 items-center">
                    {org?.logo_image ? (
                      !hideOrgName && (
                        <span className="truncate text-sm font-semibold text-foreground">
                          {org?.name}
                        </span>
                      )
                    ) : (
                      <LaunchLMSLogo />
                    )}
                  </div>
                </Link>
              ) : (
                <div className="relative h-10 w-10">
                  <Link
                    href={getUriWithOrg(orgslug, '/')}
                    data-sidebar-logo
                    className="absolute inset-0 flex items-center justify-center overflow-hidden transition-opacity duration-150 group-hover/sidebar:pointer-events-none group-hover/sidebar:opacity-0"
                  >
                    {org?.logo_image ? (
                      <img
                        src={getOrgLogoMediaDirectory(org.org_uuid, org.logo_image)}
                        alt="Logo"
                        className="h-10 w-auto max-w-[40px] object-contain"
                      />
                    ) : (
                      <LaunchLMSIcon />
                    )}
                  </Link>
                  <TooltipProvider delayDuration={0}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          onClick={() => setDesktopExpanded(true)}
                          className="absolute inset-0 flex items-center justify-center rounded-2xl text-muted-foreground opacity-0 transition-colors transition-opacity duration-150 hover:bg-foreground/[0.06] hover:text-foreground group-hover/sidebar:opacity-100"
                          aria-label="Open sidebar"
                        >
                          <SidebarSimple size={20} weight="bold" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="right" className="text-xs">
                        Open sidebar
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
              )}
              {isDesktopNavExpanded ? (
                <button
                  type="button"
                  onClick={() => setDesktopExpanded(false)}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl text-muted-foreground transition-colors hover:bg-foreground/[0.06] hover:text-foreground"
                  aria-label="Collapse sidebar"
                >
                  <SidebarSimple size={20} weight="bold" />
                </button>
              ) : null}
            </div>

            <div className="mt-6 flex min-h-0 flex-1 flex-col justify-center">
              <nav className={cn('flex flex-col gap-1', isDesktopNavExpanded ? 'items-stretch' : 'items-center')}>
                {primaryNavItems.map((item) => (
                  <SidebarItem
                    key={item.href || item.label}
                    item={item}
                    orgslug={orgslug}
                    isExpanded={isDesktopNavExpanded}
                  />
                ))}
              </nav>
            </div>

            <div className={cn('mt-auto flex flex-col pt-6', isDesktopNavExpanded ? 'items-stretch' : 'items-center')}>
              <FeedbackSidebarButton onClick={openFeedback} isExpanded={isDesktopNavExpanded} />
              <div className="mt-2">
                <DesktopAccountLink orgslug={orgslug} isExpanded={isDesktopNavExpanded} unreadCount={unreadCount} />
              </div>
            </div>
          </div>
        </div>
      </aside>

      <OrgMenuMobile items={primaryNavItems} orgslug={orgslug} hidden={Boolean(isActivityPage)} unreadCount={unreadCount} />

    </>
  )
}

function SidebarItem({
  item,
  orgslug,
  muted = false,
  isExpanded = false,
}: SidebarItemProps) {
  const baseClass = item.active
    ? NAV_ACTIVE_CLASS
    : muted
      ? 'text-muted-foreground hover:bg-foreground/[0.05] hover:text-muted-foreground'
      : 'text-muted-foreground hover:bg-foreground/[0.05] hover:text-foreground'

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
    </>
  )

  const element = <NavItemControl item={item} orgslug={orgslug} className={sharedClass} dot={item.dot && !item.active}>{content}</NavItemControl>

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

function FeedbackSidebarButton({ onClick, isExpanded }: { onClick: () => void; isExpanded: boolean }) {
  const button = (
    <button
      type="button"
      onClick={onClick}
      aria-label="Send feedback"
      className={cn(
        'relative flex h-11 items-center rounded-2xl text-muted-foreground transition-colors hover:bg-foreground/[0.05] hover:text-foreground',
        isExpanded ? 'w-full justify-start gap-1 pl-0.5 pr-3' : 'w-11 justify-center'
      )}
    >
      <span className="flex h-11 w-11 shrink-0 items-center justify-center"><ChatCircleDots size={22} weight="fill" /></span>
      <span className={cn('truncate text-sm font-medium', isExpanded ? 'inline' : 'hidden')}>Feedback</span>
    </button>
  )

  if (isExpanded) return button

  return (
    <TooltipProvider delayDuration={0}>
      <Tooltip>
        <TooltipTrigger asChild>{button}</TooltipTrigger>
        <TooltipContent side="right" className="text-xs">Feedback</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

type SidebarItemProps = {
  item: OrgMenuNavItem
  orgslug: string
  muted?: boolean
  isExpanded?: boolean
}

function DesktopAccountLink({
  orgslug,
  isExpanded,
  unreadCount,
}: {
  orgslug: string
  isExpanded: boolean
  unreadCount: number
}) {
  const session = useLHSession() as any
  const accountHref = getUriWithOrg(orgslug, routePaths.owner.account.root())

  return (
    <DropdownMenu modal={false}>
      <TooltipProvider delayDuration={0}>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label="Account"
                className={cn(
                  'group/account flex h-11 items-center rounded-2xl text-muted-foreground transition-colors hover:bg-foreground/[0.08] hover:text-foreground',
                  isExpanded
                    ? 'w-full justify-start gap-1 pl-0.5 pr-3'
                    : 'w-11 justify-center'
                )}
              >
                <div className="flex h-11 w-11 shrink-0 items-center justify-center">
                  <span className="relative"><UserAvatar border="border-2" rounded="rounded-xl" width={34} />{unreadCount > 0 ? <span className="absolute -right-1.5 -top-1.5 flex min-h-4 min-w-4 items-center justify-center rounded-full bg-blue-600 px-1 text-[9px] font-black leading-none text-white ring-2 ring-background">{unreadCount > 9 ? '9+' : unreadCount}</span> : null}</span>
                </div>
                <div className={cn('min-w-0 flex-1 text-left leading-tight', isExpanded ? 'block' : 'hidden')}>
                  <p className="truncate text-sm font-semibold text-foreground capitalize">
                    {session?.data?.user?.username}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">{session?.data?.user?.email}</p>
                </div>
                <CaretDown size={16} weight="bold" className={cn('shrink-0 text-muted-foreground transition-colors group-hover/account:text-muted-foreground', isExpanded ? 'block' : 'hidden')} />
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
      <DropdownMenuContent
        side={isExpanded ? 'top' : 'right'}
        align={isExpanded ? 'start' : 'end'}
        sideOffset={isExpanded ? 8 : 12}
        className="w-56"
        style={{ zIndex: Z_INDEX.NAV_MENU + 1 }}
      >
        <DropdownMenuLabel>
          <div className="flex items-center gap-2">
            <UserAvatar border="border-2" rounded="rounded-full" width={24} shadow="" />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium capitalize">{session?.data?.user?.username}</p>
              <p className="truncate text-xs text-muted-foreground">{session?.data?.user?.email}</p>
            </div>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href={accountHref} className="flex items-center gap-2">
            <User size={16} weight="fill" /><span>Account</span>
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href={getUriWithOrg(orgslug, routePaths.owner.account.messages())} className="flex items-center gap-2">
            <Envelope size={16} weight="fill" />
            <span className="flex-1">Messages</span>
            {unreadCount > 0 ? <span className="flex min-w-5 items-center justify-center rounded-full bg-blue-600 px-1.5 py-0.5 text-[10px] font-black text-white">{unreadCount}</span> : null}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href={getUriWithOrg(orgslug, routePaths.owner.account.organizations())} className="flex items-center gap-2">
            <Buildings size={16} weight="fill" /><span>Organizations</span>
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href={getUriWithOrg(orgslug, routePaths.owner.account.preferences())} className="flex items-center gap-2">
            <Sun size={16} weight="fill" /><span>Appearance</span>
          </Link>
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
