'use client'

import React from 'react'
import Link from 'next/link'
import { Bookmark, Building2, Flag, MessageCircle, ShieldCheck, Star, Users } from 'lucide-react'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { useOrg } from '@components/Contexts/OrgContext'
import { getResourceTypePresentation } from '@components/Resources/ResourceTypeVisual'
import { channelColorOptions } from '@components/Resources/ResourceChannelStyle'
import { plural } from '@components/Plans/plan/planVersions'
import { getUriWithOrg, routePaths } from '@services/config/config'
import { getResourceChannelThumbnailMediaDirectory } from '@services/media/media'
import type { ResourceType } from '@services/resources/resources'
import { AUDIENCE_LABELS, typeLabel, type ChannelAudience, type ChannelCard, type ResourceRow } from '@services/resources/workspace'
import { cn } from '@/lib/utils'

/** The org, session token and slug every Resources page needs. */
export function useResourcesContext() {
  const org = useOrg() as { id?: number; slug?: string; name?: string } | null
  const session = useLHSession() as { data?: { tokens?: { access_token?: string }; user?: { id?: number } } }
  const orgId = Number(org?.id)
  const token = session?.data?.tokens?.access_token
  return { orgId, orgslug: org?.slug || '', orgName: org?.name || 'your organization', token, userId: Number(session?.data?.user?.id || 0), ready: Boolean(orgId && token) }
}

export const channelHref = (orgslug: string, uuid: string) => getUriWithOrg(orgslug, routePaths.org.admin.resources.channel(uuid))
export const resourceHref = (orgslug: string, uuid: string) => getUriWithOrg(orgslug, routePaths.org.admin.resources.item(uuid))

const PALETTE = ['#C8327D', '#2F66D6', '#0B8077', '#C77A0E', '#6B3FE0', '#1A86AE', '#5E9A14', '#C9501E']
const pick = (text: string) => PALETTE[[...text].reduce((sum, char) => sum + char.charCodeAt(0), 0) % PALETTE.length]

/** A resource's type as a colored tile with its icon. */
export function TypeTile({ type, className }: { type: ResourceType; className?: string }) {
  const { icon: Icon, color } = getResourceTypePresentation(type)
  return <span className={cn('grid shrink-0 place-items-center rounded-xl text-white', className || 'h-12 w-12')} style={{ background: color }} title={typeLabel(type)}>
    <Icon size={20} aria-hidden="true" />
  </span>
}

/** An organization's initial in its color, beside its name. */
export function OrgChip({ name, className }: { name: string; className?: string }) {
  return <span className={cn('inline-flex min-w-0 items-center gap-1.5 text-[13px] text-muted-foreground', className)}>
    <span className="grid h-[18px] w-[18px] shrink-0 place-items-center rounded-[5px] text-[10px] font-bold text-white" style={{ background: pick(name) }} aria-hidden="true">{name.slice(0, 1).toUpperCase()}</span>
    <span className="truncate">{name}</span>
  </span>
}

/** A channel's cover: its picture, or its color with a few of the types inside. */
export function ChannelCover({ channel, className, children }: { channel: Pick<ChannelCard, 'channel_uuid' | 'name' | 'thumbnail_image' | 'color' | 'owner_org_uuid' | 'resource_types'>; className?: string; children?: React.ReactNode }) {
  const src = channel.thumbnail_image && channel.owner_org_uuid ? getResourceChannelThumbnailMediaDirectory(channel.owner_org_uuid, channel.channel_uuid, channel.thumbnail_image) : null
  const color = channelColorOptions.find((option) => option.name === channel.color)?.background || (channel.color?.startsWith('#') ? channel.color : pick(channel.name))
  return <div className={cn('relative overflow-hidden bg-cover bg-center', className)} style={src ? { backgroundImage: `url(${src})` } : { background: color }}>
    {channel.resource_types.length ? <span className="absolute bottom-2 left-2 flex -space-x-1">
      {channel.resource_types.map((type) => <TypeTile key={type} type={type} className="h-6 w-6 rounded-md border-2 border-white/90 [&_svg]:size-3" />)}
    </span> : null}
    {children}
  </div>
}

const AUDIENCE_ICONS: Record<ChannelAudience, typeof Users> = { org: Building2, groups: Users, staff: ShieldCheck }

export function AudienceIcon({ audience, size = 14 }: { audience: ChannelAudience; size?: number }) {
  const Icon = AUDIENCE_ICONS[audience]
  return <Icon size={size} aria-hidden="true" />
}

const cardClass = 'block w-[176px] shrink-0 snap-start rounded-[20px] border border-border bg-card px-2.5 pb-3.5 pt-2.5 text-left transition hover:-translate-y-0.5 hover:shadow-[0_1px_2px_hsl(200_30%_10%/.06),0_8px_28px_hsl(200_30%_10%/.08)] sm:w-[220px]'

