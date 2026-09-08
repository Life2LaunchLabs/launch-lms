'use client'

import { Dispatch, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  Award,
  Building2,
  SquareLibrary,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useDebounce } from '@/hooks/useDebounce'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import SafeImage from '@components/Objects/SafeImage'
import { BadgeThumbnailImage } from '@components/Objects/Thumbnails/BadgeThumbnailImage'
import ResourceTypeVisual from '@components/Resources/ResourceTypeVisual'
import { Card } from '@components/ui/card'
import { getUriWithOrg, routePaths } from '@services/config/config'
import {
  getOrgLogoMediaDirectory,
  getOrgThumbnailMediaDirectory,
  getResourceThumbnailMediaDirectory,
  getUserAvatarMediaDirectory,
} from '@services/media/media'
import { getResources, Resource } from '@services/resources/resources'
import { searchOrgContent } from '@services/search/search'

export type HubSearchType = 'all' | 'resources' | 'badges' | 'badge_collections' | 'organizations' | 'users'

type NamedResult = {
  name: string
  description?: string | null
}

type BadgeResult = NamedResult & {
  badge_uuid: string
  thumbnail_image?: string | null
  status?: string
}

type CollectionResult = NamedResult & {
  collection_uuid: string
  thumbnail_image?: string | null
  badges?: BadgeResult[]
}

type OrganizationResult = NamedResult & {
  org_uuid: string
  slug: string
  about?: string | null
  logo_image?: string | null
  thumbnail_image?: string | null
  member_count?: number
}

type UserResult = {
  id: number
  user_uuid: string
  username: string
  first_name: string
  last_name: string
  bio?: string | null
  avatar_image?: string | null
}

type SearchResults = {
  badges: BadgeResult[]
  badge_collections: CollectionResult[]
  organizations: OrganizationResult[]
  resources: Resource[]
  users: UserResult[]
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
  organizations: [],
  resources: [],
  users: [],
}

export const HUB_SEARCH_TYPES: Array<{ value: HubSearchType; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'resources', label: 'Resources' },
  { value: 'badges', label: 'Badges' },
  { value: 'badge_collections', label: 'Collections' },
  { value: 'organizations', label: 'Organizations' },
  { value: 'users', label: 'People' },
]

function ResourceResultCard({ resource, orgslug, orgUUID, onSelect }: { resource: Resource; orgslug: string; orgUUID?: string; onSelect?: Dispatch<Resource> }) {
  const ownerOrgUuid = resource.owner_org_uuid || orgUUID
  const imageSrc = resource.thumbnail_image && ownerOrgUuid
    ? getResourceThumbnailMediaDirectory(ownerOrgUuid, resource.resource_uuid, resource.thumbnail_image)
    : resource.cover_image_url
  const href = getUriWithOrg(orgslug, routePaths.org.resource(resource.resource_uuid.replace('resource_', '')))

  const content = (
    <>
      <ResourceTypeVisual
        type={resource.resource_type}
        title={resource.title}
        imageSrc={imageSrc}
        className="aspect-video w-full border-b border-border/50"
        iconClassName="h-7 w-7 opacity-90"
      />
      <div className="min-h-20 p-2.5">
        <div className="flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-[0.09em] text-muted-foreground">
          <span>{resource.resource_type}</span>
          {resource.provider_name && <><span aria-hidden="true">·</span><span className="truncate">{resource.provider_name}</span></>}
        </div>
        <h3 className="mt-1 line-clamp-2 text-xs font-semibold leading-4 tracking-tight text-foreground">{resource.title}</h3>
        {resource.description && <p className="mt-1 line-clamp-2 text-[9px] leading-3.5 text-muted-foreground">{resource.description}</p>}
      </div>
    </>
  )

  if (onSelect) return (
    <Card variant="interactive" size="none" className="group overflow-hidden rounded-xl border border-border/70 bg-card shadow-sm hover:shadow-md">
      <button type="button" onClick={() => onSelect(resource)} className="block w-full text-left" aria-label={`Add ${resource.title} to this conversation`}>
        {content}
      </button>
    </Card>
  )

  return (
    <Card asChild variant="interactive" size="none" className="group overflow-hidden rounded-xl border border-border/70 bg-card shadow-sm hover:shadow-md">
      <Link href={href} className="block">
        {content}
      </Link>
    </Card>
  )
}

