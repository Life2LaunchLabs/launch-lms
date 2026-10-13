'use client'

import Link from 'next/link'
import { Buildings, Envelope, GearSix, Question, SignOut, Sun, User } from '@phosphor-icons/react'
import { openCandidatePanel } from '@components/Candidate/CandidateExperience'
import { signOut } from '@components/Contexts/AuthContext'
import useInboxMessages from '@components/Hooks/useInboxMessages'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@components/ui/dropdown-menu'
import { getUriWithOrg, routePaths } from '@services/config/config'

const item = 'flex items-center gap-3 rounded-xl px-3 py-2'

/**
 * Account, messages and help on phones. They live behind a settings button on the
 * learner's own portfolio header; a dot marks unread messages. Wider screens keep them
 * at the bottom of the side navigation.
 */
export default function PortfolioSettingsMenu({ orgslug }: { orgslug: string }) {
  const { unreadCount } = useInboxMessages()
  return <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <button type="button" aria-label={unreadCount ? `Settings, ${unreadCount} unread ${unreadCount === 1 ? 'message' : 'messages'}` : 'Settings'} className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-black/25 text-white backdrop-blur transition hover:bg-black/40 md:hidden">
        <GearSix size={20} weight="bold" />
        {unreadCount ? <span className="absolute right-1.5 top-1.5 h-2.5 w-2.5 rounded-full bg-[#7cc4ff] ring-2 ring-black/40" aria-hidden="true" /> : null}
      </button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" className="w-56 rounded-2xl p-2">
      <DropdownMenuItem asChild><Link href={getUriWithOrg(orgslug, routePaths.owner.account.root())} className={item}><User size={18} weight="fill" /><span>Account</span></Link></DropdownMenuItem>
      <DropdownMenuItem asChild><Link href={getUriWithOrg(orgslug, routePaths.owner.account.messages())} className={item}><Envelope size={18} weight="fill" /><span className="flex-1">Messages</span>{unreadCount ? <span className="rounded-full bg-[#7cc4ff] px-1.5 text-[10px] font-extrabold text-[#08222c]">{unreadCount > 9 ? '9+' : unreadCount}</span> : null}</Link></DropdownMenuItem>
      <DropdownMenuItem asChild><Link href={getUriWithOrg(orgslug, routePaths.owner.account.organizations())} className={item}><Buildings size={18} weight="fill" /><span>Organizations</span></Link></DropdownMenuItem>
      <DropdownMenuItem asChild><Link href={getUriWithOrg(orgslug, routePaths.owner.account.preferences())} className={item}><Sun size={18} weight="fill" /><span>Appearance</span></Link></DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem onClick={() => openCandidatePanel('feedback')} className={item}><Question size={18} weight="fill" /><span>Help &amp; feedback</span></DropdownMenuItem>
      <DropdownMenuItem onClick={() => signOut({ callbackUrl: '/' })} className={`${item} text-red-600 focus:text-red-600`}><SignOut size={18} weight="fill" /><span>Sign out</span></DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
}
