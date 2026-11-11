'use client'

import React from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import { Building2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { getUriWithOrg, routePaths } from '@services/config/config'
import { getOrgLogoMediaDirectory, getOrgThumbnailMediaDirectory } from '@services/media/media'
import { getDiscoverOrganizations, type DiscoverOrganization } from '@services/organizations/orgs'
import { SectionTitle, Shelf } from './PlanArt'
import { tr } from '@/lib/tr'

/** Organizations that chose to be listed in Discover and whose page is ready (a cover, a tagline and a plan to join). */
export function useListedOrganizations(query = '', enabled = true) {
  const session = useLHSession() as any
  const token = session?.data?.tokens?.access_token
  return useSWR<DiscoverOrganization[]>(enabled ? ['discover-orgs', query, token || 'public'] : null,
    () => getDiscoverOrganizations({ page: 1, limit: 24, query, listed: true }, null, token || undefined), { keepPreviousData: true })
}

export function offerLine(org: Pick<DiscoverOrganization, 'plan_count' | 'badge_count'>): string {
  const plans = org.plan_count === 1 ? tr('discover.organizations.one_plan', '1 plan') : tr('discover.organizations.count_plans', '{{count}} plans', { count: org.plan_count })
  if (!org.badge_count) return plans
  const badges = org.badge_count === 1 ? tr('discover.organizations.one_badge', '1 badge') : tr('discover.organizations.count_badges', '{{count}} badges', { count: org.badge_count })
  return `${plans} · ${badges}`
}

/** An organization on a shelf: its cover with the logo over it, its name, tagline and what it offers. Sized like a plan tile. */
export function OrganizationCard({ org, orgslug, width = 196, fill = false }: { org: DiscoverOrganization; orgslug: string; width?: number; fill?: boolean }) {
  const cover = org.thumbnail_image ? getOrgThumbnailMediaDirectory(org.org_uuid, org.thumbnail_image) : null
  const logo = org.logo_image ? getOrgLogoMediaDirectory(org.org_uuid, org.logo_image) : null
  return <Link href={getUriWithOrg(orgslug, routePaths.org.organization(org.slug))} className={cn('group flex flex-col gap-2 text-foreground no-underline', fill ? 'w-full' : 'shrink-0')} style={fill ? undefined : { width }}>
    <span className="relative block h-[180px] transition-transform duration-200 group-hover:-translate-y-[3px]">
      <span className="block h-[148px] overflow-hidden rounded-[18px] bg-muted">
        {cover ? <img src={cover} alt="" className="h-full w-full object-cover" /> : null}
      </span>
      <span className="absolute bottom-0 left-3 flex h-14 w-14 items-center justify-center overflow-hidden rounded-2xl border-4 border-background bg-card shadow-sm">
        {logo ? <img src={logo} alt="" className="h-full w-full object-cover" /> : <Building2 size={22} className="text-muted-foreground" aria-hidden="true" />}
      </span>
    </span>
    <span className="px-0.5 text-base font-black leading-tight">{org.name}</span>
    {org.description ? <span className="-mt-1 line-clamp-2 px-0.5 text-[13px] text-muted-foreground">{org.description}</span> : null}
    <span className="-mt-1 px-0.5 text-[13px] font-semibold text-muted-foreground">{offerLine(org)}</span>
  </Link>
}

/** Discover's Organizations shelf: the second way in after plans. Hidden when no organization is listed. */
export default function OrganizationShelf({ orgslug }: { orgslug: string }) {
  const { data } = useListedOrganizations()
  if (!data?.length) return null
  return <section aria-label={tr('discover.organizations.title', 'Organizations')} className="flex flex-col gap-3.5">
    <SectionTitle>{tr('discover.organizations.title', 'Organizations')}</SectionTitle>
    <Shelf label={tr('discover.organizations.title', 'Organizations')}>{data.map((org) => <OrganizationCard key={org.org_uuid} org={org} orgslug={orgslug} />)}</Shelf>
  </section>
}
