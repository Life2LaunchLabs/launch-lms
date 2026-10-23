'use client'

import React from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { PaperPlaneTilt, Storefront } from '@phosphor-icons/react'
import { useOrg } from '@components/Contexts/OrgContext'
import { usePlansTabCounts } from '@components/Admin/Plans/usePlansTabCounts'
import { getUriWithOrg, routePaths } from '@services/config/config'
import type { MarketplaceType } from '@services/routing/paths'
import { cn } from '@/lib/utils'
import DiscoverHome from '@components/Goals/admin/discover/DiscoverHome'
import MarketplaceRequests from './MarketplaceRequests'

/** Plans › Discover: what organizations share (plans, collections, frameworks, badges), or the Requests view (`?view=requests`). */
export default function Marketplace() {
  const params = useSearchParams()
  const org = useOrg() as { slug?: string } | null
  const orgslug = org?.slug || ''
  const view = params?.get('view') === 'requests' ? 'requests' : 'browse'
  const waiting = usePlansTabCounts().marketplace?.count || 0
  const type = (params?.get('type') || null) as MarketplaceType | null
  const views = [
    { id: 'browse' as const, label: 'Browse', icon: Storefront, href: routePaths.org.admin.marketplace({ type }) },
    { id: 'requests' as const, label: 'Requests', icon: PaperPlaneTilt, href: routePaths.org.admin.marketplace({ view: 'requests' }) },
  ]
  return <div className="px-4 pb-10 pt-6 sm:px-10"><div className="mx-auto max-w-6xl space-y-5">
    <nav aria-label="Marketplace view" className="inline-flex rounded-full bg-gray-100 p-1">
      {views.map(({ id, label, icon: Icon, href }) => <Link key={id} href={getUriWithOrg(orgslug, href)} aria-current={view === id ? 'page' : undefined}
        className={cn('inline-flex h-9 items-center gap-1.5 rounded-full px-4 text-sm font-semibold', view === id ? 'bg-black text-white' : 'text-gray-700 hover:text-black')}>
        <Icon size={15} />{label}
        {id === 'requests' && waiting ? <span className="ml-0.5 inline-grid h-5 min-w-5 place-items-center rounded-full bg-red-600 px-1 text-[11px] font-bold text-white" aria-label={`${waiting} waiting`}>{waiting}</span> : null}
      </Link>)}
    </nav>
    {view === 'requests' ? <MarketplaceRequests /> : <DiscoverHome orgslug={orgslug} />}
  </div></div>
}
