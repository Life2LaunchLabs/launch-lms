'use client'

import React from 'react'
import GeneralWrapperStyled from '@components/Objects/StyledElements/Wrappers/GeneralWrapper'
import FeatureDisabledView from '@components/Dashboard/Shared/FeatureDisabled/FeatureDisabledView'
import CollectionsOverviewSection from '@components/Pages/Courses/CollectionsOverviewSection'
import { SquareLibrary } from 'lucide-react'
import FeatureInfoBanner from '@components/Onboarding/FeatureInfoBanner'

interface CourseProps {
  orgslug: string
  collections: any
  org_id: string | number
}

function Courses(props: CourseProps) {
  return (
    <FeatureDisabledView
      featureName="collections"
      orgslug={props.orgslug}
      icon={SquareLibrary}
      context="public"
    >
      <div className="w-full">
        <GeneralWrapperStyled>
          <FeatureInfoBanner orgslug={props.orgslug} feature="courses" />
          <CollectionsOverviewSection
            collections={props.collections || []}
            orgslug={props.orgslug}
            org_id={props.org_id}
          />
        </GeneralWrapperStyled>
      </div>
    </FeatureDisabledView>
  )
}

export default Courses
