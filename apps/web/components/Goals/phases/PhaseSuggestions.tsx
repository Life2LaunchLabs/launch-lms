'use client'

import React from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import useSWR from 'swr'
import { Bookmark, ChevronLeft, ChevronRight } from 'lucide-react'
import { useOrg } from '@components/Contexts/OrgContext'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import GeneralWrapperStyled from '@components/Objects/StyledElements/Wrappers/GeneralWrapper'
import ResourceCover from '@components/Discover/ResourceCover'
import ResourceSheet, { type SheetContext } from '@components/Discover/ResourceSheet'
import { ResourceTile } from '@components/Discover/ResourceShelves'
import { Shelf } from '@components/Discover/PlanArt'
import { Skeleton } from '@components/ui/skeleton'
import { getUriWithOrg, routePaths } from '@services/config/config'
import { recommendApi, type PhaseSuggestions, type Suggestion } from '@services/recommend/recommend'
import type { Resource } from '@services/resources/resources'

import { tr } from '@/lib/tr'

/** How many suggestions the phase page shows; See more has the rest. */
export const PICKS = 4

/** A phase's suggestions and the actions on them, shared by the phase page's card and the See more page. */
export function usePhaseSuggestions(phaseId: string) {
  const org = useOrg() as any
  const session = useLHSession() as any
  const token: string | undefined = session?.data?.tokens?.access_token
  const orgId: number | undefined = org?.id
  const swr = useSWR<PhaseSuggestions>(token && orgId ? ['phase-suggestions', phaseId, orgId] : null, () => recommendApi.phase(phaseId, orgId!, token), { revalidateOnFocus: false })
  const data = swr.data
  const find = React.useCallback((uuid: string): Suggestion | undefined => {
    const key = uuid.startsWith('resource_') ? uuid : `resource_${uuid}`
    return [...(data?.list?.items || []), ...(data?.picks || []), ...(data?.shelves || []).flatMap((s) => s.items)].find((r) => r.resource_uuid === key)
  }, [data])
  const contextFor = React.useCallback((uuid: string): SheetContext | undefined => {
    if (!data || !orgId) return undefined
    const key = uuid.startsWith('resource_') ? uuid : `resource_${uuid}`
    const item = find(key)
    const inList = Boolean(data.list?.items.some((r) => r.resource_uuid === key))
    return {
      label: data.context.label,
      reason: inList ? undefined : item?.reason,
      inList,
      onSave: async () => { await recommendApi.saveToPhase(phaseId, orgId, key, item?.shelf, token); await swr.mutate() },
      onRemove: async () => { await recommendApi.removeFromPhase(phaseId, orgId, key, token); await swr.mutate() },
      onHide: item && !inList ? () => { void recommendApi.events(orgId, [{ kind: 'hide', resource_uuid: key, context: data.context.key, shelf: item.shelf }], token).then(() => swr.mutate()) } : undefined,
    }
  }, [data, find, orgId, phaseId, swr, token])
  const opened = React.useCallback((uuid: string, position?: number) => {
    if (!data || !orgId) return
    const item = find(uuid)
    void recommendApi.events(orgId, [{ kind: 'open', resource_uuid: item?.resource_uuid || uuid, context: data.context.key, shelf: item?.shelf, position }], token)
  }, [data, find, orgId, token])
  return { ...swr, data, orgId, token, contextFor, opened, org }
}

function Row({ item, onOpen, saved }: { item: Suggestion; onOpen: () => void; saved?: boolean }) {
  return <button type="button" onClick={onOpen} className="flex min-h-[52px] w-full min-w-0 items-center gap-3 rounded-2xl p-1.5 text-left hover:bg-raised">
    <ResourceCover resource={item as unknown as Resource} chip={false} className="w-[60px] shrink-0 rounded-xl" />
    <span className="grid min-w-0 flex-1">
      <span className="truncate text-[14.5px] font-extrabold">{item.title}</span>
      <span className="truncate text-xs font-semibold text-muted-foreground">{saved ? tr('goals.phase_suggestions.saved_here', 'Saved for this phase') : item.reason}</span>
    </span>
    {item.is_saved && !saved ? <Bookmark className="size-4 shrink-0 fill-current text-[var(--org-primary-color)]" aria-label={tr('discover.resource_shelves.saved', 'Saved')} /> : null}
  </button>
}

