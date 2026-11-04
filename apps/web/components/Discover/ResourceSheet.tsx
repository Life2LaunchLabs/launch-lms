'use client'

import React, { type Dispatch } from 'react'
import { createPortal } from 'react-dom'
import { useSearchParams } from 'next/navigation'
import useSWR from 'swr'
import { toast } from 'react-hot-toast'
import { ArrowUpRight, Bookmark, Loader2, Sparkles, Star, X } from 'lucide-react'
import { useOrg } from '@components/Contexts/OrgContext'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { useHub } from '@components/Hub/HubContext'
import AddToPlans from '@components/Careers/AddToPlans'
import CareerProfile from '@components/Careers/CareerProfile'
import CareerTake from '@components/Careers/CareerTake'
import ResourceComments from '@components/Resources/ResourceComments'
import ResourceNotes from '@components/Resources/ResourceNotes'
import SaveDropdown from '@components/Resources/SaveDropdown'
import { Button } from '@components/ui/button'
import { getUriWithOrg, routePaths } from '@services/config/config'
import { getResource, getResources, saveResource, unsaveResource, type Resource } from '@services/resources/resources'
import { careerCode } from '@services/life/careers'
import { cn } from '@/lib/utils'
import ResourceCover, { resourceKind, resourceSite, resourceSource } from './ResourceCover'

function minutes(value: number | null) {
  if (!value) return ''
  return value < 60 ? `${value} min` : `${Math.floor(value / 60)}h${value % 60 ? ` ${value % 60}m` : ''}`
}

/** "Video on YouTube · 6 min · Free": what it is, where it plays, how long, and whether it costs. */
export function resourceMeta(resource: Resource) {
  const kind = resourceKind(resource.resource_type)
  const where = resource.resource_type === 'video' ? `Video on ${resourceSource(resource)}` : resourceSource(resource)
  const access = resource.access_mode === 'paid' ? 'Costs money' : resource.access_mode === 'restricted' ? 'Needs an account' : 'Free'
  return { kind, line: [where, minutes(resource.estimated_time), access].filter(Boolean).join(' · ') }
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="flex flex-col gap-2.5">
    <h3 className="m-0 text-xs font-extrabold uppercase tracking-[0.08em] text-muted-foreground">{title}</h3>
    {children}
  </section>
}

function MoreFrom({ resource, onOpen }: { resource: Resource; onOpen: Dispatch<string> }) {
  const org = useOrg() as any
  const session = useLHSession() as any
  const token = session?.data?.tokens?.access_token
  const channel = resource.channels?.[0]
  const { data } = useSWR(channel && org?.id ? ['resource-sheet-more', channel.channel_uuid, token || 'public'] : null,
    () => getResources(org.id, { channel_uuid: channel!.channel_uuid, limit: 8 }, token))
  const others = (data || []).filter((item) => item.resource_uuid !== resource.resource_uuid).slice(0, 6)
  if (!channel || !others.length) return null
  return <Block title={`More in ${channel.name}`}>
    <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {others.map((item) => <button key={item.resource_uuid} type="button" onClick={() => onOpen(item.resource_uuid)} className="flex w-[160px] shrink-0 flex-col gap-1.5 text-left">
        <ResourceCover resource={item} className="rounded-xl" />
        <span className="line-clamp-2 text-[13px] font-extrabold leading-tight">{item.title}</span>
      </button>)}
    </div>
  </Block>
}

/**
 * One resource, over Discover: what it is and a big button straight to it, then saving it, asking Coach,
 * your notes and what others say. A sheet from the bottom on phones, a card in the middle on wider screens.
 */