/** A channel in a row of cards: cover (who sees it, or Saved), count, name and owner. */
export function ChannelTile({ orgslug, channel, action }: { orgslug: string; channel: ChannelCard; action?: React.ReactNode }) {
  const badge = channel.is_shared_from_other_org ? null : channel.audience !== 'org' ? channel.audience === 'groups' ? plural(channel.usergroup_ids.length, 'group') : AUDIENCE_LABELS.staff : null
  return <div className="relative">
    <Link href={channelHref(orgslug, channel.channel_uuid)} className={cardClass}>
      <ChannelCover channel={channel} className="aspect-[16/10] rounded-[14px]">
        {badge ? <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-white/95 px-2 py-0.5 text-[11.5px] font-bold text-foreground"><AudienceIcon audience={channel.audience} size={12} />{badge}</span> : null}
        {channel.needs_look ? <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11.5px] font-bold text-amber-900"><Flag size={11} aria-hidden="true" />{channel.needs_look}</span> : null}
      </ChannelCover>
      <span className="mx-1 mt-3 block text-[12.5px] font-medium text-muted-foreground">{plural(channel.resource_count, 'resource')}</span>
      <b className="mx-1 block truncate text-base font-bold tracking-tight">{channel.name}</b>
      <OrgChip name={channel.owner_org_name} className="mx-1 mt-1" />
    </Link>
    {action ? <div className="absolute right-4 top-4">{action}</div> : null}
  </div>
}

/** The dashed card that starts a channel. */
export function NewChannelTile({ onClick }: { onClick: () => void }) {
  return <button type="button" onClick={onClick} className={cn(cardClass, 'flex min-h-[200px] flex-col items-center justify-center gap-2.5 border-[1.5px] border-dashed bg-transparent text-sm font-bold text-muted-foreground hover:translate-y-0 hover:border-foreground/40 hover:text-foreground hover:shadow-none')}>
    <span className="grid h-[46px] w-[46px] place-items-center rounded-full bg-muted text-xl text-foreground">+</span>New channel
  </button>
}

export const domainOf = (link: string) => {
  try { return new URL(link).hostname.replace(/^www\./, '') } catch { return link }
}

/** The quiet line under a resource's title: who made it, its type and how long it takes. */
export function resourceMeta(resource: Pick<ResourceRow, 'provider_name' | 'external_url' | 'resource_type' | 'estimated_time'>) {
  return [resource.provider_name || domainOf(resource.external_url), typeLabel(resource.resource_type), resource.estimated_time ? `${resource.estimated_time} min` : null].filter(Boolean).join(' · ')
}

/** One resource in a list: its type, title and meta, the channels it's in, and what waits on it. */
export function ResourceListRow({ orgslug, resource, showChannels = true, showOwner = false, leading, actions }: {
  orgslug: string; resource: ResourceRow; showChannels?: boolean; showOwner?: boolean; leading?: React.ReactNode; actions?: React.ReactNode
}) {
  return <li className="flex items-center gap-3 border-b border-border px-3.5 py-3 last:border-b-0 sm:gap-3.5">
    {leading}
    <TypeTile type={resource.resource_type} />
    <Link href={resourceHref(orgslug, resource.resource_uuid)} className="min-w-0 flex-1">
      <b className="block truncate text-[15px] font-semibold">{resource.title}</b>
      <span className="mt-0.5 flex min-w-0 items-center gap-2 text-[13px] text-muted-foreground">
        <span className="truncate">{resourceMeta(resource)}</span>
        {showOwner ? <OrgChip name={resource.owner_org_name} className="hidden sm:inline-flex" /> : null}
      </span>
    </Link>
    {showChannels ? <span className="hidden max-w-[260px] flex-wrap justify-end gap-1 md:flex">
      {resource.channels.slice(0, 2).map((channel) => <span key={channel.channel_uuid} className="truncate rounded-full bg-muted px-2.5 py-1 text-[12px] font-semibold text-foreground/80">{channel.name}</span>)}
      {resource.channels.length > 2 ? <span className="rounded-full bg-muted px-2 py-1 text-[12px] font-semibold text-muted-foreground">+{resource.channels.length - 2}</span> : null}
    </span> : null}
    {resource.needs_look ? <span className="inline-flex items-center gap-1 text-[12.5px] font-bold text-amber-700" title={`${plural(resource.needs_look, 'comment')} to look at`}><Flag size={14} aria-hidden="true" />{resource.needs_look}</span>
      : resource.comment_count ? <span className="hidden items-center gap-1 text-[12.5px] text-muted-foreground sm:inline-flex" title={plural(resource.comment_count, 'comment')}><MessageCircle size={14} aria-hidden="true" />{resource.comment_count}</span> : null}
    {resource.average_rating ? <span className="hidden items-center gap-0.5 text-[12.5px] text-muted-foreground lg:inline-flex"><Star size={13} className="fill-amber-400 text-amber-400" aria-hidden="true" />{resource.average_rating.toFixed(1)}</span> : null}
    {actions}
  </li>
}

export const listClass = 'overflow-hidden rounded-[18px] border border-border bg-card'

/** Save or unsave something from the Library for the whole org. */
export function SaveButton({ saved, onClick, label, busy, compact }: { saved: boolean; onClick: () => void; label?: string; busy?: boolean; compact?: boolean }) {
  return <button type="button" onClick={onClick} disabled={busy} aria-pressed={saved} aria-label={compact ? `${saved ? 'Saved' : 'Save'}${label ? ` ${label}` : ''}` : undefined}
    className={cn('inline-flex shrink-0 items-center justify-center gap-1.5 rounded-full text-[13px] font-semibold transition-colors disabled:opacity-50',
      compact ? 'h-8 w-8' : 'h-8 px-3', saved ? 'bg-foreground text-background' : 'border border-border bg-card text-foreground hover:bg-muted')}>
    <Bookmark size={15} className={saved ? 'fill-current' : undefined} aria-hidden="true" />{compact ? null : saved ? 'Saved' : 'Save'}
  </button>
}
