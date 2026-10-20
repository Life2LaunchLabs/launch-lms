'use client'
import { useOrg } from '@components/Contexts/OrgContext'
import { signOut } from '@components/Contexts/AuthContext'
import {
  House,
  Globe,
  Gear,
  SignOut,
  SidebarSimple,
  Check,
  CaretDown,
  UserCircle,
  LockSimple,
} from '@phosphor-icons/react'
import Link from 'next/link'
import React, { useState } from 'react'
import { usePathname } from 'next/navigation'
import UserAvatar from '../../Objects/UserAvatar'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { getUriWithOrg, getDefaultOrg, routePaths } from '@services/config/config'
import { platformSections } from '@components/Admin/Platform/platformSections'
import { authenticatedOrgHref } from '@services/auth/handoff'
import { useTranslation } from 'react-i18next'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@components/ui/tooltip"
import {
  HoverMenu,
  HoverMenuContent,
  HoverMenuItem,
  HoverMenuLabel,
  HoverMenuSeparator,
} from "@components/ui/hover-menu"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@components/ui/dropdown-menu'
import DashFeedbackButton from './DashFeedbackButton'
import NavPill from './NavPill'
import ExperienceSwitcher from '@components/Objects/Menus/ExperienceSwitcher'
import { ADMIN_NAV_ICONS, PLATFORM_NAV_ICONS } from '@components/Admin/adminNavIcons'
import RequestAccessButton, { accessRequestLabel } from '@components/Admin/RequestAccessButton'
import { AVAILABLE_LANGUAGES } from '@/lib/languages'
import { adminLabel, adminTabForPath, type VisibleNavItem } from '@/lib/admin/registry'
import { usePlansNavTabs } from '@components/Admin/Plans/usePlansNavTabs'
import { getOrgLogoMediaDirectory } from '@services/media/media'
import { cn } from '@/lib/utils'
import { useFeatures } from '@components/Hooks/useFeatures'
import { PLAN_LABELS } from '@services/plans/plans'

const TOOLTIP_CLASS = "z-tooltip bg-[#1a1a1b] border-white/10 text-white text-xs px-2 py-1 shadow-lg shadow-black/20"
const COLLAPSED_KEY = 'dash-menu-collapsed'

