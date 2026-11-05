'use client'
/* eslint-disable no-unused-vars -- parameter names in function types */

import React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, CalendarDays, Check, ChevronRight, Compass, MoreHorizontal, Plus, Scale } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@components/ui/button'
import { getUriWithOrg, routePaths } from '@services/config/config'
import type { LifeDoc, Phase, PlacePhoto } from '@services/life/life'
import useLifeNumbers from '@components/LifePlan/useLifeNumbers'
import { money, project } from '@components/LifePlan/model'
import PhaseCover from './PhaseCover'
import {
  addAfter, addBefore, addBetween, byId, canJoin, current, endOf, isReal, join, kids, mi, monthText, normalize, remove, routeDoc, routeName, routes, split,
  thisMonthIndex, whenOf,
} from './graph'

type Change = (fn: (next: LifeDoc) => void) => Promise<LifeDoc | null>
type Adding = { mode: 'after' | 'before' | 'branch' | 'between'; from: string; to?: string; name: string }

const LEAF = 300, GAP = 48, MINW = 240, LEFT = 70, LH = 180, TOP = 30, BH = 152

/**
 * Where everything sits: time runs left to right at true scale, squeezed so a short phase is never
 * narrower than a tap target. Each branch gets its own row.
 */
function layout(doc: LifeDoc, width: number) {
  const lane: Record<string, number> = {}
  let next = 0
  const put = (p: Phase, l: number) => { lane[p.id] = l; kids(doc, p.id).forEach((c, i) => { if (lane[c.id] == null) put(c, i === 0 ? l : ++next) }) }
  doc.phases.filter((p) => !p.after?.length).forEach((r, i) => { if (lane[r.id] == null) put(r, i === 0 ? 0 : ++next) })
  const marks = [...new Set(doc.phases.map((p) => mi(p.starts!)))].sort((a, b) => a - b)
  const avail = Math.max(320, width)
  const span = Math.max(1, marks[marks.length - 1] - marks[0])
  const ppm = Math.max(7, (avail - LEFT - LEAF - 70) / span)
  const xs = [LEFT]
  for (let i = 1; i < marks.length; i++) xs.push(xs[i - 1] + Math.max(MINW + GAP, (marks[i] - marks[i - 1]) * ppm))
  // Time inside a bar lands on the bar; the gap between bars is the moment one ends and the next starts.
  const X = (m: number) => {
    const i = marks.indexOf(m)
    if (i >= 0) return xs[i]
    const j = marks.findIndex((v) => v > m)
    if (j < 0) return xs[xs.length - 1] + (m - marks[marks.length - 1]) * ppm
    if (j === 0) return xs[0] - (marks[0] - m) * ppm
    return xs[j - 1] + (xs[j] - GAP - xs[j - 1]) * (m - marks[j - 1]) / (marks[j] - marks[j - 1])
  }
  const unX = (x: number) => {
    if (x <= xs[0]) return marks[0]
    for (let j = 1; j < xs.length; j++) if (x <= xs[j]) return Math.round(marks[j - 1] + (marks[j] - marks[j - 1]) * Math.min(1, (x - xs[j - 1]) / (xs[j] - GAP - xs[j - 1])))
    return Math.round(marks[marks.length - 1] + (x - xs[xs.length - 1]) / ppm)
  }
  const box = (p: Phase) => { const x = X(mi(p.starts!)), leaf = !kids(doc, p.id).length; return { x, w: leaf ? LEAF : Math.max(MINW, X(endOf(doc, p)) - x - GAP) } }
  const lanes = Math.max(0, ...Object.values(lane)) + 1
  return { lane, X, unX, box, lanes, W: Math.max(avail, xs[xs.length - 1] + LEAF + 70), H: TOP + lanes * LH + 30 }
}

const lengthText = (months: number) => months < 12 ? `${months} month${months === 1 ? '' : 's'}` : `${Math.floor(months / 12)} yr${months % 12 ? ` ${months % 12} mo` : ''}`

