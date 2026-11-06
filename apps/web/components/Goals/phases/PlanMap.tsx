'use client'
/* eslint-disable no-unused-vars -- parameter names in function types */

import React from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Check, ChevronRight, Compass, GitBranch, Lock, MoreHorizontal, Plus, Scale, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@components/ui/button'
import { getUriWithOrg, routePaths } from '@services/config/config'
import type { LifeDoc, Phase, PlacePhoto } from '@services/life/life'
import PhaseCover from './PhaseCover'
import PlanCompare from './PlanCompare'
import MoveBar, { type Moving } from './MoveBar'
import {
  addAfter, addBefore, addBetween, addOption, addRejoin, byId, canJoin, current, heldShape, join, kids, lift, loosePiece, mi, monthText, normalize,
  optionsOf, pieceOf, place, rejoinOf, remove, routes, split, splitOf, thisMonthIndex, whenOf, type RouteStep,
} from './graph'

type Change = (fn: (next: LifeDoc) => void) => Promise<LifeDoc | null>

const SHOWN_KEY = 'plans-map-shown'
const HOLD_KEY = 'plans-map-hold'
/** Careers hand the map a route to place: it waits here while the map opens with it picked up. */
export function holdRoute(label: string, steps: RouteStep[]) { try { sessionStorage.setItem(HOLD_KEY, JSON.stringify({ label, steps })) } catch { /* private mode: the map opens without it */ } }
const readShown = (): Record<string, string> => { try { return JSON.parse(localStorage.getItem(SHOWN_KEY) || '{}') } catch { return {} } }

/** Desktop shows a split's other options beside the picked one; a phone shows one at a time. */
const WIDE = 860, GAP = 28

/**
 * The plan as a stack of phases, top to bottom, all one size: order matters here, not length (Compare
 * shows time to scale). Where the plan splits, a band lists the options and shows the one you picked;
 * swiping inside the band swaps everything in it. Every later phase has an empty space beside it with a
 * + for another option. Press and hold a phase to move it and what follows it.
 */
