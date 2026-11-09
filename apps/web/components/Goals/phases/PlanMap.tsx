'use client'
/* eslint-disable no-unused-vars -- parameter names in function types */

import React from 'react'
import { createPortal } from 'react-dom'
import { useRouter, useSearchParams } from 'next/navigation'
import { ArrowUpDown, CornerRightDown, MoreVertical, Plus, Scale, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@components/ui/dropdown-menu'
import { getUriWithOrg, routePaths } from '@services/config/config'
import type { LifeDoc, Phase, PlacePhoto } from '@services/life/life'
import PlanCompare from './PlanCompare'
import PhaseSheet from './PhaseSheet'
import { freshStart, HOLD_KEY, PhaseCard, RankSheet, SkipPane, Tray, undated, type Env } from './MapParts'
import { PendingCard } from './PendingCard'
import { pagePinned, scrollSpeed, type Moving } from './dragPage'
import { kindFor, suggestTitle } from './setup'
import { addSkip, canAddSkip, fillSkip, makeOptional } from './skips'
import { bottomOf, byId, endsKey, heldShape, join, liftLine, kids, lift, loosePiece, mi, normalize, optionsOf, pieceOf, place, placeBefore, rank, rejoinOf, remove, split, splitOf, whenOf, ym, type RouteStep } from './graph'
import { isSkip, showWayTo } from './dates'
import { WayBar } from './PhaseTime'
import { getShown, setShown as setShownStore, showOption, useShown } from './way'

import { tr } from '@/lib/tr'
type Change = (fn: (next: LifeDoc) => void) => Promise<LifeDoc | null>
/**
 * Where a dragged piece would land: after `at` in line, or as a new option in the split `at`. `home`
 * puts it back where it was; `index` (a split's options row) or `beside` (an option's card) say where
 * among the options it goes.
 */
type Spot = { at: string; inline: boolean; text: string; el: HTMLElement; slot?: boolean; home?: boolean; index?: number; beside?: string; before?: string; edge?: 't' | 'b'; skipTo?: string }

const WIDE = 860

/**
 * The plan as a stack of phases, top to bottom, all one size: order matters here, not length. Where
 * the plan splits, a row of options sits over a surface showing the one picked; swiping on the
 * surface swaps everything in it. The + button hands you a new phase to drag into the map: between
 * two phases, onto one (an option beside it) or onto a split's options. Press and hold a phase to move it.
 */
export default function PlanMap({ doc: raw, orgslug, token, photos, change, focus, title }: { doc: LifeDoc; orgslug: string; token?: string; photos?: Record<string, PlacePhoto>; change: Change; focus?: string | null; title?: React.ReactNode }) {
  const router = useRouter()
  const params = useSearchParams()
  // Which option each split shows is the way being looked at: every date follows it.
  const shown = useShown()
  const doc = React.useMemo(() => normalize(raw, shown), [raw, shown])
  const wrap = React.useRef<HTMLDivElement>(null)
  const [width, setWidth] = React.useState(400)
  const [gut, setGut] = React.useState({ l: 16, r: 16 })
  const [sheet, setSheet] = React.useState<{ id: string; renaming?: string; confirmRm?: boolean } | null>(null)
  const [moving, setMoving] = React.useState<Moving | null>(null)
  const movingNow = moving
  // A new phase, or a career's route, put on the map but not kept yet. A route shows as one card.
  const [pending, setPending] = React.useState<{ doc: LifeDoc; id: string; name: string; ids?: string[] } | null>(null)
  // A career's route waiting beside the + button to be dragged onto the map.
  const [route, setRoute] = React.useState<{ title: string; loose: { doc: LifeDoc; ids: string[] } } | null>(null)
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

  const setShown = React.useCallback((key: string, id: string) => showOption(key, id), [])
  /** Show every option on the way to a phase (and, when a split moved under another phase, keep what it showed). */
  const showWay = (d: LifeDoc, id: string, moved?: { from: string; to: string }) => {
    const s = getShown(), next = { ...s }
    if (moved && s[moved.from]) next[moved.to] = s[moved.from]
    setShownStore(showWayTo(normalize(d, next), id, next))
  }
  // Which option each split shows is remembered on this device. Opening on a phase shows the way to it.
  React.useEffect(() => {
    if (focus && byId(doc, focus)) { const now = getShown(), next = showWayTo(doc, focus, now); if (JSON.stringify(next) !== JSON.stringify(now)) setShownStore(next) }
    if (focus) requestAnimationFrame(() => document.querySelector(`[data-card="${focus}"]`)?.scrollIntoView({ block: 'center' }))
  }, [focus]) // eslint-disable-line react-hooks/exhaustive-deps

  // A career's route waiting to be placed.
  React.useEffect(() => {
    if (!params?.has('hold')) return
    try {
      const held = JSON.parse(sessionStorage.getItem(HOLD_KEY) || 'null') as { title: string; steps: RouteStep[] } | null
      sessionStorage.removeItem(HOLD_KEY)
      if (held?.steps?.length) setRoute({ title: held.title, loose: loosePiece(doc, held.steps) })
    } catch { /* nothing waiting */ }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  /** Change the map and keep the result. */
  const apply = async (op: (d: LifeDoc) => LifeDoc) => change((next) => { Object.assign(next, op(normalize(next))) })

  /* ---------- moving, and placing a new phase ---------- */
  const base = pending ? pending.doc : moving?.loose ? moving.loose.doc : doc
  // Phases move one at a time; a career's route moves as a whole until it is placed.
  const heldIds = React.useMemo(() => (moving ? (moving.loose ? moving.loose.ids : pieceOf(doc, moving.head, true)) : []), [moving, doc])
  const held = React.useMemo(() => new Set(heldIds), [heldIds])
  // The map as it is without the phase being moved: where it can go is worked out on this.
  const without = React.useMemo(() => (moving && !moving.loose ? lift(doc, moving.head, true) : base), [moving, doc, base])
  const startMove = (head: string) => { setSheet(null); setPending(null); setMoving({ head, only: true, dragging: true }) }
  const freshMoving = (dragging: boolean): Moving => {
    const loose = loosePiece(doc, [{ title: tr('goals.pending_card.new_phase', 'New phase'), years: 1 }])
    return { head: loose.ids[0], only: false, loose, fresh: true, dragging }
  }
  const startNew = () => { setSheet(null); setPending(null); setMoving(freshMoving(true)) }
  // Tapped instead of dragged: a new phase (or a career's route) goes at the bottom of the map, waiting there.
  const addAtBottom = (m: Moving | null) => {
    if (!m?.loose) return
    setSheet(null); setFab(false)
    const at = bottomOf(doc), ids = m.loose.ids
    if (at) void drop(at, false, {}, m)
    else { if (m.route) setRoute(null); setPending({ doc: m.route ? m.loose.doc : undated(m.loose.doc, ids), id: ids[0], name: m.label || '', ids: m.route ? ids : undefined }) }
  }
  const drop = async (at: string, inline: boolean, where: { index?: number; beside?: string; before?: string; skipTo?: string } = {}, moving = movingNow) => {
    if (!moving) return
    const ids = moving.loose ? moving.loose.ids : pieceOf(doc, moving.head, true)
    let lifted = moving.loose ? moving.loose.doc : lift(doc, moving.head, true)
    // A new phase sits right after where it was dropped, until the learner picks its date.
    if (moving.fresh && !where.before && byId(lifted, ids[0])!.undated !== false) { lifted = structuredClone(lifted); byId(lifted, ids[0])!.starts = ym(freshStart(lifted, at, inline)) }
    // Dropped on a skip: it becomes that option, in the skip's place.
    let placed = where.skipTo ? fillSkip(lifted, ids, where.skipTo) : where.before ? placeBefore(lifted, ids, where.before) : place(lifted, ids, at, inline)
    // Among a split's options it goes where it was dropped: first, last, or right after the card it went beside.
    const key = !inline && !where.before && !where.skipTo && splitOf(byId(placed, ids[0])!)
    if (key && (where.index != null || where.beside)) {
      const order = optionsOf(placed, key).map((q) => q.id).filter((id) => id !== ids[0])
      const j = where.beside ? order.indexOf(where.beside) + 1 : Math.min(where.index!, order.length)
      order.splice(j < 0 ? order.length : j, 0, ids[0])
      placed = rank(placed, order)
    }
    setMoving(null)
    // Show the way to where it landed, so it never seems to vanish into an option that isn't showing. In
    // line before a split, the split now hangs off the piece: it keeps showing the option it showed.
    showWay(placed, ids[0], inline ? { from: at, to: heldShape(placed, ids).tail || ids[ids.length - 1] } : undefined)
    requestAnimationFrame(() => document.querySelector(`[data-card="${ids[0]}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }))
    // Something new assumes nothing: its date and the rest stay blank until the learner picks them.
    // A career's route keeps its steps' usual lengths; a new phase takes no time until its length is picked.
    if (moving.route) { setRoute(null); setPending({ doc: placed, id: ids[0], name: moving.label || '', ids }) }
    else if (moving.fresh) setPending({ doc: undated(placed, ids), id: ids[0], name: pending?.id === ids[0] ? pending.name : '' })
    else await change((next) => { Object.assign(next, placed) })
  }
  /** A skip in a split, from its menu: shown right away, so its dates are the ones on screen. */
  const addSkipTo = async (key: string) => {
    let id = ''
    await apply((d) => { const r = addSkip(d, key); id = r.id; return r.doc })
    if (id) setShown(key, id)
  }
  /** A new phase straight into a split, from its menu: it waits there for a name. */
  const newOption = (key: string) => {
    const loose = loosePiece(doc, [{ title: tr('goals.pending_card.new_phase', 'New phase'), years: 1 }]), id = loose.ids[0], lifted = structuredClone(loose.doc)
    byId(lifted, id)!.starts = ym(freshStart(lifted, key, false))
    setSheet(null); setMoving(null)
    setPending({ doc: undated(place(lifted, [id], key, false), [id]), id, name: '' })
    setShown(key, id)
  }
  /** Change the waiting phase (every phase of a waiting route) before it's kept. */
  const editPending = (fn: (p: Phase) => void) => setPending((pd) => {
    if (!pd) return pd
    const d = structuredClone(pd.doc)
    for (const id of pd.ids || [pd.id]) { const p = byId(d, id); if (p) fn(p) }
    return { ...pd, doc: d }
  })
  /** Pick how long the waiting phase lasts. */
  const lengthPending = (months: number) => setPending((pd) => {
    if (!pd) return pd
    const d = structuredClone(pd.doc), p = byId(d, pd.id)
    if (!p) return pd
    p.months = Math.max(1, Math.min(1200, months)); p.undated = false
    return { ...pd, doc: normalize(d) }
  })
  const keepPending = async () => {
    if (!pending) return
    const kept = structuredClone(pending.doc)
    for (const id of pending.ids || [pending.id]) {
      const p = byId(kept, id)
      if (!p) continue
      // Named for what it is when no name was typed. Its budget starts empty: the phase page offers estimates.
      if (!pending.ids) { if (p.activities?.length) p.kind = kindFor(p.activities); p.title = pending.name.trim() || (p.activities?.length || p.living || p.place_label ? suggestTitle(p) : tr('lit.graph.new_phase', 'New phase')) }
    }
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

  // While dragging: over a phase, its top edge is before it, its bottom edge right after it and its middle an option
  // beside it; over a split's options row, an option in that split (hold over one to show it); anywhere else the nearest gap.
  const lifting = React.useRef<{ ghost: HTMLElement; x0: number; y0: number; x: number; y: number; scroll?: number; spot: Spot | null; drill?: { id: string; timer: ReturnType<typeof setTimeout> }; flip?: { k: string; side: number; armed: boolean; timer?: ReturnType<typeof setTimeout> } } | null>(null)
  const moveRef = React.useRef<(x: number, y: number) => void>(() => {})
  const ghostMove = React.useCallback((x: number, y: number) => {
    const l = lifting.current
    if (!l) return
    l.ghost.style.left = `${x}px`; l.ghost.style.top = `${y}px`
    l.x = x; l.y = y
    const el = document.elementFromPoint(x, y) as HTMLElement | null
    const row = el?.closest<HTMLElement>('[data-band-key]'), chip = el?.closest<HTMLElement>('[data-chip]'), card = el?.closest<HTMLElement>('[data-card]:not([data-held])')
    const home = el?.closest<HTMLElement>('[data-card][data-held]')
    let spot: Spot | null = null
    // Still over where it came from: it goes back there.
    const skip = el?.closest<HTMLElement>('[data-skip-to]')
    if (home) spot = { at: '', inline: false, home: true, text: tr('lit.plan_map.put_it_back', 'Put it back'), el: home }
    else if (skip) spot = { at: skip.dataset.skipTo!, inline: false, skipTo: skip.dataset.skipTo!, el: skip, text: tr('goals.plan_map.instead_of_skipping', 'Here, instead of skipping') }
    else if (row) {
      // Among the options, where the finger is: before the first, between two, or after the last.
      const chips = [...row.querySelectorAll<HTMLElement>('[data-chip]:not([data-held])')]
      const index = chips.filter((c) => { const r = c.getBoundingClientRect(); return x > r.left + r.width / 2 }).length
      spot = { at: row.dataset.bandKey!, inline: false, index, el: row, text: !chips.length || index >= chips.length ? tr('lit.plan_map.the_last_option', 'The last option') : index === 0 ? tr('lit.plan_map.the_first_option', 'The first option') : `Option ${index + 1}` }
    } else if (card) {
      const r = card.getBoundingClientRect(), f = (y - r.top) / r.height, { card: id, title, opt } = card.dataset
      if (f <= 0.2 && card.dataset.before) spot = { at: id!, inline: false, before: id, edge: 't', text: tr('goals.plan_map.before_title', 'Before {{title}}', { title }), el: card }
      else if (f >= 0.8 && card.dataset.after) spot = { at: id!, inline: true, edge: 'b', text: tr('goals.plan_map.right_after_title', 'Right after {{title}}', { title }), el: card }
      else if (f > 0.2 && f < 0.8 && opt) spot = { at: opt, inline: false, beside: id, text: `An option beside ${title}`, el: card } }
    if (chip && chip.dataset.chip !== l.drill?.id) {
      if (l.drill) clearTimeout(l.drill.timer)
      const key = row!.dataset.bandKey!, id = chip.dataset.chip!
      l.drill = { id, timer: setTimeout(() => setShown(key, id), 450) }
    } else if (!chip && l.drill) { clearTimeout(l.drill.timer); l.drill = undefined }
    // Over a split's options, carrying it out of the middle half of the card toward either side flips to
    // the option that way after a short pause, and on to the next after a longer one while it stays there.
    // A card picked up already near a side flips nothing until it has been back over the middle.
    const tray = el?.closest<HTMLElement>('[data-tray]'), tk = tray?.dataset.tray || ''
    const box = tray?.getBoundingClientRect(), quarter = box ? box.width / 4 : 0
    const side = box ? (x < box.left + quarter ? -1 : x > box.right - quarter ? 1 : 0) : 0
    const flip = (dir: number) => { if (!tray) return; const ids = tray.dataset.opts!.split(','), j = Number(tray.dataset.index) + dir; if (j >= 0 && j < ids.length) { setShown(tk, ids[j]); navigator.vibrate?.(8); setTimeout(() => { if (lifting.current === l) moveRef.current(l.x, l.y) }, 330) } }
    const f = l.flip
    if (!tray || tk !== f?.k || side !== f.side || (side && !f.armed)) {
      if (f?.timer) clearTimeout(f.timer)
      const armed = !!tray && (side === 0 || (tk === f?.k && f.armed))
      l.flip = tray ? { k: tk, side, armed } : undefined
      if (tray && side && armed) {
        const g = l.flip!, step = (wait: number) => { g.timer = setTimeout(() => { flip(side); step(900) }, wait) }
        step(350)
      }
    }
    if (!spot) {
      let best: HTMLElement | null = null, bd = Infinity
      // Options not showing still have their gaps laid out underneath: only the ones you can see count.
      wrap.current?.querySelectorAll<HTMLElement>('[data-slot]').forEach((s) => { if (s.closest('[aria-hidden="true"]')) return; const r = s.getBoundingClientRect(), d = y >= r.top && y <= r.bottom ? 0 : Math.abs(y - (r.top + r.bottom) / 2); if (d < bd) { bd = d; best = s } })
      const s = best as HTMLElement | null
      if (s) { const mode = s.dataset.modes!; spot = { at: s.dataset.slot!, inline: mode === 'in', slot: true, el: s, text: mode === 'in' ? `Right after ${s.dataset.title}` : `After ${s.dataset.title}` } }
    }
    if (spot?.el !== l.spot?.el || spot?.index !== l.spot?.index || spot?.edge !== l.spot?.edge) {
      // Only marks: nothing is inserted, so the layout (and what's under the finger) stays put.
      wrap.current?.querySelectorAll<HTMLElement>('[data-hot]').forEach((b) => { delete b.dataset.hot })
      wrap.current?.querySelectorAll<HTMLElement>('[data-ins],[data-edge]').forEach((b) => { delete b.dataset.ins; delete b.dataset.edge })
      if (spot?.edge) spot.el.dataset.edge = spot.edge; else if (spot) spot.el.dataset.hot = '1'
      if (spot?.index != null) {
        const chips = [...spot.el.querySelectorAll<HTMLElement>('[data-chip]:not([data-held])')]
        if (chips[spot.index]) chips[spot.index].dataset.ins = 'l'; else if (chips.length) chips[chips.length - 1].dataset.ins = 'r'
      }
      l.spot = spot
      l.ghost.textContent = spot?.text || tr('lit.plan_map.drop_it_on_the_map', 'Drop it on the map')
    }
    // Carried up to the top or down to the bottom, the page scrolls smoothly for as long as the finger stays
    // there, faster the closer it gets. A card picked up near an edge doesn't scroll until it moves that way.
    if (!l.scroll && scrollSpeed(l) && lifting.current === l) {
      const step = () => {
        const v = lifting.current === l ? scrollSpeed(l) : 0
        if (!v) { l.scroll = undefined; return }
        window.scrollBy(0, v)
        moveRef.current(l.x, l.y)
        l.scroll = requestAnimationFrame(step)
      }
      l.scroll = requestAnimationFrame(step)
    }
  }, [setShown])
  React.useEffect(() => { moveRef.current = ghostMove }, [ghostMove])
  const ghostEnd = React.useCallback(() => {
    const l = lifting.current
    lifting.current = null
    if (!l) return
    if (l.drill) clearTimeout(l.drill.timer)
    if (l.flip?.timer) clearTimeout(l.flip.timer)
    if (l.scroll) cancelAnimationFrame(l.scroll)
    l.ghost.remove()
    pagePinned(false)
    wrap.current?.querySelectorAll<HTMLElement>('[data-hot],[data-ins],[data-edge]').forEach((b) => { delete b.dataset.hot; delete b.dataset.ins; delete b.dataset.edge })
    const stop = (e: MouseEvent) => { e.stopPropagation(); e.preventDefault() }
    window.addEventListener('click', stop, { capture: true, once: true })
    setTimeout(() => window.removeEventListener('click', stop, { capture: true }), 50)
    // The touch listeners were set up before the piece lifted, so the drop reads the latest render.
    if (l.spot?.home) setMoving(null)
    else if (l.spot) void dropRef.current(l.spot.at, l.spot.inline, l.spot)
    // Let go nowhere in particular: nothing moves.
    else setMoving(null)
  }, [])
  const ghostStart = (text: string, x: number, y: number) => {
    const ghost = document.createElement('div')
    ghost.className = 'pointer-events-none fixed z-[80] max-w-[80vw] -translate-x-1/2 -translate-y-[130%] -rotate-2 truncate rounded-2xl bg-foreground px-4 py-3 text-base font-extrabold text-background shadow-2xl'
    ghost.textContent = text
    document.body.append(ghost)
    pagePinned(true)
    lifting.current = { ghost, x0: x, y0: y, x, y, spot: null }
    ghostMove(x, y)
    // Look again once the map shows what's moving: a finger that hasn't moved is over where the piece came from.
    requestAnimationFrame(() => requestAnimationFrame(() => { const l = lifting.current; if (l) moveRef.current(l.x, l.y) }))
    navigator.vibrate?.(12)
  }
  const liftCard = (p: Phase, x: number, y: number) => { startMove(p.id); ghostStart(p.title, x, y) }
  // The new phase waiting for a name moves the same way, and keeps waiting where it lands.
  const liftPending = (x: number, y: number) => {
    if (!pending) return
    const ids = pending.ids || [pending.id], name = pending.name.trim() || tr('lit.graph.new_phase', 'New phase')
    setMoving({ head: pending.id, only: true, fresh: !pending.ids, route: !!pending.ids, dragging: true, label: name, loose: { doc: liftLine(pending.doc, ids), ids } })
    ghostStart(name, x, y)
  }
  // The + button: tap it to open the new phase card, or drag straight off it.
  const fabPress = React.useRef<{ x: number; y: number; live: boolean } | null>(null)

  // The new phase in the + button's tray: drag it out (it never scrolls the page), or tap it to pick a spot.
  const press = React.useRef<{ x: number; y: number; live: boolean } | null>(null)
  // A career's route, waiting: drag it into the map like a new phase; it stays one card until you keep it.
  const routePress = React.useRef<{ x: number; y: number; live: boolean } | null>(null)
  const routeMoving = (dragging: boolean): Moving | null => route ? { head: route.loose.ids[0], only: false, loose: route.loose, route: true, dragging, label: route.title } : null
  const routeCard = route ? <div className="relative">
    <div role="button" tabIndex={0} aria-label={tr('goals.plan_map.title_drag_or_tap_end', '{{title}}: drag it into your map, or tap to add it at the end', { title: route.title })}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); addAtBottom(routeMoving(false)) } }}
      onPointerDown={(e) => { if (e.button > 0) return; e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); routePress.current = { x: e.clientX, y: e.clientY, live: false } }}
      onPointerMove={(e) => {
        const p = routePress.current
        if (!p) return
        if (!p.live) { if (Math.hypot(e.clientX - p.x, e.clientY - p.y) < 6) return; p.live = true; setPending(null); setMoving(routeMoving(true)); ghostStart(route.title, e.clientX, e.clientY) }
        ghostMove(e.clientX, e.clientY)
      }}
      onPointerUp={() => { const p = routePress.current; routePress.current = null; if (p?.live) ghostEnd(); else if (p) addAtBottom(routeMoving(false)) }}
      onPointerCancel={() => { routePress.current = null; ghostEnd() }}
      className={cn('grid w-[220px] cursor-grab touch-none select-none gap-1 rounded-[20px] border-[3px] border-dashed border-foreground/50 bg-card p-3 pr-9 text-left shadow-2xl transition-opacity', moving?.dragging && 'opacity-30')}>
      <b className="text-lg font-extrabold leading-tight">{route.title}</b>
      <small className="text-xs font-bold text-muted-foreground">{route.loose.ids.length === 1 ? tr('goals.plan_map.1_phase', '1 phase') : `${route.loose.ids.length} phases`}{' '}{tr('goals.plan_map.drag_it_into_your_map', '· drag it into your map')}</small>
    </div>
    <button type="button" aria-label={tr('goals.plan_map.don_t_add_title', 'Don’t add {{title}}', { title: route.title })} onClick={() => setRoute(null)} className="absolute right-1.5 top-1.5 grid size-7 place-items-center rounded-full text-muted-foreground hover:bg-muted"><X size={15} aria-hidden="true" /></button>
  </div> : null
  const newCard = <div role="button" tabIndex={0} aria-label={tr('goals.plan_map.new_phase_drag_or_tap_end', 'New phase: drag it into your map, or tap to add it at the end')}
    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); addAtBottom(freshMoving(false)) } }}
    onPointerDown={(e) => { e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); press.current = { x: e.clientX, y: e.clientY, live: false } }}
    onPointerMove={(e) => {
      const p = press.current
      if (!p) return
      if (!p.live) { if (Math.hypot(e.clientX - p.x, e.clientY - p.y) < 6) return; p.live = true; startNew(); ghostStart(tr('lit.graph.new_phase', 'New phase'), e.clientX, e.clientY) }
      ghostMove(e.clientX, e.clientY)
    }}
    onPointerUp={() => { const p = press.current; press.current = null; setFab(false); if (p?.live) ghostEnd(); else if (p) addAtBottom(freshMoving(false)) }}
    onPointerCancel={() => { press.current = null; ghostEnd() }}
    className={cn('grid h-[104px] w-[172px] cursor-grab touch-none select-none content-between rounded-[20px] border-[3px] border-dashed border-foreground/50 bg-card p-3 text-left shadow-2xl transition-opacity', moving?.dragging && 'opacity-30')}>
    <b className="text-lg font-extrabold">{tr('goals.pending_card.new_phase', 'New phase')}</b>
    <small className="text-xs font-bold text-muted-foreground">{tr('goals.plan_map.drag_or_tap_end', 'Drag it into your map, or tap to add it at the end')}</small>
  </div>

  if (comparing) return <PlanCompare doc={doc} orgslug={orgslug} token={token} only={comparing} onBack={() => setComparing(null)} />

  const picked = (key: string, options: Phase[]) => options.find((q) => q.id === shown[key]) || options[0]
  const later = (p: Phase) => whenOf(doc, p) !== 'done' && whenOf(doc, p) !== 'now'
  const env: Env = { base, photos, wide, moving, held, later }
  const linear = !!moving && heldShape(moving.loose ? moving.loose.doc : doc, heldIds).linear
  const pad = wide ? undefined : { paddingLeft: gut.l, paddingRight: gut.r }

  /* ---------- the stack ---------- */
  // The gap between two cards; while something is picked up, a place to drop it. `at` can be a split's
  // ends (after every option).
  const gapAt = (key: string, a?: Phase, b?: Phase, at?: string, title?: string) => {
    const spot = at || a?.id
    if (moving && spot && !(a && held.has(a.id)) && !(b && held.has(b.id)) && !(a && whenOf(base, a) === 'done')) {
      const name = title || a!.title, mode = b ? 'in' : 'after'
      // A gap keeps exactly its size (the map never moves under your finger); the one you're over lights up.
      return <div key={key} data-slot={spot} data-modes={mode} data-title={name} className="group flex h-3 items-center">
        <span className="h-1 w-full rounded-full transition-[background-color,transform] group-data-[hot]:scale-y-[2.5] group-data-[hot]:bg-foreground" />
      </div>
    }
    return <div key={key} className="h-3" />
  }
  const card = (p: Phase) => {
    if (p.pass) return <SkipPane key={`c-${p.id}`} skip={p} next={kids(base, p.id)} moving={!!moving} />
    if (pending?.id === p.id) return <PendingCard key={`c-${p.id}`} p={p} env={env} token={token} onEdit={editPending} onLength={lengthPending} name={pending.name} steps={pending.ids?.map((id) => byId(base, id)?.title || '')} onName={(name) => setPending({ ...pending, name })}
      onKeep={() => void keepPending()} onCancel={() => setPending(null)} onLift={liftPending} onLiftMove={ghostMove} onLiftEnd={ghostEnd} />
    const wh = whenOf(base, p), lp = moving ? byId(without, p.id) : undefined
    // Even the phase right after the one moving can take it as an option: worked out as if it were gone.
    const key = lp && splitOf(lp)
    const opt = moving && key && wh !== 'done' && wh !== 'now' && !held.has(p.id) ? key : undefined
    const edges = moving && !held.has(p.id) ? { before: linear && later(p), after: wh !== 'done' } : undefined
    return <PhaseCard key={`c-${p.id}`} p={p} env={env} opt={opt} edges={edges} onOpen={() => setSheet({ id: p.id })} onLift={(x, y) => liftCard(p, x, y)} onLiftMove={ghostMove} onLiftEnd={ghostEnd} />
  }

  // A way down from p. `stop` holds the phases where an outer split's options meet again.
  const chain = (p: Phase, stop: Set<string>, depth: number): React.ReactNode[] => {
    if (stop.has(p.id)) return []
    const out: React.ReactNode[] = [card(p)]
    // A route not kept yet is one card: the way on is from its last phase.
    const end = (pending?.ids && pending.id === p.id && byId(base, pending.ids[pending.ids.length - 1])) || p
    const all = kids(base, end.id), k = all.filter((x) => !stop.has(x.id))
    if (!all.length) return moving ? [...out, gapAt(`l-${end.id}`, end)] : out
    if (!k.length) return moving ? [...out, gapAt(`l-${end.id}`, end, all[0])] : out
    if (k.length === 1) return [...out, gapAt(`l-${end.id}`, end, k[0]), ...chain(k[0], stop, depth)]
    return [...out, gapAt(`l-${end.id}`, end, k[0]), ...band(end.id, end.title, k, stop, depth)]
  }
  const band = (key: string, after: string, options: Phase[], stop: Set<string>, depth: number): React.ReactNode[] => {
    const sel = picked(key, options), i = options.indexOf(sel)
    const meet = rejoinOf(base, options)
    const group = meet ? (meet.after!.length > 1 ? optionsOf(base, splitOf(meet)!) : [meet]) : []
    const inner = new Set([...stop, ...group.map((x) => x.id)])
    const label = `Options after ${after}`
    // A skip is an option with no phase of its own: straight on to where the other options lead.
    const skipOf = (q: Phase) => isSkip(q)
    const skip = options.find(skipOf), canSkip = !moving && canAddSkip(base, key)
    const out: React.ReactNode[] = [<section key={`b-${key}`} aria-label={label} className="grid min-w-0 grid-cols-[minmax(0,1fr)]" style={wide ? undefined : { marginLeft: -gut.l, marginRight: -gut.r }}>
      <div data-band-key={key} className={cn('flex items-center gap-2 rounded-full py-1.5 transition-colors data-[hot]:bg-foreground/10', wide && 'mx-auto w-full max-w-[620px]')} style={pad}>
        <span className="shrink-0 text-[13px] font-extrabold text-muted-foreground">{tr('goals.decision.options', 'Options')}</span>
        <div role="tablist" aria-label={label} className="-my-0.5 flex min-w-0 flex-1 gap-1.5 overflow-x-auto py-0.5 [scrollbar-width:none]">
          {options.map((q) => <button key={q.id} type="button" role="tab" data-chip={q.id} data-held={held.has(q.id) || undefined} aria-selected={q === sel} onClick={() => setShown(key, q.id)}
            className={cn('shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-[13px] font-extrabold data-[ins=l]:!shadow-[-7px_0_0_-3px_hsl(var(--foreground))] data-[ins=r]:!shadow-[7px_0_0_-3px_hsl(var(--foreground))] shadow-[0_0_0_1.5px_hsl(var(--border))]', q === sel ? 'bg-foreground text-background shadow-none' : 'bg-card', (q.idea || skipOf(q)) && q !== sel && 'border-2 border-dashed border-border shadow-none')}>{skipOf(q) ? tr('goals.plan_map.skip', 'Skip') : q.title}</button>)}
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild><button type="button" aria-label={tr('goals.plan_map.more_for_tolowercase', 'More for {{toLowerCase}}', { toLowerCase: label.toLowerCase() })} className="-mr-1.5 grid size-9 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"><MoreVertical size={18} aria-hidden="true" /></button></DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {canSkip ? <DropdownMenuItem onSelect={() => { void addSkipTo(key) }}><CornerRightDown size={15} aria-hidden="true" />{tr('goals.plan_map.add_a_skip', 'Add a skip')}</DropdownMenuItem> : null}
            <DropdownMenuItem onSelect={() => newOption(key)}><Plus size={15} aria-hidden="true" />{tr('goals.decision.add_an_option', 'Add an option')}</DropdownMenuItem>
            {skip ? <DropdownMenuItem onSelect={() => { void apply((d) => remove(d, skip.id)) }}><X size={15} aria-hidden="true" />{tr('goals.plan_map.remove_the_skip', 'Remove the skip')}</DropdownMenuItem> : null}
            <DropdownMenuItem onSelect={() => setComparing(options.map((q) => q.id))}><Scale size={15} aria-hidden="true" />{tr('goals.plan_compare.compare', 'Compare')}</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setRanking({ key, options })}><ArrowUpDown size={15} aria-hidden="true" />{tr('goals.plan_map.rank', 'Rank')}</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className={cn('border-y-[1.5px] border-border py-3', depth % 2 ? 'bg-card' : 'bg-muted/40')}>
        <div className={cn(wide && 'mx-auto w-full max-w-[620px]')}>
          <Tray env={env} trayKey={key} wide={wide} index={i} onIndex={(j) => setShown(key, options[j].id)}
            panes={options.map((q) => ({ id: q.id, phase: q, node: <div style={pad}>{chain(q, inner, depth + 1)}</div> }))} />
        </div>
      </div>
    </section>]
    if (meet && !group.every((x) => stop.has(x.id))) {
      out.push(gapAt(`j-${key}`))
      out.push(...(group.length > 1 ? band(splitOf(meet)!, group.map((g) => byId(base, g.after![0])?.title).join(' or '), group, stop, depth) : chain(meet, stop, depth)))
    } else if (!meet) {
      // After every option: something they all lead to.
      // Worked out without the phase being moved, so an option's last phase can still go after them all.
      const ends = endsKey(without, key)
      if (ends && !ends.split(/[:,]/).some((id) => held.has(id))) out.push(gapAt(`j-${key}`, undefined, undefined, ends, `all ${options.length} options`))
    }
    return out
  }

  const first = base.phases.filter((p) => !p.after?.length && !held.has(p.id)).sort((a, b) => mi(a.starts!) - mi(b.starts!))[0]
  const sheetPhase = sheet ? byId(doc, sheet.id) : undefined

  return <div className="flex flex-col gap-4">
    <div className={cn('grid gap-3', wide && 'mx-auto w-full max-w-[620px]')}>{title}<WayBar doc={doc} /></div>
    <div ref={wrap} className={cn('flex flex-col pb-28', wide && '[&>:not(section)]:mx-auto [&>:not(section)]:w-full [&>:not(section)]:max-w-[620px]', moving && 'pb-40')}>
      {first ? chain(first, new Set(), 0) : null}
    </div>

    {/* Overlays live on the page body: the map sits in a moving view that would trap them under the menu bar. */}
    {mounted ? createPortal(<>
    <div className={cn('fixed bottom-[calc(env(safe-area-inset-bottom)+84px)] right-4 z-40 flex flex-col items-end gap-3 md:bottom-8 md:right-8', ((moving && !moving.fresh && !moving.route) || (moving && !moving.dragging) || pending) && 'invisible')}>
      {route ? routeCard : fab ? newCard : null}
      <button type="button" aria-expanded={fab} aria-label={fab ? tr('goals.explore_board.close', 'Close') : tr('goals.plan_map.add_a_phase', 'Add a phase')}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setFab(!fab) } }}
        onPointerDown={(e) => { if (e.button > 0) return; e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); fabPress.current = { x: e.clientX, y: e.clientY, live: false } }}
        onPointerMove={(e) => {
          const p = fabPress.current
          if (!p) return
          if (!p.live) { if (Math.hypot(e.clientX - p.x, e.clientY - p.y) < 8) return; p.live = true; setFab(false); startNew(); ghostStart(tr('lit.graph.new_phase', 'New phase'), e.clientX, e.clientY) }
          ghostMove(e.clientX, e.clientY)
        }}
        onPointerUp={() => { const p = fabPress.current; fabPress.current = null; if (p?.live) ghostEnd(); else if (p) setFab(!fab) }}
        onPointerCancel={() => { const p = fabPress.current; fabPress.current = null; if (p?.live) ghostEnd() }}
        className="grid size-14 touch-none select-none place-items-center rounded-full bg-foreground text-background shadow-[0_10px_30px_-8px_rgb(0_0_0/0.6)] transition-transform active:scale-95">
        {fab ? <X size={24} aria-hidden="true" /> : <Plus size={26} aria-hidden="true" />}
      </button>
    </div>

    {ranking ? <RankSheet options={ranking.options} onClose={() => setRanking(null)}
      onSave={(order) => { const key = ranking.key; setRanking(null); setShown(key, order[0]); void apply((d) => rank(d, order)) }} /> : null}
    {sheetPhase ? <PhaseSheet doc={doc} p={sheetPhase} photos={photos} state={sheet!} setState={setSheet}
      onOptional={() => { setSheet(null); void apply((d) => makeOptional(d, sheetPhase.id)) }}
      onOpen={() => router.push(getUriWithOrg(orgslug, routePaths.org.phase(sheetPhase.id)))}
      onRename={async (t) => { setSheet({ id: sheetPhase.id }); if (t.trim()) await apply((d) => { byId(d, sheetPhase.id)!.title = t.trim(); return d }) }}
      onKeep={() => void apply((d) => { byId(d, sheetPhase.id)!.idea = false; return d })}
      onRemove={async () => { setSheet(null); await apply((d) => remove(d, sheetPhase.id)) }}
      onSplit={async (fromId) => { let id = ''; await apply((d) => { const r = split(d, sheetPhase.id, fromId); id = r.id; return r.doc }); if (id) setSheet({ id }) }}
      onJoin={async (toId) => { setSheet(null); await apply((d) => join(d, sheetPhase.id, toId)) }} /> : null}
    </>, document.body) : null}
  </div>
}
