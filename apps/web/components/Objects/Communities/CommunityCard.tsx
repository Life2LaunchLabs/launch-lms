'use client'
import { useOrg } from '@components/Contexts/OrgContext'
import { getUriWithOrg, routePaths } from '@services/config/config'
import { Community } from '@services/communities/communities'
import { getCommunityThumbnailMediaDirectory } from '@services/media/media'
import { Users, MessageCircle } from 'lucide-react'
import Link from 'next/link'
import React from 'react'
import { useTranslation } from 'react-i18next'

type PropsType = {
  community: Community
  orgslug: string
  org_id: string | number
}

const removeCommunityPrefix = (communityid: string) => {
  return communityid.replace('community_', '')
}

function CommunityCard(props: PropsType) {
  const { t } = useTranslation()
  const org = useOrg() as any
  const communityId = removeCommunityPrefix(props.community.community_uuid)
  const ownerOrgUuid = props.community.owner_org_uuid || org?.org_uuid
  const communityLink = getUriWithOrg(props.orgslug, routePaths.org.community(communityId))

  return (
    <div
      className="group relative flex flex-col bg-card rounded-xl nice-shadow overflow-hidden w-full transition-all duration-300 hover:scale-[1.01]"
    >
      <Link
        href={communityLink}
        className="block relative aspect-video overflow-hidden bg-muted"
      >
        {props.community.thumbnail_image && ownerOrgUuid ? (
          <img
            src={getCommunityThumbnailMediaDirectory(
              ownerOrgUuid,
              props.community.community_uuid,
              props.community.thumbnail_image
            )}
            alt={props.community.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="flex flex-col items-center justify-center h-full w-full text-gray-300 gap-2">
            <Users size={40} strokeWidth={1.5} />
          </div>
        )}
      </Link>

      <div className="p-3 flex flex-col space-y-1.5">
        <Link
          href={communityLink}
          className="text-base font-bold text-foreground leading-tight hover:text-foreground transition-colors line-clamp-1"
        >
          {props.community.name}
        </Link>

        {props.community.description && (
          <p className="text-[11px] text-muted-foreground line-clamp-2 min-h-[1.5rem]">
            {props.community.description}
          </p>
        )}

        <div className="pt-1.5 flex items-center justify-between border-t border-border">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <MessageCircle size={12} />
            <span className="text-[10px] font-bold uppercase tracking-wider">
              {props.community.public ? t('courses.public') : t('courses.private')}
            </span>
          </div>

          <Link
            href={communityLink}
            className="text-[10px] font-bold text-muted-foreground hover:text-foreground transition-colors uppercase tracking-wider"
          >
            {t('dashboard.courses.communities.card.view_community')}
          </Link>
        </div>
        {props.community.owner_org_name && (
          <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
            {props.community.owner_org_name}
          </div>
        )}
      </div>
    </div>
  )
}

export default CommunityCard