function BadgeResultCard({ badge, href }: { badge: BadgeResult; href: string }) {
  return (
    <Link href={href} className="group flex h-20 min-w-0 items-center gap-2.5 rounded-2xl bg-card p-2 text-left shadow-sm ring-1 ring-border/70 transition-colors hover:bg-muted/60 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring">
      <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-visible">
        {badge.thumbnail_image ? (
          <BadgeThumbnailImage src={badge.thumbnail_image} alt={badge.name} hoverScale />
        ) : (
          <div className="flex h-[82%] w-[82%] items-center justify-center rounded-full bg-muted text-muted-foreground ring-1 ring-border/60">
            <Award className="h-6 w-6" strokeWidth={1.4} />
          </div>
        )}
      </div>
      <div className="min-w-0">
        <h3 className="line-clamp-2 text-sm font-semibold leading-snug text-foreground">{badge.name}</h3>
        {badge.status && <p className="mt-1 text-[9px] font-medium uppercase tracking-[0.1em] text-muted-foreground">{badge.status.replace('_', ' ')}</p>}
      </div>
    </Link>
  )
}

function VisualResultCard({ href, icon: Icon, imageSrc, imageFit = 'cover', title, description, eyebrow, meta }: {
  href: string
  icon: LucideIcon
  imageSrc?: string | null
  imageFit?: 'cover' | 'contain'
  title: string
  description?: string | null
  eyebrow: string
  meta?: string | null
}) {
  return (
    <Card asChild variant="interactive" size="none" className="group h-24 overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm hover:shadow-md">
      <Link href={href} className="flex">
        <div className="relative flex h-full w-24 shrink-0 items-center justify-center overflow-hidden border-r border-border/50 bg-muted text-muted-foreground">
          <Icon className="h-7 w-7 opacity-60" strokeWidth={1.5} />
          {imageSrc && (
            <SafeImage
              src={imageSrc}
              alt=""
              className={`absolute inset-0 h-full w-full ${imageFit === 'contain' ? 'bg-card object-contain p-5' : 'object-cover'} transition-transform duration-300 group-hover:scale-[1.025]`}
              onError={(event) => { event.currentTarget.style.display = 'none' }}
            />
          )}
        </div>
        <div className="flex min-w-0 flex-1 flex-col justify-center p-2.5">
          <p className="text-[9px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">{eyebrow}</p>
          <h3 className="mt-1 line-clamp-2 text-sm font-semibold leading-snug tracking-tight text-foreground">{title}</h3>
          {description && <p className="mt-0.5 line-clamp-1 text-[10px] leading-4 text-muted-foreground">{description}</p>}
          {meta && !description && <p className="mt-0.5 truncate text-[10px] text-muted-foreground">{meta}</p>}
        </div>
      </Link>
    </Card>
  )
}

function PersonResultCard({ user, href }: { user: UserResult; href: string }) {
  const name = `${user.first_name} ${user.last_name}`.trim() || user.username
  const avatar = user.avatar_image ? getUserAvatarMediaDirectory(user.user_uuid, user.avatar_image) : null
  return (
    <Link href={href} className="group flex h-16 items-center gap-2.5 rounded-2xl bg-card p-2 transition-colors hover:bg-muted focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring">
      <div className="relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted text-xs font-semibold text-muted-foreground ring-1 ring-border/60">
        {name.slice(0, 1).toUpperCase()}
        {avatar && <SafeImage src={avatar} alt="" className="absolute inset-0 h-full w-full object-cover" onError={(event) => { event.currentTarget.style.display = 'none' }} />}
      </div>
      <div className="min-w-0">
        <h3 className="truncate text-sm font-semibold text-foreground">{name}</h3>
        <p className="truncate text-xs text-muted-foreground">@{user.username}</p>
        {user.bio && <p className="mt-0.5 line-clamp-1 text-[10px] text-muted-foreground">{user.bio}</p>}
      </div>
    </Link>
  )
}

