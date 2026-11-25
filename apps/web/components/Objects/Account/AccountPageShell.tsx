'use client'

import React from 'react'
import GeneralWrapperStyled from '@components/Objects/StyledElements/Wrappers/GeneralWrapper'
import UserAvatar from '@components/Objects/UserAvatar'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { useTranslation } from 'react-i18next'
import { shownName } from '@/lib/names'
import Link from 'next/link'
import { ArrowRight, IdentificationCard } from '@phosphor-icons/react'
import { getDefaultOrg, getUriWithOrg, routePaths } from '@services/config/config'
import { tr } from '@/lib/tr'

/** The bar Settings opens with (PF-3): your name, photo and intro are edited in your portfolio, not here. */
export function PersonalDetailsBar() {
  useTranslation()
  return <div data-testid="settings-personal-details" className="mt-6 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border-2 border-border bg-muted/50 px-4 py-3">
    <IdentificationCard size={20} className="shrink-0 text-muted-foreground" aria-hidden="true" />
    <p className="min-w-0 flex-1 text-sm text-foreground">{tr('account_settings.personal_details_bar', 'Your name, photo and intro are edited in your portfolio.')}</p>
    <Link href={getUriWithOrg(getDefaultOrg(), routePaths.org.portfolio())} className="inline-flex items-center gap-1 text-sm font-bold text-foreground underline-offset-4 hover:underline">
      {tr('account_settings.go_to_portfolio', 'Go to your portfolio')}<ArrowRight size={14} weight="bold" aria-hidden="true" />
    </Link>
  </div>
}

export type AccountPageTab = 'account' | 'messages' | 'organizations' | 'memory' | 'preferences' | 'accessibility' | 'data' | 'contact'

/** Settings: one page for your account, how the app looks, and what Coach remembers. */
export default function AccountPageShell({ children }: { children: React.ReactNode }) {
  const session = useLHSession() as any
  const { t } = useTranslation()
  const user = session?.data?.user
  return (
    <main className="min-h-screen bg-background text-foreground">
      <GeneralWrapperStyled>
        <header className="flex items-center gap-4 pt-2">
          <UserAvatar border="border-2" rounded="rounded-xl" width={56} />
          <div className="min-w-0">
            <h1 className="text-3xl font-black tracking-tight">{t('nav.settings')}</h1>
            <p className="truncate text-sm text-muted-foreground">{shownName(user)}{user?.username ? ` · @${user.username}` : ''}</p>
          </div>
        </header>
        <PersonalDetailsBar />
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
