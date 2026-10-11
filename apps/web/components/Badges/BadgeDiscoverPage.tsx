'use client'

import React from 'react'
import { Award, ChevronDown } from 'lucide-react'
import FeatureDisabledView from '@components/Dashboard/Shared/FeatureDisabled/FeatureDisabledView'
import DiscoverFeed from '@components/Badges/discover/DiscoverFeed'

type BadgeDiscoverPageProps = {
  orgslug: string
  choosingBadge?: boolean
}

export default function BadgeDiscoverPage({ orgslug, choosingBadge = false }: BadgeDiscoverPageProps) {
  return (
    <FeatureDisabledView featureName="collections" orgslug={orgslug} icon={Award} context="public">
      <div className="flex flex-col gap-6 pb-12 pt-5 md:pt-0">
        {choosingBadge ? (
          <section className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-xl bg-[var(--org-primary-color)] px-4 py-3 text-[var(--org-on-primary-color)] shadow-sm" aria-labelledby="choose-a-badge-title">
            <Award className="h-5 w-5" aria-hidden="true" />
            <div className="min-w-0">
              <h1 id="choose-a-badge-title" className="truncate text-sm font-black">Pick a badge to start</h1>
              <p className="mt-0.5 truncate text-xs opacity-80">Open one that interests you and select <strong className="font-black">Start earning</strong>.</p>
            </div>
            <ChevronDown className="h-5 w-5 opacity-75" aria-hidden="true" />
          </section>
        ) : null}
        <DiscoverFeed orgslug={orgslug} />
      </div>
    </FeatureDisabledView>
  )
}
