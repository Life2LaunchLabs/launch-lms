'use client'

import React from 'react'
import GeneralWrapperStyled from '@components/Objects/StyledElements/Wrappers/GeneralWrapper'
import FeatureDisabledView from '@components/Dashboard/Shared/FeatureDisabled/FeatureDisabledView'
import CollectionsOverviewSection from '@components/Pages/Courses/CollectionsOverviewSection'
import { SquareLibrary } from 'lucide-react'
import FeatureInfoBanner from '@components/Onboarding/FeatureInfoBanner'
import InProgressSection from '@components/Landings/InProgressSection'

interface CourseProps {
  orgslug: string
  collections: any
  org_id: string | number
}

function Courses(props: CourseProps) {
  return (
    <div className="w-full">
      <GeneralWrapperStyled>
        <div className="mb-8">
          <InProgressSection orgslug={props.orgslug} />
        </div>
        <FeatureInfoBanner orgslug={props.orgslug} feature="courses" />
        <FeatureDisabledView
          featureName="collections"
          orgslug={props.orgslug}
          icon={SquareLibrary}
          context="public"
        >
          <CollectionsOverviewSection
            collections={props.collections || []}
            orgslug={props.orgslug}
            org_id={props.org_id}
          />
        </FeatureDisabledView>
      </GeneralWrapperStyled>
    </div>
  )
}

export default Courses