/** On the phase page, beside its budget: four suggestions, each with why it's here, and the way into the rest. */
export function PhaseSuggestionsCard({ phaseId, orgslug }: { phaseId: string; orgslug: string }) {
  const { data, isLoading, orgId, token, contextFor, opened, mutate } = usePhaseSuggestions(phaseId)
  const [open, setOpen] = React.useState('')
  const shown = React.useRef('')
  const picks = (data?.picks || []).slice(0, PICKS)
  React.useEffect(() => {
    const key = picks.map((p) => p.resource_uuid).join(',')
    if (!data || !orgId || !key || shown.current === key) return
    shown.current = key
    void recommendApi.events(orgId, picks.map((p, i) => ({ kind: 'shown' as const, resource_uuid: p.resource_uuid, context: data.context.key, shelf: p.shelf, position: i })), token)
  }, [data, orgId, picks, token])
  const more = getUriWithOrg(orgslug, routePaths.org.phaseSuggestions(phaseId))
  if (isLoading) return <div className="grid gap-3 rounded-[22px] bg-card p-5 shadow-[0_1px_0_hsl(var(--border)),0_10px_28px_-24px_rgb(10_30_50/0.5)]" aria-busy="true">
    <Skeleton className="h-5 w-32" />
    {[0, 1, 2, 3].map((i) => <div key={i} className="flex items-center gap-3"><Skeleton className="h-[38px] w-[60px] rounded-xl" /><div className="grid flex-1 gap-1.5"><Skeleton className="h-3.5 w-3/4" /><Skeleton className="h-3 w-1/2" /></div></div>)}
  </div>
  const count = data?.list?.count || 0
  if (!data || (!picks.length && !count)) return null
  const extra = data.shelves.reduce((n, s) => n + s.items.length, 0) > picks.length
  return <section aria-labelledby="phase-suggestions" className="grid gap-2 rounded-[22px] bg-card p-4 shadow-[0_1px_0_hsl(var(--border)),0_10px_28px_-24px_rgb(10_30_50/0.5)]">
    <h2 id="phase-suggestions" className="px-1.5 pt-1 text-xl font-extrabold tracking-tight">{tr('goals.phase_suggestions.for_this_phase', 'For this phase')}</h2>
    {picks.length ? <ul className="grid gap-0.5">{picks.map((item, i) => <li key={item.resource_uuid}><Row item={item} onOpen={() => { setOpen(item.resource_uuid); opened(item.resource_uuid, i) }} /></li>)}</ul> : null}
    {count ? <Link href={more} className="flex items-center justify-between gap-2 rounded-2xl bg-raised px-3 py-2.5 text-sm font-bold text-foreground hover:bg-muted">
      <span className="flex items-center gap-2"><Bookmark size={15} className="fill-current text-[var(--org-primary-color)]" aria-hidden="true" />{count === 1 ? tr('goals.phase_suggestions.one_saved', '1 saved for this phase') : tr('goals.phase_suggestions.count_saved', '{{count}} saved for this phase', { count })}</span>
      <ChevronRight size={16} className="text-muted-foreground" aria-hidden="true" />
    </Link> : null}
    {picks.length && (extra || count) ? <Link href={more} className="inline-flex w-fit items-center gap-0.5 px-1.5 py-1.5 text-sm font-bold text-[var(--org-primary-color)]">
      {tr('goals.phase_suggestions.see_more', 'See more for this phase')}<ChevronRight size={16} aria-hidden="true" />
    </Link> : null}
    {open ? <ResourceSheet resourceUuid={open} orgslug={orgslug} context={contextFor(open)} onOpen={setOpen} onClose={() => { setOpen(''); void mutate() }} /> : null}
  </section>
}

