'use client'

import React from 'react'
import { SignOut } from '@phosphor-icons/react'
import AccountPageShell, { settingsCard } from '@components/Objects/Account/AccountPageShell'
import AccountGeneral from '@components/Objects/Account/subpages/AccountGeneral'
import AccountSecurity from '@components/Objects/Account/subpages/AccountSecurity'
import AccountMemory from '@components/Objects/Account/subpages/AccountMemory'
import AccountPreferences from '@components/Objects/Account/subpages/AccountPreferences'
import { signOut } from '@components/Contexts/AuthContext'

/** Where each old account tab now sits on the one Settings page. */
const SECTIONS: Record<string, string> = { preferences: 'appearance', memory: 'memory' }

const AccountClient = ({ subpage }: { orgslug: string; subpage: string }) => {
  // Old links to a tab land on its section.
  React.useEffect(() => {
    const section = SECTIONS[subpage]
    if (section) document.getElementById(section)?.scrollIntoView({ block: 'start' })
  }, [subpage])

  return (
    <AccountPageShell>
      <div className="space-y-6">
        <section id="account" className="scroll-mt-6 space-y-6"><AccountGeneral /><AccountSecurity /></section>
        <section id="appearance" className="scroll-mt-6"><AccountPreferences /></section>
        <section id="memory" className="scroll-mt-6"><AccountMemory /></section>
        <button type="button" onClick={() => signOut({ callbackUrl: '/' })}
          className={`${settingsCard} flex w-full items-center justify-center gap-2 px-5 py-4 text-sm font-bold text-red-600 transition-colors hover:bg-red-50 dark:hover:bg-red-500/10`}>
          <SignOut size={18} weight="fill" />Sign out
        </button>
      </div>
    </AccountPageShell>
  )
}

export default AccountClient
