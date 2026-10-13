'use client'

import React from 'react'
import { Award } from 'lucide-react'
import FeatureDisabledView from '@components/Dashboard/Shared/FeatureDisabled/FeatureDisabledView'
import DiscoverFeed from '@components/Badges/discover/DiscoverFeed'
import GeneralWrapper from '@components/Objects/StyledElements/Wrappers/GeneralWrapper'
import TabbedPageHeader from '@components/Objects/StyledElements/Headers/TabbedPageHeader'

/** Discover: badges to earn. Badges you're earning are plans; badges you've earned live on your portfolio. */
export default function BadgeDiscoverPage({ orgslug }: { orgslug: string }) {
  return (
    <FeatureDisabledView featureName="collections" orgslug={orgslug} icon={Award} context="public">
      <GeneralWrapper wide>
        <main className="pb-16 text-foreground">
          <TabbedPageHeader activeTab="discover" tabs={[]} expanded={false} fullHeader={null} compactHeader={<h1 className="text-2xl font-semibold tracking-tight">Discover</h1>} />
          <div className="pt-6"><DiscoverFeed orgslug={orgslug} /></div>
        </main>
      </GeneralWrapper>
    </FeatureDisabledView>
  )
}
