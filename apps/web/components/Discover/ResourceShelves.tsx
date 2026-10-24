'use client'

import React from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import { Clock } from 'lucide-react'
import { useOrg } from '@components/Contexts/OrgContext'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import ResourceTypeVisual from '@components/Resources/ResourceTypeVisual'
import { SectionTitle, Shelf } from './PlanArt'
import { getUriWithOrg, routePaths } from '@services/config/config'
import { getResourceThumbnailMediaDirectory } from '@services/media/media'
import { getResources, type Resource, type ResourceType } from '@services/resources/resources'
import { cn } from '@/lib/utils'

/** Resource types in the order Discover shelves them, with their shelf names. */
export const RESOURCE_TYPES: { value: ResourceType; label: string }[] = [
  { value: 'video', label: 'Videos' },
  { value: 'article', label: 'Articles' },
  { value: 'guide', label: 'Guides' },
  { value: 'tool', label: 'Tools' },
  { value: 'assessment', label: 'Assessments' },
  { value: 'course', label: 'Courses' },
  { value: 'other', label: 'More resources' },
]

function minutes(value: number | null) {
  if (!value) return ''
  return value < 60 ? `${value} min` : `${Math.floor(value / 60)}h${value % 60 ? ` ${value % 60}m` : ''}`
}

export function resourceImage(resource: Resource) {
  return resource.thumbnail_image && resource.owner_org_uuid
    ? getResourceThumbnailMediaDirectory(resource.owner_org_uuid, resource.resource_uuid, resource.thumbnail_image)
    : resource.cover_image_url
}

/** A resource on a shelf or in results: its cover, title, and where it's from. */
export function ResourceTile({ resource, orgslug, fill = false }: { resource: Resource; orgslug: string; fill?: boolean }) {
  const time = minutes(resource.estimated_time)
  return <Link href={getUriWithOrg(orgslug, routePaths.org.resource(resource.resource_uuid))} className={cn('group flex flex-col gap-2.5 text-foreground no-underline', fill ? 'w-full' : 'w-[240px] shrink-0')}>
    <span className="relative block aspect-[16/10] overflow-hidden rounded-2xl shadow-[0_4px_0_hsl(var(--edge))] transition-transform duration-200 group-hover:-translate-y-[3px]">
      <ResourceTypeVisual type={resource.resource_type} title="" imageSrc={resourceImage(resource)} iconClassName="h-10 w-10" />
      {resource.is_saved ? <span className="absolute left-2.5 top-2.5 rounded-full bg-black/60 px-2 py-1 text-[11px] font-extrabold uppercase tracking-wide text-white">Saved</span> : null}
    </span>
    <span className="line-clamp-2 px-0.5 text-base font-extrabold leading-tight">{resource.title}</span>
    <span className="-mt-1 flex items-center gap-2 px-0.5 text-xs font-semibold text-muted-foreground">
      <span className="truncate">{resource.provider_name || RESOURCE_TYPES.find((item) => item.value === resource.resource_type)?.label}</span>
      {time ? <span className="flex shrink-0 items-center gap-1"><Clock size={12} aria-hidden="true" />{time}</span> : null}
    </span>
  </Link>
}

/** Resources under the badges: one shelf per type, then what the learner saved. */
export default function ResourceShelves({ orgslug }: { orgslug: string }) {
  const org = useOrg() as any
  const session = useLHSession() as any
  const token = session?.data?.tokens?.access_token
  const { data: resources } = useSWR(org?.id ? ['discover-resources', org.id, token || 'public'] : null, () => getResources(org.id, { limit: 50 }, token))
  const { data: saved } = useSWR(org?.id && token ? ['discover-saved-resources', org.id, token] : null, () => getResources(org.id, { saved_only: true, limit: 20 }, token))
  if (!resources) return null
  const shelves = RESOURCE_TYPES.map((type) => ({ ...type, items: resources.filter((resource) => resource.resource_type === type.value) })).filter((shelf) => shelf.items.length)
  return <>
    {shelves.map((shelf) => <section key={shelf.value} aria-label={shelf.label} className="flex flex-col gap-3.5">
      <SectionTitle href={getUriWithOrg(orgslug, routePaths.org.discover({ type: 'resources', resource_types: shelf.value }))}>{shelf.label}</SectionTitle>
      <Shelf label={shelf.label}>{shelf.items.slice(0, 12).map((resource) => <ResourceTile key={resource.resource_uuid} resource={resource} orgslug={orgslug} />)}</Shelf>
    </section>)}
    {saved?.length ? <section aria-label="Saved" className="flex flex-col gap-3.5">
      <SectionTitle href={getUriWithOrg(orgslug, routePaths.org.discover({ type: 'resources', saved: '1' }))}>Saved</SectionTitle>
      <Shelf label="Saved resources">{saved.map((resource) => <ResourceTile key={resource.resource_uuid} resource={resource} orgslug={orgslug} />)}</Shelf>
    </section> : null}
  </>
}
