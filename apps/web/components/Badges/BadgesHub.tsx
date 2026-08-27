'use client'

import React, { useEffect, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import BadgeDiscoverPage from '@components/Badges/BadgeDiscoverPage'
import BadgesPageShell, { type BadgesPageTab } from '@components/Badges/BadgesPageShell'
import { PortfolioBadgesView, type Shell } from '@components/Pages/Portfolio/PortfolioShell'
import LearnerProgramsPage from '@components/Programs/LearnerPrograms'
import { getUriWithOrg, routePaths } from '@services/config/config'

function tabForPath(pathname: string): BadgesPageTab {
  if (pathname.endsWith('/badges/my-badges')) return 'my-badges'
  if (pathname.endsWith('/programs') || pathname.endsWith('/badges/programs')) return 'programs'
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

  useEffect(() => {
    const handlePopState = () => setActiveTab(tabForPath(window.location.pathname))
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  function changeTab(tab: BadgesPageTab) {
    if (tab === activeTab) return
    const href = getUriWithOrg(orgslug, tab === 'discover' ? routePaths.org.badges() : tab === 'my-badges' ? routePaths.org.myBadges() : routePaths.org.programs())
    if (tab === 'my-badges' && !initialPortfolio) {
      window.location.assign(href)
      return
    }
    setActiveTab(tab)
    window.history.pushState({}, '', href)
    window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' })
  }

  return (
    <BadgesPageShell orgslug={orgslug} activeTab={activeTab} onTabChange={changeTab}>
      <AnimatePresence mode="wait" initial={false}>
        {activeTab === 'discover' ? (
          <motion.div key="discover"><BadgeDiscoverPage orgslug={orgslug} collections={collections} choosingBadge={choosingBadge} /></motion.div>
        ) : activeTab === 'my-badges' && initialPortfolio ? (
          <motion.div key="my-badges"><PortfolioBadgesView initialShell={initialPortfolio} orgslug={orgslug} /></motion.div>
        ) : (
          <motion.div key="programs"><LearnerProgramsPage orgslug={orgslug} embedded /></motion.div>
        )}
      </AnimatePresence>
    </BadgesPageShell>
  )
}