function ResultGroup({ label, showLabel, children }: { label: string; showLabel: boolean; children: React.ReactNode }) {
  return (
    <section aria-label={label} className={showLabel ? 'pt-8 first:pt-0' : ''}>
      {showLabel && <h2 className="pb-3 text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">{label}</h2>}
      {children}
    </section>
  )
}

export default function HubQuickSearch({
  orgslug,
  orgId,
  orgUUID,
  query,
  selectedTypes,
  resourceFilters,
  onSelectResource,
}: {
  orgslug: string
  orgId?: number
  orgUUID?: string
  query: string
  selectedTypes: HubSearchType[]
  resourceFilters: HubResourceFilters
  onSelectResource?: Dispatch<Resource>
}) {
  const session = useLHSession() as any
  const accessToken = session?.data?.tokens?.access_token
  const debouncedQuery = useDebounce(query, 300)
  const [results, setResults] = useState<SearchResults>(EMPTY_RESULTS)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const { access, channel, provider, resource_types: resourceTypes, tags, user_channel: userChannel } = resourceFilters
  const hasResourceFilters = Boolean(access || channel || provider || resourceTypes || tags || userChannel)
  const selectedTypesKey = selectedTypes.join(',')

  useEffect(() => {
    let active = true
    const search = async () => {
      if (!debouncedQuery.trim() && !hasResourceFilters && selectedTypes.length === 0) {
        setResults(EMPTY_RESULTS)
        setError('')
        setLoading(false)
        return
      }

      setLoading(true)
      setError('')
      try {
        const shouldSearchEverything = Boolean(debouncedQuery.trim() || selectedTypes.length)
        const globalRequest = shouldSearchEverything
          ? searchOrgContent(orgslug, debouncedQuery.trim(), 1, debouncedQuery.trim() ? 10 : 50, null, accessToken)
          : Promise.resolve({ data: EMPTY_RESULTS })
        const resourceRequest = hasResourceFilters && orgId
          ? getResources(orgId, {
            access,
            channel_uuid: channel,
            provider,
            resource_types: resourceTypes,
            tags,
            user_channel_uuid: userChannel,
            query: debouncedQuery || undefined,
          }, accessToken)
          : Promise.resolve<Resource[] | null>(null)
        const [globalResponse, filteredResources] = await Promise.all([globalRequest, resourceRequest])
        if (!active) return
        const data = (globalResponse as any)?.data || {}
        setResults({
          badges: Array.isArray(data.badges) ? data.badges : [],
          badge_collections: Array.isArray(data.badge_collections) ? data.badge_collections : [],
          organizations: Array.isArray(data.organizations) ? data.organizations : [],
          resources: filteredResources ?? (Array.isArray(data.resources) ? data.resources : []),
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
  }, [access, accessToken, channel, debouncedQuery, hasResourceFilters, orgId, orgslug, provider, resourceTypes, selectedTypes.length, selectedTypesKey, tags, userChannel])

  const counts = useMemo<Record<HubSearchType, number>>(() => {
    const values = {
      resources: results.resources.length,
      badges: results.badges.length,
      badge_collections: results.badge_collections.length,
      organizations: results.organizations.length,
      users: results.users.length,
    }
    return { all: Object.values(values).reduce((sum, count) => sum + count, 0), ...values }
  }, [results])

  if (selectedTypes.length === 0 && !hasResourceFilters) return null

  const resolvedTypes = selectedTypes.length ? selectedTypes : ['resources'] as HubSearchType[]
  const visible = (type: HubSearchType) => resolvedTypes.includes('all') || resolvedTypes.includes(type)
  const selectedCount = resolvedTypes.includes('all')
    ? counts.all
    : resolvedTypes.reduce((total, type) => total + counts[type], 0)
  const selectedLabel = resolvedTypes.length === 1
    ? HUB_SEARCH_TYPES.find((item) => item.value === resolvedTypes[0])?.label || 'Results'
    : `${resolvedTypes.length} types`
  const showGroupLabels = resolvedTypes.includes('all') || resolvedTypes.length > 1

  return (
    <div aria-live="polite" aria-busy={loading}>
      <div className="mb-5 flex items-baseline justify-between gap-4">
        <h2 className="text-lg font-semibold tracking-tight">{query.trim() ? `Results for “${query.trim()}”` : selectedLabel}</h2>
        {!loading && !error && selectedCount > 0 && <span className="text-xs text-muted-foreground">{selectedCount} shown</span>}
      </div>

      {loading && <div className="py-12 text-sm text-muted-foreground" role="status">Searching…</div>}
      {!loading && error && <div className="rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive" role="alert">{error}</div>}
      {!loading && !error && selectedCount === 0 && (
        <div className="py-12 text-sm text-muted-foreground">No matching results.</div>
      )}

      {!loading && !error && visible('resources') && results.resources.length > 0 && (
        <ResultGroup label="Resources" showLabel={showGroupLabels}>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,8.75rem),1fr))] gap-3">
            {results.resources.map((resource) => (
              <ResourceResultCard key={resource.resource_uuid} resource={resource} orgslug={orgslug} orgUUID={orgUUID} onSelect={onSelectResource} />
            ))}
          </div>
        </ResultGroup>
      )}
      {!loading && !error && visible('badges') && results.badges.length > 0 && (
        <ResultGroup label="Badges" showLabel={showGroupLabels}>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,12rem),1fr))] gap-3">
            {results.badges.map((badge) => (
              <BadgeResultCard key={badge.badge_uuid} badge={badge} href={getUriWithOrg(orgslug, routePaths.org.badgeDetail(badge.badge_uuid.replace('badge_', '')))} />
            ))}
          </div>
        </ResultGroup>
      )}
      {!loading && !error && visible('badge_collections') && results.badge_collections.length > 0 && (
        <ResultGroup label="Collections" showLabel={showGroupLabels}>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,15rem),1fr))] gap-3">
            {results.badge_collections.map((collection) => (
              <VisualResultCard
                key={collection.collection_uuid}
                href={getUriWithOrg(orgslug, `/badges?collection=${encodeURIComponent(collection.collection_uuid)}`)}
                icon={SquareLibrary}
                imageSrc={collection.thumbnail_image}
                title={collection.name}
                description={collection.description}
                eyebrow="Collection"
                meta={collection.badges ? `${collection.badges.length} badges` : null}
              />
            ))}
          </div>
        </ResultGroup>
      )}
      {!loading && !error && visible('organizations') && results.organizations.length > 0 && (
        <ResultGroup label="Organizations" showLabel={showGroupLabels}>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,15rem),1fr))] gap-3">
            {results.organizations.map((organization) => {
              const thumbnail = organization.thumbnail_image
                ? getOrgThumbnailMediaDirectory(organization.org_uuid, organization.thumbnail_image)
                : null
              const logo = !thumbnail && organization.logo_image
                ? getOrgLogoMediaDirectory(organization.org_uuid, organization.logo_image)
                : null
              return (
                <VisualResultCard
                  key={organization.org_uuid}
                  href={getUriWithOrg(orgslug, routePaths.org.organization(organization.slug))}
                  icon={Building2}
                  imageSrc={thumbnail || logo}
                  imageFit={thumbnail ? 'cover' : 'contain'}
                  title={organization.name}
                  description={organization.description || organization.about}
                  eyebrow="Organization"
                  meta={typeof organization.member_count === 'number' ? `${organization.member_count} members` : null}
                />
              )
            })}
          </div>
        </ResultGroup>
      )}
      {!loading && !error && visible('users') && results.users.length > 0 && (
        <ResultGroup label="People" showLabel={showGroupLabels}>
          <div className="grid gap-2 sm:grid-cols-2">
            {results.users.map((user) => (
              <PersonResultCard key={user.user_uuid} user={user} href={getUriWithOrg(orgslug, routePaths.org.user(user.username))} />
            ))}
          </div>
        </ResultGroup>
      )}
    </div>
  )
}
