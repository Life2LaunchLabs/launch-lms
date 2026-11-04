'use client'

import React from 'react'
import { BookOpen, ClipboardCheck, FileText, GraduationCap, Link2, Play, Wrench, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getResourceThumbnailMediaDirectory } from '@services/media/media'
import type { Resource, ResourceType } from '@services/resources/resources'

export function resourceImage(resource: Pick<Resource, 'thumbnail_image' | 'owner_org_uuid' | 'resource_uuid' | 'cover_image_url'>) {
  return resource.thumbnail_image && resource.owner_org_uuid
    ? getResourceThumbnailMediaDirectory(resource.owner_org_uuid, resource.resource_uuid, resource.thumbnail_image)
    : resource.cover_image_url
}

/** Each type's name, icon, button words and color. The color is fixed per type, so a row scans at a glance. */
export const RESOURCE_KIND: Record<ResourceType, { label: string; icon: LucideIcon; verb: string; color: string }> = {
  video: { label: 'Video', icon: Play, verb: 'Watch on', color: '#e5484d' },
  article: { label: 'Article', icon: FileText, verb: 'Read on', color: '#3b7bf0' },
  guide: { label: 'Guide', icon: BookOpen, verb: 'Open on', color: '#1f9d63' },
  tool: { label: 'Tool', icon: Wrench, verb: 'Open on', color: '#0e9fb2' },
  assessment: { label: 'Quiz', icon: ClipboardCheck, verb: 'Take it on', color: '#8155ef' },
  course: { label: 'Course', icon: GraduationCap, verb: 'Start on', color: '#ec8320' },
  other: { label: 'Link', icon: Link2, verb: 'Open on', color: '#5f6f82' },
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

const Bar = ({ className, width }: { className?: string; width?: string }) => <span className={cn('block h-[6px] shrink-0 rounded-full bg-border', className)} style={width ? { width } : undefined} />

/** A little screen rising from the bottom of the type's color. */
function Screen({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span className={cn('absolute inset-x-[14%] -bottom-[8%] top-[24%] flex flex-col gap-[6%] overflow-hidden rounded-t-xl bg-card p-[5%] shadow-[0_10px_30px_rgba(0,0,0,.22)]', className)}>{children}</span>
}

/** The drawn page for a type: what that kind of thing looks like, with no words in it. */
function Drawing({ type }: { type: ResourceType }) {
  const color = resourceKind(type).color
  if (type === 'video') {
    return <span className="absolute inset-x-[12%] bottom-[12%] top-[20%] flex items-center justify-center rounded-xl bg-[#0f0f0f] shadow-[0_10px_30px_rgba(0,0,0,.3)]">
      <span className="flex h-[30%] w-[22%] items-center justify-center rounded-[28%]" style={{ backgroundColor: color }}>
        <span className="ml-[8%] h-0 w-0 border-y-[7px] border-l-[11px] border-y-transparent border-l-white" />
      </span>
      <span className="absolute inset-x-[5%] bottom-[8%] h-[3px] rounded-full bg-white/25"><span className="block h-full w-[38%] rounded-full" style={{ backgroundColor: color }} /></span>
    </span>
  }
  if (type === 'article') {
    return <Screen>
      <span className="block h-[34%] shrink-0 rounded-md" style={{ backgroundColor: `${color}33` }} />
      <Bar className="h-[9px] bg-muted-foreground/35" width="86%" />
      <Bar className="h-[9px] bg-muted-foreground/35" width="60%" />
      <Bar />
      <Bar width="90%" />
    </Screen>
  }
  if (type === 'guide') {
    // A path of steps, left to right: the first two done.
    return <Screen className="justify-center">
      <Bar className="h-[9px] bg-muted-foreground/35" width="50%" />
      <span className="relative mt-[6%] flex items-center justify-between px-[2%]">
        <span className="absolute inset-x-[6%] top-1/2 h-[3px] -translate-y-1/2 rounded-full bg-border" />
        <span className="absolute left-[6%] top-1/2 h-[3px] w-[38%] -translate-y-1/2 rounded-full" style={{ backgroundColor: color }} />
        {[true, true, false, false].map((done, index) => <span key={index} className={cn('relative h-[15px] w-[15px] rounded-full border-[3px]', done ? 'border-transparent' : 'border-border bg-card')} style={done ? { backgroundColor: color } : undefined} />)}
      </span>
      <span className="mt-[4%] flex justify-between px-[1%]">{[0, 1, 2, 3].map((index) => <Bar key={index} width="18%" />)}</span>
    </Screen>
  }
  if (type === 'tool') {
    return <Screen>
      {[62, 35].map((value) => <span key={value} className="flex items-center gap-[6%]">
        <Bar width="26%" />
        <span className="relative h-[4px] flex-1 rounded-full bg-border">
          <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${value}%`, backgroundColor: color }} />
          <span className="absolute top-1/2 h-[11px] w-[11px] -translate-x-1/2 -translate-y-1/2 rounded-full border-2 bg-card" style={{ left: `${value}%`, borderColor: color }} />
        </span>
      </span>)}
      <span className="mt-[2%] flex h-[34%] items-end gap-[5%]">
        {[40, 65, 100, 55, 75].map((height, index) => <span key={index} className="flex-1 rounded-t-[3px]" style={{ height: `${height}%`, backgroundColor: index === 2 ? color : `${color}55` }} />)}
      </span>
    </Screen>
  }
  if (type === 'assessment') {
    return <Screen>
      <span className="flex gap-[3px]">{[0, 1, 2, 3, 4, 5].map((index) => <span key={index} className="h-[3px] flex-1 rounded-full" style={{ backgroundColor: index < 3 ? color : 'hsl(var(--border))' }} />)}</span>
      <Bar className="h-[9px] bg-muted-foreground/35" width="80%" />
      {[false, true, false].map((on, index) => <span key={index} className="flex h-[15px] shrink-0 items-center gap-[5px] rounded-full border-2 px-[4px]" style={on ? { borderColor: color, backgroundColor: `${color}22` } : { borderColor: 'hsl(var(--border))' }}>
        <span className="h-[7px] w-[7px] rounded-full border-[1.5px]" style={on ? { backgroundColor: color, borderColor: color } : { borderColor: 'hsl(var(--muted-foreground) / .4)' }} />
      </span>)}
    </Screen>
  }
  if (type === 'course') {
    // A stack of lesson thumbnails, the front one with its progress.
    return <span className="absolute inset-x-[16%] bottom-[12%] top-[16%]">
      <span className="absolute inset-x-[12%] top-0 h-[30%] rounded-xl bg-white/35" />
      <span className="absolute inset-x-[6%] top-[9%] h-[30%] rounded-xl bg-white/60" />
      <span className="absolute inset-x-0 bottom-0 top-[18%] flex flex-col justify-end gap-[8%] overflow-hidden rounded-xl bg-card p-[6%] shadow-[0_10px_30px_rgba(0,0,0,.22)]">
        <span className="absolute inset-x-0 top-0 h-[48%]" style={{ backgroundColor: `${color}33` }}>
          <span className="absolute left-1/2 top-1/2 h-0 w-0 -translate-x-1/2 -translate-y-1/2 border-y-[6px] border-l-[10px] border-y-transparent" style={{ borderLeftColor: color }} />
        </span>
        <Bar className="h-[8px] bg-muted-foreground/35" width="70%" />
        <span className="block h-[4px] rounded-full bg-border"><span className="block h-full w-[45%] rounded-full" style={{ backgroundColor: color }} /></span>
      </span>
    </span>
  }
  return <Screen>
    <Bar className="h-[9px] bg-muted-foreground/35" width="50%" />
    <Bar />
    <Bar width="85%" />
    <Bar width="92%" />
    <Bar width="70%" />
  </Screen>
}

/**
 * A resource's cover. The site's own image is shown whole on a blur of itself (logos and banners are
 * never cut off); without one, a little drawn page for its type on the type's color. No words: the
 * title and site are written once, under the card.
 */
export default function ResourceCover({ resource, className, chip = true }: { resource: Resource; className?: string; chip?: boolean }) {
  const image = resourceImage(resource)
  const [failed, setFailed] = React.useState(false)
  const kind = resourceKind(resource.resource_type)
  const Icon = kind.icon
  return <span className={cn('relative isolate block aspect-[16/10] overflow-hidden rounded-2xl', className)} style={{ backgroundColor: kind.color }}>
    {image && !failed ? <>
      <span aria-hidden="true" className="absolute -inset-[20%] scale-110 bg-cover bg-center blur-[22px] brightness-[.85] saturate-[1.3]" style={{ backgroundImage: `url("${image}")` }} />
      <img src={image} alt="" className="absolute inset-[8px] h-[calc(100%-16px)] w-[calc(100%-16px)] object-contain" onError={() => setFailed(true)} />
    </> : <>
      <span aria-hidden="true" className="absolute inset-0 bg-[radial-gradient(120%_90%_at_20%_0%,rgba(255,255,255,.22),transparent_60%)]" />
      <span aria-hidden="true"><Drawing type={resource.resource_type} /></span>
    </>}
    {chip ? <span className="absolute left-2 top-2 z-[1] flex items-center gap-1 rounded-full bg-black/70 py-1 pl-1.5 pr-2.5 text-[11px] font-extrabold tracking-wide text-white backdrop-blur-sm">
      <Icon size={12} aria-hidden="true" />{kind.label}
    </span> : null}
  </span>
}