/** The plan as a map you build on: phases and pluses, nothing else. */
export default function PlanMap({ doc: raw, orgslug, token, photos, change, focus, title, actions }: { doc: LifeDoc; orgslug: string; token?: string; photos?: Record<string, PlacePhoto>; change: Change; focus?: string | null; title?: React.ReactNode; actions?: React.ReactNode }) {
  const router = useRouter()
  const doc = React.useMemo(() => normalize(raw), [raw])
  const wrap = React.useRef<HTMLDivElement>(null)
  const [width, setWidth] = React.useState(900)
  const [sel, setSel] = React.useState<string | null>(focus || null)
  const [adding, setAdding] = React.useState<Adding | null>(null)
  const [confirmRm, setConfirmRm] = React.useState<string | null>(null)
  const [renaming, setRenaming] = React.useState<{ id: string; title: string } | null>(null)
  const [picking, setPicking] = React.useState(false)
  const [at, setAt] = React.useState(() => thisMonthIndex() + 60)
  const [comparing, setComparing] = React.useState(false)
  const [drag, setDrag] = React.useState<{ id: string; dx: number; dy: number; over: string | null } | null>(null)
  const dragFrom = React.useRef<{ id: string; x: number; y: number; moved: boolean } | null>(null)

  React.useLayoutEffect(() => {
    const el = wrap.current?.parentElement
    if (!el) return
    const ro = new ResizeObserver(() => setWidth(el.clientWidth))
    ro.observe(el); setWidth(el.clientWidth)
    return () => ro.disconnect()
  }, [comparing])

  const L = React.useMemo(() => layout(doc, width), [doc, width])
  const now = current(doc)
  const focusId = sel || now?.id
  const open = (id: string) => router.push(getUriWithOrg(orgslug, routePaths.org.phase(id)))

  // Open centered on the phase in focus.
  const scrolled = React.useRef(false)
  React.useLayoutEffect(() => {
    const el = wrap.current
    if (!el || scrolled.current) return
    const p = byId(doc, focus || now?.id)
    if (!p) return
    const b = L.box(p)
    el.scrollLeft = Math.max(0, b.x + Math.min(b.w, 200) / 2 - el.clientWidth / 2)
    scrolled.current = true
  }, [L, doc, focus, now])

  /** Change the map and keep the result: `op` gets the plan as a map and returns the new one. */
  const apply = async (op: (d: LifeDoc) => LifeDoc) => { await change((next) => { Object.assign(next, op(normalize(next))) }) }

  const submitAdd = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!adding) return
    const x = { title: adding.name.trim() || 'New phase' }
    let id = ''
    await apply((d) => {
      const r = adding.mode === 'before' ? addBefore(d, adding.from, x) : adding.mode === 'between' && adding.to ? addBetween(d, adding.from, adding.to, x) : addAfter(d, adding.from, x)
      id = r.id
      return r.doc
    })
    setAdding(null); setSel(id || null)
  }

  // Drag the plus after an end phase onto a later phase: that way now joins up with it.
  const barAt = (x: number, y: number) => (document.elementsFromPoint(x, y).map((n) => (n as HTMLElement).closest?.('[data-phase]')).find(Boolean) as HTMLElement | undefined)?.dataset.phase || null
  const onPointerDown = (event: React.PointerEvent, id: string) => { dragFrom.current = { id, x: event.clientX, y: event.clientY, moved: false } }
  React.useEffect(() => {
    const move = (event: PointerEvent) => {
      const d = dragFrom.current
      if (!d) return
      const dx = event.clientX - d.x, dy = event.clientY - d.y
      if (!d.moved && Math.hypot(dx, dy) < 8) return
      d.moved = true
      setDrag({ id: d.id, dx, dy, over: barAt(event.clientX, event.clientY) })
    }
    const up = (event: PointerEvent) => {
      const d = dragFrom.current
      dragFrom.current = null
      if (!d?.moved) return
      setDrag(null)
      const over = barAt(event.clientX, event.clientY)
      if (over && canJoin(doc, d.id, over)) { void apply((m) => join(m, d.id, over)); setSel(over) }
      // The click that follows a drag must not add a phase.
      const stop = (e: MouseEvent) => { e.stopPropagation(); e.preventDefault() }
      window.addEventListener('click', stop, { capture: true, once: true })
      setTimeout(() => window.removeEventListener('click', stop, { capture: true }), 50)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up) }
  })

  if (comparing) return <PlanCompare doc={doc} at={at} orgslug={orgslug} token={token} onBack={() => setComparing(false)} />

  const yOf = (p: Phase) => TOP + L.lane[p.id] * LH
  const all = routes(doc)
  const bars: React.ReactNode[] = [], plus: React.ReactNode[] = [], links: React.ReactNode[] = []
  for (const p of doc.phases) {
    const { x, w } = L.box(p), y = yOf(p), wh = whenOf(doc, p), leaf = !kids(doc, p.id).length
    const over = drag?.over === p.id
    bars.push(<React.Fragment key={p.id}>
      <button type="button" data-phase={p.id} onClick={() => open(p.id)} title={`${p.title} · from ${monthText(p.starts!)}`}
        style={{ left: x, top: y, width: w, height: BH }}
        className={cn('absolute isolate flex flex-col justify-end overflow-hidden rounded-[26px] text-left text-white shadow-[0_18px_34px_-20px_rgb(0_0_0/0.7)] transition-transform hover:-translate-y-0.5',
          wh === 'done' && !sel && 'opacity-80',
          sel === p.id && 'outline outline-[3px] outline-offset-2 outline-foreground',
          over && (canJoin(doc, drag!.id, p.id) ? 'outline outline-[3px] outline-offset-2 outline-[var(--go,#1f9d5a)]' : 'outline-dashed outline-[3px] outline-offset-2 outline-destructive'))}>
        <PhaseCover phase={p} photos={photos} past={wh === 'done'} className={cn('absolute inset-0 -z-20 h-full w-full', p.idea && 'saturate-[.35]')} />
        <span className="absolute inset-0 -z-10 bg-[linear-gradient(180deg,transparent_25%,rgb(8_20_30/0.78))]" aria-hidden="true" />
        {p.idea ? <span className="pointer-events-none absolute inset-0 z-10 rounded-[26px] border-[3px] border-dashed border-white/85" aria-hidden="true" /> : null}
        {wh === 'now' ? <span className="absolute left-3 top-3 rounded-full bg-[var(--org-primary-color)] px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-[0.06em] text-[var(--org-on-primary-color,#fff)]">You’re here</span> : null}
        <span className="grid min-w-0 gap-0.5 px-4 pb-3.5">
          <b className="truncate text-[clamp(18px,2.2vw,24px)] font-extrabold leading-tight tracking-tight">{p.title}</b>
          <small className="truncate text-[12.5px] font-bold opacity-90">{monthText(p.starts!)}{p.place_label ? ` · ${p.place_label.split(',')[0]}` : ''}{p.idea ? ' · idea' : ''}</small>
        </span>
      </button>
      <button type="button" onClick={() => { setSel(sel === p.id ? null : p.id); setAdding(null); setConfirmRm(null); setRenaming(null) }}
        aria-label={`More for ${p.title}`} title="Details, rename, remove, join up" aria-pressed={sel === p.id}
        style={{ left: x + w - 42, top: y + 10 }}
        className={cn('absolute z-[3] grid size-8 place-items-center rounded-full text-white backdrop-blur', sel === p.id ? 'bg-foreground text-background' : 'bg-black/40 hover:bg-foreground hover:text-background')}>
        <MoreHorizontal size={16} aria-hidden="true" />
      </button>
    </React.Fragment>)
    for (const pid of p.after || []) {
      const pp = byId(doc, pid)
      if (!pp) continue
      const a = L.box(pp), same = yOf(pp) === y, y0 = yOf(pp) + BH / 2, y1 = y + BH / 2, x0 = a.x + a.w
      links.push(<path key={`${pid}-${p.id}`} d={same ? `M${x0} ${y0} H${x}` : `M${x0} ${y0} C ${x0 + 22} ${y0}, ${x - 22} ${y1}, ${x} ${y1}`} fill="none" stroke="hsl(var(--border))" strokeWidth={4} strokeLinecap="round" strokeDasharray={p.idea ? '8 8' : undefined} />)
      // A small plus on a link adds a phase in between: only around the phase in focus, so the map stays clean.
      if (mi(p.starts!) > thisMonthIndex() && (p.id === focusId || pid === focusId)) {
        const mx = same ? (x0 + x) / 2 : x - 9
        plus.push(<MiniPlus key={`in-${pid}-${p.id}`} x={mx - 11} y={y1 - 11} label={`Add a phase between ${pp.title} and ${p.title}`} onClick={() => { setAdding({ mode: 'between', from: pid, to: p.id, name: '' }); setSel(null) }} />)
      }
    }
    if (leaf) plus.push(<button key={`after-${p.id}`} type="button" onPointerDown={(e) => onPointerDown(e, p.id)} onClick={() => { setAdding({ mode: 'after', from: p.id, name: '' }); setSel(null) }}
      aria-label={`Add a phase after ${p.title}. Drag onto a later phase to join up with it.`} title="Add after, or drag onto a later phase to join it"
      style={{ left: x + w + 14, top: y + BH / 2 - 22, transform: drag?.id === p.id ? `translate(${drag.dx}px, ${drag.dy}px)` : undefined, touchAction: 'none' }}
      className={cn('absolute z-[4] grid size-11 cursor-grab place-items-center rounded-full bg-card text-foreground shadow-[0_0_0_2px_hsl(var(--border)),0_4px_0_hsl(var(--border))] hover:text-[var(--org-primary-color)]', drag?.id === p.id && 'z-50 cursor-grabbing')}>
      <Plus size={18} aria-hidden="true" />
    </button>)
    if (!p.after?.length) plus.push(<button key={`before-${p.id}`} type="button" onClick={() => { setAdding({ mode: 'before', from: p.id, name: '' }); setSel(null) }} aria-label="Add an earlier phase" title="Add an earlier phase"
      style={{ left: x - 58, top: y + BH / 2 - 22 }} className="absolute z-[4] grid size-11 place-items-center rounded-full bg-card text-foreground opacity-60 shadow-[0_0_0_2px_hsl(var(--border)),0_4px_0_hsl(var(--border))] hover:opacity-100">
      <Plus size={18} aria-hidden="true" />
    </button>)
    // Under the end of a phase that already leads somewhere: another option after it.
    if (!leaf && p.id === focusId && (!now || mi(p.starts!) >= mi(now.starts!))) {
      const bx = x + w + 6, by = y + BH + 4
      links.push(<path key={`br-${p.id}`} d={`M${x + w} ${y + BH / 2} C ${x + w + 14} ${y + BH / 2}, ${bx + 6} ${by - 4}, ${bx + 11} ${by + 1}`} fill="none" stroke="hsl(var(--border))" strokeWidth={2} strokeDasharray="6 6" />)
      plus.push(<MiniPlus key={`br-${p.id}`} x={bx} y={by} label={`Add another option after ${p.title}`} onClick={() => { setAdding({ mode: 'after', from: p.id, name: '' }); setSel(null) }} />)
    }
  }

  const pickAt = (event: React.MouseEvent) => {
    const r = (event.currentTarget as HTMLElement).getBoundingClientRect()
    setAt(Math.max(thisMonthIndex(), L.unX(event.clientX - r.left)))
  }
  const years = Array.from({ length: 25 }, (_, i) => new Date().getFullYear() + i)
  const selPhase = sel ? byId(doc, sel) : undefined

  return <div className="flex flex-col gap-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      {picking ? <div className="flex w-full flex-wrap items-center gap-x-3 gap-y-2 font-bold">
        <b className="inline-flex items-center gap-1.5 font-extrabold"><CalendarDays size={16} aria-hidden="true" />Tap the map</b> at the moment to compare, or pick it:
        <span className="inline-flex gap-1.5">
          <select aria-label="Month" className="h-9 rounded-xl bg-muted px-2 font-bold" value={at % 12} onChange={(e) => setAt(Math.floor(at / 12) * 12 + Number(e.target.value))}>{Array.from({ length: 12 }, (_, i) => <option key={i} value={i}>{monthText(2000 * 12 + i).slice(0, 3)}</option>)}</select>
          <select aria-label="Year" className="h-9 rounded-xl bg-muted px-2 font-bold" value={Math.floor(at / 12)} onChange={(e) => setAt(Number(e.target.value) * 12 + (at % 12))}>{years.map((y) => <option key={y} value={y}>{y}</option>)}</select>
        </span>
        <span className="inline-flex gap-1.5"><Button size="sm" variant="brand" onClick={() => { setPicking(false); setComparing(true) }}>Compare {monthText(at)}</Button><Button size="sm" variant="ghost" onClick={() => setPicking(false)}>Cancel</Button></span>
      </div> : <>
        {title || <span />}
        <span className="flex flex-wrap items-center gap-2">
          {all.length > 1 ? <Button size="sm" variant="surface" onClick={() => { setPicking(true); setSel(null); setAdding(null) }}><Scale size={16} aria-hidden="true" />Compare</Button> : null}
          {actions}
        </span>
      </>}
    </div>

    <div ref={wrap} className="-mx-4 overflow-x-auto px-4 [scrollbar-width:thin] sm:-mx-6 sm:px-6">
      <div className={cn('relative', picking && 'cursor-crosshair')} style={{ width: L.W, height: L.H }} onClick={picking ? pickAt : undefined}>
        <div className="pointer-events-none absolute inset-y-0 border-l-2 border-dashed border-[var(--org-primary-color)] opacity-70" style={{ left: L.X(thisMonthIndex()) }}>
          <span className="absolute left-1.5 top-0 whitespace-nowrap text-[11px] font-extrabold uppercase tracking-[0.06em] text-[var(--org-primary-color)]">Today</span>
        </div>
        {picking ? <div className="pointer-events-none absolute inset-y-0 z-[6] border-l-[2.5px] border-dashed border-foreground" style={{ left: L.X(at) }}>
          <span className="absolute left-1.5 top-1 whitespace-nowrap rounded-lg bg-foreground px-2 py-0.5 text-xs font-extrabold text-background">{monthText(at)}</span>
        </div> : null}
        <svg width={L.W} height={L.H} className="pointer-events-none absolute left-0 top-0" aria-hidden="true">{links}</svg>
        <div className={cn(picking && 'pointer-events-none opacity-70')}>{bars}{plus}</div>
      </div>
    </div>

    {adding || selPhase ? <div className="fixed inset-0 z-40 bg-black/30" aria-hidden="true" onClick={() => { setAdding(null); setSel(null); setConfirmRm(null); setRenaming(null) }} /> : null}
    {adding ? <AddCard doc={doc} adding={adding} setAdding={setAdding} onSubmit={submitAdd} orgslug={orgslug} /> : selPhase ? <DetailCard
      doc={doc} phase={selPhase} photos={photos} all={all} confirmRm={confirmRm === selPhase.id} renaming={renaming?.id === selPhase.id ? renaming.title : null}
      onOpen={() => open(selPhase.id)}
      onRename={(title) => setRenaming(title == null ? null : { id: selPhase.id, title })}
      onRenameDone={async () => { const t = renaming?.title.trim(); setRenaming(null); if (t) await apply((d) => { byId(d, selPhase.id)!.title = t; return d }) }}
      onKeep={() => apply((d) => { byId(d, selPhase.id)!.idea = false; return d })}
      onRemove={async (sure) => { if (!selPhase.idea && !sure) { setConfirmRm(selPhase.id); return } setConfirmRm(null); setSel(null); await apply((d) => remove(d, selPhase.id)) }}
      onNoRemove={() => setConfirmRm(null)}
      onSplit={async (fromId) => { let id = ''; await apply((d) => { const r = split(d, selPhase.id, fromId); id = r.id; return r.doc }); setSel(id || null) }}
      onJoin={async (toId) => { await apply((d) => join(d, selPhase.id, toId)); setSel(toId) }}
    /> : null}
  </div>
}

