'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  BookCopy,
  Building2,
  Layers,
  LibraryBig,
  MessageCircle,
  SquareLibrary,
  Users,
} from 'lucide-react'
import { useDebounce } from '@/hooks/useDebounce'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { Button } from '@components/ui/button'
import { getUriWithOrg, routePaths } from '@services/config/config'
import { getResources, Resource } from '@services/resources/resources'
import { searchOrgContent } from '@services/search/search'

type SearchType = 'all' | 'resources' | 'badges' | 'badge_collections' | 'communities' | 'resource_channels' | 'organizations' | 'users'

type NamedResult = {
  name: string
  description?: string | null
}

type SearchResults = {
  badges: Array<NamedResult & { badge_uuid: string }>
  badge_collections: Array<NamedResult & { collection_uuid: string }>
  communities: Array<NamedResult & { community_uuid: string }>
  organizations: Array<NamedResult & { org_uuid: string; slug: string; about?: string | null }>
  resources: Resource[]
  resource_channels: Array<NamedResult & { channel_uuid: string }>
  users: Array<{ id: number; user_uuid: string; username: string; first_name: string; last_name: string; bio?: string | null }>
}

export type HubResourceFilters = {
  channel?: string
  user_channel?: string
  resource_types?: string
  tags?: string
  access?: string
  provider?: string
}

const EMPTY_RESULTS: SearchResults = {
  badges: [],
  badge_collections: [],
  communities: [],
  organizations: [],
  resources: [],
  resource_channels: [],
  users: [],
}

const SEARCH_TYPES: Array<{ value: SearchType; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'resources', label: 'Resources' },
  { value: 'badges', label: 'Badges' },
  { value: 'badge_collections', label: 'Collections' },
  { value: 'communities', label: 'Communities' },
  { value: 'resource_channels', label: 'Channels' },
  { value: 'organizations', label: 'Organizations' },
  { value: 'users', label: 'People' },
]

function normalizeSearchType(value?: string): SearchType {
  return SEARCH_TYPES.some((item) => item.value === value) ? value as SearchType : 'all'
}

function ResultLink({ href, icon, title, description, type }: {
  href: string
  icon: React.ReactNode
  title: string
  description?: string | null
  type: string
}) {
  return (
    <Link href={href} className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-muted focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="truncate text-sm font-semibold text-foreground">{title}</span>
          <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{type}</span>
        </span>
        {description && <span className="block truncate text-xs text-muted-foreground">{description}</span>}
      </span>
    </Link>
  )
}

function ResultGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section aria-label={label}>
      <h2 className="px-3 pb-1 pt-3 text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">{label}</h2>
      <div className="space-y-0.5">{children}</div>
    </section>
  )
}

