'use client'

import React from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useOrg } from '@components/Contexts/OrgContext'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import GeneralWrapper from '@components/Objects/StyledElements/Wrappers/GeneralWrapper'
import DiscoverFeed from './DiscoverFeed'
import DiscoverResults from './DiscoverResults'
import DiscoverSearchBar, { filtersApplied, type DiscoverFilters } from './DiscoverSearchBar'
import ResourceSheet from './ResourceSheet'

import { tr } from '@/lib/tr'
/**
 * Discover: plans to join (many earn a badge) and resources to use, searchable from the top. With no search
 * or filters it's a feed; otherwise it's a results view. The URL holds both.
 */
export default function DiscoverPage({ orgslug }: { orgslug: string }) {
  const org = useOrg() as any
  const session = useLHSession() as any
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  // Plans organizations offer and resources are open to every learner.
  const showPlans = true
  const showResources = Boolean(org)
  const query = params.get('q') || ''
  const filters: DiscoverFilters = React.useMemo(() => ({
    // Old links ask for badges: badges are earned through plans.
    type: params.get('type') === 'badges' ? 'plans' : ['plans', 'organizations', 'resources'].includes(params.get('type') || '') ? params.get('type') as DiscoverFilters['type'] : '',
    resourceTypes: (params.get('resource_types') || '').split(',').filter(Boolean),
    saved: params.get('saved') === '1',
  }), [params])

  const update = React.useCallback((patch: Record<string, string>) => {
    const next = new URLSearchParams(params.toString())
    for (const [key, value] of Object.entries(patch)) { if (value) next.set(key, value); else next.delete(key) }
    router.replace(`${pathname}${next.size ? `?${next}` : ''}`, { scroll: false })
  }, [params, pathname, router])
  const onQuery = React.useCallback((value: string) => update({ q: value }), [update])
  const onFilters = (value: DiscoverFilters) => update({ type: value.type, resource_types: value.resourceTypes.join(','), saved: value.saved ? '1' : '' })

  const resource = params.get('r') || ''
  const closeResource = React.useCallback(() => update({ r: '' }), [update])
  const openResource = React.useCallback((uuid: string) => update({ r: uuid.replace(/^resource_/, '') }), [update])

  const searching = Boolean(query) || filtersApplied(filters)
  const content = <GeneralWrapper wide>
    <main className="flex flex-col gap-6 pb-16 pt-2 text-foreground">
      <h1 className="sr-only">{tr('discover.discover_page.discover', 'Discover')}</h1>
      <DiscoverSearchBar query={query} onQuery={onQuery} filters={filters} onFilters={onFilters} showPlans={showPlans} showResources={showResources} signedIn={Boolean(session?.data?.tokens?.access_token)} />
      {searching
        ? <DiscoverResults orgslug={orgslug} query={query} filters={filters} showPlans={showPlans} showResources={showResources} />
        : <DiscoverFeed orgslug={orgslug} showPlans={showPlans} showResources={showResources} />}
      {resource ? <ResourceSheet resourceUuid={resource} orgslug={orgslug} onClose={closeResource} onOpen={openResource} /> : null}
    </main>
  </GeneralWrapper>
  return content
}