/** Add and details float over the map, so nothing sits under it. */
const SHEET = 'fixed inset-x-3 bottom-3 z-50 mx-auto max-w-[580px] rounded-[24px] bg-card shadow-[0_0_0_1px_hsl(var(--border)),0_24px_60px_-20px_rgb(0_0_0/0.6)] sm:bottom-6'

function MiniPlus({ x, y, label, onClick }: { x: number; y: number; label: string; onClick: () => void }) {
  return <button type="button" onClick={onClick} aria-label={label} title={label} style={{ left: x, top: y }}
    className="absolute z-[4] grid size-[24px] place-items-center rounded-full bg-card text-muted-foreground shadow-[0_0_0_2px_hsl(var(--border))] before:absolute before:-inset-[11px] hover:text-[var(--org-primary-color)] hover:shadow-[0_0_0_2px_var(--org-primary-color)]">
    <Plus size={12} aria-hidden="true" />
  </button>
}

function AddCard({ doc, adding, setAdding, onSubmit, orgslug }: { doc: LifeDoc; adding: Adding; setAdding: (a: Adding | null) => void; onSubmit: (e: React.FormEvent) => void; orgslug: string }) {
   
  const from = byId(doc, adding.from)!
  const label = adding.mode === 'before' ? `Before ${from.title}` : adding.mode === 'between' ? `Between ${from.title} and ${byId(doc, adding.to)?.title}` : kids(doc, from.id).length ? `Another option after ${from.title}` : `After ${from.title}`
  return <form onSubmit={onSubmit} className={cn(SHEET, 'grid gap-2.5 p-4')}>
    <span className="text-xs font-extrabold uppercase tracking-[0.08em] text-muted-foreground">{label}</span>
    { }
    <input autoFocus aria-label="Phase name" value={adding.name} onChange={(e) => setAdding({ ...adding, name: e.target.value })}
      placeholder={adding.mode === 'before' ? 'Elementary school, moved to Eugene…' : 'Gap year, trade school, move to Portland…'}
      className="h-12 rounded-2xl bg-muted px-3 text-base font-bold outline-none focus:ring-2 focus:ring-[var(--org-primary-color)]" />
    <div className="flex flex-wrap items-center justify-between gap-2">
      {adding.mode === 'before' ? <span /> : <Link href={getUriWithOrg(orgslug, `/discover/careers?after=${encodeURIComponent(from.id)}`)} className="inline-flex items-center gap-1.5 text-sm font-bold text-[var(--org-primary-color)]"><Compass size={15} aria-hidden="true" />Start from a career instead</Link>}
      <span className="flex gap-1.5"><Button type="button" size="sm" variant="ghost" onClick={() => setAdding(null)}>Cancel</Button><Button type="submit" size="sm" variant="brand">Add</Button></span>
    </div>
  </form>
}