/** See more: a Discover-style page of shelves for one phase, each titled with its reason, and what's saved to it. */
export function PhaseSuggestionsPage({ phaseId, orgslug }: { phaseId: string; orgslug: string }) {
  const { data, isLoading, error, contextFor, opened, mutate } = usePhaseSuggestions(phaseId)
  const params = useSearchParams()
  const pathname = usePathname()
  const router = useRouter()
  const open = params.get('r') || ''
  const setOpen = React.useCallback((uuid: string) => {
    const next = new URLSearchParams(params.toString())
    if (uuid) next.set('r', uuid.replace(/^resource_/, '')); else next.delete('r')
    router.replace(`${pathname}${next.size ? `?${next}` : ''}`, { scroll: false })
  }, [params, pathname, router])
  const last = React.useRef('')
  React.useEffect(() => {
    if (open && data && last.current !== open) { last.current = open; opened(open) }
    if (!open) last.current = ''
  }, [data, open, opened])
  const back = getUriWithOrg(orgslug, routePaths.org.phase(phaseId))
  const shelves = [
    ...(data?.list?.items.length ? [{ key: 'list', title: tr('goals.phase_suggestions.saved_for_this_phase', 'Saved for this phase'), why: tr('goals.phase_suggestions.in_your_library_list', 'Your Library list “{{name}}”', { name: data.list.name }), items: data.list.items }] : []),
    ...(data?.shelves || []),
  ]
  return <GeneralWrapperStyled>
    <main className="flex flex-col gap-8 pb-16 pt-2 text-foreground">
      <div className="flex flex-col gap-1.5">
        <Link href={back} className="inline-flex w-fit items-center gap-1 text-sm font-bold text-[var(--org-primary-color)]"><ChevronLeft size={16} aria-hidden="true" />{data?.context.label || tr('goals.phase_suggestions.back_to_phase', 'Back to the phase')}</Link>
        <h1 className="m-0 text-3xl font-extrabold tracking-tight">{tr('goals.phase_suggestions.for_this_phase', 'For this phase')}</h1>
        <p className="m-0 max-w-prose text-[15px] text-muted-foreground">{tr('goals.phase_suggestions.lead', 'Picked from your plan, what you’ve saved and what you’re into. Each shelf says why it’s here.')}</p>
      </div>
      {isLoading ? [0, 1, 2].map((i) => <div key={i} className="flex flex-col gap-3.5" aria-busy="true">
        <Skeleton className="h-6 w-56" />
        <div className="flex gap-[18px] overflow-hidden">{[0, 1, 2, 3].map((j) => <div key={j} className="flex w-[256px] shrink-0 flex-col gap-2.5"><Skeleton className="aspect-[16/10] w-full rounded-2xl" /><Skeleton className="h-4 w-3/4" /></div>)}</div>
      </div>) : null}
      {error ? <p role="alert" className="rounded-2xl bg-muted p-6 text-sm font-medium">{tr('goals.phase_suggestions.couldn_t_load', 'Suggestions couldn’t load. Try again in a moment.')}</p> : null}
      {data && !shelves.length ? <p className="rounded-[22px] border-2 border-dashed border-border px-5 py-8 text-center font-bold text-muted-foreground">
        {tr('goals.phase_suggestions.nothing_yet', 'Nothing to suggest yet. Tell us more about this phase (what you’re doing and where) and suggestions will follow.')}
      </p> : null}
      {shelves.map((shelf) => <section key={shelf.key} aria-label={shelf.title} className="flex flex-col gap-3.5">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2 className="m-0 text-xl font-extrabold tracking-tight">{shelf.title}</h2>
          <p className="m-0 min-w-0 text-sm font-semibold text-muted-foreground">{shelf.why}</p>
        </div>
        <Shelf label={shelf.title}>{shelf.items.map((item) => <ResourceTile key={item.resource_uuid} resource={item as unknown as Resource} orgslug={orgslug} />)}</Shelf>
      </section>)}
      {open ? <ResourceSheet resourceUuid={open} orgslug={orgslug} context={contextFor(open)} onOpen={setOpen} onClose={() => { setOpen(''); void mutate() }} /> : null}
    </main>
  </GeneralWrapperStyled>
}