/** The admin sidebar: the registry's tabs for this viewer, the platform pages for superadmins, then feedback and the account menu. */
function DashLeftMenu() {
  const org = useOrg() as any
  const session = useLHSession() as any
  const features = useFeatures()
  const { t, i18n } = useTranslation()
  const pathname = usePathname() || ''
  const [isCollapsed, setIsCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false
    return localStorage.getItem(COLLAPSED_KEY) === 'true'
  })

  const setCollapsed = (collapsed: boolean) => {
    setIsCollapsed(collapsed)
    localStorage.setItem(COLLAPSED_KEY, String(collapsed))
  }

  async function logOutUI() {
    await signOut({ redirect: true, callbackUrl: getUriWithOrg(org.slug, '/login') })
  }

  const tabs = usePlansNavTabs(features.adminTabs())

  if (!org || !session) return null

  const active = adminTabForPath(pathname)
  const showPlatform = org.slug === getDefaultOrg() && features.isSuperadmin
  const logo = org.logo_image
    ? <img src={getOrgLogoMediaDirectory(org.org_uuid, org.logo_image)} alt={org.name} className="h-9 w-9 object-contain rounded-lg" />
    : <img src="/logo-icon.svg" alt="Launch LMS logo" className="h-8 w-8" />

  return (
    <TooltipProvider delayDuration={0}>
    <nav
      aria-label="Dashboard sidebar navigation"
      className={cn(
        "group/sidebar flex h-[100dvh] max-h-[100dvh] min-h-0 flex-col text-white sticky top-0 z-overlay border-r border-white/[0.08] bg-[#0f0f10] transition-all duration-300",
        isCollapsed ? "w-[72px]" : "w-64"
      )}
    >
      <div className={cn(
        "flex items-center h-16 border-b border-white/[0.08] px-4 shrink-0",
        isCollapsed ? "justify-center" : "justify-between"
      )}>
        {isCollapsed ? (
          <div className="relative h-10 w-10">
            <Link
              className="absolute inset-0 flex items-center justify-center rounded-xl transition-opacity hover:opacity-70 group-hover/sidebar:pointer-events-none group-hover/sidebar:opacity-0"
              href={routePaths.org.admin.root()}
              aria-label="Dashboard home"
            >
              {logo}
            </Link>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  aria-label="Expand sidebar"
                  onClick={() => setCollapsed(false)}
                  className="absolute inset-0 flex items-center justify-center rounded-xl bg-white/[0.08] text-white/50 opacity-0 transition-all hover:bg-white/[0.12] hover:text-white group-hover/sidebar:opacity-100"
                >
                  <SidebarSimple size={20} weight="fill" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right" className={TOOLTIP_CLASS}>{t('common.expand')}</TooltipContent>
            </Tooltip>
          </div>
        ) : (
          <>
            <ExperienceSwitcher
              current={{ side: 'admin', orgslug: org.slug }}
              homeHref={routePaths.org.admin.root()}
              tone="dark"
              className="-ml-2 flex min-w-0 flex-1 items-center gap-3 rounded-lg px-2 py-1.5 transition-colors hover:bg-white/[0.08]"
            >
              {logo}
              <div className="flex flex-col min-w-0">
                <span className="font-semibold text-sm text-white truncate">{org.name}</span>
                <span className="text-[9px] font-medium uppercase tracking-wider text-green-400">{PLAN_LABELS[features.plan] ?? features.plan}</span>
              </div>
            </ExperienceSwitcher>
            <button
              aria-label="Collapse sidebar"
              onClick={() => setCollapsed(true)}
              className="p-2 rounded-lg text-white/40 hover:text-white hover:bg-white/[0.08] transition-all"
            >
              <SidebarSimple size={18} weight="fill" />
            </button>
          </>
        )}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-3 py-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="space-y-1">
          {tabs.map((tab) => (
            <NavEntry key={tab.id} item={tab} isActive={active?.tab.id === tab.id} isCollapsed={isCollapsed} />
          ))}
        </div>
      </div>

      {showPlatform && (
        <div className="border-t border-amber-400/20 mt-1 pt-2 px-3 pb-1">
          {!isCollapsed && (
            <p className="text-[9px] font-semibold uppercase tracking-widest text-amber-400/60 px-1 mb-1">Platform</p>
          )}
          {platformSections().map((section) => {
            const Icon = PLATFORM_NAV_ICONS[section.id]
            const isActive = section.exact
              ? pathname === `/orgs/${org.slug}${section.href}` || pathname === section.href
              : pathname.startsWith(`/orgs/${org.slug}${section.href}`) || pathname.startsWith(section.href)
            return (
              <Link
                key={section.href}
                href={getUriWithOrg(org.slug, section.href)}
                aria-label={section.label}
                className={cn(
                  "flex items-center w-full rounded-lg transition-all",
                  isCollapsed ? "justify-center h-10" : "px-3 py-2 gap-3",
                  isActive ? "bg-amber-400/10 text-amber-300" : "text-amber-400/70 hover:text-amber-300 hover:bg-amber-400/10"
                )}
              >
                <Icon size={20} weight="fill" />
                {!isCollapsed && <span className="text-sm font-medium">{section.label}</span>}
              </Link>
            )
          })}
        </div>
      )}

      <div className="border-t border-white/[0.08] py-3 px-3 shrink-0">
        <DashFeedbackButton isCollapsed={isCollapsed} />
        <DropdownMenu modal={false}>
          <Tooltip>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>
                <button className={cn(
                  "group/account flex items-center w-full rounded-lg text-white/50 hover:text-white hover:bg-white/[0.08] transition-all",
                  isCollapsed ? "justify-center h-10" : "px-3 py-2 gap-3"
                )}>
                  <UserAvatar width={24} rounded="rounded-full" shadow="shadow-none" />
                  {!isCollapsed && (
                    <>
                      <div className="flex flex-col min-w-0 flex-1 text-left">
                        <span className="text-sm font-medium truncate text-white/90">{session?.data?.user?.username}</span>
                        <span className="text-xs text-white/40 truncate">{session?.data?.user?.email}</span>
                      </div>
                      <CaretDown size={16} weight="bold" className="shrink-0 text-white/30 transition-colors group-hover/account:text-white/60" />
                    </>
                  )}
                </button>
              </DropdownMenuTrigger>
            </TooltipTrigger>
            {isCollapsed && (
              <TooltipContent side="right" className={TOOLTIP_CLASS}>{session?.data?.user?.username || 'Account'}</TooltipContent>
            )}
          </Tooltip>
          <DropdownMenuContent
            side={isCollapsed ? 'right' : 'top'}
            align={isCollapsed ? 'end' : 'start'}
            sideOffset={isCollapsed ? 12 : 8}
            className="w-64 border-white/10 bg-[#1a1a1b] p-1 text-white shadow-xl shadow-black/25"
          >
            <DropdownMenuLabel className="px-3 py-2">
              <div className="flex items-center gap-2">
                <UserAvatar border="border-2" rounded="rounded-full" width={24} shadow="" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold capitalize text-white/90">{session?.data?.user?.username}</p>
                  <p className="truncate text-xs font-normal text-white/40">{session?.data?.user?.email}</p>
                </div>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator className="bg-white/[0.08]" />
            <DropdownMenuItem asChild>
              <Link href={authenticatedOrgHref(getUriWithOrg(getDefaultOrg(), routePaths.owner.root()), true)} className="flex items-center gap-2 rounded-md px-3 py-2 text-white/70 focus:bg-white/[0.08] focus:text-white">
                <House size={16} weight="fill" />
                <span>Return to User Experience</span>
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger className="rounded-md px-3 py-2 text-white/70 focus:bg-white/[0.08] focus:text-white data-[state=open]:bg-white/[0.08] data-[state=open]:text-white">
                <Globe size={16} weight="fill" />
                <span>{t('common.language')}</span>
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="max-h-96 w-64 overflow-y-auto border-white/10 bg-[#1a1a1b] p-1 text-white shadow-xl shadow-black/25 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {AVAILABLE_LANGUAGES.map((language) => (
                  <DropdownMenuItem
                    key={language.code}
                    onClick={() => i18n.changeLanguage(language.code)}
                    className="flex items-center justify-between rounded-md px-3 py-2 text-white/70 focus:bg-white/[0.08] focus:text-white"
                  >
                    <div className="flex min-w-0 flex-col">
                      <span className="truncate text-sm font-medium">{language.nativeName}</span>
                      <span className="truncate text-xs text-white/40">{t(language.translationKey)}</span>
                    </div>
                    {i18n.language === language.code && <Check size={16} weight="bold" className="text-green-500" />}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuSeparator className="bg-white/[0.08]" />
            <DropdownMenuItem asChild>
              <Link href={authenticatedOrgHref(getUriWithOrg(getDefaultOrg(), routePaths.org.portfolio()), true)} className="flex items-center gap-2 rounded-md px-3 py-2 text-white/70 focus:bg-white/[0.08] focus:text-white">
                <UserCircle size={16} weight="fill" />
                <span>Portfolio</span>
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href={authenticatedOrgHref(getUriWithOrg(getDefaultOrg(), routePaths.owner.account.root()), true)} className="flex items-center gap-2 rounded-md px-3 py-2 text-white/70 focus:bg-white/[0.08] focus:text-white">
                <Gear size={16} weight="fill" />
                <span>{t('common.settings')}</span>
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator className="bg-white/[0.08]" />
            <DropdownMenuItem
              onClick={() => logOutUI()}
              className="flex items-center gap-2 rounded-md px-3 py-2 text-red-500 focus:bg-white/[0.08] focus:text-red-400"
            >
              <SignOut size={16} weight="fill" />
              <span>{t('user.sign_out')}</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </nav>
    </TooltipProvider>
  )
}

