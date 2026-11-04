'use client'

import React from 'react'
import { BookOpen, ClipboardCheck, FileText, GraduationCap, Layers, Play, Wrench, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getResourceThumbnailMediaDirectory } from '@services/media/media'
import type { Resource, ResourceType } from '@services/resources/resources'

export function resourceImage(resource: Pick<Resource, 'thumbnail_image' | 'owner_org_uuid' | 'resource_uuid' | 'cover_image_url'>) {
  return resource.thumbnail_image && resource.owner_org_uuid
    ? getResourceThumbnailMediaDirectory(resource.owner_org_uuid, resource.resource_uuid, resource.thumbnail_image)
    : resource.cover_image_url
}

/** What each type is called on a card, its icon, and the words on the button that opens it. */
export const RESOURCE_KIND: Record<ResourceType, { label: string; icon: LucideIcon; verb: string }> = {
  video: { label: 'Video', icon: Play, verb: 'Watch on' },
  article: { label: 'Article', icon: FileText, verb: 'Read on' },
  guide: { label: 'Guide', icon: BookOpen, verb: 'Open on' },
  tool: { label: 'Tool', icon: Wrench, verb: 'Open on' },
  assessment: { label: 'Quiz', icon: ClipboardCheck, verb: 'Take it on' },
  course: { label: 'Course', icon: GraduationCap, verb: 'Start on' },
  other: { label: 'Link', icon: Layers, verb: 'Open on' },
}

export function resourceKind(type: ResourceType) {
  return RESOURCE_KIND[type] || RESOURCE_KIND.other
}

/** The site a resource opens, as people read it: "khanacademy.org". */
export function resourceSite(resource: Pick<Resource, 'external_url' | 'provider_url'>) {
  for (const value of [resource.external_url, resource.provider_url]) {
    try {
      if (value) return new URL(value).hostname.replace(/^www\./, '')
    } catch {
      // not a full URL: try the next one
    }
  }
  return ''
}

/** Who made it: the provider's name, else the site. */
export function resourceSource(resource: Pick<Resource, 'provider_name' | 'external_url' | 'provider_url'>) {
  return resource.provider_name || resourceSite(resource) || 'the web'
}

/**
 * A resource's cover: the site's own image when it has one, else a small drawn page with the site's name
 * and the title, so a card always reads as "a page on that site" and never as something that plays here.
 */
export default function ResourceCover({ resource, className, titleClassName }: { resource: Resource; className?: string; titleClassName?: string }) {
  const image = resourceImage(resource)
  const [failed, setFailed] = React.useState(false)
  const site = resourceSite(resource)
  if (image && !failed) {
    return <span className={cn('block aspect-[16/10] overflow-hidden rounded-2xl bg-muted', className)}>
      <img src={image} alt="" className="h-full w-full object-cover" onError={() => setFailed(true)} />
    </span>
  }
  return <span aria-hidden="true" className={cn('flex aspect-[16/10] flex-col overflow-hidden rounded-2xl border-2 border-border bg-card text-foreground', className)}>
    <span className="flex items-center gap-2 border-b border-border px-3 py-2 text-[11px] font-bold text-muted-foreground">
      <span className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[5px] bg-foreground text-[10px] font-extrabold uppercase text-background">{resourceSource(resource).charAt(0)}</span>
      <span className="truncate">{site || resourceSource(resource)}</span>
    </span>
    <span className={cn('line-clamp-2 px-3 pt-2.5 text-[15px] font-extrabold leading-tight', titleClassName)}>{resource.title}</span>
    <span className="flex flex-col gap-1.5 px-3 pt-2.5">
      <span className="h-[5px] w-[92%] rounded-full bg-muted" />
      <span className="h-[5px] w-[78%] rounded-full bg-muted" />
      <span className="h-[5px] w-[84%] rounded-full bg-muted" />
    </span>
  </span>
}
