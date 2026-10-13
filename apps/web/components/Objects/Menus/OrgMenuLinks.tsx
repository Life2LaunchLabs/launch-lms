import React from 'react'
import { ClipboardText, Compass, Sparkle, User } from '@phosphor-icons/react'

export interface OrgMenuNavItem {
  /** A destination, or ``hub`` for the item that brings Hub out beside the page. */
  href?: string
  action?: 'hub'
  label: string
  icon: React.ReactNode
  active: boolean
  show: boolean
}

function isFeatureEnabled(resolvedFeatures: any, feature: string) {
  return resolvedFeatures?.[feature]?.enabled === true
}

/** The learner app's primary destinations, in nav order. Plans is home. */
export function getPrimaryOrgMenuItems({
  pathname,
  resolvedFeatures,
  hubOpen = false,
}: {
  pathname?: string | null
  resolvedFeatures: any
  hubOpen?: boolean
}): OrgMenuNavItem[] {
  const isOnPortfolio = Boolean(pathname?.includes('/portfolio'))
  const isOnDiscover = !isOnPortfolio && Boolean(pathname?.includes('/discover') || pathname?.includes('/badges'))
  return [
    { href: '/plans', label: 'Plans', icon: <ClipboardText size={22} weight="fill" />, active: Boolean(pathname?.includes('/plans')) && !hubOpen, show: true },
    { href: '/discover', label: 'Discover', icon: <Compass size={22} weight="fill" />, active: isOnDiscover && !hubOpen, show: isFeatureEnabled(resolvedFeatures, 'badges') || isFeatureEnabled(resolvedFeatures, 'resources') },
    { href: '/portfolio', label: 'Portfolio', icon: <User size={22} weight="fill" />, active: isOnPortfolio && !hubOpen, show: true },
    { action: 'hub', label: 'Hub', icon: <Sparkle size={22} weight="fill" />, active: hubOpen, show: true },
  ]
}
