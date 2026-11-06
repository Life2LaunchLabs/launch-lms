'use client'
/* eslint-disable no-unused-vars -- parameter names in function types */

import React from 'react'
import { createPortal } from 'react-dom'
import { useRouter, useSearchParams } from 'next/navigation'
import { ArrowUpDown, GitBranch, MoreVertical, Plus, Scale, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@components/ui/dropdown-menu'
import { getUriWithOrg, routePaths } from '@services/config/config'
import type { LifeDoc, Phase, PlacePhoto } from '@services/life/life'
import PlanCompare from './PlanCompare'
import PhaseSheet from './PhaseSheet'
import MoveBar, { type Moving } from './MoveBar'
import { PendingCard, PhaseCard, RankSheet, Target, Tray, type Env } from './MapParts'
import {
  byId, endOf, heldShape, join, kids, lift, loosePiece, mi, normalize, optionsOf, pieceOf, place, rank, rejoinOf, remove, split, splitOf, whenOf, ym, type RouteStep,
} from './graph'

type Change = (fn: (next: LifeDoc) => void) => Promise<LifeDoc | null>
/** Where a dragged piece would land: after `at` in line, or as a new option in the split `at`. */
type Spot = { at: string; inline: boolean; text: string; el: HTMLElement; slot?: boolean }

const SHOWN_KEY = 'plans-map-shown'
const HOLD_KEY = 'plans-map-hold'
/** Careers hand the map a route to place: it waits here while the map opens with it picked up. */
export function holdRoute(label: string, steps: RouteStep[]) { try { sessionStorage.setItem(HOLD_KEY, JSON.stringify({ label, steps })) } catch { /* private mode: the map opens without it */ } }
const readShown = (): Record<string, string> => { try { return JSON.parse(localStorage.getItem(SHOWN_KEY) || '{}') } catch { return {} } }
const WIDE = 860

/** When a new phase dropped at a spot should start: halfway to what follows in line, or with the other options. */
function freshStart(d: LifeDoc, at: string, inline: boolean): number {
  const after = (at.startsWith('g:') ? at.slice(2).split(',') : [at]).map((id) => byId(d, id)!).filter(Boolean)
  const from = after.reduce((a, b) => (mi(b.starts!) > mi(a.starts!) ? b : a))
  if (inline) return Math.max(mi(from.starts!) + 1, Math.floor((mi(from.starts!) + endOf(d, from)) / 2))
  const sib = optionsOf(d, at)[0]
  return sib ? mi(sib.starts!) : endOf(d, from)
}

/**
 * The plan as a stack of phases, top to bottom, all one size: order matters here, not length. Where
 * the plan splits, a row of options sits over a surface showing the one picked; swiping on the
 * surface swaps everything in it. The + button hands you a new phase to drag into the map: between
 * two phases, onto one (an option beside it) or onto a split's options. Press and hold a phase to move it.
 */
export default function PlanMap({ doc: raw, orgslug, token, photos, change, focus, title }: { doc: LifeDoc; orgslug: string; token?: string; photos?: Record<string, PlacePhoto>; change: Change; focus?: string | null; title?: React.ReactNode }) {
  const router = useRouter()
  const params = useSearchParams()
  const doc = React.useMemo(() => normalize(raw), [raw])
  const wrap = React.useRef<HTMLDivElement>(null)
  const [width, setWidth] = React.useState(400)
  const [gut, setGut] = React.useState({ l: 16, r: 16 })
  const [shown, setShownState] = React.useState<Record<string, string>>({})
  const [sheet, setSheet] = React.useState<{ id: string; renaming?: string; confirmRm?: boolean } | null>(null)
  const [moving, setMoving] = React.useState<Moving | null>(null)
  const [pending, setPending] = React.useState<{ doc: LifeDoc; id: string } | null>(null)
  const [comparing, setComparing] = React.useState<string[] | null>(null)
  const [ranking, setRanking] = React.useState<{ key: string; options: Phase[] } | null>(null)
  const [fab, setFab] = React.useState(false)
  const [mounted, setMounted] = React.useState(false)
  React.useEffect(() => setMounted(true), [])
  const wide = width >= WIDE

  React.useLayoutEffect(() => {
    const el = wrap.current
    if (!el) return
    // Splits run edge to edge on a phone: measure how far the map sits in from each edge.
    const measure = () => { const r = el.getBoundingClientRect(); setWidth(el.clientWidth); setGut({ l: r.left, r: document.documentElement.clientWidth - r.right }) }
    const ro = new ResizeObserver(measure)
    ro.observe(el); measure()
    return () => ro.disconnect()
  }, [comparing])

  const setShown = React.useCallback((key: string, id: string) => setShownState((s) => { const next = { ...s, [key]: id }; try { localStorage.setItem(SHOWN_KEY, JSON.stringify(next)) } catch { /* not kept */ } return next }), [])
  // Which option each split shows is remembered on this device. Opening on a phase shows the way to it.
  React.useEffect(() => {
    const s = readShown()
    let x = byId(doc, focus)
    while (x?.after?.length) { s[splitOf(x)!] = x.id; x = byId(doc, x.after[0]) }
    setShownState(s)
    if (focus) requestAnimationFrame(() => document.querySelector(`[data-card="${focus}"]`)?.scrollIntoView({ block: 'center' }))
  }, [focus]) // eslint-disable-line react-hooks/exhaustive-deps

  // A career's route waiting to be placed.
  React.useEffect(() => {
    if (!params?.has('hold')) return
    try {
      const held = JSON.parse(sessionStorage.getItem(HOLD_KEY) || 'null') as { label: string; steps: RouteStep[] } | null
      sessionStorage.removeItem(HOLD_KEY)
      if (held?.steps?.length) { const loose = loosePiece(doc, held.steps); setMoving({ head: loose.ids[0], only: false, label: held.label, loose }) }
    } catch { /* nothing waiting */ }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  /** Change the map and keep the result. */
  const apply = async (op: (d: LifeDoc) => LifeDoc) => change((next) => { Object.assign(next, op(normalize(next))) })

  /* ---------- moving, and placing a new phase ---------- */
  const base = pending ? pending.doc : moving?.loose ? moving.loose.doc : doc
  const heldIds = React.useMemo(() => (moving ? (moving.loose ? moving.loose.ids : pieceOf(doc, moving.head, moving.only)) : []), [moving, doc])
  const held = React.useMemo(() => new Set(heldIds), [heldIds])
  const shape = React.useMemo(() => (moving ? heldShape(base, heldIds) : null), [moving, base, heldIds])
  const startMove = (head: string, only = false, dragging = false) => { setSheet(null); setPending(null); setMoving({ head, only, dragging }) }
  const startNew = (dragging: boolean) => {
    setSheet(null); setPending(null)
    const loose = loosePiece(doc, [{ title: 'New phase', years: 1 }])
    setMoving({ head: loose.ids[0], only: false, loose, fresh: true, dragging, label: 'Where does the new phase go?' })
  }
  const drop = async (at: string, inline: boolean) => {
    if (!moving) return
    const ids = heldIds
    let lifted = moving.loose ? moving.loose.doc : lift(doc, moving.head, moving.only)
    if (moving.fresh) { lifted = structuredClone(lifted); byId(lifted, ids[0])!.starts = ym(freshStart(lifted, at, inline)) }
    const placed = place(lifted, ids, at, inline)
    setMoving(null)
    setShown(at, ids[0])
    requestAnimationFrame(() => document.querySelector(`[data-card="${ids[0]}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }))
    if (moving.fresh) setPending({ doc: placed, id: ids[0] })
    else await change((next) => { Object.assign(next, placed) })
  }
  const keepPending = async (name: string) => {
    if (!pending) return
    const kept = structuredClone(pending.doc)
    byId(kept, pending.id)!.title = name.trim() || 'New phase'
    setPending(null)
    await change((next) => { Object.assign(next, kept) })
  }
  const dropRef = React.useRef(drop)
  React.useEffect(() => { dropRef.current = drop })
  React.useEffect(() => {
    if (!moving && !pending) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setMoving(null); setPending(null) } }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [moving, pending])

  // While dragging: over the middle of a phase means an option beside it, over a split's options row an
  // option in that split (hold over one to show it, and go deeper), anywhere else the nearest gap.
  const lifting = React.useRef<{ ghost: HTMLElement; spot: Spot | null; drill?: { id: string; timer: ReturnType<typeof setTimeout> } } | null>(null)
  const ghostMove = React.useCallback((x: number, y: number) => {
    const l = lifting.current
    if (!l) return
    l.ghost.style.left = `${x}px`; l.ghost.style.top = `${y}px`
    const el = document.elementFromPoint(x, y) as HTMLElement | null
    const row = el?.closest<HTMLElement>('[data-band-key]'), chip = el?.closest<HTMLElement>('[data-chip]'), card = el?.closest<HTMLElement>('[data-opt]')
    let spot: Spot | null = null
    if (row) spot = { at: row.dataset.bandKey!, inline: false, text: 'A new option here', el: row }
    else if (card) { const r = card.getBoundingClientRect(); if (y > r.top + r.height * 0.2 && y < r.bottom - r.height * 0.2) spot = { at: card.dataset.opt!, inline: false, text: `An option beside ${card.dataset.title}`, el: card } }
    if (chip && chip.dataset.chip !== l.drill?.id) {
      if (l.drill) clearTimeout(l.drill.timer)
      const key = row!.dataset.bandKey!, id = chip.dataset.chip!
      l.drill = { id, timer: setTimeout(() => setShown(key, id), 450) }
    } else if (!chip && l.drill) { clearTimeout(l.drill.timer); l.drill = undefined }
    if (!spot) {
      let best: HTMLElement | null = null, bd = Infinity
      wrap.current?.querySelectorAll<HTMLElement>('[data-slot]').forEach((s) => { const r = s.getBoundingClientRect(), d = y >= r.top && y <= r.bottom ? 0 : Math.abs(y - (r.top + r.bottom) / 2); if (d < bd) { bd = d; best = s } })
      const s = best as HTMLElement | null
      if (s) { const mode = s.dataset.modes!; spot = { at: s.dataset.slot!, inline: mode === 'in', slot: true, el: s, text: mode === 'in' ? `Between ${s.dataset.title} and what’s next` : mode === 'opt' ? `A new option after ${s.dataset.title}` : `After ${s.dataset.title}` } }
    }
    if (spot?.el !== l.spot?.el) {
      wrap.current?.querySelectorAll('[data-ph]').forEach((b) => b.remove())
      wrap.current?.querySelectorAll<HTMLElement>('[data-hot]').forEach((b) => { delete b.dataset.hot })
      if (spot?.slot) {
        const box = document.createElement('div')
        box.dataset.ph = '1'
        box.className = 'pointer-events-none my-2 h-[150px] w-full rounded-[22px] border-[3px] border-dashed border-muted-foreground bg-card'
        spot.el.append(box)
      } else if (spot) spot.el.dataset.hot = '1'
      l.spot = spot
      l.ghost.textContent = spot?.text || 'Drop it on the map'
    }
    if (y < 80) window.scrollBy(0, -12); else if (y > window.innerHeight - 140) window.scrollBy(0, 12)
  }, [setShown])
  const ghostEnd = React.useCallback(() => {
    const l = lifting.current
    lifting.current = null
    if (!l) return
    if (l.drill) clearTimeout(l.drill.timer)
    l.ghost.remove()
    wrap.current?.querySelectorAll('[data-ph]').forEach((b) => b.remove())
    wrap.current?.querySelectorAll<HTMLElement>('[data-hot]').forEach((b) => { delete b.dataset.hot })
    const stop = (e: MouseEvent) => { e.stopPropagation(); e.preventDefault() }
    window.addEventListener('click', stop, { capture: true, once: true })
    setTimeout(() => window.removeEventListener('click', stop, { capture: true }), 50)
    // The touch listeners were set up before the piece lifted, so the drop reads the latest render.
    if (l.spot) void dropRef.current(l.spot.at, l.spot.inline)
    else setMoving((m) => (m ? { ...m, dragging: false } : m))
  }, [])
  const ghostStart = (text: string, x: number, y: number) => {
    const ghost = document.createElement('div')
    ghost.className = 'pointer-events-none fixed z-[80] max-w-[80vw] -translate-x-1/2 -translate-y-[130%] -rotate-2 truncate rounded-2xl bg-foreground px-4 py-3 text-base font-extrabold text-background shadow-2xl'
    ghost.textContent = text
    document.body.append(ghost)
    lifting.current = { ghost, spot: null }
    ghostMove(x, y)
    navigator.vibrate?.(12)
  }
  const liftCard = (p: Phase, x: number, y: number) => { startMove(p.id, false, true); ghostStart(p.title, x, y) }

  // The new phase in the + button's tray: drag it out (it never scrolls the page), or tap it to pick a spot.
  const press = React.useRef<{ x: number; y: number; live: boolean } | null>(null)
  const newCard = <div role="button" tabIndex={0} aria-label="New phase: drag it into your map, or tap to pick a spot"
    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setFab(false); startNew(false) } }}
    onPointerDown={(e) => { e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); press.current = { x: e.clientX, y: e.clientY, live: false } }}
    onPointerMove={(e) => {
      const p = press.current
      if (!p) return
      if (!p.live) { if (Math.hypot(e.clientX - p.x, e.clientY - p.y) < 6) return; p.live = true; startNew(true); ghostStart('New phase', e.clientX, e.clientY) }
      ghostMove(e.clientX, e.clientY)
    }}
    onPointerUp={() => { const p = press.current; press.current = null; setFab(false); if (p?.live) ghostEnd(); else if (p) startNew(false) }}
    onPointerCancel={() => { press.current = null; ghostEnd() }}
    className={cn('grid h-[104px] w-[172px] cursor-grab touch-none select-none content-between rounded-[20px] border-[3px] border-dashed border-foreground/50 bg-card p-3 text-left shadow-2xl transition-opacity', moving?.dragging && 'opacity-30')}>
    <b className="text-lg font-extrabold">New phase</b>
    <small className="text-xs font-bold text-muted-foreground">Drag it into your map, or tap to pick a spot</small>
  </div>

  if (comparing) return <PlanCompare doc={doc} orgslug={orgslug} token={token} only={comparing} onBack={() => setComparing(null)} />

  const picked = (key: string, options: Phase[]) => options.find((q) => q.id === shown[key]) || options[0]
  const later = (p: Phase) => whenOf(doc, p) !== 'done' && whenOf(doc, p) !== 'now'
  const env: Env = { base, photos, wide, moving, held, later }
  const pad = wide ? undefined : { paddingLeft: gut.l, paddingRight: gut.r }

  /* ---------- the stack ---------- */
  const lineAt = (key: string, a?: Phase, b?: Phase, splitNext = false) => {
    if (moving && a && !held.has(a.id) && !(b && held.has(b.id)) && whenOf(base, a) !== 'done') {
      const mode = !b && !splitNext ? 'after' : shape?.linear && b ? 'in' : 'opt'
      return <div key={key} data-slot={a.id} data-modes={mode} data-title={a.title} className="relative flex flex-wrap justify-center gap-1.5 py-2 before:absolute before:inset-y-0 before:left-1/2 before:-z-10 before:border-l-[3px] before:border-dotted before:border-border">
        {moving.dragging ? <span className="h-3" /> : mode === 'after' ? <Target onClick={() => void drop(a.id, false)}>Here, after {a.title}</Target> : <>
          {mode === 'in' ? <Target onClick={() => void drop(a.id, true)}>Here, in line</Target> : null}
          <Target alt onClick={() => void drop(a.id, false)}><GitBranch size={13} aria-hidden="true" />New option after {a.title}</Target>
        </>}
      </div>
    }
    return <div key={key} className={cn('relative h-[30px] before:absolute before:inset-y-0 before:left-1/2 before:border-l-[3px] before:border-border', b?.idea && 'before:border-dashed')} />
  }
  const card = (p: Phase) => {
    if (pending?.id === p.id) return <PendingCard key={`c-${p.id}`} p={p} onKeep={(t) => void keepPending(t)} onCancel={() => setPending(null)} />
    const key = splitOf(p), wh = whenOf(base, p)
    const opt = moving && key && wh !== 'done' && wh !== 'now' && !held.has(p.id) && !(p.after || []).some((a) => held.has(a)) ? key : undefined
    return <PhaseCard key={`c-${p.id}`} p={p} env={env} opt={opt} onOpen={() => setSheet({ id: p.id })} onLift={(x, y) => liftCard(p, x, y)} onLiftMove={ghostMove} onLiftEnd={ghostEnd} />
  }

  // A way down from p. `stop` holds the phases where an outer split's options meet again.
  const chain = (p: Phase, stop: Set<string>, depth: number): React.ReactNode[] => {
    if (stop.has(p.id)) return []
    const out: React.ReactNode[] = [card(p)]
    const all = kids(base, p.id), k = all.filter((x) => !stop.has(x.id))
    if (!all.length) return moving ? [...out, lineAt(`l-${p.id}`, p)] : out
    if (!k.length) return moving ? [...out, lineAt(`l-${p.id}`, p, all[0])] : out
    if (k.length === 1) return [...out, lineAt(`l-${p.id}`, p, k[0]), ...chain(k[0], stop, depth)]
    return [...out, lineAt(`l-${p.id}`, p, undefined, true), ...band(p.id, p.title, k, stop, depth)]
  }
  const band = (key: string, after: string, options: Phase[], stop: Set<string>, depth: number): React.ReactNode[] => {
    const sel = picked(key, options), i = options.indexOf(sel)
    const meet = rejoinOf(base, options)
    const group = meet ? (meet.after!.length > 1 ? optionsOf(base, splitOf(meet)!) : [meet]) : []
    const inner = new Set([...stop, ...group.map((x) => x.id)])
    const label = `Options after ${after}`
    const out: React.ReactNode[] = [<section key={`b-${key}`} aria-label={label} className="grid min-w-0 grid-cols-[minmax(0,1fr)]" style={wide ? undefined : { marginLeft: -gut.l, marginRight: -gut.r }}>
      <div data-band-key={key} className={cn('flex items-center gap-2 rounded-full py-1.5 transition-colors data-[hot]:bg-foreground/10', wide && 'mx-auto w-full max-w-[620px]')} style={pad}>
        <span className="shrink-0 text-[13px] font-extrabold text-muted-foreground">Options</span>
        <div role="tablist" aria-label={label} className="-my-0.5 flex min-w-0 flex-1 gap-1.5 overflow-x-auto py-0.5 [scrollbar-width:none]">
          {options.map((q) => <button key={q.id} type="button" role="tab" data-chip={q.id} aria-selected={q === sel} onClick={() => setShown(key, q.id)}
            className={cn('shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-[13px] font-extrabold shadow-[0_0_0_1.5px_hsl(var(--border))]', q === sel ? 'bg-foreground text-background shadow-none' : 'bg-card', q.idea && q !== sel && 'shadow-[0_0_0_1.5px_hsl(var(--border))] [border-style:dashed]')}>{q.title}</button>)}
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild><button type="button" aria-label={`More for ${label.toLowerCase()}`} className="-mr-1.5 grid size-9 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"><MoreVertical size={18} aria-hidden="true" /></button></DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => setComparing(options.map((q) => q.id))}><Scale size={15} aria-hidden="true" />Compare</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setRanking({ key, options })}><ArrowUpDown size={15} aria-hidden="true" />Rank</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className={cn('border-y-[1.5px] border-border py-3', depth % 2 ? 'bg-card' : 'bg-muted/40')}>
        <div className={cn(wide && 'mx-auto w-full max-w-[620px]')}>
          <Tray env={env} wide={wide} index={i} onIndex={(j) => setShown(key, options[j].id)}
            panes={options.map((q) => ({ id: q.id, phase: q, node: <div style={pad}>{chain(q, inner, depth + 1)}</div> }))} />
        </div>
      </div>
    </section>]
    if (meet && !group.every((x) => stop.has(x.id))) {
      out.push(lineAt(`j-${key}`))
      out.push(...(group.length > 1 ? band(splitOf(meet)!, group.map((g) => byId(base, g.after![0])?.title).join(' or '), group, stop, depth) : chain(meet, stop, depth)))
    }
    return out
  }

  const first = base.phases.filter((p) => !p.after?.length && !held.has(p.id)).sort((a, b) => mi(a.starts!) - mi(b.starts!))[0]
  const sheetPhase = sheet ? byId(doc, sheet.id) : undefined

  return <div className="flex flex-col gap-4">
    <div className={cn(wide && 'mx-auto w-full max-w-[620px]')}>{title}</div>
    <div ref={wrap} className={cn('flex flex-col pb-28', wide && '[&>:not(section)]:mx-auto [&>:not(section)]:w-full [&>:not(section)]:max-w-[620px]', moving && 'pb-40')}>
      {first ? chain(first, new Set(), 0) : null}
    </div>

    {/* Overlays live on the page body: the map sits in a moving view that would trap them under the menu bar. */}
    {mounted ? createPortal(<>
    <div className={cn('fixed bottom-[calc(env(safe-area-inset-bottom)+84px)] right-4 z-40 flex flex-col items-end gap-3 md:bottom-8 md:right-8', ((moving && !moving.fresh) || (moving && !moving.dragging) || pending) && 'invisible')}>
      {fab ? newCard : null}
      <button type="button" onClick={() => setFab(!fab)} aria-expanded={fab} aria-label={fab ? 'Close' : 'Add a phase'}
        className="grid size-14 place-items-center rounded-full bg-foreground text-background shadow-[0_10px_30px_-8px_rgb(0_0_0/0.6)] transition-transform active:scale-95">
        {fab ? <X size={24} aria-hidden="true" /> : <Plus size={26} aria-hidden="true" />}
      </button>
    </div>

    {moving ? <MoveBar doc={base} ids={heldIds} moving={moving} hidden={!!moving.dragging}
      onScope={(only) => setMoving({ ...moving, only })} onCancel={() => setMoving(null)} /> : null}
    {ranking ? <RankSheet options={ranking.options} onClose={() => setRanking(null)}
      onSave={(order) => { const key = ranking.key; setRanking(null); setShown(key, order[0]); void apply((d) => rank(d, order)) }} /> : null}
    {sheetPhase ? <PhaseSheet doc={doc} p={sheetPhase} photos={photos} state={sheet!} setState={setSheet}
      onOpen={() => router.push(getUriWithOrg(orgslug, routePaths.org.phase(sheetPhase.id)))}
      onRename={async (t) => { setSheet({ id: sheetPhase.id }); if (t.trim()) await apply((d) => { byId(d, sheetPhase.id)!.title = t.trim(); return d }) }}
      onKeep={() => void apply((d) => { byId(d, sheetPhase.id)!.idea = false; return d })}
      onRemove={async () => { setSheet(null); await apply((d) => remove(d, sheetPhase.id)) }}
      onMove={() => startMove(sheetPhase.id)}
      onSplit={async (fromId) => { let id = ''; await apply((d) => { const r = split(d, sheetPhase.id, fromId); id = r.id; return r.doc }); if (id) setSheet({ id }) }}
      onJoin={async (toId) => { setSheet(null); await apply((d) => join(d, sheetPhase.id, toId)) }} /> : null}
    </>, document.body) : null}
  </div>
}
