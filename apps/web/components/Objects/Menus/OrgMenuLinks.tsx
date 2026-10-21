import React from 'react'
import { ChatsCircle, ClipboardText, Compass, Sparkle, User } from '@phosphor-icons/react'

export interface OrgMenuNavItem {
  /** A destination, or ``hub`` for the item that brings Coach out beside the page. */
  href?: string
  action?: 'hub'
  label: string
  icon: React.ReactNode
  active: boolean
  show: boolean
  /** Something new waits there, such as an unread chat. */
  dot?: boolean
}

/** The learner app's primary destinations, in nav order. Plans is home. */
export function getPrimaryOrgMenuItems({
  pathname,
  hubOpen = false,
  connectWaiting = false,
}: {
  pathname?: string | null
  hubOpen?: boolean
  /** Unread chats, chat requests, or invitations from organizations. */
  connectWaiting?: boolean
}): OrgMenuNavItem[] {
  const isOnPortfolio = Boolean(pathname?.includes('/portfolio'))
  const isOnDiscover = !isOnPortfolio && Boolean(pathname?.includes('/discover') || pathname?.includes('/badges'))
  return [
    { href: '/plans', label: 'Goals', icon: <ClipboardText size={22} weight="fill" />, active: Boolean(pathname?.includes('/plans')) && !hubOpen, show: true },
    { href: '/discover', label: 'Discover', icon: <Compass size={22} weight="fill" />, active: isOnDiscover && !hubOpen, show: true },
    { href: '/connect', label: 'Connect', icon: <ChatsCircle size={22} weight="fill" />, active: Boolean(pathname?.includes('/connect') || pathname?.includes('/organization/')) && !hubOpen, show: true, dot: connectWaiting },
    { href: '/portfolio', label: 'Portfolio', icon: <User size={22} weight="fill" />, active: isOnPortfolio && !hubOpen, show: true },
    { action: 'hub', label: 'Coach', icon: <Sparkle size={22} weight="fill" />, active: hubOpen, show: true },
  ]
}
