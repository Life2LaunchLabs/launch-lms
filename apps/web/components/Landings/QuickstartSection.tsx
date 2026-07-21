'use client'

import type { ComponentType } from 'react'
import Link from 'next/link'
import {
  Community,
} from '@services/communities/communities'
import { getUriWithOrg } from '@services/config/config'
import {
  getCommunityThumbnailMediaDirectory,
  getResourceChannelThumbnailMediaDirectory,
} from '@services/media/media'
import { ResourceChannel } from '@services/resources/resources'
import {
  LandingQuickstartItem,
} from '@components/Dashboard/Pages/Org/OrgEditLanding/landing_types'
import { QUICKSTART_FEATURES } from './quickstartConfig'

interface QuickstartSectionProps {
  title?: string
  description?: string
  items: LandingQuickstartItem[]
  orgslug: string
  orgUUID?: string
  communities: Community[]
  resourceChannels: ResourceChannel[]
}

type ResolvedQuickstartCard = {
  key: string
  title: string
  href: string
  imageUrl?: string | null
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
  title,
  description,
  items,
  orgslug,
  orgUUID,
  communities,
  resourceChannels,
}: QuickstartSectionProps) {
  const cards = items
    .map((item) =>
      resolveQuickstartCard(
        item,
        orgslug,
        orgUUID,
        communities,
        resourceChannels
      )
    )
    .filter((card): card is ResolvedQuickstartCard => card !== null)

  if (cards.length === 0) {
    return null
  }

  return (
    <section className="w-full">
      {title && (
        <h2 className="my-2 text-lg font-bold tracking-tight text-foreground">
          {title}
        </h2>
      )}
      {description && (
        <p className="mb-3 text-sm text-muted-foreground line-clamp-2">{description}</p>
      )}
      <div className="mt-3 flex gap-4">
        {cards.map((card) => (
          <Link
            key={card.key}
            href={card.href}
            className="group flex min-w-0 flex-1 flex-col"
          >
            <div className="h-44 w-full overflow-hidden rounded-[8px] bg-[#f2f4f7] ring-1 ring-black/6 transition-all duration-200 group-hover:bg-[#e8ecf1] group-hover:ring-black/10">
              {card.imageUrl ? (
                <img
                  src={card.imageUrl}
                  alt={card.title}
                  className="h-full w-full object-cover"
                />
              ) : card.Icon ? (
                <div className="flex h-full w-full items-center justify-center">
                  <card.Icon className="text-foreground/55" />
                </div>
              ) : null}
            </div>
            <div className="pt-1.5">
              <p className="text-sm font-semibold text-foreground/80 transition-colors group-hover:text-foreground">
                {card.title}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </section>
  )
}