function DetailCard(props: {
  doc: LifeDoc; phase: Phase; photos?: Record<string, PlacePhoto>; all: Phase[][]; confirmRm: boolean; renaming: string | null
  onOpen: () => void; onRename: (title: string | null) => void; onRenameDone: () => void; onKeep: () => void; onRemove: (sure?: boolean) => void; onNoRemove: () => void
  onSplit: (fromId: string) => void; onJoin: (toId: string) => void
}) {
   
  const { doc, phase: p, photos } = props
  const wh = whenOf(doc, p)
  const leaf = !kids(doc, p.id).length
  const len = leaf ? null : endOf(doc, p) - mi(p.starts!)
  const joinTo = leaf ? doc.phases.filter((x) => canJoin(doc, p.id, x.id)) : []
  const fixed = wh === 'now' || wh === 'done'
  const act = p.activities?.[0]
  const what = act ? (act.career_title || act.school || act.field || act.employer || '') : ''
  return <div role="dialog" aria-label={p.title} className={cn(SHEET, 'grid overflow-hidden sm:grid-cols-[150px_minmax(0,1fr)]')}>
    <div className="relative h-24 sm:h-auto"><PhaseCover phase={p} photos={photos} className="absolute inset-0 h-full w-full" /></div>
    <div className="grid gap-2.5 p-4">
      <div>
        <span className="text-xs font-extrabold uppercase tracking-[0.08em] text-muted-foreground">{p.idea ? 'Idea · ' : ''}{{ now: 'You are here', done: 'Before now', next: 'Up next', later: 'Later' }[wh]}</span>
        {props.renaming != null
           
          ? <input autoFocus aria-label="Name" value={props.renaming} onChange={(e) => props.onRename(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') props.onRenameDone() }} className="mt-1 h-11 w-full rounded-xl bg-muted px-3 text-xl font-extrabold outline-none" />
          : <h3 className="text-[22px] font-extrabold tracking-tight">{p.title}</h3>}
        <p className="text-sm text-muted-foreground">{monthText(p.starts!)} · {len == null ? 'no end yet' : lengthText(len)}{p.place_label ? ` · ${p.place_label}` : ''}{what ? ` · ${what}` : ''}</p>
      </div>
      {(p.after?.length || 0) > 1 ? <p className="text-sm text-muted-foreground">{p.after!.length} ways lead here: {p.after!.map((id) => byId(doc, id)?.title).join(' and ')}.</p> : null}
      {!p.lines.length && !p.activities?.length ? <p className="text-sm text-muted-foreground">Just a name so far. Open it to add where, what you’d do and a budget.</p> : null}
      {props.confirmRm ? <div className="flex flex-wrap items-center gap-2 rounded-xl bg-amber-100 px-3 py-2 text-sm font-bold text-amber-900 dark:bg-amber-500/15 dark:text-amber-200">
        Remove {p.title}? Its budget goes too, and its goals go back to the phase you’re in.
        <Button size="sm" variant="destructive" onClick={() => props.onRemove(true)}>Remove</Button><Button size="sm" variant="ghost" onClick={props.onNoRemove}>Keep</Button>
      </div> : null}
      <div className="flex flex-wrap items-center gap-1.5">
        <Button size="sm" variant="brand" onClick={props.onOpen}>Open<ChevronRight size={14} aria-hidden="true" /></Button>
        {props.renaming != null ? <Button size="sm" variant="surface" onClick={props.onRenameDone}>Done</Button> : <Button size="sm" variant="surface" onClick={() => props.onRename(p.title)}>Rename</Button>}
        {p.idea ? <Button size="sm" variant="surface" onClick={props.onKeep}><Check size={13} aria-hidden="true" />Make it real</Button> : null}
        {(p.after?.length || 0) > 1 ? p.after!.map((id) => <Button key={id} size="sm" variant="surface" onClick={() => props.onSplit(id)}>Split off the {byId(doc, id)?.title} way</Button>) : null}
        {joinTo.length ? <label className="inline-flex h-8 items-center gap-1.5 rounded-xl bg-muted px-2.5 text-sm font-bold">Joins up with
          <select aria-label="Joins up with" className="max-w-40 bg-transparent font-bold" value="" onChange={(e) => { if (e.target.value) props.onJoin(e.target.value) }}>
            <option value="">…</option>{joinTo.map((x) => <option key={x.id} value={x.id}>{x.title}</option>)}
          </select></label> : null}
        {fixed ? null : <Button size="sm" variant="ghost" onClick={() => props.onRemove()}>Remove</Button>}
      </div>
    </div>
  </div>
}

/** Every way through the map at one moment, side by side: where you'd be and what the money looks like. */
function PlanCompare({ doc, at, orgslug, token, onBack }: { doc: LifeDoc; at: number; orgslug: string; token?: string; onBack: () => void }) {
  const { valueOf } = useLifeNumbers(doc, token)
  const all = routes(doc)
  const cols = all.map((r) => {
    let ph: Phase | null = null
    for (const p of r) if (mi(p.starts!) <= at) ph = p
    if (!ph) return null
    const rd = routeDoc(doc, r[r.length - 1].id)
    const proj = project(rd, valueOf)
    const g = Math.min(proj.months, Math.max(0, at - mi(rd.start)))
    const g0 = Math.min(proj.months, Math.max(0, thisMonthIndex() - mi(rd.start)))
    const net = (proj.inn[g] ?? 0) - (proj.out[g] ?? 0)
    const worth = (proj.sav[g] ?? 0) + (proj.own[g] ?? 0) - (proj.debt[g] ?? 0) - ((proj.sav[g0] ?? 0) + (proj.own[g0] ?? 0) - (proj.debt[g0] ?? 0))
    return { r, ph, net, worth, real: isReal(doc, ph) }
  }).filter(Boolean) as { r: Phase[]; ph: Phase; net: number; worth: number; real: boolean }[]
  const seen = new Set<string>()
  const row = (label: string, f: (c: typeof cols[number]) => React.ReactNode) => <tr className="border-t border-border"><th scope="row" className="py-3 pr-3 text-left text-xs font-extrabold uppercase tracking-[0.06em] text-muted-foreground">{label}</th>{cols.map((c, i) => <td key={i} className="py-3 pr-4 align-top">{f(c)}</td>)}</tr>
  return <div className="flex flex-col gap-4">
    <button type="button" onClick={onBack} className="inline-flex w-fit items-center gap-1.5 text-sm font-bold text-muted-foreground hover:text-foreground"><ArrowLeft size={16} aria-hidden="true" />Map</button>
    <div><p className="text-xs font-extrabold uppercase tracking-[0.08em] text-muted-foreground">Compare</p><h2 className="text-3xl font-extrabold tracking-tight">{monthText(at)}</h2><p className="text-muted-foreground">Where each way through your map has you at that moment.</p></div>
    <div className="overflow-x-auto rounded-[22px] bg-card p-4 shadow-[0_0_0_2px_hsl(var(--border))]">
      <table className="w-full min-w-[520px] text-sm">
        <thead><tr><th />{cols.map((c, i) => <th key={i} scope="col" className="pb-2 pr-4 text-left text-base font-extrabold">{routeName(c.r, all)}</th>)}</tr></thead>
        <tbody>
          {row('You’d be', (c) => <><b className="font-extrabold">{c.ph.title}</b>{c.ph.idea ? <span className="text-muted-foreground"> · idea</span> : null}<br /><small className="text-muted-foreground">since {monthText(c.ph.starts!)}</small></>)}
          {row('Where', (c) => c.ph.place_label || '—')}
          {row('Left a month', (c) => c.ph.lines.length ? <b className={c.net >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive'}>{money(c.net, { sign: true })}</b> : <span className="text-muted-foreground">No budget yet</span>)}
          {row('Saved up by then', (c) => <><b>{money(c.worth, { sign: true })}</b><br /><small className="text-muted-foreground">from today, after tax</small></>)}
          {row('', (c) => seen.has(c.ph.id) ? null : (seen.add(c.ph.id), <Button size="sm" variant="surface" asChild><Link href={getUriWithOrg(orgslug, routePaths.org.phase(c.ph.id))}>Open {c.ph.title}</Link></Button>))}
        </tbody>
      </table>
    </div>
    <p className="text-sm text-muted-foreground">Each phase’s budget starts from sourced estimates (BLS pay, HUD rent) and your own numbers. A phase with no budget yet counts as nothing in or out.</p>
  </div>
}

