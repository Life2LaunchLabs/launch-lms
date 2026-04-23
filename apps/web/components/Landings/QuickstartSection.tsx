'use client'

import type { ComponentType } from 'react'
import Link from 'next/link'
import {
  Community,
} from '@services/communities/communities'
import { getUriWithOrg } from '@services/config/config'
import {
  getCollectionThumbnailMediaDirectory,
  getCommunityThumbnailMediaDirectory,
  getResourceChannelThumbnailMediaDirectory,
} from '@services/media/media'
import { ResourceChannel } from '@services/resources/resources'
import {
  LandingQuickstartItem,
} from '@components/Dashboard/Pages/Org/OrgEditLanding/landing_types'
import { QUICKSTART_FEATURES } from './quickstartConfig'
import CollectionCoverFanThumbnail, {
  CollectionCoverFanCourse,
} from '@components/Objects/Thumbnails/CollectionCoverFanThumbnail'

type CollectionLike = {
  collection_uuid: string
  name: string
  thumbnail_image?: string | null
  owner_org_uuid?: string | null
  courses?: Array<{
    course_uuid: string
    thumbnail_image?: string | null
    owner_org_uuid?: string | null
  }>
}

interface QuickstartSectionProps {
  title?: string
  items: LandingQuickstartItem[]
  orgslug: string
  orgUUID?: string
  collections: CollectionLike[]
  communities: Community[]
  resourceChannels: ResourceChannel[]
}

type ResolvedQuickstartCard = {
  key: string
  title: string
  href: string
  imageUrl?: string | null
  fallbackCourses?: CollectionCoverFanCourse[]
  fallbackOrgUuid?: string | null
  Icon?: ComponentType<{ className?: string }>
}

function getResourceChannelHref(orgslug: string, channelUuid: string) {
  return getUriWithOrg(
    orgslug,
    `/resources?channel=${encodeURIComponent(channelUuid)}`
  )
}

function resolveQuickstartCard(
  item: LandingQuickstartItem,
  orgslug: string,
  orgUUID: string | undefined,
  collections: CollectionLike[],
  communities: Community[],
  resourceChannels: ResourceChannel[]
): ResolvedQuickstartCard | null {
  if (item.type === 'feature' && item.feature) {
    const feature = QUICKSTART_FEATURES[item.feature]
    if (!feature) return null

    return {
      key: `feature-${item.feature}`,
      title: feature.label,
      href: getUriWithOrg(orgslug, feature.href),
      Icon: feature.icon,
    }
  }

  if (item.type === 'collection' && item.target_uuid) {
    const collection = collections.find(
      (entry) => entry.collection_uuid === item.target_uuid
    )
    if (!collection) return null

    return {
      key: collection.collection_uuid,
      title: collection.name,
      href: getUriWithOrg(
        orgslug,
        `/collection/${collection.collection_uuid.replace('collection_', '')}`
      ),
      imageUrl:
        collection.thumbnail_image && (collection.owner_org_uuid || orgUUID)
          ? getCollectionThumbnailMediaDirectory(
              collection.owner_org_uuid || orgUUID || '',
              collection.collection_uuid,
              collection.thumbnail_image
            )
          : null,
      fallbackCourses:
        collection.thumbnail_image || !collection.courses?.length
          ? []
          : collection.courses
              .filter(
                (course) =>
                  course.thumbnail_image &&
                  (course.owner_org_uuid || collection.owner_org_uuid || orgUUID)
              )
              .slice(0, 3),
      fallbackOrgUuid: collection.owner_org_uuid || orgUUID,
    }
  }

  if (item.type === 'community' && item.target_uuid) {
    const community = communities.find(
      (entry) => entry.community_uuid === item.target_uuid
    )
    if (!community) return null

    return {
      key: community.community_uuid,
      title: community.name,
      href: getUriWithOrg(
        orgslug,
        `/community/${community.community_uuid.replace('community_', '')}`
      ),
      imageUrl:
        community.thumbnail_image && (community.owner_org_uuid || orgUUID)
          ? getCommunityThumbnailMediaDirectory(
              community.owner_org_uuid || orgUUID || '',
              community.community_uuid,
              community.thumbnail_image
            )
          : null,
    }
  }

  if (item.type === 'resource-channel' && item.target_uuid) {
    const channel = resourceChannels.find(
      (entry) => entry.channel_uuid === item.target_uuid
    )
    if (!channel) return null

    return {
      key: channel.channel_uuid,
      title: channel.name,
      href: getResourceChannelHref(orgslug, channel.channel_uuid),
      imageUrl:
        channel.thumbnail_image && (channel.owner_org_uuid || orgUUID)
          ? getResourceChannelThumbnailMediaDirectory(
              channel.owner_org_uuid || orgUUID || '',
              channel.channel_uuid,
              channel.thumbnail_image
            )
          : null,
    }
  }

  return null
}

export default function QuickstartSection({
  items,
  orgslug,
  orgUUID,
  collections,
  communities,
  resourceChannels,
}: QuickstartSectionProps) {
  const cards = items
    .map((item) =>
      resolveQuickstartCard(
        item,
        orgslug,
        orgUUID,
        collections,
        communities,
        resourceChannels
      )
    )
    .filter((card): card is ResolvedQuickstartCard => card !== null)

  if (cards.length === 0) {
    return null
  }

  return (
    <section className="py-8 w-full">
      <div className="flex flex-wrap gap-4">
        {cards.map((card) => (
          <Link
            key={card.key}
            href={card.href}
            className="group flex w-full max-w-[148px] flex-col"
          >
            <div className="aspect-square w-full overflow-hidden rounded-[8px] bg-[#f2f4f7] ring-1 ring-black/6 transition-all duration-200 group-hover:bg-[#e8ecf1] group-hover:ring-black/10">
              {card.imageUrl ? (
                <img
                  src={card.imageUrl}
                  alt={card.title}
                  className="h-full w-full object-cover"
                />
              ) : card.fallbackCourses?.length ? (
                <CollectionCoverFanThumbnail
                  courses={card.fallbackCourses}
                  fallbackOrgUuid={card.fallbackOrgUuid}
                />
              ) : card.Icon ? (
                <div className="flex h-full w-full items-center justify-center">
                  <card.Icon className="text-black/55" />
                </div>
              ) : null}
            </div>
            <div className="pt-1.5">
              <p className="text-sm font-semibold text-black/80 transition-colors group-hover:text-black">
                {card.title}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </section>
  )
}
