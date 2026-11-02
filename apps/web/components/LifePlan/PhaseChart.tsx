'use client'

import React from 'react'
import { Maximize2, Minus, Plus } from 'lucide-react'
import { Button } from '@components/ui/button'
import { Dialog, DialogContent, DialogTitle } from '@components/ui/dialog'
import { useLife } from './LifeContext'
import { LifeIcon } from './icons'
import { money, monthLabel, phaseOffset, short } from './model'

const SAVE = '#2F7DD3', OWN = '#7A5BD0', DEBT = '#E0662E'

function nice(v: number) {
  if (v <= 1000) return 1000
  const p = Math.pow(10, Math.floor(Math.log10(v))), f = v / p
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p
}

function Legend({ own }: { own: boolean }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs font-semibold text-muted-foreground">
      <span className="inline-flex items-center gap-1.5"><i className="inline-block size-2.5 rounded-sm" style={{ background: SAVE }} />Savings</span>
      {own && <span className="inline-flex items-center gap-1.5"><i className="inline-block size-2.5 rounded-sm" style={{ background: OWN }} />Things you own</span>}
      <span className="inline-flex items-center gap-1.5"><i className="inline-block h-[3px] w-3.5 rounded" style={{ background: DEBT }} />Debt</span>
    </div>
  )
}

