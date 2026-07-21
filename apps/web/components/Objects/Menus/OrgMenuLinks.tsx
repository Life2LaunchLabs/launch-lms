import React from 'react'
import {
  House,
  User,
  SealCheck,
  FolderOpen,
  Newspaper,
  Question,
} from '@phosphor-icons/react'
import type { TFunction } from 'i18next'

export const KNOWN_SUBPATHS = [
  '/badges',
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
  kind?: 'link' | 'action'
  actionKey?: 'help'
}

function isFeatureEnabled(resolvedFeatures: any, feature: string) {
  return resolvedFeatures?.[feature]?.enabled === true
}

export function getPrimaryOrgMenuItems({
  pathname,
  resolvedFeatures,
  t,
}: {
  pathname?: string | null
  resolvedFeatures: any
  t: TFunction
}): OrgMenuNavItem[] {
  const isHome = !KNOWN_SUBPATHS.some((subpath) => pathname?.includes(subpath))
  const isOnPortfolio = pathname?.includes('/portfolio')
  const isOnBadges = !isOnPortfolio && pathname?.includes('/badges')
  const isOnResources = pathname?.includes('/resources') || pathname?.includes('/resource/')
  const isOnNews = pathname?.includes('/news')

  return [
    {
      href: '/portfolio',
      label: 'Portfolio',
      icon: <User size={18} weight="fill" />,
      active: Boolean(isOnPortfolio || isHome),
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
      href: '/resources',
      label: 'Resources',
      icon: <FolderOpen size={18} weight="fill" />,
      active: Boolean(isOnResources),
      show: isFeatureEnabled(resolvedFeatures, 'resources'),
      onboardingFeature: 'resources',
    },
    {
      href: '/news',
      label: 'News',
      icon: <Newspaper size={18} weight="fill" />,
      active: Boolean(isOnNews),
      show: true,
    },
  ]
}

export function getAdministrativeOrgMenuItems({
  t,
  isHelpOpen,
}: {
  t: TFunction
  isHelpOpen: boolean
}): OrgMenuNavItem[] {
  return [
    {
      label: t('common.help'),
      icon: <Question size={18} weight="fill" />,
      active: isHelpOpen,
      show: true,
      kind: 'action',
      actionKey: 'help',
    },
  ]
}
