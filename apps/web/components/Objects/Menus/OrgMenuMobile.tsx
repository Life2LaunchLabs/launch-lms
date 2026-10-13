'use client'

import Link from 'next/link'
import { Buildings, Envelope, Question, SignOut, Sun, User } from '@phosphor-icons/react'
import { getUriWithOrg, routePaths } from '@services/config/config'
import { signOut } from '@components/Contexts/AuthContext'
import { useHub } from '@components/Hub/HubContext'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import type { OrgMenuNavItem } from './OrgMenuLinks'

export const NAV_ACTIVE_CLASS = 'bg-[color-mix(in_srgb,var(--org-primary-color)_16%,transparent)] text-foreground ring-2 ring-[var(--org-primary-color)]'

/** A primary destination, or the Hub toggle, in the phone bar or the desktop sidebar. */
export function NavItemControl({ item, orgslug, className, children }: { item: OrgMenuNavItem; orgslug: string; className: string; children: React.ReactNode }) {
  const hub = useHub()
  if (item.action === 'hub') {
    return <button type="button" onClick={() => hub?.toggle()} aria-label={hub?.unread ? 'Hub, new reply' : 'Hub'} aria-pressed={item.active} className={cn('relative', className)}>
      {children}
      {hub?.unread && !item.active ? <span className="absolute right-2.5 top-2 h-2.5 w-2.5 rounded-full bg-[#7cc4ff] ring-2 ring-shell" aria-hidden="true" /> : null}
    </button>
  }
  return <Link href={getUriWithOrg(orgslug, item.href || '/')} aria-label={item.label} aria-current={item.active ? 'page' : undefined} className={className}>{children}</Link>
}

/** The phone tab bar. It sits on the outside surface and never moves with the page. */
export default function OrgMenuMobile({ items, orgslug, hidden, onHelp, unreadCount }: { items: OrgMenuNavItem[]; orgslug: string; hidden: boolean; onHelp: () => void; unreadCount: number }) {
  return <nav
    aria-label="Mobile navigation"
    className={cn('fixed inset-x-0 bottom-0 z-[var(--z-nav)] flex justify-center bg-shell px-2 transition-[opacity,transform] duration-300 ease-out md:hidden', hidden ? 'pointer-events-none translate-y-full opacity-0' : 'translate-y-0 opacity-100')}
    style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 0px)' }}
  >
    <div className="pointer-events-auto flex h-16 w-full max-w-screen-sm items-center justify-around gap-1">
      {items.map((item) => <NavItemControl key={item.href || item.label} item={item} orgslug={orgslug} className={cn('flex h-11 w-14 items-center justify-center rounded-2xl transition-colors', item.active ? NAV_ACTIVE_CLASS : 'text-muted-foreground hover:bg-foreground/[0.08] hover:text-foreground')}>{item.icon}</NavItemControl>)}
      <MobileMoreMenu orgslug={orgslug} onHelp={onHelp} unreadCount={unreadCount} />
    </div>
  </nav>
}


function MobileMoreMenu({ orgslug, onHelp, unreadCount }: { orgslug: string; onHelp: () => void; unreadCount: number }) {
  return <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <button type="button" aria-label="More" className="flex h-11 w-14 items-center justify-center rounded-2xl text-muted-foreground transition-colors hover:bg-foreground/[0.08] hover:text-foreground">
        <span className="relative"><User size={20} weight="bold" />{unreadCount > 0 ? <span className="absolute -right-2 -top-2 flex min-h-4 min-w-4 items-center justify-center rounded-full bg-blue-600 px-1 text-[9px] font-black text-white">{unreadCount > 9 ? '9+' : unreadCount}</span> : null}</span>
      </button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" side="top" className="mb-3 w-48 rounded-2xl p-2">
      <DropdownMenuItem asChild><Link href={getUriWithOrg(orgslug, routePaths.owner.account.root())} className="flex items-center gap-3 rounded-xl px-3 py-2"><User size={18} weight="fill" /><span>Account</span></Link></DropdownMenuItem>
      <DropdownMenuItem asChild><Link href={getUriWithOrg(orgslug, routePaths.owner.account.messages())} className="flex items-center gap-3 rounded-xl px-3 py-2"><Envelope size={18} weight="fill" /><span className="flex-1">Messages</span>{unreadCount > 0 ? <span className="flex min-w-5 items-center justify-center rounded-full bg-blue-600 px-1.5 py-0.5 text-[10px] font-black text-white">{unreadCount}</span> : null}</Link></DropdownMenuItem>
      <DropdownMenuItem asChild><Link href={getUriWithOrg(orgslug, routePaths.owner.account.organizations())} className="flex items-center gap-3 rounded-xl px-3 py-2"><Buildings size={18} weight="fill" /><span>Organizations</span></Link></DropdownMenuItem>
      <DropdownMenuItem asChild><Link href={getUriWithOrg(orgslug, routePaths.owner.account.preferences())} className="flex items-center gap-3 rounded-xl px-3 py-2"><Sun size={18} weight="fill" /><span>Appearance</span></Link></DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem onClick={onHelp} className="flex items-center gap-3 rounded-xl px-3 py-2"><Question size={18} weight="fill" /><span>Help &amp; feedback</span></DropdownMenuItem>
      <DropdownMenuItem onClick={() => signOut({ callbackUrl: '/' })} className="flex items-center gap-3 rounded-xl px-3 py-2 text-red-600 focus:text-red-600"><SignOut size={18} weight="fill" /><span>Sign out</span></DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
}
