'use client'
import React from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import {
  BookOpen,
  Users,
  Microphone,
  Chalkboard,
} from '@phosphor-icons/react'
import { useOrg } from '@components/Contexts/OrgContext'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { getAPIUrl, routePaths } from '@services/config/config'
import { swrFetcher } from '@services/utils/ts/requests'
import { useFeatures } from '@components/Hooks/useFeatures'

export default function ContentOverview() {
  const org = useOrg() as any
  const session = useLHSession() as any
  const token = session?.data?.tokens?.access_token
  const orgslug = org?.slug
  const orgId = org?.id
  const features = useFeatures()

  const { data: badgesData } = useSWR(
    token && orgId
      ? `${getAPIUrl()}badges/?org_id=${orgId}&admin=true`
      : null,
    (url) => swrFetcher(url, token),
    { revalidateOnFocus: false }
  )

  // Members
  const { data: membersData } = useSWR(
    token && orgId
      ? `${getAPIUrl()}orgs/${orgId}/users?page=1&limit=1`
      : null,
    (url) => swrFetcher(url, token),
    { revalidateOnFocus: false }
  )

  const resourcesEnabled = features.has('resources')
  const { data: resourcesData } = useSWR(
    resourcesEnabled && token && orgId
      ? `${getAPIUrl()}resources/org/${orgId}?include_private=true`
      : null,
    (url) => swrFetcher(url, token),
    { revalidateOnFocus: false }
  )

  // Podcasts
  const podcastsEnabled = features.has('podcasts')
  const { data: podcastsData } = useSWR(
    podcastsEnabled && token && orgslug
      ? `${getAPIUrl()}podcasts/org_slug/${orgslug}/page/1/limit/100?include_unpublished=true`
      : null,
    (url) => swrFetcher(url, token),
    { revalidateOnFocus: false }
  )

  const badges: any[] = badgesData ?? []
  const totalMembers = membersData?.total ?? 0
  const resources: any[] = resourcesData ?? []
  const podcasts: any[] = podcastsData ?? []

  const publishedBadges = badges.filter((badge: any) => badge.status === 'published').length
  const draftBadges = badges.length - publishedBadges

  const cards = [
    {
      label: 'Badges',
      value: badges.length,
      sub: `${publishedBadges} published · ${draftBadges} draft`,
      icon: BookOpen,
      iconColor: 'text-blue-500',
      iconBg: 'bg-blue-50',
      href: routePaths.org.admin.badges(),
      show: true,
    },
    {
      label: 'Members',
      value: totalMembers,
      sub: 'Total users',
      icon: Users,
      iconColor: 'text-indigo-500',
      iconBg: 'bg-indigo-50',
      href: routePaths.org.admin.people.root(),
      show: true,
    },
    {
      label: 'Resources',
      value: resources.length,
      sub: `${resources.filter((r: any) => r.is_saved).length} saved by you`,
      icon: Chalkboard,
      iconColor: 'text-emerald-500',
      iconBg: 'bg-emerald-50',
      href: routePaths.org.admin.content.resources(),
      show: resourcesEnabled,
    },
    {
      label: 'Podcasts',
      value: podcasts.length,
      sub: `${podcasts.reduce((sum: number, p: any) => sum + (p.episode_count || 0), 0)} episodes`,
      icon: Microphone,
      iconColor: 'text-amber-500',
      iconBg: 'bg-amber-50',
      href: routePaths.org.admin.content.podcasts(),
      show: podcastsEnabled,
    },
  ]

  const visibleCards = cards.filter((c) => c.show)

  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-4">
      {visibleCards.map((card) => (
        <Link
          key={card.label}
          href={card.href}
          className="bg-white rounded-xl nice-shadow px-5 py-4 hover:bg-gray-50 transition-colors group"
        >
          <div className="flex items-center gap-2 mb-2">
            <div className={`p-1.5 rounded-lg ${card.iconBg}`}>
              <card.icon
                size={14}
                weight="duotone"
                className={card.iconColor}
              />
            </div>
            <span className="text-xs font-medium text-gray-400">
              {card.label}
            </span>
          </div>
          <div className="text-2xl font-bold text-gray-900">{card.value}</div>
          <p className="text-[11px] text-gray-300 mt-0.5">{card.sub}</p>
        </Link>
      ))}
    </div>
  )
}