export default function PlanMap({ doc: raw, orgslug, token, photos, change, focus, title, actions }: { doc: LifeDoc; orgslug: string; token?: string; photos?: Record<string, PlacePhoto>; change: Change; focus?: string | null; title?: React.ReactNode; actions?: React.ReactNode }) {
  const router = useRouter()
  const params = useSearchParams()
  const doc = React.useMemo(() => normalize(raw), [raw])
  const wrap = React.useRef<HTMLDivElement>(null)
  const [width, setWidth] = React.useState(400)
  const [shown, setShownState] = React.useState<Record<string, string>>({})
  const [sheet, setSheet] = React.useState<{ id: string; renaming?: string; confirmRm?: boolean } | null>(null)
  const [adding, setAdding] = React.useState<{ after: string; name: string } | null>(null)
  const [moving, setMoving] = React.useState<Moving | null>(null)
  const [comparing, setComparing] = React.useState(false)
  const now = current(doc)
  const wide = width >= WIDE

  React.useLayoutEffect(() => {
    const el = wrap.current
    if (!el) return
    const ro = new ResizeObserver(() => setWidth(el.clientWidth))
    ro.observe(el); setWidth(el.clientWidth)
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
  const addThen = async (make: (d: LifeDoc) => { doc: LifeDoc; id: string }, key?: string) => {
    let id = ''
    await apply((d) => { const r = make(d); id = r.id; return r.doc })
    if (id) { if (key) setShown(key, id); setSheet({ id, renaming: '' }) }
  }

  /* ---------- moving ---------- */
  const base = moving?.loose ? moving.loose.doc : doc
  const heldIds = React.useMemo(() => (moving ? (moving.loose ? moving.loose.ids : pieceOf(doc, moving.head, moving.only)) : []), [moving, doc])
  const held = React.useMemo(() => new Set(heldIds), [heldIds])
  const shape = React.useMemo(() => (moving ? heldShape(base, heldIds) : null), [moving, base, heldIds])
  const startMove = (head: string, only = false, dragging = false) => { setSheet(null); setAdding(null); setMoving({ head, only, dragging }) }
  const drop = async (at: string, inline: boolean) => {
    if (!moving) return
    const lifted = moving.loose ? moving.loose.doc : lift(doc, moving.head, moving.only)
    const ids = heldIds, placed = place(lifted, ids, at, inline)
    setMoving(null)
    await change((next) => { Object.assign(next, placed) })
    setShown(at, ids[0])
    requestAnimationFrame(() => document.querySelector(`[data-card="${ids[0]}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }))
  }
  const dropRef = React.useRef(drop)
  React.useEffect(() => { dropRef.current = drop })
  React.useEffect(() => {
    if (!moving) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMoving(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [moving])

  // Press and hold (touch) or drag (mouse) a later phase: it lifts, and the spot nearest the finger opens into a placeholder.
  const lifting = React.useRef<{ ghost: HTMLElement; slot: HTMLElement | null; mode: string } | null>(null)
  const ghostMove = React.useCallback((x: number, y: number) => {
    const l = lifting.current
    if (!l) return
    l.ghost.style.left = `${x}px`; l.ghost.style.top = `${y}px`
    let best: HTMLElement | null = null, bd = Infinity
    wrap.current?.querySelectorAll<HTMLElement>('[data-slot]').forEach((s) => { const r = s.getBoundingClientRect(), d = y >= r.top && y <= r.bottom ? 0 : Math.abs(y - (r.top + r.bottom) / 2); if (d < bd) { bd = d; best = s } })
    if (best) {
      const s = best as HTMLElement, modes = (s.dataset.modes || '').split(','), r = s.getBoundingClientRect()
      const mode = modes.length > 1 ? (x > r.left + r.width * 0.6 ? 'opt' : 'in') : modes[0]
      if (s !== l.slot || mode !== l.mode) {
        wrap.current?.querySelectorAll('[data-ph]').forEach((b) => b.remove())
        const box = document.createElement('div')
        box.dataset.ph = '1'
        box.className = cn('pointer-events-none my-2 grid h-[150px] place-content-center rounded-[22px] border-[3px] border-dashed border-muted-foreground bg-card text-center text-sm font-extrabold text-foreground', mode === 'opt' && 'ml-[18%]')
        box.textContent = mode === 'opt' ? `New option after ${s.dataset.title}` : mode === 'in' ? 'Here, in line' : `Here, after ${s.dataset.title}`
        s.append(box); l.slot = s; l.mode = mode
      }
    }
    if (y < 80) window.scrollBy(0, -12); else if (y > window.innerHeight - 140) window.scrollBy(0, 12)
  }, [])
  const ghostEnd = React.useCallback(() => {
    const l = lifting.current
    lifting.current = null
    if (!l) return
    l.ghost.remove()
    wrap.current?.querySelectorAll('[data-ph]').forEach((b) => b.remove())
    const stop = (e: MouseEvent) => { e.stopPropagation(); e.preventDefault() }
    window.addEventListener('click', stop, { capture: true, once: true })
    setTimeout(() => window.removeEventListener('click', stop, { capture: true }), 50)
    // The touch listeners were set up before the piece lifted, so the drop reads the latest render.
    if (l.slot) void dropRef.current(l.slot.dataset.slot!, l.mode === 'in')
    else setMoving((m) => (m ? { ...m, dragging: false } : m))
  }, [])
  const liftCard = (p: Phase, x: number, y: number) => {
    startMove(p.id, false, true)
    const ghost = document.createElement('div')
    ghost.className = 'pointer-events-none fixed z-[80] -translate-x-1/2 -translate-y-1/2 -rotate-2 rounded-2xl bg-foreground px-4 py-3 text-base font-extrabold text-background shadow-2xl'
    const more = pieceOf(doc, p.id).length - 1
    ghost.textContent = more ? `${p.title} +${more}` : p.title
    document.body.append(ghost)
    lifting.current = { ghost, slot: null, mode: '' }
    ghostMove(x, y)
    navigator.vibrate?.(12)
  }

  if (comparing) return <PlanCompare doc={doc} orgslug={orgslug} token={token} onBack={() => setComparing(false)} />

  const picked = (key: string, options: Phase[]) => options.find((q) => q.id === shown[key]) || options[0]
  const later = (p: Phase) => whenOf(doc, p) !== 'done' && whenOf(doc, p) !== 'now'
  const env: Env = { doc, base, photos, wide, width, now, moving, held, shape, later }

  /* ---------- the stack ---------- */
  const lineAt = (key: string, a?: Phase, b?: Phase, splitNext = false) => {
    if (moving && a && !held.has(a.id) && !(b && held.has(b.id)) && whenOf(base, a) !== 'done') {
      const modes = !b && !splitNext ? 'after' : shape?.linear ? 'in,opt' : 'opt'
      return <div key={key} data-slot={a.id} data-modes={modes} data-title={a.title} className="relative flex flex-wrap justify-center gap-1.5 py-2 before:absolute before:inset-y-0 before:left-1/2 before:-z-10 before:border-l-[3px] before:border-dotted before:border-border">
        {moving.dragging ? <span className="h-3" /> : <>
          {modes === 'after' ? <Target onClick={() => void drop(a.id, false)}>Here, after {a.title}</Target> : <>
            {shape?.linear ? <Target onClick={() => void drop(a.id, true)}>Here, in line</Target> : null}
            <Target alt onClick={() => void drop(a.id, false)}><GitBranch size={13} aria-hidden="true" />New option after {a.title}</Target>
          </>}
        </>}
      </div>
    }
    const insert = a && b && !moving && mi(b.starts!) > thisMonthIndex()
    return <div key={key} className={cn('relative grid h-[30px] place-items-center before:absolute before:inset-y-0 before:left-1/2 before:border-l-[3px] before:border-border', b?.idea && 'before:border-dashed')}>
      {insert ? <button type="button" onClick={() => void addThen((d) => addBetween(d, a!.id, b!.id, { title: 'New phase' }))} aria-label={`Put a phase between ${a!.title} and ${b!.title}`} title="Put a phase in between"
        className="relative grid size-6 place-items-center rounded-full bg-background text-muted-foreground shadow-[0_0_0_2px_hsl(var(--border))] hover:text-foreground"><Plus size={13} aria-hidden="true" /></button> : null}
    </div>
  }
  const card = (p: Phase, head: boolean) => {
    const key = splitOf(p), wh = whenOf(base, p)
    const c = <PhaseCard key={`c-${p.id}`} p={p} env={env} onOpen={() => setSheet({ id: p.id })} onLift={(x, y) => liftCard(p, x, y)} onLiftMove={ghostMove} onLiftEnd={ghostEnd} />
    if (head) return c
    const can = key && wh !== 'done' && wh !== 'now'
    const side = can
      ? <button type="button" onClick={() => void addThen((d) => addOption(d, key!, { title: 'New option' }), key!)} aria-label={`Add another option beside ${p.title}`} title="Add another option"
        className="grid size-14 place-items-center rounded-full bg-foreground text-background shadow-lg"><Plus size={24} aria-hidden="true" /></button>
      : <span className="grid max-w-[260px] justify-items-center gap-1 px-4 text-center text-muted-foreground"><Lock size={20} aria-hidden="true" /><b className="text-[15px] text-foreground">Can’t add an option here</b>
        <small className="text-[13px] leading-snug">{wh === 'now' ? `You’re in ${p.title} now. Add options for what comes after it.` : `${p.title} already happened.`}</small></span>
    return <Tray key={`s-${p.id}`} env={env} solo panes={[{ id: p.id, node: c }]} index={0} side={side} />
  }
  const end = (p: Phase) => adding?.after === p.id
    ? <form key={`e-${p.id}`} onSubmit={async (e) => { e.preventDefault(); const t = adding.name.trim() || 'Next phase'; setAdding(null); await apply((d) => addAfter(d, p.id, { title: t }).doc) }}
      className="grid gap-2 rounded-[22px] border-[3px] border-dashed border-border p-4">
      <b className="text-lg font-extrabold">After {p.title}</b>
      <input autoFocus aria-label="Name of the next phase" value={adding.name} onChange={(e) => setAdding({ ...adding, name: e.target.value })} placeholder="Gap year, trade school, move to Portland…"
        className="h-12 rounded-2xl bg-muted px-3 text-base font-bold outline-none focus:ring-2 focus:ring-[var(--org-primary-color)]" />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link href={getUriWithOrg(orgslug, `/discover/careers?after=${encodeURIComponent(p.id)}`)} className="inline-flex items-center gap-1.5 text-sm font-bold text-[var(--org-primary-color)]"><Compass size={15} aria-hidden="true" />Start from a career</Link>
        <span className="flex gap-1.5"><Button type="button" size="sm" variant="ghost" onClick={() => setAdding(null)}>Cancel</Button><Button type="submit" size="sm" variant="brand">Add</Button></span>
      </div>
    </form>
    : <button key={`e-${p.id}`} type="button" disabled={!!moving} onClick={() => setAdding({ after: p.id, name: '' })}
      className="flex w-full items-center gap-3 rounded-[22px] border-[3px] border-dashed border-border px-4 py-3.5 text-left font-bold text-muted-foreground hover:border-muted-foreground disabled:opacity-50">
      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-card text-foreground shadow-[0_0_0_2px_hsl(var(--border))]"><Plus size={18} aria-hidden="true" /></span>
      <span><b className="block text-lg font-extrabold text-foreground">What’s next?</b>Add a phase after {p.title}</span>
    </button>

  // A way down from p. `stop` holds the phases where an outer split's options meet again.
  const chain = (p: Phase, stop: Set<string>, head: boolean, depth: number): React.ReactNode[] => {
    if (stop.has(p.id)) return []
    const out: React.ReactNode[] = [card(p, head)]
    const all = kids(base, p.id), k = all.filter((x) => !stop.has(x.id))
    if (!all.length) return [...out, lineAt(`l-${p.id}`, p), end(p)]
    if (!k.length) return moving ? [...out, lineAt(`l-${p.id}`, p, all[0])] : out
    if (k.length === 1) return [...out, lineAt(`l-${p.id}`, p, k[0]), ...chain(k[0], stop, false, depth)]
    return [...out, lineAt(`l-${p.id}`, p, undefined, true), ...band(p.id, `${k.length} options after ${p.title}`, k, stop, depth)]
  }
  const band = (key: string, label: string, options: Phase[], stop: Set<string>, depth: number): React.ReactNode[] => {
    const sel = picked(key, options), i = options.indexOf(sel)
    const meet = rejoinOf(base, options)
    const group = meet ? (meet.after!.length > 1 ? optionsOf(base, splitOf(meet)!) : [meet]) : []
    const inner = new Set([...stop, ...group.map((x) => x.id)])
    const top = depth === 0
    const out: React.ReactNode[] = [<section key={`b-${key}`} aria-label={label}
      className={cn('grid gap-2.5 border-y-[1.5px] border-border py-3', top ? '-mx-4 bg-muted/40 sm:-mx-6' : '-mx-4 bg-card shadow-[0_12px_28px_-20px_rgb(0_0_0/0.45)]', top && wide && 'mx-0 rounded-[28px] border-x-[1.5px] py-5 sm:mx-0')}>
      <div className={cn('grid gap-2 px-4', top && wide && 'mx-auto w-full max-w-[620px] px-0')}>
        <div className="flex items-center gap-2 text-[13px] font-extrabold"><GitBranch size={15} className="text-muted-foreground" aria-hidden="true" />{label}<span className="ml-auto text-xs font-bold text-muted-foreground">{i + 1} of {options.length}</span></div>
        <div role="tablist" aria-label={label} className="-m-0.5 flex gap-1.5 overflow-x-auto p-0.5 [scrollbar-width:none]">
          {options.map((q) => <button key={q.id} type="button" role="tab" aria-selected={q === sel} disabled={!!moving} onClick={() => setShown(key, q.id)}
            className={cn('shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-[13px] font-extrabold shadow-[0_0_0_1.5px_hsl(var(--border))]', q === sel ? 'bg-foreground text-background shadow-none' : 'bg-card')}>{q.title}</button>)}
          {moving ? null : <button type="button" onClick={() => void addThen((d) => addOption(d, key, { title: 'New option' }), key)} aria-label="Add another option" title="Add another option"
            className="grid shrink-0 place-items-center rounded-full bg-card px-3 text-muted-foreground shadow-[0_0_0_1.5px_hsl(var(--border))]"><Plus size={14} aria-hidden="true" /></button>}
        </div>
      </div>
      <Tray env={env} wide={top && wide} panes={options.map((q) => ({ id: q.id, node: <div className="px-4">{chain(q, inner, true, depth + 1)}</div> }))} index={i} onIndex={(j) => setShown(key, options[j].id)}
        side={moving ? undefined : <button type="button" onClick={() => void addThen((d) => addOption(d, key, { title: 'New option' }), key)} aria-label="Add another option" title="Add another option" className="grid size-14 place-items-center rounded-full bg-foreground text-background shadow-lg"><Plus size={24} aria-hidden="true" /></button>} />
    </section>]
    if (meet && !group.every((x) => stop.has(x.id))) {
      out.push(lineAt(`j-${key}`))
      out.push(...(group.length > 1 ? band(splitOf(meet)!, `${group.length} options next`, group, stop, depth) : chain(meet, stop, false, depth)))
    } else if (!meet && !moving) {
      out.push(<div key={`r-${key}`} className="relative grid h-[38px] place-items-center before:absolute before:inset-y-0 before:left-1/2 before:border-l-[3px] before:border-dashed before:border-border">
        <button type="button" onClick={() => void addThen((d) => addRejoin(d, key, { title: 'New phase' }))} aria-label="Add a phase all these options lead to" title="Add a phase all these options lead to"
          className="relative grid size-7 place-items-center rounded-full bg-background text-muted-foreground shadow-[0_0_0_2px_hsl(var(--border))] hover:text-foreground"><Plus size={14} aria-hidden="true" /></button>
      </div>)
    }
    return out
  }

  const first = base.phases.filter((p) => !p.after?.length && !held.has(p.id)).sort((a, b) => mi(a.starts!) - mi(b.starts!))[0]
  const sheetPhase = sheet ? byId(doc, sheet.id) : undefined
  const all = routes(doc)

  return <div className="flex flex-col gap-4">
    <div className={cn('flex flex-wrap items-center justify-between gap-3', wide && 'mx-auto w-full max-w-[620px]')}>
      {title || <span />}
      <span className="flex flex-wrap items-center gap-2">
        {all.length > 1 ? <Button size="sm" variant="surface" onClick={() => { setComparing(true); setSheet(null) }}><Scale size={16} aria-hidden="true" />Compare</Button> : null}
        {actions}
      </span>
    </div>
    <div ref={wrap} className={cn('flex flex-col', wide && '[&>:not(section)]:mx-auto [&>:not(section)]:w-full [&>:not(section)]:max-w-[620px]', moving && 'pb-40')}>
      {first && !moving ? <button type="button" onClick={() => void addThen((d) => addBefore(d, first.id, { title: 'Earlier phase', idea: false }))}
        className="mx-auto flex items-center gap-1.5 text-sm font-bold text-muted-foreground hover:text-foreground"><Plus size={14} aria-hidden="true" />Add something before {first.title}</button> : null}
      {first ? <>{lineAt('l-top')}{chain(first, new Set(), false, 0)}</> : null}
    </div>

    {moving ? <MoveBar doc={base} ids={heldIds} moving={moving} hidden={!!moving.dragging}
      onScope={(only) => setMoving({ ...moving, only })} onCancel={() => setMoving(null)} /> : null}
    {sheetPhase ? <PhaseSheet doc={doc} p={sheetPhase} photos={photos} state={sheet!} setState={setSheet}
      onOpen={() => router.push(getUriWithOrg(orgslug, routePaths.org.phase(sheetPhase.id)))}
      onRename={async (t) => { setSheet({ id: sheetPhase.id }); if (t.trim()) await apply((d) => { byId(d, sheetPhase.id)!.title = t.trim(); return d }) }}
      onKeep={() => void apply((d) => { byId(d, sheetPhase.id)!.idea = false; return d })}
      onRemove={async () => { setSheet(null); await apply((d) => remove(d, sheetPhase.id)) }}
      onOption={() => { const key = splitOf(sheetPhase); if (key) void addThen((d) => addOption(d, key, { title: 'New option' }), key) }}
      onMove={() => startMove(sheetPhase.id)}
      onSplit={async (fromId) => { let id = ''; await apply((d) => { const r = split(d, sheetPhase.id, fromId); id = r.id; return r.doc }); if (id) setSheet({ id }) }}
      onJoin={async (toId) => { setSheet(null); await apply((d) => join(d, sheetPhase.id, toId)) }} /> : null}
  </div>
}

interface Env { doc: LifeDoc; base: LifeDoc; photos?: Record<string, PlacePhoto>; wide: boolean; width: number; now?: Phase; moving: Moving | null; held: Set<string>; shape: ReturnType<typeof heldShape> | null; later: (p: Phase) => boolean }

function Target({ alt, onClick, children }: { alt?: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" onClick={onClick}
    className={cn('relative inline-flex items-center gap-1.5 rounded-full border-2 border-dashed bg-card px-3.5 py-1.5 text-[12.5px] font-extrabold hover:border-solid hover:bg-foreground hover:text-background', alt ? 'border-border' : 'border-muted-foreground')}>{children}</button>
}

/** A phase's card. Press and hold (touch) or drag it (mouse) to move it; a tap opens its details. */
function PhaseCard({ p, env, onOpen, onLift, onLiftMove, onLiftEnd }: { p: Phase; env: Env; onOpen: () => void; onLift: (x: number, y: number) => void; onLiftMove: (x: number, y: number) => void; onLiftEnd: () => void }) {
  const wh = whenOf(env.base, p)
  const movable = env.later(p) && !env.moving
  const [holding, setHolding] = React.useState(false)
  const mouse = React.useRef<{ x: number; y: number; live: boolean } | null>(null)

  // Touch: listeners go on the touched element itself and stay there until the finger lifts, so the
  // drag keeps working while the map redraws, and the page stops scrolling once the card is lifted.
  const onTouchStart = (e: React.TouchEvent) => {
    if (!movable || e.touches.length > 1) return
    const target = e.target as HTMLElement, t0 = e.touches[0]
    let live = false, moved = false
    setHolding(true)
    const timer = setTimeout(() => { if (!moved) { live = true; setHolding(false); onLift(t0.clientX, t0.clientY) } }, 380)
    const mv = (ev: TouchEvent) => {
      const t = ev.touches[0]
      if (live) { ev.preventDefault(); onLiftMove(t.clientX, t.clientY); return }
      if (Math.hypot(t.clientX - t0.clientX, t.clientY - t0.clientY) > 8) { moved = true; clearTimeout(timer); setHolding(false) }
    }
    const done = () => {
      clearTimeout(timer); setHolding(false)
      target.removeEventListener('touchmove', mv); target.removeEventListener('touchend', done); target.removeEventListener('touchcancel', done)
      if (live) onLiftEnd()
    }
    target.addEventListener('touchmove', mv, { passive: false }); target.addEventListener('touchend', done); target.addEventListener('touchcancel', done)
  }
  React.useEffect(() => {
    const move = (e: PointerEvent) => {
      const m = mouse.current
      if (!m) return
      if (m.live) return onLiftMove(e.clientX, e.clientY)
      const dx = e.clientX - m.x, dy = e.clientY - m.y
      if (Math.hypot(dx, dy) > 8) { if (Math.abs(dy) > Math.abs(dx)) { m.live = true; onLift(e.clientX, e.clientY) } else mouse.current = null }
    }
    const up = () => { const m = mouse.current; mouse.current = null; if (m?.live) onLiftEnd() }
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up)
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up) }
  }, [onLift, onLiftMove, onLiftEnd])

  const isHeld = env.held.has(p.id)
  return <button type="button" data-card={p.id} onClick={onOpen} title={`${p.title} · from ${monthText(p.starts!)}`}
    onPointerDown={(e) => { if (movable && e.pointerType === 'mouse' && e.button === 0) mouse.current = { x: e.clientX, y: e.clientY, live: false } }}
    onTouchStart={onTouchStart} onContextMenu={(e) => { if (movable) e.preventDefault() }}
    className={cn('relative isolate flex h-[180px] w-full select-none flex-col justify-end overflow-hidden rounded-[22px] text-left text-white shadow-[0_18px_34px_-24px_rgb(0_0_0/0.7)] [-webkit-touch-callout:none] transition-[transform,opacity] duration-300',
      holding && 'scale-[.97]', isHeld && 'opacity-35')}>
    <PhaseCover phase={p} photos={env.photos} past={wh === 'done'} className={cn('absolute inset-0 -z-20 h-full w-full', p.idea && 'saturate-[.45]')} />
    <span className="absolute inset-0 -z-10 bg-[linear-gradient(180deg,transparent_30%,rgb(8_20_30/0.8))]" aria-hidden="true" />
    {p.idea ? <span className="pointer-events-none absolute inset-0 z-10 rounded-[22px] border-[3px] border-dashed border-white/85" aria-hidden="true" /> : null}
    {wh === 'now' ? <span className="absolute left-3.5 top-3 rounded-full bg-[var(--org-primary-color)] px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-[0.06em] text-[var(--org-on-primary-color,#fff)]">You’re here</span>
      : p.idea ? <span className="absolute left-3.5 top-3 rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-[0.06em] text-slate-900">Idea</span> : null}
    <span className="absolute right-3 top-3 grid size-8 place-items-center rounded-full bg-black/35 backdrop-blur" aria-hidden="true"><MoreHorizontal size={16} /></span>
    <span className="grid min-w-0 gap-0.5 px-4 pb-3.5">
      <b className="truncate text-[clamp(22px,3vw,27px)] font-extrabold leading-tight tracking-tight">{p.title}</b>
      <small className="truncate text-[12.5px] font-bold opacity-90">{monthText(p.starts!)}{p.place_label ? ` · ${p.place_label.split(',')[0]}` : ''}</small>
    </span>
  </button>
}

/**
 * Options side by side that you swipe between. Past the last one waits an empty space (`side`) with a
 * + in it, or the reason nothing can go there; it is only shown, never added on its own. A single
 * phase (`solo`) is a tray of one, so any phase can be pulled aside. On desktop (`wide`) the other
 * options show faded beside the picked one.
 */
function Tray({ env, panes, index, onIndex, side, solo, wide }: { env: Env; panes: { id: string; node: React.ReactNode }[]; index: number; onIndex?: (j: number) => void; side?: React.ReactNode; solo?: boolean; wide?: boolean }) {
  const [atSide, setAtSide] = React.useState(false)
  const [dragging, setDragging] = React.useState(false)
  const tray = React.useRef<HTMLDivElement>(null), track = React.useRef<HTMLDivElement>(null), label = React.useRef<HTMLSpanElement>(null)
  const d = React.useRef<{ x: number; y: number; on: boolean; dx: number; w: number; id: number } | null>(null)
  const n = panes.length, hasSide = !!side
  const i = atSide && hasSide ? n : Math.min(index, n - 1)
  const pw = wide ? Math.min(620, env.width - 160) : 0
  const tf = (at: number, dx = 0) => (wide ? `translateX(calc(50% - ${pw / 2}px - ${at * (pw + GAP)}px + ${dx}px))` : `translateX(calc(${-at * 100}% + ${dx}px))`)
  React.useEffect(() => { setAtSide(false) }, [index, env.moving])
  React.useLayoutEffect(() => { if (track.current) track.current.style.transform = tf(i) })

  const down = (e: React.PointerEvent) => {
    const ne = e.nativeEvent as PointerEvent & { trayTaken?: boolean }
    if (ne.trayTaken || env.moving || e.button > 0) return
    ne.trayTaken = true
    const pane = track.current?.firstElementChild as HTMLElement | null
    d.current = { x: e.clientX, y: e.clientY, on: false, dx: 0, w: pane?.offsetWidth || 300, id: e.pointerId }
  }
  const move = (e: React.PointerEvent) => {
    const g = d.current
    if (!g) return
    // A phase picked up to move takes over the finger: put the tray back.
    if (env.moving) { d.current = null; if (g.on) { setDragging(false); if (tray.current) tray.current.style.height = ''; if (track.current) { track.current.style.transition = ''; track.current.style.transform = tf(i) } } return }
    const dx = e.clientX - g.x, dy = e.clientY - g.y
    if (!g.on) {
      if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) { d.current = null; return }
      if (Math.abs(dx) < 10) return
      g.on = true
      const on = track.current?.children[i] as HTMLElement | undefined
      if (tray.current && on && !wide) tray.current.style.height = `${on.offsetHeight}px`
      tray.current?.setPointerCapture(g.id)
      setDragging(true)
    }
    const to = i + (dx < 0 ? 1 : -1), last = hasSide ? n : n - 1, there = to >= 0 && to <= last
    g.dx = there ? dx : dx / 4
    if (track.current) { track.current.style.transition = 'none'; track.current.style.transform = tf(i, g.dx) }
    if (label.current && !solo) label.current.textContent = to === n && hasSide ? 'Add an option' : there ? `Swap in ${panes[to]?.id ? (env.base.phases.find((x) => x.id === panes[to].id)?.title || '') : ''}` : 'Nothing that way'
  }
  const up = () => {
    const g = d.current
    d.current = null
    if (!g?.on) return
    const stop = (ev: MouseEvent) => { ev.stopPropagation(); ev.preventDefault() }
    window.addEventListener('click', stop, { capture: true, once: true })
    setTimeout(() => window.removeEventListener('click', stop, { capture: true }), 50)
    if (tray.current) tray.current.style.height = ''
    if (track.current) track.current.style.transition = ''
    setDragging(false)
    const j = i + (g.dx < 0 ? 1 : -1)
    let to = i
    if (Math.abs(g.dx) > g.w * 0.22) {
      if (j === n && hasSide) { setAtSide(true); to = n }
      else if (j >= 0 && j < n) { setAtSide(false); to = j; if (j !== index) onIndex?.(j) }
    }
    if (track.current) track.current.style.transform = tf(to)
  }

  const pickPane = (j: number) => (e: React.MouseEvent) => { if (j === i) return; e.preventDefault(); e.stopPropagation(); if (j === n) setAtSide(true); else { setAtSide(false); onIndex?.(j) } }
  const visible = (j: number) => j === i || dragging || wide
  return <div ref={tray} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
    className={cn('relative touch-pan-y overflow-hidden', solo ? '' : 'pb-1', wide && 'py-1')}>
    {solo ? null : <span ref={label} aria-hidden="true" className={cn('pointer-events-none absolute left-1/2 top-2 z-10 -translate-x-1/2 rounded-full bg-foreground px-3 py-1 text-xs font-extrabold text-background transition-opacity', dragging ? 'opacity-100' : 'opacity-0')} />}
    <div ref={track} className={cn('flex items-start transition-transform duration-300 ease-out', wide && 'gap-[28px]')} style={{ transform: tf(i) }}>
      {panes.map((pane, j) => <div key={pane.id} aria-hidden={j !== i || undefined} onClickCapture={wide && j !== i ? pickPane(j) : undefined}
        className={cn('min-w-0 shrink-0', wide ? 'transition-[opacity,transform] duration-300' : 'w-full', !visible(j) && 'invisible h-0 overflow-hidden', wide && j !== i && 'max-h-[200px] cursor-pointer overflow-hidden opacity-40 hover:opacity-60 [&_*]:pointer-events-none')}
        style={wide ? { width: pw } : undefined}>{pane.node}</div>)}
      {hasSide ? <div aria-hidden={i !== n || undefined} onClickCapture={wide && i !== n ? pickPane(n) : undefined}
        className={cn('min-w-0 shrink-0', solo ? 'pl-3' : '', wide ? '' : 'w-full', !visible(n) && 'invisible h-0 overflow-hidden', wide && i !== n && 'cursor-pointer opacity-60 [&_*]:pointer-events-none')} style={wide ? { width: pw } : undefined}>
        <div className={cn('grid h-[180px] place-items-center rounded-[22px] border-[3px] border-dashed border-border', !solo && 'mx-4')}>{side}</div>
      </div> : null}
    </div>
  </div>
}

/** A phase's details: a bottom sheet on a phone, a dialog on a wider screen. */
function PhaseSheet({ doc, p, photos, state, setState, onOpen, onRename, onKeep, onRemove, onOption, onMove, onSplit, onJoin }: {
  doc: LifeDoc; p: Phase; photos?: Record<string, PlacePhoto>; state: { id: string; renaming?: string; confirmRm?: boolean }; setState: (s: { id: string; renaming?: string; confirmRm?: boolean } | null) => void
  onOpen: () => void; onRename: (t: string) => void; onKeep: () => void; onRemove: () => void; onOption: () => void; onMove: () => void; onSplit: (fromId: string) => void; onJoin: (toId: string) => void
}) {
  const wh = whenOf(doc, p), fixed = wh === 'now' || wh === 'done', leaf = !kids(doc, p.id).length
  const joinTo = leaf ? doc.phases.filter((x) => canJoin(doc, p.id, x.id)) : []
  const renaming = state.renaming != null
  const close = () => setState(null)
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })
  const act = 'h-11 rounded-2xl bg-muted px-3.5 text-left text-sm font-extrabold hover:bg-muted/70'
  return <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">
    <button type="button" aria-label="Close" className="absolute inset-0 cursor-default bg-black/45" onClick={close} />
    <div role="dialog" aria-modal="true" aria-label={p.title} className="relative grid max-h-[90dvh] w-full gap-3 overflow-y-auto rounded-t-[28px] bg-card p-4 pb-[max(18px,env(safe-area-inset-bottom))] text-foreground shadow-2xl sm:max-w-[480px] sm:rounded-[28px] sm:p-5">
      <span className="mx-auto h-1.5 w-10 rounded-full bg-border sm:hidden" aria-hidden="true" />
      <div className="relative h-28 overflow-hidden rounded-[18px]"><PhaseCover phase={p} photos={photos} className="absolute inset-0 h-full w-full" />
        <button type="button" onClick={close} aria-label="Close" className="absolute right-2.5 top-2.5 grid size-8 place-items-center rounded-full bg-black/40 text-white"><X size={16} aria-hidden="true" /></button></div>
      <div>
        <span className="text-xs font-extrabold uppercase tracking-[0.08em] text-muted-foreground">{p.idea ? 'Idea · ' : ''}{{ now: 'You’re here', done: 'Before now', next: 'Up next', later: 'Later' }[wh]}</span>
        {renaming
          ? <form onSubmit={(e) => { e.preventDefault(); onRename(state.renaming || '') }} className="mt-1 flex gap-2">
            <input autoFocus aria-label="Name" value={state.renaming} placeholder={p.title} onChange={(e) => setState({ ...state, renaming: e.target.value })} className="h-11 min-w-0 flex-1 rounded-xl bg-muted px-3 text-xl font-extrabold outline-none focus:ring-2 focus:ring-[var(--org-primary-color)]" />
            <Button type="submit" variant="brand">Save</Button></form>
          : <h3 className="text-[26px] font-extrabold leading-tight tracking-tight">{p.title}</h3>}
        <p className="text-sm text-muted-foreground">From {monthText(p.starts!)}{p.place_label ? ` · ${p.place_label}` : ''}{(p.after?.length || 0) > 1 ? ` · ${p.after!.length} ways lead here` : ''}</p>
      </div>
      {state.confirmRm ? <div className="flex flex-wrap items-center gap-2 rounded-xl bg-amber-100 px-3 py-2 text-sm font-bold text-amber-900 dark:bg-amber-500/15 dark:text-amber-200">
        Remove {p.title}? Its budget goes too, and its goals go back to the phase you’re in.
        <Button size="sm" variant="destructive" onClick={onRemove}>Remove</Button><Button size="sm" variant="ghost" onClick={() => setState({ id: p.id })}>Keep</Button>
      </div> : null}
      <div className="grid grid-cols-2 gap-2">
        <Button variant="brand" className="col-span-2 justify-between" onClick={onOpen}>Open {p.title}<ChevronRight size={16} aria-hidden="true" /></Button>
        {renaming ? null : <button type="button" className={act} onClick={() => setState({ id: p.id, renaming: p.title })}>Rename</button>}
        {p.idea ? <button type="button" className={act} onClick={onKeep}><Check size={14} className="mr-1 inline" aria-hidden="true" />Make it real</button> : null}
        {!fixed && splitOf(p) ? <button type="button" className={act} onClick={onOption}>Another option here</button> : null}
        {!fixed ? <button type="button" className={act} onClick={onMove}>Move</button> : null}
        {(p.after?.length || 0) > 1 ? p.after!.map((id) => <button key={id} type="button" className={cn(act, 'col-span-2')} onClick={() => onSplit(id)}>Split off the {byId(doc, id)?.title} way</button>) : null}
        {joinTo.length ? <label className={cn(act, 'col-span-2 flex items-center gap-2')}>Leads into
          <select aria-label="Leads into" className="min-w-0 flex-1 bg-transparent font-extrabold" value="" onChange={(e) => { if (e.target.value) onJoin(e.target.value) }}>
            <option value="">…</option>{joinTo.map((x) => <option key={x.id} value={x.id}>{x.title}</option>)}
          </select></label> : null}
        {fixed ? null : <button type="button" className={cn(act, 'bg-transparent text-muted-foreground')} onClick={() => (p.idea ? onRemove() : setState({ id: p.id, confirmRm: true }))}>Remove</button>}
      </div>
    </div>
  </div>
}
