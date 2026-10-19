'use client'

import { useOrg } from '@components/Contexts/OrgContext'
import { cn } from '@/lib/utils'
import { getDefaultOrg, getUriWithOrg, routePaths } from '@services/config/config'
import { getOrgLogoMediaDirectory } from '@services/media/media'
import { authenticatedOrgHref } from '@services/auth/handoff'
import { House, List, UserCircle, X, type Icon } from '@phosphor-icons/react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { platformSections } from '@components/Admin/Platform/platformSections'
import React, { useEffect, useState } from 'react'
import { useFeatures } from '@components/Hooks/useFeatures'
import { adminLabel, adminTabForPath, type VisibleNavItem } from '@/lib/admin/registry'
import { useTranslation } from 'react-i18next'
import RequestAccessButton from '@components/Admin/RequestAccessButton'
import { ADMIN_NAV_ICONS, PLATFORM_NAV_ICONS } from '@components/Admin/adminNavIcons'

/** The admin menu on phones: the same registry tabs as the sidebar, with each tab's pages listed under it. */
function DashMobileMenu() {
  const org = useOrg() as any
  const features = useFeatures()
  const pathname = usePathname() || ''
  const [isOpen, setIsOpen] = useState(false)

  useEffect(() => {
    if (!isOpen) return
    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = originalOverflow
    }
  }, [isOpen])

  const closeMenu = () => setIsOpen(false)
  const tabs = features.adminTabs()
  const active = adminTabForPath(pathname)
  const showPlatform = org?.slug === getDefaultOrg() && features.isSuperadmin
  const logo = org?.logo_image
    ? <img src={getOrgLogoMediaDirectory(org.org_uuid, org.logo_image)} alt={org?.name} className="h-8 w-8 rounded-lg object-contain" />
    : <img src="/logo-icon.svg" alt="Launch LMS logo" className="h-8 w-8" />

  return (
    <>
      <header className="sticky top-0 z-overlay flex h-14 items-center justify-between border-b border-black/[0.08] bg-[#0f0f10] px-4 text-white shadow-sm">
        <button
          type="button"
          aria-label="Open dashboard menu"
          aria-expanded={isOpen}
          onClick={() => setIsOpen(true)}
          className="flex h-10 w-10 items-center justify-center rounded-lg text-white/70 transition-colors hover:bg-white/[0.08] hover:text-white"
        >
          <List className="h-5 w-5" />
        </button>

        <Link href={routePaths.org.admin.root()} className="flex min-w-0 items-center gap-2" aria-label="Dashboard home">
          {logo}
          <span className="max-w-[58vw] truncate text-sm font-semibold">{org?.name}</span>
        </Link>

        <div className="h-10 w-10" aria-hidden="true" />
      </header>

      {isOpen && (
        <div className="fixed inset-0 z-[1000] md:hidden">
          <button
            type="button"
            aria-label="Close dashboard menu"
            onClick={closeMenu}
            className="fixed inset-0 z-[1000] bg-black/55"
          />

          <aside
            aria-label="Dashboard menu"
            className="fixed left-0 top-0 z-[1001] flex h-[100dvh] w-[min(84vw,320px)] flex-col bg-[#0f0f10] text-white shadow-2xl"
          >
            <div className="flex h-14 items-center justify-between border-b border-white/[0.08] px-4">
              <div className="flex min-w-0 items-center gap-2">
                {logo}
                <span className="truncate text-sm font-semibold">{org?.name}</span>
              </div>
              <button
                type="button"
                aria-label="Close dashboard menu"
                onClick={closeMenu}
                className="flex h-9 w-9 items-center justify-center rounded-lg text-white/60 transition-colors hover:bg-white/[0.08] hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-3 py-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <div className="space-y-1">
                {tabs.map((tab) => (
                  <MobileTab key={tab.id} tab={tab} isActive={active?.tab.id === tab.id} onNavigate={closeMenu} />
                ))}
              </div>

              {showPlatform && (
                <div className="mt-5 border-t border-amber-400/20 pt-4">
                  <p className="px-3 text-[10px] font-semibold uppercase tracking-widest text-amber-400/60">Platform</p>
                  <div className="mt-2 space-y-1">
                    {platformSections().map((section) => (
                      <MobileMenuLink
                        key={section.href}
                        href={getUriWithOrg(org.slug, section.href)}
                        icon={PLATFORM_NAV_ICONS[section.id]}
                        label={section.label}
                        onClick={closeMenu}
                        className="text-amber-400/80 hover:bg-amber-400/10 hover:text-amber-300"
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="border-t border-white/[0.08] p-3">
              <MobileMenuLink
                href={authenticatedOrgHref(getUriWithOrg(getDefaultOrg(), routePaths.org.portfolio()), true)}
                icon={UserCircle}
                label="Portfolio"
                onClick={closeMenu}
              />
              <MobileMenuLink
                href={authenticatedOrgHref(getUriWithOrg(getDefaultOrg(), routePaths.org.root()), true)}
                icon={House}
                label="Return to User Experience"
                onClick={closeMenu}
              />
            </div>
          </aside>
        </div>
      )}
    </>
  )
}

function MobileTab({ tab, isActive, onNavigate }: { tab: VisibleNavItem; isActive: boolean; onNavigate: () => void }) {
  const { t } = useTranslation()
  const children = tab.children && tab.children.length > 1 ? tab.children : []
  return (
    <div>
      <MobileMenuLink href={tab.href} icon={ADMIN_NAV_ICONS[tab.id]} label={adminLabel(t, tab)} onClick={onNavigate} item={tab} className={isActive ? 'bg-white/[0.08] text-white' : undefined} />
      {children.length > 0 && (
        <div className="ml-8 space-y-0.5 border-l border-white/[0.08] pl-2">
          {children.map((child) => (
            <MobileMenuLink key={child.id} href={child.href} icon={ADMIN_NAV_ICONS[child.id]} label={adminLabel(t, child)} onClick={onNavigate} item={child} className="py-2 text-[13px]" />
          ))}
        </div>
      )}
    </div>
  )
}

function MobileMenuLink({
  href,
  icon: ItemIcon,
  label,
  onClick,
  className,
  item,
}: {
  href: string
  icon: Icon
  label: string
  onClick: () => void
  className?: string
  item?: VisibleNavItem
}) {
  const rowClass = 'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors'
  if (item?.visibility.state === 'locked') {
    return (
      <div className={cn(rowClass, 'text-white/30', className)}>
        <ItemIcon size={20} weight="fill" className="shrink-0" />
        <span className="flex-1 truncate">{label}</span>
        <RequestAccessButton request={item.visibility.request} tone="dark" />
      </div>
    )
  }
  return (
    <Link href={href} onClick={onClick} className={cn(rowClass, 'text-white/70 hover:bg-white/[0.08] hover:text-white', className)}>
      <ItemIcon size={20} weight="fill" className="shrink-0" />
      <span className="truncate">{label}</span>
    </Link>
  )
}

export default DashMobileMenu
