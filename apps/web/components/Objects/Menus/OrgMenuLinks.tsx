import React from 'react'
import {
  User,
  SealCheck,
  Newspaper,
  ClipboardText,
  House,
} from '@phosphor-icons/react'
import { getCoreCapabilities } from '@services/config/config'

export const KNOWN_SUBPATHS = [
  '/hub',
  '/badges',
  '/plans',
  '/badge',
  '/podcasts',
  '/communities',
  '/community/',
  '/organizations',
  '/organization/',
  '/resources',
  '/resource/',
  '/news',
  '/editor',
  '/portfolio',
  '/account',
  '/payments',
]

export interface OrgMenuNavItem {
  href?: string
  label: string
  icon: React.ReactNode
  active: boolean
  show: boolean
  onboardingFeature?: 'badges' | 'resources'
}

function isFeatureEnabled(resolvedFeatures: any, feature: string) {
  return resolvedFeatures?.[feature]?.enabled === true
}

export function getPrimaryOrgMenuItems({
  pathname,
  resolvedFeatures,
}: {
  pathname?: string | null
  resolvedFeatures: any
}): OrgMenuNavItem[] {
  const capabilities = getCoreCapabilities()
  const isHome = !KNOWN_SUBPATHS.some((subpath) => pathname?.includes(subpath))
  const isOnHub = pathname?.includes('/hub')
  const isOnPortfolio = pathname?.includes('/portfolio')
  const isOnBadges = !isOnPortfolio && pathname?.includes('/badges')
  const isOnPlans = pathname?.includes('/plans')
  const isOnNews = pathname?.includes('/news')

  return [
    {
      href: '/hub',
      label: 'Hub',
      icon: <House size={18} weight="fill" />,
      active: Boolean(isOnHub || isHome),
      show: true,
    },
    {
      href: '/portfolio',
      label: 'Portfolio',
      icon: <User size={18} weight="fill" />,
      active: Boolean(isOnPortfolio),
      show: true,
    },
    {
      href: '/badges',
      label: 'Badges',
      icon: <SealCheck size={18} weight="fill" />,
      active: Boolean(isOnBadges),
      show: isFeatureEnabled(resolvedFeatures, 'badges'),
      onboardingFeature: 'badges',
    },
    {
      href: '/plans',
      label: 'Plans',
      icon: <ClipboardText size={18} weight="fill" />,
      active: Boolean(isOnPlans),
      show: true,
    },
    {
      href: '/news',
      label: 'News',
      icon: <Newspaper size={18} weight="fill" />,
      active: Boolean(isOnNews),
      show: capabilities.news,
    },
  ]
}
