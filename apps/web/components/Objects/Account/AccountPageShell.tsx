'use client'

import React from 'react'
import GeneralWrapperStyled from '@components/Objects/StyledElements/Wrappers/GeneralWrapper'
import TabbedPageHeader from '@components/Objects/StyledElements/Headers/TabbedPageHeader'
import UserAvatar from '@components/Objects/UserAvatar'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import useInboxMessages from '@components/Hooks/useInboxMessages'
import { getUriWithOrg, routePaths } from '@services/config/config'

export type AccountPageTab = 'account' | 'messages' | 'organizations' | 'preferences'

export default function AccountPageShell({ orgslug, activeTab, children }: { orgslug: string; activeTab: AccountPageTab; children: React.ReactNode }) {
  const session = useLHSession() as any
  const user = session?.data?.user
  const { unreadCount } = useInboxMessages()
  const messageLabel = <span className="inline-flex items-center gap-1.5">Messages{unreadCount > 0 ? <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-blue-600 px-1.5 py-0.5 text-[10px] font-black leading-none text-white">{unreadCount}</span> : null}</span>
  const tabs = [
    { id: 'account' as const, label: 'Account', href: getUriWithOrg(orgslug, routePaths.owner.account.root()) },
    { id: 'messages' as const, label: messageLabel, href: getUriWithOrg(orgslug, routePaths.owner.account.messages()) },
    { id: 'organizations' as const, label: 'Organizations', href: getUriWithOrg(orgslug, routePaths.owner.account.organizations()) },
    { id: 'preferences' as const, label: 'Appearance', href: getUriWithOrg(orgslug, routePaths.owner.account.preferences()) },
  ]

  return (
    <main className="min-h-screen bg-background text-foreground">
      <GeneralWrapperStyled>
        <TabbedPageHeader
          activeTab={activeTab}
          tabs={tabs}
          expanded={activeTab === 'account'}
          ariaLabel="Account views"
          layoutId="account-active-tab"
          fullHeader={<div className="flex min-h-[116px] items-center gap-5"><UserAvatar border="border-4" rounded="rounded-xl" width={96} /><div><p className="text-sm font-bold text-muted-foreground">Your account</p><h1 className="mt-1 text-3xl font-black text-foreground sm:text-4xl">{[user?.first_name, user?.last_name].filter(Boolean).join(' ') || user?.username || 'Account'}</h1><p className="mt-1 text-sm text-muted-foreground">@{user?.username}</p></div></div>}
          compactHeader={<div className="flex items-center gap-3"><UserAvatar border="border-2" rounded="rounded-xl" width={40} /><h1 className="text-base font-bold">Account</h1></div>}
        />
        <div className="py-8 sm:py-12">{children}</div>
      </GeneralWrapperStyled>
    </main>
  )
}
