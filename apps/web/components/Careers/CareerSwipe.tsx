'use client'

import React, { type Dispatch } from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import useSWR from 'swr'
import { toast } from 'react-hot-toast'
import { ArrowLeft, ChevronRight, Heart, Info, Layers, Loader2, Star, Undo2, X } from 'lucide-react'
import { useOrg } from '@components/Contexts/OrgContext'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import GeneralWrapper from '@components/Objects/StyledElements/Wrappers/GeneralWrapper'
import ResourceSheet from '@components/Discover/ResourceSheet'
import { getUriWithOrg } from '@services/config/config'
import { careersApi, shortMoney, type SwipeCard } from '@services/life/careers'
import { getResource, saveResource, unsaveResource } from '@services/resources/resources'
import { cn } from '@/lib/utils'
import { CAREER_TYPES, TRAINING, CareerIcon, matchLabel } from './CareerTile'
import CareerTake from './CareerTake'

export const BATCH = 10
export const deckKey = (orgId?: number) => ['career-deck', orgId]

interface Batch { cards: SwipeCard[]; at: number; kept: string[] }
type Step = { kind: 'save' | 'skip'; code: string; resourceUuid: string }

const storeKey = (orgId: number) => `career-swipe-${orgId}`
function readBatch(orgId: number): Batch | null {
  try {
    const value = JSON.parse(window.localStorage.getItem(storeKey(orgId)) || 'null')
    return value && Array.isArray(value.cards) && value.at < value.cards.length ? value : null
  } catch {
    return null
  }
}
function writeBatch(orgId: number, batch: Batch | null) {
  try {
    if (batch) window.localStorage.setItem(storeKey(orgId), JSON.stringify(batch))
    else window.localStorage.removeItem(storeKey(orgId))
  } catch {
    // Without storage the batch just starts over next time.
  }
}
/** Where a batch stopped, for Discover's "Keep going". */
export function batchProgress(orgId?: number): { at: number; of: number } | null {
  if (!orgId || typeof window === 'undefined') return null
  const batch = readBatch(orgId)
  return batch && batch.at > 0 ? { at: batch.at, of: batch.cards.length } : null
}

function reducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function Card({ card, place, onDrag, onTap }: { card: SwipeCard; place: 0 | 1 | 2; onDrag?: Dispatch<1 | -1>; onTap?: () => void }) {
  const top = (card.top_interests || '').split('').slice(0, 2)
  const color = (CAREER_TYPES[top[0]] || CAREER_TYPES.E).color
  const el = React.useRef<HTMLElement>(null)
  const drag = React.useRef({ down: false, moved: false, x: 0, y: 0, dx: 0 })
  const [shift, setShift] = React.useState<{ dx: number; dy: number } | null>(null)
  const pay = card.my_place_pay || (card.pay ? { yearly: card.pay.yearly, place: '' } : null)

  const handlers = onDrag ? {
    onPointerDown: (event: React.PointerEvent) => {
      if (event.button !== 0 || (event.target as HTMLElement).closest('button')) return
      drag.current = { down: true, moved: false, x: event.clientX, y: event.clientY, dx: 0 }
      el.current?.setPointerCapture(event.pointerId)
    },
    onPointerMove: (event: React.PointerEvent) => {
      const state = drag.current
      if (!state.down) return
      state.dx = event.clientX - state.x
      if (Math.abs(state.dx) > 6) state.moved = true
      if (state.moved) setShift({ dx: state.dx, dy: (event.clientY - state.y) * 0.25 })
    },
    onPointerUp: () => {
      const state = drag.current
      if (!state.down) return
      state.down = false
      if (!state.moved) { onTap?.(); return }
      if (state.dx > 110) onDrag(1)
      else if (state.dx < -110) onDrag(-1)
      setShift(null)
    },
    onPointerCancel: () => { drag.current.down = false; setShift(null) },
  } : {}

  const style: React.CSSProperties = shift
    ? { transform: `translate(${shift.dx}px, ${shift.dy}px) rotate(${shift.dx / 18}deg)` }
    : { transform: place === 0 ? undefined : `translateY(${place * 12}px) scale(${1 - place * 0.04})`, transition: reducedMotion() ? undefined : 'transform .25s ease' }
  const yes = shift ? Math.max(0, Math.min(1, shift.dx / 90)) : 0
  const no = shift ? Math.max(0, Math.min(1, -shift.dx / 90)) : 0

  return <article ref={el} {...handlers} aria-hidden={place !== 0} style={{ ...style, zIndex: 3 - place }}
    className={cn('absolute inset-0 flex touch-pan-y select-none flex-col overflow-hidden rounded-[28px] bg-card shadow-[0_6px_0_hsl(var(--edge)),0_20px_50px_rgba(0,0,0,.15)]', place === 0 ? 'cursor-grab active:cursor-grabbing' : 'pointer-events-none')}>
    <div className="relative flex min-h-0 flex-[1.15] items-center justify-center text-white" style={{ backgroundColor: color }}>
      <span aria-hidden="true" className="absolute inset-0 bg-[radial-gradient(120%_90%_at_20%_0%,rgba(255,255,255,.25),transparent_60%)]" />
      <div className="absolute left-4 top-4 flex gap-1.5">{top.map((letter) => <span key={letter} className="rounded-full bg-black/25 px-2.5 py-1 text-[11.5px] font-extrabold">{CAREER_TYPES[letter]?.name}</span>)}</div>
      {card.match != null ? <span className="absolute right-4 top-4 rounded-full bg-black/55 px-2.5 py-1 text-[11.5px] font-extrabold">{matchLabel(card.match)}</span> : null}
      <CareerIcon code={card.code} className="h-24 w-24 drop-shadow-[0_4px_0_rgba(0,0,0,.18)]" />
      <span aria-hidden="true" className="absolute left-5 top-14 -rotate-12 rounded-xl border-4 border-emerald-400 px-3 py-1 text-2xl font-black text-emerald-300" style={{ opacity: yes }}>SAVE</span>
      <span aria-hidden="true" className="absolute right-5 top-14 rotate-12 rounded-xl border-4 border-slate-200 px-3 py-1 text-2xl font-black text-slate-100" style={{ opacity: no }}>LATER</span>
    </div>
    <div className="flex flex-col gap-2 p-5">
      <h2 className="m-0 text-balance text-[24px] font-extrabold leading-[1.12] tracking-tight">{card.title}</h2>
      {card.alt_titles?.length ? <p className="m-0 line-clamp-1 text-[13px] font-semibold text-muted-foreground">Also called {card.alt_titles.slice(0, 2).join(', ')}</p> : null}
      {onTap ? <button type="button" onClick={onTap} className="flex items-center gap-0.5 self-start text-[14px] font-extrabold text-[var(--org-primary-color)]">What it’s like<ChevronRight size={16} aria-hidden="true" /></button> : null}
      <div className="mt-1 grid grid-cols-2 gap-2">
        {pay ? <div className="rounded-2xl bg-muted px-3 py-2">
          <b className="block text-[20px] font-extrabold tabular-nums">{shortMoney(pay.yearly)}</b>
          <span className="flex items-center gap-1 text-[12px] font-bold text-muted-foreground">{card.my_place_pay ? <><Star size={12} className="fill-amber-500 text-amber-500" aria-hidden="true" />typical in {card.my_place_pay.place}</> : 'typical yearly pay in Oregon'}</span>
        </div> : null}
        {card.job_zone ? <div className="rounded-2xl bg-muted px-3 py-2">
          <b className="block text-[15px] font-extrabold leading-tight">{TRAINING[card.job_zone]}</b>
          <span className="text-[12px] font-bold text-muted-foreground">usual training</span>
        </div> : null}
      </div>
    </div>
  </article>
}

