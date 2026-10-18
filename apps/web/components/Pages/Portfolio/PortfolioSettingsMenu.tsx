'use client'

import Link from 'next/link'
import { ChatCircleDots, GearSix, SignOut } from '@phosphor-icons/react'
import { openCandidatePanel } from '@components/Candidate/CandidateExperience'
import { signOut } from '@components/Contexts/AuthContext'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@components/ui/dropdown-menu'
import { getUriWithOrg, routePaths } from '@services/config/config'

const item = 'flex items-center gap-3 rounded-xl px-3 py-2'

/**
 * Settings and help on phones, behind a button on the learner's own portfolio header.
 * Wider screens keep them at the bottom of the side navigation. Messages and
 * invitations are in Connect.
 */
export default function PortfolioSettingsMenu({ orgslug }: { orgslug: string }) {
  return <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <button type="button" aria-label="Settings" className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-black/25 text-white backdrop-blur transition hover:bg-black/40 md:hidden">
        <GearSix size={20} weight="bold" />
      </button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" className="w-56 rounded-2xl p-2">
      <DropdownMenuItem asChild><Link href={getUriWithOrg(orgslug, routePaths.owner.account.root())} className={item}><GearSix size={18} weight="fill" /><span>Settings</span></Link></DropdownMenuItem>
      <DropdownMenuItem onClick={() => openCandidatePanel('feedback')} className={item}><ChatCircleDots size={18} weight="fill" /><span>Feedback</span></DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem onClick={() => signOut({ callbackUrl: '/' })} className={`${item} text-red-600 focus:text-red-600`}><SignOut size={18} weight="fill" /><span>Sign out</span></DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
}
