'use client'

import React from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import { Building2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getUriWithOrg, routePaths } from '@services/config/config'
import { getOrgLogoMediaDirectory } from '@services/media/media'
import { getDiscoverOrganizations, type DiscoverOrganization } from '@services/organizations/orgs'
import { useConnectToken } from './useConnect'

type OrgLike = { org_uuid: string; name: string; slug: string; logo_image?: string | null }

/** An organization's mark: its logo, or a building on its own square. */
export function OrgMark({ org, size = 'md' }: { org?: OrgLike | null; size?: 'sm' | 'md' }) {
  const box = size === 'md' ? 'h-9 w-9 rounded-xl' : 'h-7 w-7 rounded-lg'
  if (org?.logo_image) return <img src={getOrgLogoMediaDirectory(org.org_uuid, org.logo_image)} alt="" className={cn(box, 'shrink-0 object-cover')} />
  return <span className={cn(box, 'flex shrink-0 items-center justify-center bg-emerald-600 text-white')}><Building2 size={size === 'md' ? 18 : 14} /></span>
}

/** Organizations matching a search, above the people it finds. */
export function OrganizationResults({ orgslug, query }: { orgslug: string; query: string }) {
  const token = useConnectToken()
  const needle = query.trim().replace(/^@/, '')
  const { data } = useSWR<DiscoverOrganization[]>(['connect-org-search', needle, token], () => getDiscoverOrganizations({ page: 1, limit: 5, query: needle }, null, token || undefined), { keepPreviousData: true })
  if (!data?.length) return null
  return <ul className="mb-1 flex flex-col gap-0.5 border-b border-border pb-1">{data.map((org) => <li key={org.org_uuid}>
    <Link href={getUriWithOrg(orgslug, routePaths.org.organization(org.slug))} className="flex items-center gap-3 rounded-2xl px-2.5 py-2.5 hover:bg-foreground/[0.05]">
      <OrgMark org={org} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-semibold">{org.name}</span>
        <span className="block truncate text-sm text-muted-foreground">Organization{org.is_member ? ' · You’re a member' : ` · ${org.member_count} members`}</span>
      </span>
    </Link>
  </li>)}</ul>
}
