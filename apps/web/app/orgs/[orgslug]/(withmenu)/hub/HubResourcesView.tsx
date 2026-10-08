'use client'

import { Dispatch, useEffect, useMemo, useState } from 'react'
import { Bookmark, Loader2, MessageSquare, Search, X } from 'lucide-react'
import { toast } from 'react-hot-toast'
import useSWR from 'swr'
import ResourceTypeVisual from '@components/Resources/ResourceTypeVisual'
import { Button } from '@components/ui/button'
import { getResourceChannels, getResources, Resource, ResourceType, saveResource, unsaveResource } from '@services/resources/resources'
import { ActiveResourceWorkspace, asAdvisorResource, resourceImage } from './HubResourceContext'
import HubSheet from './HubSheet'

type Scope = 'discover' | 'saved'

const RESOURCE_TYPES: Array<{ value: 'all' | ResourceType; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'video', label: 'Videos' },
  { value: 'course', label: 'Courses' },
  { value: 'guide', label: 'Guides' },
  { value: 'article', label: 'Articles' },
  { value: 'tool', label: 'Tools' },
  { value: 'assessment', label: 'Assessments' },
]

const TYPE_LABELS: Record<ResourceType, string> = {
  video: 'Video', course: 'Course', guide: 'Guide', article: 'Article', tool: 'Tool', assessment: 'Assessment', other: 'Resource',
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`h-9 shrink-0 rounded-full px-3.5 text-sm font-medium transition focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring ${active ? 'bg-foreground text-background' : 'border border-border bg-background text-muted-foreground hover:text-foreground'}`}
    >
      {children}
    </button>
  )
}

