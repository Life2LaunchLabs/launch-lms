'use client'

import React from 'react'
import GeneralWrapperStyled from '@components/Objects/StyledElements/Wrappers/GeneralWrapper'
import TabbedPageHeader from '@components/Objects/StyledElements/Headers/TabbedPageHeader'
import { getUriWithOrg, routePaths } from '@services/config/config'
import badgesImage from 'public/landing/badges.png'

export type BadgesPageTab = 'discover' | 'my-badges'

export default function BadgesPageShell({
  orgslug,
  activeTab,
  onTabChange,
  children,
}: {
  orgslug: string
  activeTab: BadgesPageTab
  onTabChange?: React.Dispatch<BadgesPageTab>
  children: React.ReactNode
}) {
  const tabs = [
    { id: 'discover' as const, label: 'Discover', href: getUriWithOrg(orgslug, routePaths.org.badges()) },
    { id: 'my-badges' as const, label: 'My badges', href: getUriWithOrg(orgslug, routePaths.org.myBadges()) },
  ]

  return (
    <main className="min-h-screen bg-background text-foreground">
      <GeneralWrapperStyled>
        <TabbedPageHeader
          activeTab={activeTab}
          tabs={tabs}
          expanded={activeTab === 'discover'}
          ariaLabel="Badge views"
          layoutId="badges-active-tab"
          onTabChange={onTabChange ? (tab) => onTabChange(tab.id) : undefined}
          fullHeader={(
            <div className="grid min-h-[116px] gap-3 md:grid-cols-[minmax(0,460px)_196px] md:items-center md:justify-between">
              <div className="relative z-10 max-w-[460px]">
                <h1 className="text-[36px] font-black leading-[0.9] tracking-normal text-foreground sm:text-[44px] lg:text-[50px]">
                  <span className="block">Skills that</span>
                  <span className="relative inline-block">
                    <span className="absolute inset-x-[-0.08em] bottom-[0.08em] top-[0.46em] -z-10 rotate-[-1deg] bg-lime-300" />
                    open
                  </span>{' '}doors.
                </h1>
                <p className="mt-1.5 text-base font-medium leading-5 text-muted-foreground">Learn. Earn. Get recognized.</p>
              </div>
              <div className="hidden justify-end md:flex">
                <img src={badgesImage.src} alt="" className="h-[148px] w-[148px] object-contain" />
              </div>
            </div>
          )}
          compactHeader={(
            <div className="flex items-center gap-3">
              <img src={badgesImage.src} alt="" className="h-10 w-10 object-contain" />
              <h1 className="text-base font-bold">Badges</h1>
            </div>
          )}
        />
        <div className="py-8 sm:py-12">{children}</div>
      </GeneralWrapperStyled>
    </main>
  )
}
