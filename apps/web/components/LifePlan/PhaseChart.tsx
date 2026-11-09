'use client'

import React from 'react'
import { Maximize2, Minus, Plus } from 'lucide-react'
import { Button } from '@components/ui/button'
import { Dialog, DialogContent, DialogTitle } from '@components/ui/dialog'
import { useLife } from './LifeContext'
import { LifeIcon } from './icons'
import { monthIndex, monthLabel, phaseOffset, short } from './model'
import { MarkCard, MarkDot, markLabel, marksBetween } from './ChartEvents'

import { tr } from '@/lib/tr'
const SAVE = '#10B981', OWN = '#7A5BD0', DEBT = 'hsl(var(--foreground))'

function nice(v: number) {
  if (v <= 1000) return 1000
  const p = Math.pow(10, Math.floor(Math.log10(v))), f = v / p
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p
}

/** Fills that fade from each line down to nothing. */
function Fills() {
  return (
    <defs>
      {([['save', SAVE, 0.32], ['own', OWN, 0.32], ['debt', DEBT, 0.16]] as const).map(([k, c, o]) => (
        <linearGradient key={k} id={`fill-${k}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" style={{ stopColor: c, stopOpacity: o }} /><stop offset="100%" style={{ stopColor: c, stopOpacity: 0.02 }} /></linearGradient>
      ))}
    </defs>
  )
}

function Legend({ own }: { own: boolean }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs font-semibold text-muted-foreground">
      <span className="inline-flex items-center gap-1.5"><i className="inline-block h-2 w-3.5 rounded-full" style={{ background: SAVE }} />{tr('budget.chart_events.savings', 'Savings')}</span>
      {own && <span className="inline-flex items-center gap-1.5"><i className="inline-block h-2 w-3.5 rounded-full" style={{ background: OWN }} />{tr('budget.chart_events.things_you_own', 'Things you own')}</span>}
      <span className="inline-flex items-center gap-1.5"><i className="inline-block h-2 w-3.5 rounded-full" style={{ background: DEBT }} />{tr('budget.chart_events.debt', 'Debt')}</span>
    </div>
  )
}

/** The phase's savings, things owned (stacked on savings) and debt, with its stretches to pick. */
export default function PhaseChart() {
  const { doc, phase, stretch, stretchesOf, selectStretch, projection } = useLife()
  const [hover, setHover] = React.useState<number | null>(null)
  const [big, setBig] = React.useState(false)
  const [pick, setPick] = React.useState<number | null>(null)
  const plot = React.useRef<HTMLDivElement>(null)
  const pop = React.useRef<HTMLDivElement>(null)
  React.useEffect(() => { setPick(null) }, [phase.id])
  React.useEffect(() => {
    if (pick === null) return
    const away = (e: PointerEvent) => { if (pop.current && !pop.current.contains(e.target as Node) && !(e.target as HTMLElement).closest?.('[data-mark]')) setPick(null) }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setPick(null) }
    document.addEventListener('pointerdown', away); document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('pointerdown', away); document.removeEventListener('keydown', esc) }
  }, [pick])
  const off = phaseOffset(doc, phase.id), M = Math.max(1, phase.months)
  const sav = projection.sav.slice(off, off + M + 1), own = projection.own.slice(off, off + M + 1), debt = projection.debt.slice(off, off + M + 1)
  const stack = sav.map((v, i) => v + own[i]), hasOwn = own.some((v) => v > 1)
  const marks = stretchesOf.length > 1
  const H = marks ? 132 : 104, top = marks ? 36 : 10, bot = H - 4
  const hi = Math.max(1000, ...stack, ...debt) * 1.08
  const X = (m: number) => (m / M) * 100, Y = (v: number) => top + (1 - Math.max(0, v) / hi) * (bot - top)
  const pts = (a: number[]) => a.map((v, m) => `${X(m).toFixed(3)},${Y(v).toFixed(1)}`).join(' ')
  const area = (up: number[], dn: number[]) => `${pts(up)} ${dn.map((v, m) => `${X(m).toFixed(3)},${Y(v).toFixed(1)}`).reverse().join(' ')}`
  const zero = sav.map(() => 0)
  // Things that make the lines jump, as dots on the savings line.
  const dots = marksBetween(projection.marks, off, off + M - 1).map(([g, ms]) => {
    const m = g - off
    return { g, ms, x: X(m + 0.5), y: Y((stack[m] + stack[Math.min(M, m + 1)]) / 2) }
  })
  const picked = dots.find((d) => d.g === pick) || null
  // Start and end values beside the lines, nudged apart when they'd overlap.
  const showDebt = debt[0] > 0.5 || debt[M] > 0.5
  const ends = (i: number) => {
    let a = Y(stack[i]), b = Y(debt[i])
    if (showDebt && Math.abs(a - b) < 14) { const mid = (a + b) / 2, up = stack[i] >= debt[i] ? -1 : 1; a = mid + up * 7; b = mid - up * 7 }
    return [{ y: a, v: stack[i], c: SAVE, k: 's' }, ...(showDebt ? [{ y: b, v: debt[i], c: DEBT, k: 'd' }] : [])]
  }

  const onMove = (e: React.PointerEvent) => {
    const r = plot.current?.getBoundingClientRect(); if (!r) return
    setHover(Math.max(0, Math.min(M, Math.round(((e.clientX - r.left) / r.width) * M))))
  }

  return (
    <section aria-label={tr('budget.phase_chart.money_over_this_phase', 'Money over this phase')}>
      <div className="relative rounded-2xl bg-card px-2 pb-1.5 pt-2 shadow-[0_1px_0_hsl(var(--border))]">
        <Button variant="ghost" size="icon" className="absolute bottom-0.5 right-1.5 z-[5] size-6 text-muted-foreground [&_svg]:size-3.5" onClick={() => setBig(true)} aria-label={tr('budget.phase_chart.see_every_phase_full_screen', 'See every phase, full screen')} title={tr('budget.phase_chart.see_every_phase', 'See every phase')}><Maximize2 /></Button>
        <div className="mb-0.5 flex gap-3 pl-11 text-[11px] font-semibold text-muted-foreground">
          <span className="inline-flex items-center gap-1"><i className="inline-block h-1.5 w-3 rounded-full" style={{ background: SAVE }} />{hasOwn ? tr('budget.phase_chart.savings_and_things', 'Savings + things you own') : tr('budget.chart_events.savings', 'Savings')}</span>
          {showDebt && <span className="inline-flex items-center gap-1"><i className="inline-block h-1.5 w-3 rounded-full" style={{ background: DEBT }} />{tr('budget.chart_events.debt', 'Debt')}</span>}
        </div>
        <div className="relative px-11">
          {[0, M].map((i) => (
            <div key={i} className={`pointer-events-none absolute inset-y-0 w-10 ${i ? 'right-0' : 'left-0'}`}>
              {ends(i).map((e) => <span key={e.k} className={`absolute -translate-y-1/2 text-[11px] font-bold tabular-nums ${i ? 'left-1' : 'right-1'}`} style={{ top: e.y, color: e.c }}>{short(e.v)}</span>)}
            </div>
          ))}
          <div ref={plot} className="relative touch-pan-y" style={{ height: H }} onPointerMove={onMove} onPointerLeave={() => setHover(null)}>
            {stretchesOf.length > 1 && stretchesOf.map((s) => (
              <button key={s.i} type="button" aria-label={`Show ${s.i === 0 ? 'the start' : s.why.join(', ')}`} onClick={() => selectStretch(phase.id, s.i)}
                className={`absolute bottom-0 top-[32px] z-[1] ${s.i === stretch.i ? 'bg-[color-mix(in_srgb,var(--org-primary-color)_11%,transparent)]' : 'hover:bg-[color-mix(in_srgb,var(--org-primary-color)_6%,transparent)]'}`}
                style={{ left: `${X(s.m0)}%`, width: `${X(s.m1 + 1) - X(s.m0)}%` }} />
            ))}
            <svg viewBox={`0 0 100 ${H}`} preserveAspectRatio="none" width="100%" height={H} className="pointer-events-none relative block overflow-visible" role="img" aria-label={tr('budget.phase_chart.savings_things_you_own_and', 'Savings, things you own and debt during {{title}}', { title: phase.title })}>
              <Fills />
              <polygon points={area(debt, zero)} fill="url(#fill-debt)" />
              <polygon points={area(sav, zero)} fill="url(#fill-save)" />
              {hasOwn && <><polygon points={area(stack, sav)} fill="url(#fill-own)" /><polyline points={pts(stack)} fill="none" stroke={OWN} strokeWidth="2.25" vectorEffect="non-scaling-stroke" /></>}
              <polyline points={pts(sav)} fill="none" stroke={SAVE} strokeWidth="2.25" vectorEffect="non-scaling-stroke" />
              <polyline points={pts(debt)} fill="none" stroke={DEBT} strokeWidth="2.25" vectorEffect="non-scaling-stroke" />
            </svg>
            {stretchesOf.slice(1).map((s) => (
              <React.Fragment key={s.i}>
                <span className={`pointer-events-none absolute bottom-0 top-[32px] z-[2] w-0 border-l-[1.5px] ${s.i === stretch.i ? 'border-solid border-[var(--org-primary-color)]' : 'border-dashed border-muted-foreground/50'}`} style={{ left: `${X(s.m0)}%` }} />
                <button type="button" onClick={() => selectStretch(phase.id, s.i)} title={`${s.why.join(', ')} · ${monthLabel(doc.start, s.g0)}`} aria-label={s.why.join(', ')}
                  className={`absolute top-0.5 z-[3] grid size-[26px] -translate-x-1/2 place-items-center rounded-full ${s.i === stretch.i ? 'bg-[var(--org-primary-color)] text-[var(--org-on-primary-color)]' : 'bg-card text-foreground ring-2 ring-border'}`} style={{ left: `${X(s.m0)}%` }}>
                  <LifeIcon name={s.icon} className="size-3.5" />
                </button>
              </React.Fragment>
            ))}
            {dots.map((d) => (
              <span key={d.g} data-mark=""><MarkDot ms={d.ms} active={pick === d.g} onClick={() => setPick(pick === d.g ? null : d.g)} style={{ left: `${d.x}%`, top: d.y }}
                label={tr('budget.phase_chart.monthlabel_marklabel_why_the_line', '{{monthLabel}}: {{markLabel}}. Why the line moves', { monthLabel: monthLabel(doc.start, d.g), markLabel: markLabel(d.ms) })} /></span>
            ))}
            {picked && (
              <div ref={pop} className="absolute z-[6]" style={{ top: Math.min(picked.y + 16, H - 20), ...(picked.x > 55 ? { right: `${100 - picked.x}%`, marginRight: -12 } : { left: `${picked.x}%`, marginLeft: -12 }) }}>
                <MarkCard g={picked.g} ms={picked.ms} onClose={() => setPick(null)} onShow={() => setPick(null)} />
              </div>
            )}
            {hover !== null && pick === null && (
              <>
                <span className="pointer-events-none absolute bottom-0 top-[32px] z-[2] w-px bg-muted-foreground/50" style={{ left: `${X(hover)}%` }} />
                <span className="pointer-events-none absolute top-8 z-[4] whitespace-nowrap rounded-xl bg-foreground px-2.5 py-2 text-xs font-semibold text-background" style={X(hover) > 60 ? { right: `${100 - X(hover)}%`, marginRight: 12 } : { left: `${X(hover)}%`, marginLeft: 12 }}>
                  <b className="block">{monthLabel(doc.start, off + Math.min(hover, M - 1))}</b>
                  {tr('budget.phase_chart.savings_short', 'Savings {{short}}', { short: short(sav[hover]) })}{own[hover] > 1 ? <><br />{tr('budget.phase_chart.things_you_own_short', 'Things you own {{short}}', { short: short(own[hover]) })}</> : null}<br />{tr('budget.phase_chart.debt_short', 'Debt {{short}}', { short: short(debt[hover]) })}
                </span>
              </>
            )}
          </div>
          <div className="mt-0.5 flex justify-between text-[11px] font-semibold text-muted-foreground"><span>{monthLabel(doc.start, off)}</span><span>{monthLabel(doc.start, off + M - 1)}</span></div>
        </div>
      </div>
      <FullChart open={big} onClose={() => setBig(false)} />
    </section>
  )
}

/** Every phase on one long chart to drag and zoom; for the long view only. */
function FullChart({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { doc, projection, phase } = useLife()
  const [ppm, setPpm] = React.useState<number | null>(null)
  const box = React.useRef<HTMLDivElement>(null)
  const [w, setW] = React.useState(800)
  React.useEffect(() => { if (!open) { setPpm(null); return } const t = setTimeout(() => setW(box.current?.clientWidth || 800), 30); return () => clearTimeout(t) }, [open])
  const G = projection.months
  const scale = ppm ?? w / G
  const W = Math.max(w, G * scale), H = typeof window !== 'undefined' ? Math.max(240, Math.min(window.innerHeight - 240, 560)) : 360
  const stack = projection.sav.map((v, i) => v + projection.own[i])
  const hi = nice(Math.max(1000, ...stack, ...projection.debt) * 1.05)
  const X = (g: number) => g * scale, Y = (v: number) => 8 + (1 - Math.max(0, v) / hi) * (H - 14)
  const pts = (a: number[]) => a.map((v, i) => `${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(' ')
  const area = (up: number[], dn: number[]) => `${pts(up)} ${dn.map((v, i) => `${X(i).toFixed(1)},${Y(v).toFixed(1)}`).reverse().join(' ')}`
  const zoom = (d: number) => {
    const el = box.current; if (!el) return
    const c = (el.scrollLeft + el.clientWidth / 2) / scale
    const next = Math.max(el.clientWidth / G, Math.min(40, scale * (d > 0 ? 1.8 : 1 / 1.8)))
    setPpm(next)
    requestAnimationFrame(() => { el.scrollLeft = c * next - el.clientWidth / 2 })
  }
  const yrPx = 12 * scale, step = yrPx > 60 ? 1 : yrPx > 28 ? 2 : yrPx > 12 ? 5 : 10
  const ticks: [number, string][] = []
  for (let g = 0; g < G; g++) { const l = monthLabel(doc.start, g), year = l.slice(l.lastIndexOf(' ') + 1); if (monthIndex(doc.start, g) === 0 && Number(year) % step === 0) ticks.push([g, year]) }
  const drag = React.useRef<{ x: number; s: number } | null>(null)
  const [pick, setPick] = React.useState<number | null>(null)
  React.useEffect(() => { if (!open) setPick(null) }, [open])
  const dots = marksBetween(projection.marks, 0, G - 1)
  const picked = dots.find(([g]) => g === pick) || null
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex h-[100dvh] max-h-none w-screen max-w-none flex-col gap-3 rounded-none p-4 sm:rounded-none">
        <div className="flex items-start justify-between gap-3 pr-10">
          <div><DialogTitle className="text-2xl font-extrabold">{tr('budget.phase_chart.every_phase', 'Every phase')}</DialogTitle><div className="mt-1"><Legend own={projection.own.some((v) => v > 1)} /></div></div>
          <div className="flex gap-1"><Button variant="ghost" size="icon" onClick={() => zoom(-1)} aria-label={tr('budget.phase_chart.zoom_out', 'Zoom out')}><Minus /></Button><Button variant="ghost" size="icon" onClick={() => zoom(1)} aria-label={tr('budget.phase_chart.zoom_in', 'Zoom in')}><Plus /></Button></div>
        </div>
        <div className="relative min-h-0 flex-1 pl-11">
          <div className="pointer-events-none absolute bottom-0 left-0 top-[30px] w-10">
            {[0, hi / 4, hi / 2, (3 * hi) / 4, hi].map((t) => <span key={t} className="absolute right-1 -translate-y-1/2 text-[11px] font-semibold tabular-nums text-muted-foreground" style={{ top: Y(t) }}>{t ? short(t) : '$0'}</span>)}
          </div>
          <div ref={box} className="cursor-grab overflow-x-auto overflow-y-hidden pb-2 active:cursor-grabbing"
            onPointerDown={(e) => { if (e.pointerType !== 'mouse') return; drag.current = { x: e.clientX, s: box.current!.scrollLeft } }}
            onPointerMove={(e) => { if (drag.current && box.current) box.current.scrollLeft = drag.current.s - (e.clientX - drag.current.x) }}
            onPointerUp={() => { drag.current = null }} onPointerLeave={() => { drag.current = null }}>
            <div className="relative select-none" style={{ width: W }}>
              <div className="relative mb-1 h-[26px]">
                {doc.phases.map((p, k) => (
                  <span key={p.id} className={`absolute top-0 h-6 overflow-clip rounded-lg border-l-2 border-card ${p.id === phase.id ? 'bg-[color-mix(in_srgb,var(--org-primary-color)_22%,transparent)]' : k % 2 ? 'bg-muted' : 'bg-muted/60'}`} style={{ left: X(phaseOffset(doc, p.id)), width: p.months * scale }}>
                    <span className="sticky left-0 inline-block max-w-full truncate px-2 py-1 text-xs font-bold">{p.title}</span>
                  </span>
                ))}
              </div>
              <svg width={W} height={H} role="img" aria-label={tr('budget.phase_chart.savings_things_you_own_and_2', 'Savings, things you own and debt across every phase')}>
                {[0, hi / 4, hi / 2, (3 * hi) / 4, hi].map((t) => <line key={t} x1="0" x2={W} y1={Y(t)} y2={Y(t)} stroke="hsl(var(--border))" />)}
                {doc.phases.slice(1).map((p) => <line key={p.id} x1={X(phaseOffset(doc, p.id))} x2={X(phaseOffset(doc, p.id))} y1="0" y2={H} stroke="hsl(var(--border))" strokeDasharray="4 4" />)}
                <Fills />
                <polygon points={area(projection.debt, projection.debt.map(() => 0))} fill="url(#fill-debt)" />
                <polygon points={area(projection.sav, projection.sav.map(() => 0))} fill="url(#fill-save)" />
                <polygon points={area(stack, projection.sav)} fill="url(#fill-own)" />
                <polyline points={pts(projection.sav)} fill="none" stroke={SAVE} strokeWidth="2.25" />
                <polyline points={pts(projection.debt)} fill="none" stroke={DEBT} strokeWidth="2.25" />
              </svg>
              {dots.map(([g, ms]) => (
                <MarkDot key={g} ms={ms} active={pick === g} onClick={() => setPick(pick === g ? null : g)} label={tr('budget.phase_chart.monthlabel_marklabel_why_the_line', '{{monthLabel}}: {{markLabel}}. Why the line moves', { monthLabel: monthLabel(doc.start, g), markLabel: markLabel(ms) })}
                  style={{ left: X(g + 0.5), top: 26 + 4 + Y((stack[g] + stack[Math.min(G, g + 1)]) / 2) }} />
              ))}
              <div className="relative h-5">{ticks.map(([g, y]) => <span key={g} className="absolute -translate-x-1/2 text-[11px] font-semibold text-muted-foreground" style={{ left: X(g) }}>{y}</span>)}</div>
            </div>
          </div>
        </div>
        {picked ? <MarkCard g={picked[0]} ms={picked[1]} onClose={() => setPick(null)} onShow={onClose} className="self-start" />
          : <p className="text-xs text-muted-foreground">{tr('budget.phase_chart.drag_to_move_along_use', 'Drag to move along; use + and − to zoom.')}{dots.length > 0 && tr('budget.phase_chart.tap_a_dot_to_see_2', ' Tap a dot to see why the line moves.')}</p>}
      </DialogContent>
    </Dialog>
  )
}
