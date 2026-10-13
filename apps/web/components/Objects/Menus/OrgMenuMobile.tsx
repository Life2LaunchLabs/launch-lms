'use client'

import Link from 'next/link'
import { getUriWithOrg } from '@services/config/config'
import { useHub } from '@components/Hub/HubContext'
import { cn } from '@/lib/utils'
import type { OrgMenuNavItem } from './OrgMenuLinks'

export const NAV_ACTIVE_CLASS = 'bg-[color-mix(in_srgb,var(--org-primary-color)_16%,transparent)] text-foreground ring-2 ring-[var(--org-primary-color)]'

/** A primary destination, or the Hub toggle, in the phone bar or the desktop sidebar. */
export function NavItemControl({ item, orgslug, className, children, dot = false }: { item: OrgMenuNavItem; orgslug: string; className: string; children: React.ReactNode; dot?: boolean }) {
  const hub = useHub()
  if (item.action === 'hub') {
    return <button type="button" onClick={() => hub?.toggle()} aria-label={hub?.unread ? 'Hub, new reply' : 'Hub'} aria-pressed={item.active} className={cn('relative', className)}>
      {children}
      {hub?.unread && !item.active ? <span className="absolute right-2.5 top-2 h-2.5 w-2.5 rounded-full bg-[#7cc4ff] ring-2 ring-shell" aria-hidden="true" /> : null}
    </button>
  }
  return <Link href={getUriWithOrg(orgslug, item.href || '/')} aria-label={dot ? `${item.label}, unread messages` : item.label} aria-current={item.active ? 'page' : undefined} className={cn('relative', className)}>
    {children}
    {dot ? <span className="absolute right-2.5 top-2 h-2.5 w-2.5 rounded-full bg-[#7cc4ff] ring-2 ring-shell" aria-hidden="true" /> : null}
  </Link>
}

/**
 * The phone tab bar. It sits on the outside surface and never moves with the page.
 * Account, messages and help live behind the settings button on the learner's
 * portfolio, so Portfolio carries the unread-messages dot.
 */
export default function OrgMenuMobile({ items, orgslug, hidden, unreadCount }: { items: OrgMenuNavItem[]; orgslug: string; hidden: boolean; unreadCount: number }) {
  return <nav
    aria-label="Mobile navigation"
    className={cn('fixed inset-x-0 bottom-0 z-[var(--z-nav)] flex justify-center bg-shell px-2 transition-[opacity,transform] duration-300 ease-out md:hidden', hidden ? 'pointer-events-none translate-y-full opacity-0' : 'translate-y-0 opacity-100')}
    style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 0px)' }}
  >
    <div className="pointer-events-auto flex h-16 w-full max-w-screen-sm items-center justify-around gap-1">
      {items.map((item) => <NavItemControl key={item.href || item.label} item={item} orgslug={orgslug} dot={unreadCount > 0 && item.href === '/portfolio'} className={cn('flex h-11 w-14 items-center justify-center rounded-2xl transition-colors', item.active ? NAV_ACTIVE_CLASS : 'text-muted-foreground hover:bg-foreground/[0.08] hover:text-foreground')}>{item.icon}</NavItemControl>)}
    </div>
  </nav>
}