/** One tab: a link, a hover menu when it has more than one page, or a locked row with its Request action. */
function NavEntry({ item, isActive, isCollapsed }: { item: VisibleNavItem; isActive: boolean; isCollapsed: boolean }) {
  const { t } = useTranslation()
  const label = adminLabel(t, item)
  const Icon = ADMIN_NAV_ICONS[item.id]
  const locked = item.visibility.state === 'locked' ? item.visibility.request : null
  const hasMenu = !locked && !item.inPageTabs && (item.children?.length ?? 0) > 1
  const rowClass = cn(
    "flex items-center w-full rounded-lg transition-all",
    isCollapsed ? "justify-center h-10" : "px-3 py-2 gap-3",
    isActive ? "bg-white/[0.08] text-white" : "text-white/50 hover:text-white hover:bg-white/[0.08]"
  )

  if (locked) {
    const row = (
      <div className={cn(rowClass, "text-white/30 hover:bg-transparent hover:text-white/30")}>
        <span className="relative flex items-center justify-center">
          <Icon size={20} weight="fill" />
          {isCollapsed && <LockSimple aria-hidden="true" size={10} weight="fill" className="absolute -right-2 -bottom-1" />}
        </span>
        {!isCollapsed && (
          <>
            <span className="text-sm font-medium flex-1 text-left">{label}</span>
            <RequestAccessButton request={locked} tone="dark" />
          </>
        )}
      </div>
    )
    return isCollapsed ? <WithTooltip label={`${label} · requires ${accessRequestLabel(locked)}`}>{row}</WithTooltip> : row
  }

  const content = (
    <>
      <span className="relative flex items-center justify-center">
        <Icon size={20} weight="fill" />
        {hasMenu && isCollapsed && <CaretDown aria-hidden="true" size={8} weight="bold" className="absolute -right-2.5 text-white/30" />}
      </span>
      {!isCollapsed && (
        <>
          <span className="text-sm font-medium flex-1 text-left">{label}</span>
          {item.pill && <NavPill>{item.pill}</NavPill>}
          {hasMenu && <CaretDown aria-hidden="true" size={14} weight="bold" className="text-white/40" />}
        </>
      )}
    </>
  )
  const link = <Link aria-label={label} href={item.href} className={rowClass}>{content}</Link>

  if (!hasMenu) return isCollapsed ? <WithTooltip label={label}>{link}</WithTooltip> : link

  return (
    <HoverMenu
      content={
        <HoverMenuContent className="w-64">
          <HoverMenuLabel className="text-white/70 font-medium">{label}</HoverMenuLabel>
          <HoverMenuSeparator />
          {item.children!.map((child) => {
            const ChildIcon = ADMIN_NAV_ICONS[child.id]
            const request = child.visibility.state === 'locked' ? child.visibility.request : null
            return request ? (
              <div key={child.id} className="flex items-center gap-2 px-3 py-2 text-sm text-white/30">
                <ChildIcon size={16} weight="fill" />
                <span className="flex-1">{adminLabel(t, child)}</span>
                <RequestAccessButton request={request} tone="dark" />
              </div>
            ) : (
              <HoverMenuItem key={child.id} asChild>
                <Link href={child.href} className="flex items-center gap-2 px-3 py-2 text-sm text-white/70 hover:text-white hover:bg-white/[0.08] cursor-pointer transition-colors">
                  <ChildIcon size={16} weight="fill" />
                  <span>{adminLabel(t, child)}</span>
                </Link>
              </HoverMenuItem>
            )
          })}
        </HoverMenuContent>
      }
    >
      {link}
    </HoverMenu>
  )
}

function WithTooltip({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="right" className={TOOLTIP_CLASS}>{label}</TooltipContent>
    </Tooltip>
  )
}

export default DashLeftMenu