export default function ResourceSheet({ resourceUuid, orgslug, onClose, onOpen }: { resourceUuid: string; orgslug: string; onClose: () => void; onOpen: Dispatch<string> }) {
  const session = useLHSession() as any
  const hub = useHub()
  const token = session?.data?.tokens?.access_token
  const signedIn = Boolean(token)
  const uuid = resourceUuid.startsWith('resource_') ? resourceUuid : `resource_${resourceUuid}`
  const { data: resource, error, mutate } = useSWR(session?.status === 'loading' ? null : ['discover-resource', uuid, token || 'public'], () => getResource(uuid, token))
  const [saving, setSaving] = React.useState(false)
  // A career just saved here: its take opens fresh, with "Add to my EPP" on.
  const [fresh, setFresh] = React.useState(false)
  const [planning, setPlanning] = React.useState<{ code: string; title: string; job_zone?: number | null } | null>(null)
  // From the plan map's "Start from a career": the phase the career goes after.
  const after = useSearchParams()?.get('after')
  const [mounted, setMounted] = React.useState(false)
  const panel = React.useRef<HTMLDivElement>(null)
  const openButton = React.useRef<HTMLButtonElement>(null)

  React.useEffect(() => setMounted(true), [])
  React.useEffect(() => {
    const restore = document.activeElement as HTMLElement | null
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented) onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = overflow
      document.removeEventListener('keydown', onKey)
      restore?.focus?.()
    }
  }, [onClose])
  React.useEffect(() => {
    panel.current?.scrollTo({ top: 0 })
    setFresh(false)
    if (resource) openButton.current?.focus({ preventScroll: true })
  }, [resource?.resource_uuid]) // eslint-disable-line react-hooks/exhaustive-deps

  const open = async () => {
    if (!resource) return
    // Counting the open never stands in the way of opening it.
    if (token) void saveResource(resource.resource_uuid, { open_count_increment: 1 }, token).catch(() => undefined)
    window.open(resource.external_url, '_blank', 'noopener,noreferrer')
  }

  const toggleSave = async () => {
    if (!resource || !token) return
    setSaving(true)
    try {
      const result: any = resource.is_saved ? await unsaveResource(resource.resource_uuid, token) : await saveResource(resource.resource_uuid, { add_to_default_channel: false }, token)
      if (!result?.success) throw new Error()
      setFresh(!resource.is_saved && resource.resource_type === 'career')
      await mutate()
    } catch {
      toast.error(resource.is_saved ? 'Couldn’t remove it. Try again.' : 'Couldn’t save it. Try again.')
    } finally {
      setSaving(false)
    }
  }

  const meta = resource ? resourceMeta(resource) : null
  const Kind = meta?.kind.icon
  const site = resource ? resourceSite(resource) : ''
  const code = resource?.resource_type === 'career' ? careerCode(resource.external_url) : null

  const sheet = <div className="fixed inset-0 flex items-end justify-center sm:items-center sm:p-6" style={{ zIndex: 'var(--z-modal)' }}>
    <div aria-hidden="true" className="absolute inset-0 bg-black/45 backdrop-blur-[2px] animate-in fade-in duration-200" onClick={onClose} />
    <div ref={panel} role="dialog" aria-modal="true" aria-labelledby="resource-sheet-title"
      className="relative flex max-h-[92dvh] w-full flex-col overflow-y-auto rounded-t-[28px] bg-card pb-[env(safe-area-inset-bottom)] text-foreground shadow-[0_8px_0_hsl(var(--edge)),0_30px_80px_rgba(0,0,0,.35)] animate-in slide-in-from-bottom-6 fade-in duration-200 sm:max-h-[calc(100dvh-48px)] sm:max-w-[560px] sm:rounded-[28px] sm:slide-in-from-bottom-2">
      <span aria-hidden="true" className="mx-auto mt-2 h-1.5 w-11 shrink-0 rounded-full bg-muted sm:hidden" />
      <button type="button" onClick={onClose} aria-label="Close" className="absolute right-6 top-6 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-foreground text-background">
        <X size={18} />
      </button>
      {error ? <p role="alert" className="m-6 rounded-2xl bg-muted p-6 text-sm font-medium">This resource isn’t available. It may have been removed or made private.</p>
        : !resource || !meta || !Kind ? <div className="flex min-h-72 items-center justify-center"><Loader2 className="animate-spin text-muted-foreground" aria-label="Loading" /></div>
        : <>
          <div className="px-[18px] pt-[18px] sm:pt-[18px]">
            <ResourceCover resource={resource} className="rounded-[20px]" />
          </div>
          <div className="flex flex-col gap-[18px] px-[22px] pb-7 pt-[18px]">
            <div className="flex flex-wrap items-center gap-2 text-[12.5px] font-bold text-muted-foreground">
              <span className="flex items-center gap-1 rounded-full bg-foreground px-2.5 py-1 font-extrabold text-background"><Kind size={12} aria-hidden="true" />{meta.kind.label}</span>
              <span>{meta.line}</span>
            </div>
            <h2 id="resource-sheet-title" className="m-0 text-balance text-[26px] font-extrabold leading-[1.12] tracking-tight">{resource.title}</h2>
            {resource.description ? <p className="m-0 max-w-prose text-[15px] text-muted-foreground">{resource.description}</p> : null}
            {resource.rating_count ? <p className="-mt-2 m-0 flex items-center gap-1.5 text-[13px] font-bold text-muted-foreground">
              <Star size={14} className="fill-amber-400 text-amber-400" aria-hidden="true" />
              <span className="text-foreground">{(resource.average_rating || 0).toFixed(1)}</span>{resource.rating_count === 1 ? '1 review' : `${resource.rating_count} reviews`}
            </p> : null}
            <div className="flex flex-col gap-2">
              <div className="flex gap-2.5">
                <Button ref={openButton} type="button" variant="brand" size="tall" className="flex-1" onClick={() => void open()}>
                  {meta.kind.verb} {resourceSource(resource)}<ArrowUpRight size={18} aria-hidden="true" />
                </Button>
                {signedIn ? <Button type="button" variant={resource.is_saved ? 'default' : 'surface'} size="tall" className="w-14 px-0" aria-pressed={resource.is_saved} aria-label={resource.is_saved ? 'Saved. Remove from your library' : 'Save to your library'} disabled={saving} onClick={() => void toggleSave()}>
                  {saving ? <Loader2 size={18} className="animate-spin" /> : <Bookmark size={18} className={cn(resource.is_saved && 'fill-current')} />}
                </Button> : null}
              </div>
              {site ? <span className="px-1 text-[12.5px] font-semibold text-muted-foreground">Opens {site} in a new tab</span> : null}
            </div>
            <div className="flex flex-wrap items-center gap-2.5">
              {hub ? <Button type="button" variant="surface" size="tall" className="flex-1" onClick={() => { hub.attach(resource); onClose() }}><Sparkles size={16} />Ask Coach about this</Button> : null}
              {signedIn ? <SaveDropdown resourceUuid={resource.resource_uuid} isSaved={resource.is_saved} savedUserChannelUuids={resource.user_channel_uuids || []}
                onSaveChange={() => void mutate()} onMembershipChange={() => void mutate()} variant="menu"
                share={{ title: resource.title, description: resource.description, url: getUriWithOrg(orgslug, routePaths.org.resource(resource.resource_uuid)) }} /> : null}
            </div>
            {code && signedIn ? <CareerProfile code={code} token={token} onOpen={onOpen} onAddToPlans={(profile) => setPlanning(profile.career)} /> : null}
            {code && signedIn && resource.is_saved ? <Block title="Your take">
              <CareerTake key={`${resource.resource_uuid}-${fresh}`} resourceUuid={resource.resource_uuid} state={resource.user_state} token={token} fresh={fresh}
                onSaved={() => { setFresh(false); void mutate() }} />
            </Block> : null}
            {signedIn && !code ? <Block title="Your notes"><ResourceNotes resourceUuid={resource.resource_uuid} compact onNotesChange={() => void mutate()} /></Block> : null}
            <Block title="What others say"><ResourceComments resourceUuid={resource.resource_uuid} compact onReviewsChange={() => void mutate()} /></Block>
            {/* A career lists careers like it instead. */}
            {code ? null : <MoreFrom resource={resource} onOpen={onOpen} />}
          </div>
        </>}
    </div>
  </div>
  return mounted ? createPortal(<>{sheet}{planning && token ? <AddToPlans career={planning} token={token} orgslug={orgslug} after={after} onClose={() => setPlanning(null)} /> : null}</>, document.body) : null
}
