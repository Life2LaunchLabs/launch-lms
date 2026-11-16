import React from 'react'
import { ChatsCircle, ClipboardText, Compass, GraduationCap, Sparkle, User } from '@phosphor-icons/react'
import type { TFunction } from 'i18next'

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
  /** The translation key that says what the dot means, given the label; unread messages unless set. */
  dotLabel?: string
  /** Only in the desktop sidebar: the phone's bottom bar keeps its five. */
  desktopOnly?: boolean
}

/** The learner app's primary destinations, in nav order. Plans is home. */
export function getPrimaryOrgMenuItems({
  pathname,
  hubOpen = false,
  connectWaiting = false,
  educationPlan = null,
  t,
}: {
  pathname?: string | null
  hubOpen?: boolean
  /** Unread chats, chat requests, or invitations from organizations. */
  connectWaiting?: boolean
  /** Where the learner's Education Plan is, once a school supports them or asks to; a waiting ask shows a dot. */
  educationPlan?: { href: string; waiting: boolean } | null
  t: TFunction
}): OrgMenuNavItem[] {
  const isOnPortfolio = Boolean(pathname?.includes('/portfolio'))
  const isOnDiscover = !isOnPortfolio && Boolean(pathname?.includes('/discover'))
  return [
    { href: '/plans', label: t('nav.goals'), icon: <ClipboardText size={22} weight="fill" />, active: Boolean(pathname?.includes('/plans')) && !hubOpen, show: true },
    { href: '/discover', label: t('nav.discover'), icon: <Compass size={22} weight="fill" />, active: isOnDiscover && !hubOpen, show: true },
    { href: '/connect', label: t('nav.connect'), icon: <ChatsCircle size={22} weight="fill" />, active: Boolean(pathname?.includes('/connect') || pathname?.includes('/organization/')) && !hubOpen, show: true, dot: connectWaiting },
    { href: '/portfolio', label: t('nav.portfolio'), icon: <User size={22} weight="fill" />, active: isOnPortfolio && !hubOpen, show: true },
    { href: educationPlan?.href, label: t('nav.education_plan'), icon: <GraduationCap size={22} weight="fill" />, active: Boolean(pathname?.endsWith('/epp')) && !hubOpen, show: Boolean(educationPlan), dot: educationPlan?.waiting, dotLabel: 'nav.new_request', desktopOnly: true },
    { action: 'hub', label: t('nav.coach'), icon: <Sparkle size={22} weight="fill" />, active: hubOpen, show: true },
  ]
}
