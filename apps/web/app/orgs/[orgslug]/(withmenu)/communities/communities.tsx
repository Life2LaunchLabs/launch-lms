'use client'

import React from 'react'
import { useTranslation } from 'react-i18next'
import TypeOfContentTitle from '@components/Objects/StyledElements/Titles/TypeOfContentTitle'
import GeneralWrapperStyled from '@components/Objects/StyledElements/Wrappers/GeneralWrapper'
import CommunityCard from '@components/Objects/Communities/CommunityCard'
import ContentPlaceHolderIfUserIsNotAdmin from '@components/Objects/ContentPlaceHolder'
import { Users, MessagesSquare } from 'lucide-react'
import { Community } from '@services/communities/communities'
import FeatureDisabledView from '@components/Dashboard/Shared/FeatureDisabled/FeatureDisabledView'

interface CommunitiesClientProps {
  communities: Community[]
  orgslug: string
  org_id: number
}

const CommunitiesClient = ({ communities, orgslug, org_id }: CommunitiesClientProps) => {
  const { t } = useTranslation()

  return (
    <FeatureDisabledView
      featureName="communities"
      orgslug={orgslug}
      icon={MessagesSquare}
      context="public"
    >
    <GeneralWrapperStyled>
      <div className="flex flex-col space-y-2 mb-6">
        <div className="flex items-center justify-between">
          <TypeOfContentTitle title={t('communities.title')} type="col" />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {communities.map((community: Community) => (
            <div key={community.community_uuid}>
              <CommunityCard
                community={community}
                orgslug={orgslug}
                org_id={org_id}
                variant="public"
              />
            </div>
          ))}
          {communities.length === 0 && (
            <div className="col-span-full flex flex-col justify-center items-center py-12 px-4 border-2 border-dashed border-gray-100 rounded-2xl bg-gray-50/30">
              <div className="p-4 bg-white rounded-full nice-shadow mb-4">
                <Users className="w-8 h-8 text-gray-300" strokeWidth={1.5} />
              </div>
              <h1 className="text-xl font-bold text-gray-600 mb-2">
                {t('communities.no_communities')}
              </h1>
              <p className="text-md text-gray-400 mb-6 text-center max-w-xs">
                <ContentPlaceHolderIfUserIsNotAdmin
                  text={t('communities.no_communities_description')}
                />
              </p>
            </div>
          )}
        </div>
      </div>
    </GeneralWrapperStyled>
    </FeatureDisabledView>
  )
}

export default CommunitiesClient
