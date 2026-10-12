'use client'

import React from 'react'
import { Award } from 'lucide-react'
import FeatureDisabledView from '@components/Dashboard/Shared/FeatureDisabled/FeatureDisabledView'
import DiscoverFeed from '@components/Badges/discover/DiscoverFeed'

/** Discover: badges to earn. Badges you're earning are plans; badges you've earned live on your portfolio. */
export default function BadgeDiscoverPage({ orgslug }: { orgslug: string }) {
  return (
    <FeatureDisabledView featureName="collections" orgslug={orgslug} icon={Award} context="public">
      <main className="min-h-screen bg-[#F4F5F9] text-[15px] leading-[1.45]">
        <h1 className="sr-only">Discover badges</h1>
        <div className="mx-auto max-w-[1280px] px-4 pb-24 pt-6 sm:px-8 sm:pt-8">
          <DiscoverFeed orgslug={orgslug} />
        </div>
      </main>
    </FeatureDisabledView>
  )
}
