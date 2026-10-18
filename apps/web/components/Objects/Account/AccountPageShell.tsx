'use client'

import React from 'react'
import GeneralWrapperStyled from '@components/Objects/StyledElements/Wrappers/GeneralWrapper'
import UserAvatar from '@components/Objects/UserAvatar'
import { useLHSession } from '@components/Contexts/LHSessionContext'

export type AccountPageTab = 'account' | 'messages' | 'organizations' | 'memory' | 'preferences'

/** Settings: one page for your account, how the app looks, and what Coach remembers. */
export default function AccountPageShell({ children }: { children: React.ReactNode }) {
  const session = useLHSession() as any
  const user = session?.data?.user
  return (
    <main className="min-h-screen bg-background text-foreground">
      <GeneralWrapperStyled>
        <header className="flex items-center gap-4 pt-2">
          <UserAvatar border="border-2" rounded="rounded-xl" width={56} />
          <div className="min-w-0">
            <h1 className="text-3xl font-black tracking-tight">Settings</h1>
            <p className="truncate text-sm text-muted-foreground">{[user?.first_name, user?.last_name].filter(Boolean).join(' ') || user?.username}{user?.username ? ` · @${user.username}` : ''}</p>
          </div>
        </header>
        <div className="py-8">{children}</div>
      </GeneralWrapperStyled>
    </main>
  )
}
