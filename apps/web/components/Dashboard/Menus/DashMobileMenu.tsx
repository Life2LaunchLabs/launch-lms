'use client'

import { useOrg } from '@components/Contexts/OrgContext'
import { cn } from '@/lib/utils'
import { getCoreCapabilities, getDefaultOrg, getUriWithOrg, routePaths } from '@services/config/config'
import { getOrgLogoMediaDirectory } from '@services/media/media'
import {
  BadgeDollarSign,
  Backpack,
  BookCopy,
  Building2,
  FolderOpen,
  Headphones,
  Home,
  Menu,
  MessagesSquare,
  Newspaper,
  School,
  UserRound,
  Users,
  X,
} from 'lucide-react'
import Link from 'next/link'
import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

function DashMobileMenu() {
  const { t } = useTranslation()
  const org = useOrg() as any
  const [isOpen, setIsOpen] = useState(false)

  const rf = org?.config?.config?.resolved_features
  const isEnabled = (feature: string) => rf?.[feature]?.enabled === true
  const capabilities = getCoreCapabilities()
  const showCommunities = isEnabled('communities')
  const showResources = isEnabled('resources')
  const showPodcasts = isEnabled('podcasts')
  const showPayments = capabilities.payments && isEnabled('payments')
  const isOwnerOrg = org?.slug === getDefaultOrg()

  useEffect(() => {
    if (!isOpen) return

    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      document.body.style.overflow = originalOverflow
    }
  }, [isOpen])

  const closeMenu = () => setIsOpen(false)

  const navItems = [
    {
      href: routePaths.org.dash.root(),
      icon: Home,
      label: t('common.home'),
    },
    {
      href: routePaths.org.dash.courses(),
      icon: BookCopy,
      label: 'Badges',
    },
    {
      href: routePaths.org.dash.assignments(),
      icon: Backpack,
      label: t('common.assignments'),
    },
    showCommunities
      ? {
          href: routePaths.org.dash.communities(),
          icon: MessagesSquare,
          label: t('communities.title'),
        }
      : null,
    showResources
      ? {
          href: routePaths.org.dash.resources(),
          icon: FolderOpen,
          label: 'Resources',
        }
      : null,
    showPodcasts
      ? {
          href: routePaths.org.dash.podcasts(),
          icon: Headphones,
          label: t('podcasts.podcasts'),
        }
      : null,
    showPayments
      ? {
          href: routePaths.org.dash.paymentsOverview(),
          icon: BadgeDollarSign,
          label: t('common.payments'),
        }
      : null,
    {
      href: routePaths.org.dash.users.users(),
      icon: Users,
      label: t('common.users'),
    },
    {
      href: routePaths.org.dash.orgSettings.general(),
      icon: School,
      label: t('common.organization'),
    },
  ].filter(Boolean) as Array<{
    href: string
    icon: React.ComponentType<{ className?: string }>
    label: string
  }>

  const platformItems = isOwnerOrg
    ? [
        {
          href: getUriWithOrg(org.slug, routePaths.owner.platform.organizations()),
          icon: Building2,
          label: 'Organizations',
        },
        {
          href: getUriWithOrg(org.slug, routePaths.owner.platform.users()),
          icon: Users,
          label: 'Users',
        },
        {
          href: getUriWithOrg(org.slug, routePaths.owner.platform.news()),
          icon: Newspaper,
          label: 'News',
        },
      ]
    : []

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
          <Menu className="h-5 w-5" />
        </button>

        <Link
          href={routePaths.org.dash.root()}
          className="flex min-w-0 items-center gap-2"
          aria-label="Dashboard home"
        >
          {org?.logo_image ? (
            <img
              src={getOrgLogoMediaDirectory(org.org_uuid, org.logo_image)}
              alt={org?.name}
              className="h-8 w-8 rounded-lg object-contain"
            />
          ) : (
            <img
              src="/logo-icon.svg"
              alt="Launch LMS logo"
              className="h-8 w-8"
            />
          )}
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
              {org?.logo_image ? (
                <img
                  src={getOrgLogoMediaDirectory(org.org_uuid, org.logo_image)}
                  alt={org?.name}
                  className="h-8 w-8 rounded-lg object-contain"
                />
              ) : (
                <img
                  src="/logo-icon.svg"
                  alt="Launch LMS logo"
                  className="h-8 w-8"
                />
              )}
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
                {navItems.map((item) => (
                  <MobileMenuLink
                    key={item.href}
                    href={item.href}
                    icon={item.icon}
                    label={item.label}
                    onClick={closeMenu}
                  />
                ))}
              </div>

              {platformItems.length > 0 && (
                <div className="mt-5 border-t border-amber-400/20 pt-4">
                  <p className="px-3 text-[10px] font-semibold uppercase tracking-widest text-amber-400/60">
                    Platform
                  </p>
                  <div className="mt-2 space-y-1">
                    {platformItems.map((item) => (
                      <MobileMenuLink
                        key={item.href}
                        href={item.href}
                        icon={item.icon}
                        label={item.label}
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
                href={getUriWithOrg(getDefaultOrg(), routePaths.org.portfolio())}
                icon={UserRound}
                label="Portfolio"
                onClick={closeMenu}
              />
              <MobileMenuLink
                href={getUriWithOrg(getDefaultOrg(), routePaths.org.root())}
                icon={Home}
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

function MobileMenuLink({
  href,
  icon: Icon,
  label,
  onClick,
  className,
}: {
  href: string
  icon: React.ComponentType<{ className?: string }>
  label: string
  onClick: () => void
  className?: string
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className={cn(
        'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-white/70 transition-colors hover:bg-white/[0.08] hover:text-white',
        className
      )}
    >
      <Icon className="h-5 w-5 shrink-0" />
      <span className="truncate">{label}</span>
    </Link>
  )
}

export default DashMobileMenu
