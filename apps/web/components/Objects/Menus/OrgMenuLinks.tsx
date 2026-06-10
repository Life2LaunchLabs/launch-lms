import React from 'react'
import {
  House,
  User,
  SealCheck,
  MapTrifold,
  ChatsCircle,
  FolderOpen,
  Question,
} from '@phosphor-icons/react'
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
  '/plan',
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
  '/profile',
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
    pathname?.includes('/badges') ||
    pathname?.includes('/courses') ||
    pathname?.includes('/course/') ||
    pathname?.includes('/collection/')
  const isOnProfile = pathname?.includes('/profile')
  const isOnPlan = pathname?.includes('/plan')
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
      href: '/profile',
      label: 'Profile',
      icon: <User size={18} weight="fill" />,
      active: Boolean(isOnProfile),
      show: true,
    },
    {
      href: '/badges',
      label: 'Badges',
      icon: <SealCheck size={18} weight="fill" />,
      active: Boolean(isOnCourses),
      show: isFeatureEnabled(resolvedFeatures, 'courses'),
      onboardingFeature: 'courses',
    },
    {
      href: '/plan',
      label: 'Plan',
      icon: <MapTrifold size={18} weight="fill" />,
      active: Boolean(isOnPlan),
      show: true,
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