function Horizon({ batch }: { batch: Batch }) {
  const done = batch.at >= batch.cards.length
  return <div className="flex flex-col gap-1.5" aria-label={done ? `All ${batch.cards.length} done` : `Career ${batch.at + 1} of ${batch.cards.length}`}>
    <div className="flex justify-between text-[12.5px] font-bold text-muted-foreground"><span>{done ? `All ${batch.cards.length} done` : `${batch.at + 1} of ${batch.cards.length}`}</span><span>{batch.kept.length} saved</span></div>
    <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${batch.cards.length}, minmax(0, 1fr))` }}>
      {batch.cards.map((card, index) => <span key={card.code} className={cn('h-2 rounded-full', index < batch.at ? (batch.kept.includes(card.code) ? 'bg-emerald-500' : 'bg-foreground/40') : index === batch.at ? 'bg-[var(--org-primary-color)]' : 'bg-muted')} />)}
    </div>
  </div>
}

/**
 * Career swipe, a Discover tool: up to ten careers at a time, closest to the learner's interests first. Swipe
 * right (or the heart) to save one and jot why; left only moves it to the back for later runs, so nothing is
 * ever marked as disliked. Saved careers are resources, so they sit in the learner's library with their note.
 */
export default function CareerSwipe({ orgslug }: { orgslug: string }) {
  const org = useOrg() as any
  const session = useLHSession() as any
  const token: string | undefined = session?.data?.tokens?.access_token
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const { data: deck, error, mutate: refetch } = useSWR(token && org?.id ? [...deckKey(org.id), token] : null, () => careersApi.deck(org.id, token!, BATCH))
  const [batch, setBatch] = React.useState<Batch | null>(null)
  const [history, setHistory] = React.useState<Step[]>([])
  const [leaving, setLeaving] = React.useState<1 | -1 | 0>(0)
  const [noteFor, setNoteFor] = React.useState<SwipeCard | null>(null)
  const discover = getUriWithOrg(orgslug, '/discover')

  // Pick up where the learner left off, else deal a new batch.
  React.useEffect(() => {
    if (batch || !org?.id || !deck) return
    setBatch(readBatch(org.id) || { cards: deck.cards, at: 0, kept: [] })
  }, [batch, deck, org?.id])
  React.useEffect(() => { if (org?.id && batch) writeBatch(org.id, batch) }, [batch, org?.id])

  const sheet = params.get('r') || ''
  const setSheet = React.useCallback((uuid: string) => {
    const next = new URLSearchParams(params.toString())
    if (uuid) next.set('r', uuid.replace(/^resource_/, '')); else next.delete('r')
    router.replace(`${pathname}${next.size ? `?${next}` : ''}`, { scroll: false })
  }, [params, pathname, router])

  const current = batch && batch.at < batch.cards.length ? batch.cards[batch.at] : null

  const decide = React.useCallback((direction: 1 | -1) => {
    if (!current || !token || leaving) return
    setLeaving(direction)
    window.setTimeout(async () => {
      setLeaving(0)
      setBatch((value) => value && { ...value, at: value.at + 1, kept: direction > 0 ? [...value.kept, current.code] : value.kept })
      setHistory((value) => [...value, { kind: direction > 0 ? 'save' : 'skip', code: current.code, resourceUuid: current.resource_uuid }])
      try {
        if (direction > 0) {
          await saveResource(current.resource_uuid, { add_to_default_channel: false, interest_level: 2 }, token)
          setNoteFor(current)
        } else {
          await careersApi.skip(current.code, token)
        }
      } catch {
        toast.error('That didn’t save. Check your connection.')
      }
    }, reducedMotion() ? 0 : 240)
  }, [current, leaving, token])

  const undo = async () => {
    const last = history[history.length - 1]
    if (!last || !token) return
    setHistory((value) => value.slice(0, -1))
    setNoteFor(null)
    setBatch((value) => value && value.at > 0 && value.cards[value.at - 1]?.code === last.code ? { ...value, at: value.at - 1, kept: value.kept.filter((code) => code !== last.code) } : value)
    try {
      if (last.kind === 'save') await unsaveResource(last.resourceUuid, token)
      else await careersApi.unskip(last.code, token)
    } catch {
      toast.error('Couldn’t undo that. Try again.')
    }
  }

  const another = async () => {
    setHistory([])
    const next = await refetch()
    setBatch(next ? { cards: next.cards, at: 0, kept: [] } : null)
  }

  React.useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (noteFor || sheet || (event.target as HTMLElement)?.closest?.('input,textarea,select,[role="dialog"]')) return
      if (event.key === 'ArrowRight') decide(1)
      else if (event.key === 'ArrowLeft') decide(-1)
      else if (event.key === 'ArrowUp' && current) { event.preventDefault(); setSheet(current.resource_uuid) }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [current, decide, noteFor, setSheet, sheet])

  const title = <div className="flex items-center gap-3">
    <Link href={discover} aria-label="Back to Discover" className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-border bg-card"><ArrowLeft size={18} /></Link>
    <h1 className="m-0 text-[26px] font-extrabold tracking-tight">Career swipe</h1>
  </div>

  let body: React.ReactNode
  if (!token) body = <p className="rounded-2xl bg-card p-6 text-sm font-medium">Sign in to explore careers.</p>
  else if (error) body = <p className="rounded-2xl bg-card p-6 text-sm font-medium">Careers couldn’t load. Refresh to try again.</p>
  else if (!batch) body = <div className="flex h-[520px] items-center justify-center"><Loader2 className="animate-spin text-muted-foreground" aria-label="Loading careers" /></div>
  else if (!batch.cards.length) body = <div className="flex flex-col gap-3 rounded-[28px] bg-card p-6">
    <h2 className="m-0 text-xl font-extrabold">{deck?.has_careers ? 'You’ve seen every career here' : 'No careers here yet'}</h2>
    <p className="m-0 text-sm text-muted-foreground">{deck?.has_careers ? 'Every career is in your library. Open one from Discover to add a note or put it on your plan.' : 'Your organization hasn’t added careers to Discover yet.'}</p>
    <Link href={discover} className="self-start font-extrabold underline">Back to Discover</Link>
  </div>
  else {
    const rest = batch.cards.slice(batch.at, batch.at + 3)
    body = <>
      <Horizon batch={batch} />
      {!deck?.has_quiz && batch.at === 0 ? <p className="m-0 rounded-2xl bg-muted px-4 py-3 text-[13px] font-semibold">
        These are in no particular order. <Link href={getUriWithOrg(orgslug, '/portfolio/interests')} className="font-extrabold underline">Take the interest quiz</Link> and the closest matches come first.
      </p> : null}
      <div className="relative mx-auto h-[min(520px,60dvh)] min-h-[380px] w-full max-w-[400px]" aria-live="polite">
        {rest.length ? rest.map((card, index) => <div key={card.code} className="absolute inset-0" style={index === 0 && leaving ? { transform: `translate(${leaving * 120}%, 40px) rotate(${leaving * 24}deg)`, opacity: 0, transition: 'transform .24s ease, opacity .24s ease' } : undefined}>
          <Card card={card} place={index as 0 | 1 | 2} onDrag={index === 0 ? decide : undefined} onTap={index === 0 ? () => setSheet(card.resource_uuid) : undefined} />
        </div>).reverse()
          : <div className="absolute inset-0 flex flex-col gap-3 overflow-y-auto rounded-[28px] bg-card p-6 shadow-[0_6px_0_hsl(var(--edge))]">
            <h2 className="m-0 text-[23px] font-extrabold">{batch.kept.length ? `Nice. ${batch.kept.length} saved.` : `That was ${batch.cards.length}.`}</h2>
            <p className="m-0 text-[14px] text-muted-foreground">{batch.kept.length ? 'They’re in your library with your notes. Open one to see more or put it on your plan.' : 'Nothing jumped out, and that’s useful too. The ones you skipped come back later, after new ones.'}</p>
            {batch.kept.length ? <div className="flex flex-col gap-2">{batch.kept.map((code) => {
              const card = batch.cards.find((item) => item.code === code)!
              return <button key={code} type="button" onClick={() => setSheet(card.resource_uuid)} className="flex items-center gap-3 rounded-2xl bg-muted p-2.5 text-left">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-white" style={{ backgroundColor: (CAREER_TYPES[card.top_interests?.[0]] || CAREER_TYPES.E).color }}><CareerIcon code={code} className="h-5 w-5" /></span>
                <b className="text-[14px]">{card.title}</b>
              </button>
            })}</div> : null}
            <div className="mt-auto flex flex-wrap gap-2.5 pt-2">
              <button type="button" onClick={() => void another()} className="flex h-12 flex-1 items-center justify-center gap-2 rounded-2xl bg-[var(--org-primary-color)] px-5 text-sm font-extrabold uppercase tracking-wide text-[var(--org-on-primary-color)] shadow-[0_4px_0_color-mix(in_srgb,var(--org-primary-color)_68%,#000)]"><Layers size={16} />Another {BATCH}</button>
              <Link href={discover} className="flex h-12 flex-1 items-center justify-center rounded-2xl border-2 border-border bg-card px-5 text-sm font-bold">Back to Discover</Link>
            </div>
          </div>}
      </div>
      <div className="flex items-center justify-center gap-4">
        <button type="button" onClick={() => void undo()} disabled={!history.length} aria-label="Undo" className="grid h-12 w-12 place-items-center rounded-full border-2 border-border bg-card disabled:opacity-40"><Undo2 size={18} /></button>
        <button type="button" onClick={() => decide(-1)} disabled={!current} aria-label="Skip for now" className="grid h-16 w-16 place-items-center rounded-full border-2 border-border bg-card text-muted-foreground shadow-[0_4px_0_hsl(var(--border))] disabled:opacity-40"><X size={26} /></button>
        <button type="button" onClick={() => current && setSheet(current.resource_uuid)} disabled={!current} aria-label="See details" className="grid h-12 w-12 place-items-center rounded-full border-2 border-border bg-card disabled:opacity-40"><Info size={18} /></button>
        <button type="button" onClick={() => decide(1)} disabled={!current} aria-label="Save this career" className="grid h-16 w-16 place-items-center rounded-full bg-emerald-500 text-white shadow-[0_4px_0_#047857] disabled:opacity-40"><Heart size={26} className="fill-current" /></button>
      </div>
      <p className="m-0 text-center text-[12.5px] font-semibold text-muted-foreground">Swipe right to save, left to skip for now. Arrow keys work too.</p>
    </>
  }

  return <GeneralWrapper>
    <main className="mx-auto flex w-full max-w-[520px] flex-col gap-4 pb-16 pt-2 text-foreground">
      {title}
      {body}
      {noteFor && token ? <NoteDialog card={noteFor} token={token} onClose={() => setNoteFor(null)} /> : null}
      {sheet ? <ResourceSheet resourceUuid={sheet} orgslug={orgslug} onClose={() => setSheet('')} onOpen={setSheet} /> : null}
    </main>
  </GeneralWrapper>
}

/** Right after a save: how into it, what caught their eye, and whether it goes on their EPP. */
function NoteDialog({ card, token, onClose }: { card: SwipeCard; token: string; onClose: () => void }) {
  const { data } = useSWR(['career-saved-state', card.resource_uuid], () => getResource(card.resource_uuid, token))
  React.useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])
  return <div className="fixed inset-0 flex items-end justify-center sm:items-center sm:p-6" style={{ zIndex: 'var(--z-modal)' }}>
    <div aria-hidden="true" className="absolute inset-0 bg-black/45" onClick={onClose} />
    <div role="dialog" aria-modal="true" aria-labelledby="career-note-title" className="relative flex max-h-[92dvh] w-full flex-col gap-4 overflow-y-auto rounded-t-[28px] bg-card p-5 pb-[max(20px,env(safe-area-inset-bottom))] sm:max-w-[480px] sm:rounded-[28px]">
      <div className="flex items-center gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-white" style={{ backgroundColor: (CAREER_TYPES[card.top_interests?.[0]] || CAREER_TYPES.E).color }}><CareerIcon code={card.code} className="h-5 w-5" /></span>
        <div><small className="text-[11px] font-extrabold uppercase tracking-[0.08em] text-muted-foreground">Saved</small><b id="career-note-title" className="block text-[17px] leading-tight">{card.title}</b></div>
      </div>
      {data ? <CareerTake resourceUuid={card.resource_uuid} state={data.user_state} token={token} fresh onSaved={onClose} onSkip={onClose} />
        : <div className="flex h-24 items-center justify-center"><Loader2 className="animate-spin text-muted-foreground" /></div>}
    </div>
  </div>
}
