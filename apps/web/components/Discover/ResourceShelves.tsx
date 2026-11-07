'use client'

import { Tx } from '@components/Utils/useContentTranslation'
import React from 'react'
import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import useSWR from 'swr'
import { ArrowUpRight, Bookmark } from 'lucide-react'
import { useOrg } from '@components/Contexts/OrgContext'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { SectionTitle, Shelf } from './PlanArt'
import ResourceCover, { resourceSite, resourceSource } from './ResourceCover'
import { getResourceChannels, getResources, saveResource, type Resource, type ResourceChannel, type ResourceType } from '@services/resources/resources'
import { cn } from '@/lib/utils'

import { tr } from '@/lib/tr'
/** Resource types in the order Discover shelves them, with their shelf names. */
export const RESOURCE_TYPES: { value: ResourceType; label: string }[] = [
  { value: 'video', get label() { return tr('discover.resource_shelves.videos', 'Videos') } },
  { value: 'article', get label() { return tr('discover.resource_shelves.articles', 'Articles') } },
  { value: 'guide', get label() { return tr('discover.resource_shelves.guides', 'Guides') } },
  { value: 'tool', get label() { return tr('discover.resource_shelves.tools', 'Tools') } },
  { value: 'assessment', get label() { return tr('discover.resource_shelves.quizzes', 'Quizzes') } },
  { value: 'course', get label() { return tr('discover.resource_shelves.courses', 'Courses') } },
  { value: 'school', get label() { return tr('discover.resource_shelves.schools', 'Schools') } },
  { value: 'career', get label() { return tr('discover.resource_shelves.careers', 'Careers') } },
  { value: 'other', get label() { return tr('discover.resource_shelves.more_resources', 'More resources') } },
]

// Careers have their own place on Discover (Career swipe and Careers for you), so a long career list never
// crowds the other shelves out.
const SHELF_TYPES = RESOURCE_TYPES.map((type) => type.value).filter((type) => type !== 'career').join(',')

function minutes(value: number | null) {
  if (!value) return ''
  return value < 60 ? `${value} min` : `${Math.floor(value / 60)}h${value % 60 ? ` ${value % 60}m` : ''}`
}

export { resourceImage } from './ResourceCover'

/** Where a card goes: the same Discover view with the resource's sheet open over it. */
export function useResourceHref() {
  const pathname = usePathname()
  const params = useSearchParams()
  return React.useCallback((resourceUuid: string) => {
    const next = new URLSearchParams(params.toString())
    next.set('r', resourceUuid.replace(/^resource_/, ''))
    return `${pathname}?${next}`
  }, [params, pathname])
}

/** Counts an open of the resource's site in a new tab, counting the open (which never stands in the way). */
export function countOpen(resource: Resource, token?: string) {
  if (token) void saveResource(resource.resource_uuid, { open_count_increment: 1 }, token).catch(() => undefined)
}

/**
 * A resource on a shelf or in results: its cover (a drawn page for its type, or its own image) with a
 * round ↗ that goes straight to the site, then its title and where it's from. The card opens the sheet.
 */
export function ResourceTile({ resource, fill = false }: { resource: Resource; orgslug?: string; fill?: boolean }) {
  const session = useLHSession() as any
  const token = session?.data?.tokens?.access_token
  const href = useResourceHref()
  const site = resourceSite(resource)
  const time = minutes(resource.estimated_time)
  const where = resource.resource_type === 'video' ? `On ${resourceSource(resource)}` : site || resourceSource(resource)
  return <div className={cn('group relative flex flex-col', fill ? 'w-full' : 'w-[256px] shrink-0')}>
    <Link href={href(resource.resource_uuid)} scroll={false} className="flex flex-col gap-2.5 text-foreground no-underline">
      <span className="relative block rounded-2xl shadow-[0_4px_0_hsl(var(--edge))] transition-transform duration-200 group-hover:-translate-y-[3px] motion-reduce:transition-none">
        <ResourceCover resource={resource} />
        {resource.is_saved ? <span className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/70 text-white" aria-label={tr('discover.resource_shelves.saved', 'Saved')}><Bookmark size={13} className="fill-current" /></span> : null}
      </span>
      <span className="line-clamp-2 min-h-[2.5em] px-0.5 text-[15.5px] font-extrabold leading-tight"><Tx text={resource.title} /></span>
      <span className="-mt-1.5 flex items-center gap-2 truncate px-0.5 text-xs font-semibold text-muted-foreground">
        <span className="truncate">{where}</span>
        {time ? <span className="shrink-0">· {time}</span> : null}
      </span>
    </Link>
    <span className="pointer-events-none absolute inset-x-0 top-0 aspect-[16/10]">
      <a href={resource.external_url} target="_blank" rel="noopener noreferrer" onClick={() => countOpen(resource, token)}
        aria-label={tr('discover.resource_shelves.open_value_in_a_new', 'Open {{value}} in a new tab', { value: site || resource.title })} title={`Open ${site || 'the site'}`}
        className="pointer-events-auto absolute bottom-2 right-2 flex h-10 w-10 items-center justify-center rounded-full bg-white text-[#14202a] shadow-[0_3px_0_rgba(0,0,0,.25)] transition-transform duration-150 hover:scale-110 motion-reduce:transition-none">
        <ArrowUpRight size={18} strokeWidth={2.5} aria-hidden="true" />
      </a>
    </span>
  </div>
}

/** Resources by channel: one row for each channel the learner can see, in the order the organization keeps them. */
export default function ResourceShelves({ orgslug }: { orgslug: string }) {
  const org = useOrg() as any
  const session = useLHSession() as any
  const token = session?.data?.tokens?.access_token
  const { data: resources } = useSWR(org?.id ? ['discover-resources', org.id, token || 'public'] : null, () => getResources(org.id, { limit: 50, resource_types: SHELF_TYPES }, token))
  const { data: channels } = useSWR(org?.id ? ['discover-channels', org.id, token || 'public'] : null, () => getResourceChannels(org.id, token))
  if (!resources?.length) return null
  const order = new Map((channels?.channels || []).map((channel, index) => [channel.channel_uuid, index]))
  const rows = new Map<string, { channel: ResourceChannel; items: Resource[] }>()
  for (const resource of resources) {
    for (const channel of resource.channels || []) {
      if (channels && !order.has(channel.channel_uuid)) continue
      const row = rows.get(channel.channel_uuid) || { channel, items: [] }
      row.items.push(resource)
      rows.set(channel.channel_uuid, row)
    }
  }
  const shelves = [...rows.values()].sort((a, b) => (order.get(a.channel.channel_uuid) ?? 999) - (order.get(b.channel.channel_uuid) ?? 999))
  return <>
    {shelves.map(({ channel, items }) => {
      const featured = [...items].sort((a, b) => Number(b.is_featured) - Number(a.is_featured))
      return <section key={channel.channel_uuid} aria-label={channel.name} className="flex flex-col gap-3.5">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <SectionTitle><Tx text={channel.name} /></SectionTitle>
          {channel.description ? <p className="m-0 min-w-0 flex-1 truncate text-sm text-muted-foreground"><Tx text={channel.description} /></p> : null}
        </div>
        <Shelf label={channel.name}>{featured.slice(0, 12).map((resource) => <ResourceTile key={resource.resource_uuid} resource={resource} orgslug={orgslug} />)}</Shelf>
      </section>
    })}
  </>
}
