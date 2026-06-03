'use client'

import React from 'react'
import GeneralWrapperStyled from '@components/Objects/StyledElements/Wrappers/GeneralWrapper'
import CoreCoursesProgressSection from '@components/CoreCourses/CoreCoursesProgressSection'

interface LandingClassicProps {
  orgslug: string
}

function LandingClassic({ orgslug }: LandingClassicProps) {
  return (
    <div className="w-full">
      <GeneralWrapperStyled>
        <CoreCoursesProgressSection orgslug={orgslug} />
      </GeneralWrapperStyled>
    </div>
  )
}

export default LandingClassic