export default function HubQuickSearch({
  orgslug,
  orgId,
  query,
  initialType,
  resourceFilters,
}: {
  orgslug: string
  orgId?: number
  query: string
  initialType?: string
  resourceFilters: HubResourceFilters
}) {
  const session = useLHSession() as any
  const accessToken = session?.data?.tokens?.access_token
  const debouncedQuery = useDebounce(query, 300)
  const [results, setResults] = useState<SearchResults>(EMPTY_RESULTS)
  const [selectedType, setSelectedType] = useState<SearchType>(() => normalizeSearchType(initialType))
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const hasResourceFilters = Object.values(resourceFilters).some(Boolean)

  useEffect(() => {
    setSelectedType(normalizeSearchType(initialType))
  }, [initialType])

  useEffect(() => {
    let active = true
    const search = async () => {
      if (!debouncedQuery.trim() && !hasResourceFilters) {
        setResults(EMPTY_RESULTS)
        setError('')
        setLoading(false)
        return
      }

      setLoading(true)
      setError('')
      try {
        const globalRequest = debouncedQuery.trim()
          ? searchOrgContent(orgslug, debouncedQuery, 1, 6, null, accessToken)
          : Promise.resolve({ data: EMPTY_RESULTS })
        const resourceRequest = hasResourceFilters && orgId
          ? getResources(orgId, { ...resourceFilters, query: debouncedQuery || undefined }, accessToken)
          : Promise.resolve<Resource[] | null>(null)
        const [globalResponse, filteredResources] = await Promise.all([globalRequest, resourceRequest])
        if (!active) return
        const data = (globalResponse as any)?.data || {}
        setResults({
          badges: Array.isArray(data.badges) ? data.badges : [],
          badge_collections: Array.isArray(data.badge_collections) ? data.badge_collections : [],
          communities: Array.isArray(data.communities) ? data.communities : [],
          organizations: Array.isArray(data.organizations) ? data.organizations : [],
          resources: filteredResources ?? (Array.isArray(data.resources) ? data.resources : []),
          resource_channels: Array.isArray(data.resource_channels) ? data.resource_channels : [],
          users: Array.isArray(data.users) ? data.users : [],
        })
      } catch (requestError: any) {
        if (!active) return
        setResults(EMPTY_RESULTS)
        setError(requestError?.message || 'Search is temporarily unavailable.')
      } finally {
        if (active) setLoading(false)
      }
    }
    void search()
    return () => { active = false }
  }, [accessToken, debouncedQuery, hasResourceFilters, orgId, orgslug, resourceFilters])

  const counts = useMemo<Record<SearchType, number>>(() => {
    const values = {
      resources: results.resources.length,
      badges: results.badges.length,
      badge_collections: results.badge_collections.length,
      communities: results.communities.length,
      resource_channels: results.resource_channels.length,
      organizations: results.organizations.length,
      users: results.users.length,
    }
    return { all: Object.values(values).reduce((sum, count) => sum + count, 0), ...values }
  }, [results])

  if (!query.trim() && !hasResourceFilters) return null

  const visible = (type: SearchType) => selectedType === 'all' || selectedType === type

  return (
    <div className="mt-4" aria-live="polite" aria-busy={loading}>
      <div className="flex gap-2 overflow-x-auto pb-2" aria-label="Search result types">
        {SEARCH_TYPES.map((item) => (
          <Button
            key={item.value}
            type="button"
            size="sm"
            variant={selectedType === item.value ? 'secondary' : 'outline'}
            aria-pressed={selectedType === item.value}
            onClick={() => setSelectedType(item.value)}
          >
            {item.label}{counts[item.value] > 0 ? ` ${counts[item.value]}` : ''}
          </Button>
        ))}
      </div>

      <div className="mt-1 rounded-2xl border border-border bg-card p-1 shadow-sm">
        {loading && <div className="px-4 py-8 text-center text-sm text-muted-foreground" role="status">Searching…</div>}
        {!loading && error && <div className="px-4 py-8 text-center text-sm text-destructive" role="alert">{error}</div>}
        {!loading && !error && counts[selectedType] === 0 && (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground">No matching results.</div>
        )}

        {!loading && !error && visible('resources') && results.resources.length > 0 && (
          <ResultGroup label="Resources">
            {results.resources.map((resource) => (
              <ResultLink key={resource.resource_uuid} href={getUriWithOrg(orgslug, routePaths.org.resource(resource.resource_uuid.replace('resource_', '')))} icon={<LibraryBig className="h-5 w-5" />} title={resource.title} description={[resource.provider_name, resource.description].filter(Boolean).join(' · ')} type={resource.resource_type} />
            ))}
          </ResultGroup>
        )}
        {!loading && !error && visible('badges') && results.badges.length > 0 && (
          <ResultGroup label="Badges">
            {results.badges.map((badge) => <ResultLink key={badge.badge_uuid} href={getUriWithOrg(orgslug, routePaths.org.badgeDetail(badge.badge_uuid.replace('badge_', '')))} icon={<BookCopy className="h-5 w-5" />} title={badge.name} description={badge.description} type="Badge" />)}
          </ResultGroup>
        )}
        {!loading && !error && visible('badge_collections') && results.badge_collections.length > 0 && (
          <ResultGroup label="Collections">
            {results.badge_collections.map((collection) => <ResultLink key={collection.collection_uuid} href={getUriWithOrg(orgslug, `/badges?collection=${encodeURIComponent(collection.collection_uuid)}`)} icon={<SquareLibrary className="h-5 w-5" />} title={collection.name} description={collection.description} type="Collection" />)}
          </ResultGroup>
        )}
        {!loading && !error && visible('communities') && results.communities.length > 0 && (
          <ResultGroup label="Communities">
            {results.communities.map((community) => <ResultLink key={community.community_uuid} href={getUriWithOrg(orgslug, routePaths.org.community(community.community_uuid.replace('community_', '')))} icon={<MessageCircle className="h-5 w-5" />} title={community.name} description={community.description} type="Community" />)}
          </ResultGroup>
        )}
        {!loading && !error && visible('resource_channels') && results.resource_channels.length > 0 && (
          <ResultGroup label="Channels">
            {results.resource_channels.map((channel) => <ResultLink key={channel.channel_uuid} href={getUriWithOrg(orgslug, `/hub?channel=${encodeURIComponent(channel.channel_uuid)}&type=resources`)} icon={<Layers className="h-5 w-5" />} title={channel.name} description={channel.description} type="Channel" />)}
          </ResultGroup>
        )}
        {!loading && !error && visible('organizations') && results.organizations.length > 0 && (
          <ResultGroup label="Organizations">
            {results.organizations.map((organization) => <ResultLink key={organization.org_uuid} href={getUriWithOrg(orgslug, routePaths.org.organization(organization.slug))} icon={<Building2 className="h-5 w-5" />} title={organization.name} description={organization.description || organization.about} type="Organization" />)}
          </ResultGroup>
        )}
        {!loading && !error && visible('users') && results.users.length > 0 && (
          <ResultGroup label="People">
            {results.users.map((user) => <ResultLink key={user.user_uuid} href={getUriWithOrg(orgslug, routePaths.org.user(user.username))} icon={<Users className="h-5 w-5" />} title={`${user.first_name} ${user.last_name}`.trim() || user.username} description={`@${user.username}`} type="Person" />)}
          </ResultGroup>
        )}
      </div>
    </div>
  )
}