/** The phase's savings, things owned (stacked on savings) and debt, with its stretches to pick. */
export default function PhaseChart() {
  const { doc, phase, stretch, stretchesOf, selectStretch, projection, valueOf } = useLife()
  const [hover, setHover] = React.useState<number | null>(null)
  const [big, setBig] = React.useState(false)
  const plot = React.useRef<HTMLDivElement>(null)
  const off = phaseOffset(doc, phase.id), M = Math.max(1, phase.months)
  const sav = projection.sav.slice(off, off + M + 1), own = projection.own.slice(off, off + M + 1), debt = projection.debt.slice(off, off + M + 1)
  const stack = sav.map((v, i) => v + own[i]), hasOwn = own.some((v) => v > 1)
  const H = 190, top = 34, bot = H - 4
  const hi = nice(Math.max(1000, ...stack, ...debt) * 1.05)
  const X = (m: number) => (m / M) * 100, Y = (v: number) => top + (1 - Math.max(0, v) / hi) * (bot - top)
  const pts = (a: number[]) => a.map((v, m) => `${X(m).toFixed(3)},${Y(v).toFixed(1)}`).join(' ')
  const area = (up: number[], dn: number[]) => `${pts(up)} ${dn.map((v, m) => `${X(m).toFixed(3)},${Y(v).toFixed(1)}`).reverse().join(' ')}`
  const zero = sav.map(() => 0)

  // The phase in a sentence: average money in and out across its months.
  let inn = 0, out = 0
  for (let m = 0; m < M; m++) { inn += projection.inn[off + m] || 0; out += projection.out[off + m] || 0 }
  inn /= M; out /= M
  const missing = projection.missing.filter((x) => x.phase === phase.id).length
  void valueOf

  const years: [number, string][] = []
  for (let m = 0; m < M; m++) { const l = monthLabel(doc.start, off + m); if (l.startsWith('Jan ')) years.push([m, l.slice(4)]) }
  const every = Math.max(1, Math.ceil(years.length / 6))

  const onMove = (e: React.PointerEvent) => {
    const r = plot.current?.getBoundingClientRect(); if (!r) return
    setHover(Math.max(0, Math.min(M, Math.round(((e.clientX - r.left) / r.width) * M))))
  }

  return (
    <section aria-label="Money over this phase">
      {phase.lines.length === 0 ? (
        <p className="text-lg font-bold leading-snug sm:text-xl">Add what comes in and what goes out to see where {phase.title.charAt(0).toLowerCase() + phase.title.slice(1)} leaves you.</p>
      ) : (<>
      <p className="text-lg font-bold leading-snug sm:text-xl">
        During {phase.title.charAt(0).toLowerCase() + phase.title.slice(1)}, about <span className="text-emerald-600 dark:text-emerald-400">{money(inn)}</span> comes in and {money(out)} goes out a month.
      </p>
      <p className="mt-1 text-sm text-muted-foreground">
        Savings{hasOwn ? ' and things you own' : ''} go from <b className="text-foreground">{short(stack[0])}</b> to <b className="text-foreground">{short(stack[M])}</b>.{(debt[0] > 0.5 || debt[M] > 0.5) && <> Debt goes from <b style={{ color: DEBT }}>{short(debt[0])}</b> to <b style={{ color: DEBT }}>{short(debt[M])}</b>.</>}
        {missing > 0 && <> {missing === 1 ? 'One line has' : `${missing} lines have`} no number yet, so {missing === 1 ? "it isn't" : "they aren't"} counted.</>}
      </p>
      </>)}
      <div className="mt-3 rounded-2xl bg-card p-3 shadow-[0_1px_0_hsl(var(--border))] sm:p-4">
        <div className="mb-1 flex items-center justify-between gap-2"><Legend own={hasOwn} /><Button variant="ghost" size="icon" onClick={() => setBig(true)} aria-label="See every phase, full screen" title="See every phase"><Maximize2 /></Button></div>
        <div className="relative pl-10">
          <div className="pointer-events-none absolute inset-y-0 left-0 w-9">
            {[0, hi / 2, hi].map((t) => <span key={t} className="absolute right-1 -translate-y-1/2 text-[11px] font-semibold tabular-nums text-muted-foreground" style={{ top: Y(t) }}>{t ? short(t) : '$0'}</span>)}
          </div>
          <div ref={plot} className="relative touch-pan-y" style={{ height: H }} onPointerMove={onMove} onPointerLeave={() => setHover(null)}>
            {stretchesOf.length > 1 && stretchesOf.map((s) => (
              <button key={s.i} type="button" aria-label={`Show ${s.i === 0 ? 'the start' : s.why.join(', ')}`} onClick={() => selectStretch(phase.id, s.i)}
                className={`absolute bottom-0 top-[30px] z-[1] ${s.i === stretch.i ? 'bg-[color-mix(in_srgb,var(--org-primary-color)_11%,transparent)]' : 'hover:bg-[color-mix(in_srgb,var(--org-primary-color)_6%,transparent)]'}`}
                style={{ left: `${X(s.m0)}%`, width: `${X(s.m1 + 1) - X(s.m0)}%` }} />
            ))}
            <svg viewBox={`0 0 100 ${H}`} preserveAspectRatio="none" width="100%" height={H} className="pointer-events-none relative block overflow-visible" role="img" aria-label={`Savings, things you own and debt during ${phase.title}`}>
              {[0, hi / 2, hi].map((t) => <line key={t} x1="0" x2="100" y1={Y(t)} y2={Y(t)} stroke="hsl(var(--border))" strokeWidth="1" vectorEffect="non-scaling-stroke" />)}
              <polygon points={area(sav, zero)} fill={SAVE} opacity={0.2} />
              {hasOwn && <><polygon points={area(stack, sav)} fill={OWN} opacity={0.25} /><polyline points={pts(stack)} fill="none" stroke={OWN} strokeWidth="2.25" vectorEffect="non-scaling-stroke" /></>}
              <polyline points={pts(sav)} fill="none" stroke={SAVE} strokeWidth="2.25" vectorEffect="non-scaling-stroke" />
              <polyline points={pts(debt)} fill="none" stroke={DEBT} strokeWidth="2.25" vectorEffect="non-scaling-stroke" />
            </svg>
            {stretchesOf.slice(1).map((s) => (
              <React.Fragment key={s.i}>
                <span className={`pointer-events-none absolute bottom-0 top-[30px] z-[2] w-0 border-l-[1.5px] ${s.i === stretch.i ? 'border-solid border-[var(--org-primary-color)]' : 'border-dashed border-muted-foreground/50'}`} style={{ left: `${X(s.m0)}%` }} />
                <button type="button" onClick={() => selectStretch(phase.id, s.i)} title={`${s.why.join(', ')} · ${monthLabel(doc.start, s.g0)}`} aria-label={s.why.join(', ')}
                  className={`absolute top-0.5 z-[3] grid size-[26px] -translate-x-1/2 place-items-center rounded-full ${s.i === stretch.i ? 'bg-[var(--org-primary-color)] text-[var(--org-on-primary-color)]' : 'bg-card text-foreground ring-2 ring-border'}`} style={{ left: `${X(s.m0)}%` }}>
                  <LifeIcon name={s.icon} className="size-3.5" />
                </button>
              </React.Fragment>
            ))}
            {hover !== null && (
              <>
                <span className="pointer-events-none absolute bottom-0 top-[30px] z-[2] w-px bg-muted-foreground/50" style={{ left: `${X(hover)}%` }} />
                <span className="pointer-events-none absolute top-8 z-[4] whitespace-nowrap rounded-xl bg-foreground px-2.5 py-2 text-xs font-semibold text-background" style={X(hover) > 60 ? { right: `${100 - X(hover)}%`, marginRight: 12 } : { left: `${X(hover)}%`, marginLeft: 12 }}>
                  <b className="block">{monthLabel(doc.start, off + Math.min(hover, M - 1))}</b>
                  Savings {short(sav[hover])}{own[hover] > 1 ? <><br />Things you own {short(own[hover])}</> : null}<br />Debt {short(debt[hover])}
                </span>
              </>
            )}
          </div>
          <div className="relative mt-1 h-4">
            {years.filter((_, i) => i % every === 0).map(([m, y]) => <span key={m} className="absolute -translate-x-1/2 text-[11px] font-semibold text-muted-foreground" style={{ left: `${X(m)}%` }}>{y}</span>)}
          </div>
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
  for (let g = 0; g < G; g++) { const l = monthLabel(doc.start, g); if (l.startsWith('Jan ') && Number(l.slice(4)) % step === 0) ticks.push([g, l.slice(4)]) }
  const drag = React.useRef<{ x: number; s: number } | null>(null)
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex h-[100dvh] max-h-none w-screen max-w-none flex-col gap-3 rounded-none p-4 sm:rounded-none">
        <div className="flex items-start justify-between gap-3 pr-10">
          <div><DialogTitle className="text-2xl font-extrabold">Every phase</DialogTitle><div className="mt-1"><Legend own={projection.own.some((v) => v > 1)} /></div></div>
          <div className="flex gap-1"><Button variant="ghost" size="icon" onClick={() => zoom(-1)} aria-label="Zoom out"><Minus /></Button><Button variant="ghost" size="icon" onClick={() => zoom(1)} aria-label="Zoom in"><Plus /></Button></div>
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
              <svg width={W} height={H} role="img" aria-label="Savings, things you own and debt across every phase">
                {[0, hi / 4, hi / 2, (3 * hi) / 4, hi].map((t) => <line key={t} x1="0" x2={W} y1={Y(t)} y2={Y(t)} stroke="hsl(var(--border))" />)}
                {doc.phases.slice(1).map((p) => <line key={p.id} x1={X(phaseOffset(doc, p.id))} x2={X(phaseOffset(doc, p.id))} y1="0" y2={H} stroke="hsl(var(--border))" strokeDasharray="4 4" />)}
                <polygon points={area(projection.sav, projection.sav.map(() => 0))} fill={SAVE} opacity={0.2} />
                <polygon points={area(stack, projection.sav)} fill={OWN} opacity={0.25} />
                <polyline points={pts(projection.sav)} fill="none" stroke={SAVE} strokeWidth="2.25" />
                <polyline points={pts(projection.debt)} fill="none" stroke={DEBT} strokeWidth="2.25" />
              </svg>
              <div className="relative h-5">{ticks.map(([g, y]) => <span key={g} className="absolute -translate-x-1/2 text-[11px] font-semibold text-muted-foreground" style={{ left: X(g) }}>{y}</span>)}</div>
            </div>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">Drag to move along; use + and − to zoom.</p>
      </DialogContent>
    </Dialog>
  )
}