// Browse, search and save resources directly, separate from any conversation.
export default function HubResourcesView({ orgId, orgslug, accessToken, initialQuery = '', askLabel = 'Ask Hub about this', onAsk }: {
  orgId?: number
  orgslug: string
  accessToken?: string
  initialQuery?: string
  askLabel?: string
  onAsk: Dispatch<Resource>
}) {
  const [scope, setScope] = useState<Scope>('discover')
  const [query, setQuery] = useState(initialQuery)
  const [debouncedQuery, setDebouncedQuery] = useState(initialQuery)
  const [resourceType, setResourceType] = useState<'all' | ResourceType>('all')
  const [list, setList] = useState('all')
  const [savedOverrides, setSavedOverrides] = useState<Record<string, boolean>>({})
  const [pending, setPending] = useState<string | null>(null)
  const [detail, setDetail] = useState<Resource | null>(null)

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedQuery(query.trim()), 200)
    return () => window.clearTimeout(timeout)
  }, [query])

  const params = scope === 'saved'
    ? { saved_only: true, user_channel_uuid: list === 'all' ? undefined : list, query: debouncedQuery, limit: 100 }
    : { resource_type: resourceType === 'all' ? undefined : resourceType, query: debouncedQuery, limit: 50 }
  const { data: resources, error, isLoading, mutate } = useSWR(
    orgId && accessToken ? ['hub-resources', orgId, accessToken, JSON.stringify(params)] : null,
    () => getResources(orgId as number, params, accessToken),
    { keepPreviousData: true, revalidateOnFocus: false },
  )
  const { data: channels } = useSWR(
    orgId && accessToken ? ['resource-channels', orgId, accessToken] : null,
    () => getResourceChannels(orgId as number, accessToken),
  )
  const lists = useMemo(() => (channels?.user_channels || []).filter((channel) => !channel.is_default), [channels])
  const isSaved = (resource: Resource) => savedOverrides[resource.resource_uuid] ?? resource.is_saved

  const toggleSave = async (resource: Resource) => {
    if (!accessToken || pending) return
    const next = !isSaved(resource)
    setPending(resource.resource_uuid)
    setSavedOverrides((current) => ({ ...current, [resource.resource_uuid]: next }))
    try {
      const result = next
        ? await saveResource(resource.resource_uuid, { add_to_default_channel: false }, accessToken)
        : await unsaveResource(resource.resource_uuid, accessToken)
      if (!result?.success) throw new Error(result?.data?.detail || 'Your library could not be updated.')
      toast.success(next ? 'Saved to your library' : 'Removed from your library')
      if (scope === 'saved') void mutate()
    } catch (saveError: any) {
      setSavedOverrides((current) => ({ ...current, [resource.resource_uuid]: !next }))
      toast.error(saveError?.message || 'Your library could not be updated.')
    } finally {
      setPending(null)
    }
  }

  const closeDetail = () => {
    setDetail(null)
    setSavedOverrides({})
    void mutate()
  }

  const shown = resources || []
  const heading = debouncedQuery
    ? `${shown.length} ${shown.length === 1 ? 'result' : 'results'} for “${debouncedQuery}”`
    : scope === 'saved' ? 'Your library' : 'Recommended for you'

  return (
    <>
    <div className="absolute inset-x-0 bottom-0 top-[3.25rem] overflow-y-auto" aria-label="Resources">
      <div className="mx-auto w-full max-w-3xl px-4 pb-24 sm:px-6">
        <div className="sticky top-0 z-[var(--z-content)] space-y-3 bg-background pb-2 pt-3">
          <label className="flex h-12 items-center gap-2.5 rounded-2xl border border-border bg-card px-3.5 focus-within:ring-2 focus-within:ring-ring">
            <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span className="sr-only">Search resources</span>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={scope === 'saved' ? 'Search your library' : 'Search all resources'}
              className="min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground [&::-webkit-search-cancel-button]:hidden"
            />
            {query ? (
              <button type="button" onClick={() => setQuery('')} aria-label="Clear search" className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            ) : null}
          </label>
          <div role="tablist" aria-label="Which resources" className="flex gap-1">
            {(['discover', 'saved'] as const).map((value) => (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={scope === value}
                onClick={() => setScope(value)}
                className={`h-9 rounded-lg px-3 text-sm font-semibold transition focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring ${scope === value ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
              >
                {value === 'discover' ? 'Discover' : 'Saved'}
              </button>
            ))}
          </div>
          <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 sm:-mx-6 sm:px-6" aria-label={scope === 'saved' ? 'Lists' : 'Resource types'}>
            {scope === 'saved'
              ? [{ value: 'all', label: 'All saved' }, ...lists.map((item) => ({ value: item.user_channel_uuid, label: item.name }))].map((item) => (
                  <Chip key={item.value} active={list === item.value} onClick={() => setList(item.value)}>{item.label}</Chip>
                ))
              : RESOURCE_TYPES.map((item) => (
                  <Chip key={item.value} active={resourceType === item.value} onClick={() => setResourceType(item.value)}>{item.label}</Chip>
                ))}
          </div>
        </div>

        <p className="flex items-center gap-2 pb-1 pt-2 text-xs font-medium text-muted-foreground" aria-live="polite">
          {heading}
          {isLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-label="Loading" /> : null}
        </p>
        {error ? <div className="rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive" role="alert">{error?.message || 'Resources are unavailable right now.'}</div> : null}
        {!error && resources && shown.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-sm font-medium">{scope === 'saved' ? 'Nothing saved here yet' : 'No resources match'}</p>
            <p className="mx-auto mt-1 max-w-xs text-sm text-muted-foreground">{scope === 'saved' ? 'Use the bookmark on any resource to keep it in your library.' : 'Try a broader word, or ask Hub to look for you.'}</p>
          </div>
        ) : null}
        <ul className="divide-y divide-border/60">
          {shown.map((resource) => {
            const saved = isSaved(resource)
            return (
              <li key={resource.resource_uuid} className="flex items-center gap-1">
                <button type="button" onClick={() => setDetail(resource)} className="flex min-h-[4.5rem] min-w-0 flex-1 items-center gap-3 rounded-xl py-3 text-left focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring">
                  <span className="h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-muted">
                    <ResourceTypeVisual type={resource.resource_type} title={resource.title} imageSrc={resourceImage(asAdvisorResource(resource))} iconClassName="h-5 w-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="line-clamp-2 text-[15px] font-semibold leading-5">{resource.title}</span>
                    <span className="mt-0.5 block truncate text-[13px] text-muted-foreground">{[TYPE_LABELS[resource.resource_type], resource.provider_name].filter(Boolean).join(' · ')}</span>
                  </span>
                </button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className={`h-11 w-11 shrink-0 ${saved ? 'text-[var(--org-primary-color,currentColor)]' : 'text-muted-foreground'}`}
                  onClick={() => void toggleSave(resource)}
                  disabled={pending === resource.resource_uuid}
                  aria-pressed={saved}
                  aria-label={`${saved ? 'Remove from library' : 'Save'}: ${resource.title}`}
                >
                  <Bookmark className={`h-5 w-5 ${saved ? 'fill-current' : ''}`} />
                </Button>
              </li>
            )
          })}
        </ul>
      </div>
    </div>
      {detail ? (
        <HubSheet
          label={detail.title}
          title={TYPE_LABELS[detail.resource_type]}
          onClose={closeDetail}
          footer={
            <Button type="button" className="h-11 w-full gap-2" onClick={() => { const resource = detail; setDetail(null); onAsk(resource) }}>
              <MessageSquare className="h-4 w-4" /> {askLabel}
            </Button>
          }
        >
          <div className="p-3 sm:p-4">
            <ActiveResourceWorkspace resource={asAdvisorResource(detail)} orgslug={orgslug} />
          </div>
        </HubSheet>
      ) : null}
    </>
  )
}
