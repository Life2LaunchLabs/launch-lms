'use client'

import React, { useEffect, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import BadgeDiscoverPage from '@components/Badges/BadgeDiscoverPage'
import BadgesPageShell, { type BadgesPageTab } from '@components/Badges/BadgesPageShell'
import { PortfolioBadgesView, type Shell } from '@components/Pages/Portfolio/PortfolioShell'
import { getUriWithOrg, routePaths } from '@services/config/config'

function tabForPath(pathname: string): BadgesPageTab {
  if (pathname.endsWith('/badges/my-badges')) return 'my-badges'
  return 'discover'
}

export default function BadgesHub({
  orgslug,
  initialTab,
  collections,
  choosingBadge = false,
  initialPortfolio,
}: {
  orgslug: string
  initialTab: BadgesPageTab
  collections: any[]
  choosingBadge?: boolean
  initialPortfolio?: Shell | null
}) {
  const reduceMotion = useReducedMotion()
  const [activeTab, setActiveTab] = useState(initialTab)
  const [choosing, setChoosing] = useState(choosingBadge)

  // Server navigation (e.g. a link from elsewhere) re-renders with new props; keep local state in step.
  const [syncedProps, setSyncedProps] = useState({ initialTab, choosingBadge })
  if (syncedProps.initialTab !== initialTab || syncedProps.choosingBadge !== choosingBadge) {
    setSyncedProps({ initialTab, choosingBadge })
    setActiveTab(initialTab)
    setChoosing(choosingBadge)
  }

  useEffect(() => {
    const handlePopState = () => {
      setActiveTab(tabForPath(window.location.pathname))
      setChoosing(new URLSearchParams(window.location.search).get('choose') === '1')
    }
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  function changeTab(tab: BadgesPageTab) {
    if (tab === activeTab) return
    const href = getUriWithOrg(orgslug, tab === 'discover' ? routePaths.org.badges() : routePaths.org.myBadges())
    if (tab === 'my-badges' && !initialPortfolio) {
      window.location.assign(href)
      return
    }
    setActiveTab(tab)
    window.history.pushState({}, '', href)
    window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' })
  }

  // Switching tabs in place: a link to /badges?choose=1 from My Badges would not change the tab state.
  function chooseBadge() {
    setActiveTab('discover')
    setChoosing(true)
    window.history.pushState({}, '', `${getUriWithOrg(orgslug, routePaths.org.badges())}?choose=1`)
    window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' })
  }

  return (
    <BadgesPageShell orgslug={orgslug} activeTab={activeTab} onTabChange={changeTab}>
      <AnimatePresence mode="wait" initial={false}>
        {activeTab === 'discover' ? (
          <motion.div key="discover"><BadgeDiscoverPage orgslug={orgslug} collections={collections} choosingBadge={choosing} /></motion.div>
        ) : activeTab === 'my-badges' && initialPortfolio ? (
          <motion.div key="my-badges"><PortfolioBadgesView initialShell={initialPortfolio} orgslug={orgslug} onChooseBadge={chooseBadge} /></motion.div>
        ) : null}
      </AnimatePresence>
    </BadgesPageShell>
  )
}
