'use client'

import { Dispatch, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, ChevronRight, Loader2, Search, Star } from 'lucide-react'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import ResourceTypeVisual from '@components/Resources/ResourceTypeVisual'
import { Button } from '@components/ui/button'
import { Card } from '@components/ui/card'
import { Input } from '@components/ui/input'
import { getResourceThumbnailMediaDirectory } from '@services/media/media'
import { trackEvent } from '@services/analytics/analytics'
import { getResources, Resource, ResourceType } from '@services/resources/resources'

export type HubResourceFilters = {
  channel?: string
  user_channel?: string
  resource_types?: string
  tags?: string
  access?: string
  provider?: string
}

const RESOURCE_TYPES: Array<{ value: 'all' | ResourceType; label: string }> = [
  { value: 'all', label: 'All types' },
  { value: 'article', label: 'Articles' },
  { value: 'video', label: 'Videos' },
  { value: 'course', label: 'Courses' },
  { value: 'guide', label: 'Guides' },
  { value: 'tool', label: 'Tools' },
  { value: 'assessment', label: 'Assessments' },
  { value: 'other', label: 'Other' },
]

function ResourceSearchCard({ resource, orgUUID, selected, expanded, onSelect }: {
  resource: Resource
  orgUUID?: string
  selected: boolean
  expanded: boolean
  onSelect: Dispatch<Resource>
}) {
  const ownerOrgUuid = resource.owner_org_uuid || orgUUID
  const imageSrc = resource.thumbnail_image && ownerOrgUuid
    ? getResourceThumbnailMediaDirectory(ownerOrgUuid, resource.resource_uuid, resource.thumbnail_image)
    : resource.cover_image_url

  return (
    <Card variant="interactive" size="none" className={`group shrink-0 snap-start rounded-2xl bg-card p-1.5 shadow-none transition-[border-color,box-shadow] ${expanded ? 'w-full' : 'w-[11rem]'} ${selected ? 'border-[var(--org-primary-color)] shadow-sm' : 'border-border/60 hover:border-border hover:shadow-sm'}`}>
      <button type="button" onClick={() => onSelect(resource)} className="block h-full w-full text-left focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset" aria-pressed={selected} aria-label={`Inspect ${resource.title}`}>
        <div className="aspect-[4/3] w-full overflow-hidden rounded-xl">
          <ResourceTypeVisual type={resource.resource_type} title={resource.title} imageSrc={imageSrc} iconClassName="h-7 w-7 opacity-80" />
        </div>
        <div className="px-1.5 pb-1.5 pt-2">
          <p className="truncate text-[8px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{resource.provider_name || resource.resource_type}</p>
          <h3 className="mt-1 line-clamp-2 text-xs font-semibold leading-4 tracking-tight">{resource.title}</h3>
          <div className="mt-1 flex items-center gap-1 text-[9px] text-muted-foreground" aria-label={`${(resource.average_rating || 0).toFixed(1)} out of 5 stars from ${resource.rating_count || 0} ratings`}>
            <span className="flex items-center gap-px" aria-hidden="true">
              {[1, 2, 3, 4, 5].map((star) => <Star key={star} className={`h-2.5 w-2.5 ${star <= Math.round(resource.average_rating || 0) ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/25'}`} />)}
            </span>
            <span className="font-medium text-foreground">{(resource.average_rating || 0).toFixed(1)}</span>
            <span>({resource.rating_count || 0})</span>
          </div>
          {resource.description && <p className="mt-1.5 line-clamp-3 text-[9px] leading-3.5 text-muted-foreground">{resource.description}</p>}
        </div>
      </button>
    </Card>
  )
}

