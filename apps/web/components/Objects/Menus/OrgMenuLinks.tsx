import React from 'react'
import {
  House,
  Books,
  ChatsCircle,
  FolderOpen,
  Question,
  GearSix,
} from '@phosphor-icons/react'
import { routePaths } from '@services/config/config'
import type { TFunction } from 'i18next'

export const KNOWN_SUBPATHS = [
  '/courses',
  '/course/',
  '/collection/',
  '/collections',
  '/trail',
  '/certificate',
  '/badge',
  '/badges',
  '/podcasts',
  '/communities',
  '/community/',
  '/organizations',
  '/organization/',
  '/resources',
  '/resource/',
  '/activity/',
  '/assignment',
  '/editor',
  '/account',
  '/payments',
]

export interface OrgMenuNavItem {
  href?: string
  label: string
  icon: React.ReactNode
  active: boolean
  show: boolean
  onboardingFeature?: 'courses' | 'communities' | 'resources'
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
  const isOnCourses =
    pathname?.includes('/courses') ||
    pathname?.includes('/course/') ||
    pathname?.includes('/collection/')
  const isOnCommunities = pathname?.includes('/communities') || pathname?.includes('/community/')
  const isOnResources = pathname?.includes('/resources') || pathname?.includes('/resource/')

  return [
    {
      href: '/',
      label: t('common.home') || 'Home',
      icon: <House size={18} weight="fill" />,
      active: isHome,
      show: true,
    },
    {
      href: '/courses',
      label: t('courses.courses'),
      icon: <Books size={18} weight="fill" />,
      active: Boolean(isOnCourses),
      show: isFeatureEnabled(resolvedFeatures, 'courses'),
      onboardingFeature: 'courses',
    },
    {
      href: '/communities',
      label: t('communities.title'),
      icon: <ChatsCircle size={18} weight="fill" />,
      active: Boolean(isOnCommunities),
      show: isFeatureEnabled(resolvedFeatures, 'communities'),
      onboardingFeature: 'communities',
    },
    {
      href: '/resources',
      label: 'Resources',
      icon: <FolderOpen size={18} weight="fill" />,
      active: Boolean(isOnResources),
      show: isFeatureEnabled(resolvedFeatures, 'resources'),
      onboardingFeature: 'resources',
    },
  ]
}

export function getAdministrativeOrgMenuItems({
  pathname,
  t,
  canAccessDashboard,
  isHelpOpen,
}: {
  pathname?: string | null
  t: TFunction
  canAccessDashboard: boolean
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
    {
      href: routePaths.org.dash.orgSettings.general(),
      label: t('common.settings'),
      icon: <GearSix size={18} weight="fill" />,
      active: Boolean(pathname?.includes('/dash/org/settings')),
      show: canAccessDashboard,
      kind: 'link',
    },
  ]
}
