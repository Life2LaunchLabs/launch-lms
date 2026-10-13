'use client'

import React from 'react'
import useSWR from 'swr'
import { Loader2, SearchX, Sparkles } from 'lucide-react'
import { useOrg } from '@components/Contexts/OrgContext'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { useHub } from '@components/Hub/HubContext'
import { Button } from '@components/ui/button'
import { BadgeTile } from '@components/Badges/discover/BadgeArt'
import { getResources } from '@services/resources/resources'
import type { BadgeCard } from '@services/learning/badgeDiscover'
import { useBadgeFeed } from './DiscoverFeed'
import { ResourceTile } from './ResourceShelves'
import type { DiscoverFilters } from './DiscoverSearchBar'

const GRID = 'grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 lg:grid-cols-4'

function matches(card: BadgeCard, terms: string[]) {
  const text = `${card.name} ${card.subtitle || ''} ${card.description || ''} ${card.collection?.name || ''}`.toLowerCase()
  return terms.every((term) => text.includes(term))
}

/** Search and filter results: matching badges and resources in their own groups, and a way to ask Coach instead. */
export default function DiscoverResults({ orgslug, query, filters, showBadges, showResources }: { orgslug: string; query: string; filters: DiscoverFilters; showBadges: boolean; showResources: boolean }) {
  const org = useOrg() as any
  const session = useLHSession() as any
  const hub = useHub()
  const token = session?.data?.tokens?.access_token
  const wantBadges = showBadges && filters.type !== 'resources' && !filters.resourceTypes.length && !filters.saved
  const wantResources = showResources && filters.type !== 'badges'
  const { data: feed } = useBadgeFeed(wantBadges)
  const resourceParams = { query: query || undefined, resource_types: filters.resourceTypes.join(',') || undefined, saved_only: filters.saved || undefined, limit: 50 }
  const { data: resources, error: resourcesError, isLoading: resourcesLoading } = useSWR(wantResources && org?.id ? ['discover-search', org.id, token || 'public', JSON.stringify(resourceParams)] : null, () => getResources(org.id, resourceParams, token), { keepPreviousData: true })
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean)
  const badges = wantBadges && feed ? [...feed.keep_going, ...feed.badges].filter((card, index, all) => all.findIndex((other) => other.badge_uuid === card.badge_uuid) === index && matches(card, terms)) : []
  const loading = (wantBadges && !feed) || (wantResources && resourcesLoading && !resources)
  const resourceList = wantResources ? resources || [] : []
  const empty = !loading && !resourcesError && !badges.length && !resourceList.length
  const askHub = hub && query ? () => hub.open({ prompt: query }) : undefined

  return <div className="flex flex-col gap-9" aria-live="polite">
    {loading ? <div className="flex min-h-48 items-center justify-center"><Loader2 className="animate-spin text-muted-foreground" aria-label="Searching" /></div> : null}
    {resourcesError ? <p role="alert" className="rounded-2xl bg-card p-5 text-sm text-muted-foreground">Resources couldn’t load. Try again in a moment.</p> : null}
    {empty ? <div className="flex flex-col items-center gap-3 rounded-3xl border-2 border-dashed border-border px-6 py-14 text-center">
      <SearchX size={36} className="text-muted-foreground" aria-hidden="true" />
      <p className="text-lg font-extrabold">{query ? `Nothing matches “${query}”` : 'Nothing matches these filters'}</p>
      <p className="max-w-sm text-sm text-muted-foreground">Try fewer words or another filter{askHub ? ', or ask Coach to look with you' : ''}.</p>
      {askHub ? <Button type="button" variant="brand" onClick={askHub}><Sparkles size={16} />Ask Coach</Button> : null}
    </div> : null}
    {!empty && askHub ? <button type="button" onClick={askHub} className="flex items-center gap-3 rounded-2xl bg-card px-4 py-3 text-left hover:bg-raised">
      <Sparkles size={20} className="shrink-0 text-[#7cc4ff]" aria-hidden="true" />
      <span className="min-w-0 flex-1 truncate text-sm font-bold">Ask Coach about “{query}”</span>
    </button> : null}
    {badges.length ? <section aria-label="Badges" className="flex flex-col gap-4">
      <h2 className="text-xl font-extrabold tracking-tight">Badges <span className="text-muted-foreground">· {badges.length}</span></h2>
      <div className={GRID}>{badges.map((card) => <BadgeTile key={card.badge_uuid} card={card} orgslug={orgslug} fill />)}</div>
    </section> : null}
    {resourceList.length ? <section aria-label="Resources" className="flex flex-col gap-4">
      <h2 className="text-xl font-extrabold tracking-tight">Resources <span className="text-muted-foreground">· {resourceList.length}</span></h2>
      <div className={GRID}>{resourceList.map((resource) => <ResourceTile key={resource.resource_uuid} resource={resource} orgslug={orgslug} fill />)}</div>
    </section> : null}
  </div>
}