export default function HubQuickSearch({ orgId, orgUUID, query, resourceFilters, selectedResourceUuids, onSelectResource }: {
  orgId?: number
  orgUUID?: string
  query: string
  resourceFilters: HubResourceFilters
  selectedResourceUuids?: string[]
  onSelectResource: Dispatch<Resource>
}) {
  const session = useLHSession() as any
  const accessToken = session?.data?.tokens?.access_token
  const [expanded, setExpanded] = useState(false)
  const [searchQuery, setSearchQuery] = useState(query)
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState(query)
  const [resourceType, setResourceType] = useState<'all' | ResourceType>('all')
  const [access, setAccess] = useState('all')
  const [availableResources, setAvailableResources] = useState<Resource[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const selectedInitialResultRef = useRef(false)

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setLoading(true)
      setDebouncedSearchQuery(searchQuery)
    }, 200)
    return () => window.clearTimeout(timeout)
  }, [searchQuery])

  useEffect(() => {
    if (!orgId || !accessToken) return
    let active = true
    getResources(orgId, {
      resource_type: resourceType === 'all' ? undefined : resourceType,
      access: access === 'all' ? resourceFilters.access : access,
      channel_uuid: resourceFilters.channel,
      user_channel_uuid: resourceFilters.user_channel,
      resource_types: resourceType === 'all' ? resourceFilters.resource_types : undefined,
      tags: resourceFilters.tags,
      provider: resourceFilters.provider,
      query: debouncedSearchQuery,
      limit: 50,
    }, accessToken)
      .then((nextResources) => {
        if (!active) return
        setAvailableResources(nextResources)
        setError('')
      })
      .catch((requestError: any) => {
        if (!active) return
        setAvailableResources([])
        setError(requestError?.message || 'Search is temporarily unavailable.')
      })
      .finally(() => active && setLoading(false))
    return () => { active = false }
  }, [access, accessToken, debouncedSearchQuery, orgId, resourceFilters.access, resourceFilters.channel, resourceFilters.provider, resourceFilters.resource_types, resourceFilters.tags, resourceFilters.user_channel, resourceType])

  const resources = availableResources
  const shownResources = useMemo(() => expanded ? resources : resources.slice(0, 4), [expanded, resources])

  const selectSearchResult = useCallback((resource: Resource) => {
    if (orgId && accessToken) {
      void trackEvent('resource_search_opened', orgId, {
        resource_uuid: resource.resource_uuid,
        search_rank: resource.search_rank,
        search_version: resource.search_version,
        query_fingerprint: resource.search_query_id,
      }, accessToken)
    }
    onSelectResource(resource)
  }, [accessToken, onSelectResource, orgId])

  useEffect(() => {
    if (selectedInitialResultRef.current || loading || selectedResourceUuids?.length || resources.length === 0) return
    selectedInitialResultRef.current = true
    selectSearchResult(resources[0])
  }, [loading, resources, selectSearchResult, selectedResourceUuids?.length])

  return (
    <section className="w-full max-w-full overflow-hidden" aria-live="polite" aria-busy={loading} aria-label={`Resource results for ${searchQuery}`}>
      <div className="flex items-center gap-2.5 border-b border-border/60 px-1 pb-2.5">
        <Search className="h-4 w-4 shrink-0" />
        <div className="min-w-0 flex-1">
          <h2 className="text-xs font-semibold">Resources</h2>
          <p className="truncate text-[10px] text-muted-foreground">{loading ? 'Searching…' : `${resources.length} result${resources.length === 1 ? '' : 's'} for “${searchQuery}”`}</p>
        </div>
        <Button type="button" variant="ghost" size="sm" className="h-7 gap-1 px-2 text-[11px] text-muted-foreground" onClick={() => setExpanded((current) => !current)}>
          {expanded ? <><ChevronDown className="h-3.5 w-3.5" /> Show less</> : <>See more <ChevronRight className="h-3.5 w-3.5" /></>}
        </Button>
      </div>

      {expanded && (
        <div className="flex flex-col gap-2 border-b border-border/50 py-3 sm:flex-row">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} className="h-10 rounded-xl bg-background pl-9 shadow-none" aria-label="Search resources" />
          </div>
          <div className="flex gap-2">
            <select aria-label="Resource type" value={resourceType} onChange={(event) => { setLoading(true); setResourceType(event.target.value as 'all' | ResourceType) }} className="h-10 min-w-32 rounded-xl border border-border bg-background px-3 text-sm">
              {RESOURCE_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
            </select>
            <select aria-label="Access" value={access} onChange={(event) => { setLoading(true); setAccess(event.target.value) }} className="h-10 min-w-28 rounded-xl border border-border bg-background px-3 text-sm">
              <option value="all">All access</option><option value="free">Free</option><option value="paid">Paid</option><option value="restricted">Restricted</option>
            </select>
          </div>
        </div>
      )}

      <div className="pt-3">
        {loading && <div className="flex h-28 items-center justify-center text-xs text-muted-foreground" role="status"><Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> Searching…</div>}
        {!loading && error && <div className="rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive" role="alert">{error}</div>}
        {!loading && !error && resources.length === 0 && <div className="flex h-24 items-center justify-center text-xs text-muted-foreground">No matching resources.</div>}
        {!loading && !error && resources.length > 0 && (
          <div className={expanded ? 'grid grid-cols-[repeat(auto-fill,minmax(11rem,1fr))] gap-2' : 'flex snap-x gap-2 overflow-x-auto pb-0.5'}>
            {shownResources.map((resource) => <ResourceSearchCard key={resource.resource_uuid} resource={resource} orgUUID={orgUUID} selected={selectedResourceUuids?.includes(resource.resource_uuid) || false} expanded={expanded} onSelect={selectSearchResult} />)}
          </div>
        )}
      </div>
    </section>
  )
}
