'use client'
/* eslint-disable no-unused-vars -- parameter names in function types */

import React from 'react'
import { ArrowDown, ArrowUp, Check, MoreHorizontal, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@components/ui/button'
import type { LifeDoc, Phase, PlacePhoto } from '@services/life/life'
import PhaseCover from './PhaseCover'
import type { Moving } from './MoveBar'
import { monthText, whenOf } from './graph'

export interface Env { base: LifeDoc; photos?: Record<string, PlacePhoto>; wide: boolean; moving: Moving | null; held: Set<string>; later: (p: Phase) => boolean }

export function Target({ alt, onClick, children }: { alt?: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" onClick={onClick}
    className={cn('relative inline-flex items-center gap-1.5 rounded-full border-2 border-dashed bg-card px-3.5 py-1.5 text-[12.5px] font-extrabold hover:border-solid hover:bg-foreground hover:text-background', alt ? 'border-border' : 'border-muted-foreground')}>{children}</button>
}

const CARD = 'relative isolate flex h-[180px] w-full select-none flex-col justify-end overflow-hidden rounded-[22px] text-left text-white shadow-[0_18px_34px_-24px_rgb(0_0_0/0.7)]'
const Shade = () => <span className="absolute inset-0 -z-10 bg-[linear-gradient(180deg,transparent_30%,rgb(8_20_30/0.8))]" aria-hidden="true" />

/**
 * Press and hold (touch) or drag (mouse) to pick something up. Touch listeners go on the touched element
 * itself and stay until the finger lifts, so the drag keeps working while the map redraws, and the page
 * stops scrolling once it is lifted. A horizontal mouse drag is left to the options tray.
 */
export function useHoldDrag(enabled: boolean, onLift: (x: number, y: number) => void, onLiftMove: (x: number, y: number) => void, onLiftEnd: () => void) {
  const [holding, setHolding] = React.useState(false)
  const mouse = React.useRef<{ x: number; y: number; live: boolean } | null>(null)
  const skip = (t: EventTarget) => !!(t as HTMLElement).closest?.('input,textarea,[data-no-drag]')
  const onTouchStart = (e: React.TouchEvent) => {
    if (!enabled || e.touches.length > 1 || skip(e.target)) return
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
  return {
    holding, onTouchStart,
    onPointerDown: (e: React.PointerEvent) => { if (enabled && e.pointerType === 'mouse' && e.button === 0 && !skip(e.target)) mouse.current = { x: e.clientX, y: e.clientY, live: false } },
    onContextMenu: (e: React.MouseEvent) => { if (enabled) e.preventDefault() },
  }
}

/**
 * A phase's card. Press and hold (touch) or drag it (mouse) to move it; a tap opens its details.
 * `opt` marks it as a place to drop a new option beside it while something is being moved.
 */
export function PhaseCard({ p, env, opt, onOpen, onLift, onLiftMove, onLiftEnd }: { p: Phase; env: Env; opt?: string; onOpen: () => void; onLift: (x: number, y: number) => void; onLiftMove: (x: number, y: number) => void; onLiftEnd: () => void }) {
  const wh = whenOf(env.base, p)
  const { holding, ...drag } = useHoldDrag(env.later(p) && !env.moving, onLift, onLiftMove, onLiftEnd)

  return <button type="button" data-card={p.id} data-held={(env.held.has(p.id) && !env.moving?.loose) || undefined} data-opt={opt} data-title={p.title} onClick={onOpen} title={`${p.title} · from ${monthText(p.starts!)}`}
    {...drag}
    className={cn(CARD, '[-webkit-touch-callout:none] transition-[transform,opacity,box-shadow] duration-200 data-[hot]:scale-[.96] data-[hot]:shadow-[0_0_0_4px_hsl(var(--foreground))]',
      holding && 'scale-[.97]', env.held.has(p.id) && 'opacity-35')}>
    <PhaseCover phase={p} photos={env.photos} past={wh === 'done'} className={cn('absolute inset-0 -z-20 h-full w-full', p.idea && 'saturate-[.45]')} />
    <Shade />
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

/** A new phase just dropped onto the map, not kept yet: name it and tick, or cross it out. Hold it to move it again. */
export function PendingCard({ p, env, name, steps, onName, onKeep, onCancel, onLift, onLiftMove, onLiftEnd }: { p: Phase; env: Env; name: string; steps?: string[]; onName: (v: string) => void; onKeep: () => void; onCancel: () => void; onLift: (x: number, y: number) => void; onLiftMove: (x: number, y: number) => void; onLiftEnd: () => void }) {
  const { holding, ...drag } = useHoldDrag(!env.moving, onLift, onLiftMove, onLiftEnd)
  return <form data-card={p.id} onSubmit={(e) => { e.preventDefault(); onKeep() }} {...drag}
    className={cn('flex h-[180px] select-none flex-col justify-between rounded-[22px] border-[3px] border-dashed border-foreground/60 bg-card p-4 transition-[transform,opacity] [-webkit-touch-callout:none]', holding && 'scale-[.97]', env.held.has(p.id) && 'opacity-35')}>
    <span className="text-xs font-extrabold uppercase tracking-[0.08em] text-muted-foreground">{steps ? `${steps.length === 1 ? '1 phase' : `${steps.length} phases`}` : 'New phase'} · from {monthText(p.starts!)}</span>
    {steps ? <span className="grid gap-1">
      <b className="truncate text-2xl font-extrabold leading-tight">{name}</b>
      <small className="truncate text-sm font-bold text-muted-foreground">{steps.join(' → ')}</small>
    </span> : <input autoFocus aria-label="Name of the new phase" value={name} onChange={(e) => onName(e.target.value)} placeholder="Gap year, trade school, move to Portland…"
      className="h-12 w-full rounded-2xl bg-muted px-3 text-lg font-extrabold outline-none focus:ring-2 focus:ring-[var(--org-primary-color)]" />}
    <span className="flex items-center justify-between gap-2">
      <small className="text-xs font-bold text-muted-foreground">Hold to move it</small>
      <span className="flex gap-2">
        <button type="button" onClick={onCancel} aria-label="Don’t add it" className="grid size-11 place-items-center rounded-full bg-muted text-foreground"><X size={20} aria-hidden="true" /></button>
        <button type="submit" aria-label="Add it" className="grid size-11 place-items-center rounded-full bg-foreground text-background"><Check size={20} aria-hidden="true" /></button>
      </span>
    </span>
  </form>
}

/**
 * A split's options: one shows, the others are a swipe away. On desktop (`wide`) the options either
 * side peek out from behind the shown one, muted; click one to bring it forward.
 */
export function Tray({ env, trayKey, panes, index, onIndex, wide }: { env: Env; trayKey: string; panes: { id: string; phase: Phase; node: React.ReactNode }[]; index: number; onIndex: (j: number) => void; wide?: boolean }) {
  const [dragging, setDragging] = React.useState(false)
  const tray = React.useRef<HTMLDivElement>(null), track = React.useRef<HTMLDivElement>(null), label = React.useRef<HTMLSpanElement>(null)
  const d = React.useRef<{ x: number; y: number; on: boolean; dx: number; w: number; id: number } | null>(null)
  const n = panes.length, i = Math.min(index, n - 1)
  // While something is dragged, holding it near either edge flips to the next option (see PlanMap).
  const marks = { 'data-tray': trayKey, 'data-opts': panes.map((q) => q.id).join(','), 'data-index': i }
  const tf = (at: number, dx = 0) => `translateX(calc(${-at * 100}% + ${dx}px))`
  React.useLayoutEffect(() => { if (track.current && !wide) track.current.style.transform = tf(i) })

  if (wide) {
    const peek = (j: number, side: -1 | 1) => {
      const q = panes[j]?.phase
      if (!q) return null
      return <button key={`peek-${q.id}`} type="button" onClick={() => onIndex(j)} aria-label={`Show ${q.title}`} title={q.title}
        className={cn(CARD, 'absolute inset-x-0 top-0 z-0 opacity-50 transition hover:opacity-70')} style={{ transform: `translateX(${side * 84}px) scale(.88)` }}>
        <PhaseCover phase={q} photos={env.photos} className="absolute inset-0 -z-20 h-full w-full saturate-[.4]" /><Shade />
      </button>
    }
    return <div className="relative" {...marks}>
      {peek(i - 1, -1)}{peek(i + 1, 1)}
      <div key={panes[i].id} className="relative z-10 animate-in fade-in duration-300">{panes[i].node}</div>
    </div>
  }

  const down = (e: React.PointerEvent) => {
    const ne = e.nativeEvent as PointerEvent & { trayTaken?: boolean }
    if (ne.trayTaken || env.moving || e.button > 0) return
    ne.trayTaken = true
    d.current = { x: e.clientX, y: e.clientY, on: false, dx: 0, w: tray.current?.offsetWidth || 300, id: e.pointerId }
  }
  const reset = () => { setDragging(false); if (tray.current) tray.current.style.height = ''; if (track.current) track.current.style.transition = '' }
  const move = (e: React.PointerEvent) => {
    const g = d.current
    if (!g) return
    // A phase picked up to move takes over the finger: put the tray back.
    if (env.moving) { d.current = null; if (g.on) { reset(); if (track.current) track.current.style.transform = tf(i) } return }
    const dx = e.clientX - g.x, dy = e.clientY - g.y
    if (!g.on) {
      if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) { d.current = null; return }
      if (Math.abs(dx) < 10) return
      g.on = true
      const on = track.current?.children[i] as HTMLElement | undefined
      if (tray.current && on) tray.current.style.height = `${on.offsetHeight}px`
      tray.current?.setPointerCapture(g.id)
      setDragging(true)
    }
    const to = i + (dx < 0 ? 1 : -1), there = to >= 0 && to < n
    g.dx = there ? dx : dx / 4
    if (track.current) { track.current.style.transition = 'none'; track.current.style.transform = tf(i, g.dx) }
    if (label.current) label.current.textContent = there ? `Swap in ${panes[to].phase.title}` : 'Nothing that way'
  }
  const up = () => {
    const g = d.current
    d.current = null
    if (!g?.on) return
    const stop = (ev: MouseEvent) => { ev.stopPropagation(); ev.preventDefault() }
    window.addEventListener('click', stop, { capture: true, once: true })
    setTimeout(() => window.removeEventListener('click', stop, { capture: true }), 50)
    reset()
    const j = i + (g.dx < 0 ? 1 : -1)
    const to = Math.abs(g.dx) > g.w * 0.22 && j >= 0 && j < n ? j : i
    if (track.current) track.current.style.transform = tf(to)
    if (to !== i) onIndex(to)
  }
  return <div ref={tray} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} className="relative touch-pan-y overflow-hidden" {...marks}>
    <span ref={label} aria-hidden="true" className={cn('pointer-events-none absolute left-1/2 top-2 z-20 -translate-x-1/2 rounded-full bg-foreground px-3 py-1 text-xs font-extrabold text-background transition-opacity', dragging ? 'opacity-100' : 'opacity-0')} />
    <div ref={track} className="flex items-start transition-transform duration-300 ease-out" style={{ transform: tf(i) }}>
      {panes.map((pane, j) => <div key={pane.id} aria-hidden={j !== i || undefined}
        className={cn('w-full min-w-0 shrink-0', j !== i && !dragging && 'invisible h-0 overflow-hidden')}>{pane.node}</div>)}
    </div>
  </div>
}

/** Put a split's options in order: the first is the one you'd pick. */
export function RankSheet({ options, onSave, onClose }: { options: Phase[]; onSave: (order: string[]) => void; onClose: () => void }) {
  const [order, setOrder] = React.useState(options)
  const swap = (a: number, b: number) => setOrder((o) => { const n = [...o];[n[a], n[b]] = [n[b], n[a]]; return n })
  return <div className="fixed inset-0 flex items-end justify-center sm:items-center sm:p-6" style={{ zIndex: 'var(--z-modal)' }}>
    <button type="button" aria-label="Close" className="absolute inset-0 cursor-default bg-black/45" onClick={onClose} />
    <div role="dialog" aria-modal="true" aria-labelledby="rank-title" className="relative grid w-full gap-3 rounded-t-[28px] bg-card p-5 pb-[max(18px,env(safe-area-inset-bottom))] shadow-2xl sm:max-w-[420px] sm:rounded-[28px]">
      <div><h3 id="rank-title" className="text-xl font-extrabold">Rank your options</h3><p className="text-sm text-muted-foreground">Your first choice goes first. It shows first on your map.</p></div>
      <ol className="grid gap-2">{order.map((q, j) => <li key={q.id} className="flex items-center gap-2 rounded-2xl bg-muted px-3 py-2">
        <b className="w-5 text-center text-muted-foreground">{j + 1}</b><span className="min-w-0 flex-1 truncate font-extrabold">{q.title}</span>
        <button type="button" disabled={!j} onClick={() => swap(j, j - 1)} aria-label={`Move ${q.title} up`} className="grid size-9 place-items-center rounded-full hover:bg-card disabled:opacity-30"><ArrowUp size={16} aria-hidden="true" /></button>
        <button type="button" disabled={j === order.length - 1} onClick={() => swap(j, j + 1)} aria-label={`Move ${q.title} down`} className="grid size-9 place-items-center rounded-full hover:bg-card disabled:opacity-30"><ArrowDown size={16} aria-hidden="true" /></button>
      </li>)}</ol>
      <div className="flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="brand" onClick={() => onSave(order.map((q) => q.id))}>Save</Button></div>
    </div>
  </div>
}
