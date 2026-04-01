'use client'

import UserCertificates from '@components/Pages/Trail/UserCertificates'
import GeneralWrapperStyled from '@components/Objects/StyledElements/Wrappers/GeneralWrapper'
import FeatureDisabledView from '@components/Dashboard/Shared/FeatureDisabled/FeatureDisabledView'
import { Award } from 'lucide-react'

function Trail(params: any) {
  const orgslug = params.orgslug

  return (
    <FeatureDisabledView
      featureName="courses"
      orgslug={orgslug}
      icon={Award}
      context="public"
    >
      <GeneralWrapperStyled>
        <UserCertificates orgslug={orgslug} />
      </GeneralWrapperStyled>
    </FeatureDisabledView>
  )
}

export default Trail
