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

/** Every Settings section's card: the learner side's surface, a face over a darker edge. */
export const settingsCard = 'rounded-2xl border-2 border-border bg-card shadow-[0_4px_0_hsl(var(--edge))]'

/** A Settings section's heading: its mark, title and one line on what it's for, with an optional control at the end. */
export function SettingsHeader({ icon: Icon, title, description, children }: { icon: React.ElementType; title: string; description?: React.ReactNode; children?: React.ReactNode }) {
  // The control sits beside the title, so the description keeps the card's full width on a phone.
  return <div className="flex items-start gap-3">
    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground" aria-hidden="true"><Icon size={19} /></span>
    <div className="min-w-0 flex-1">
      <div className="flex min-h-10 items-center justify-between gap-3">
        <h2 className="text-lg font-extrabold tracking-tight text-foreground">{title}</h2>
        {children}
      </div>
      {description ? <p className="max-w-2xl text-sm leading-6 text-muted-foreground">{description}</p> : null}
    </div>
  </div>
}
