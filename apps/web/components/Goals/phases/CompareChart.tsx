'use client'

import React from 'react'
import type { Projection } from '@components/LifePlan/model'
import { short } from '@components/LifePlan/model'
import { monthText } from './graph'
import { moneyAt, phaseAt, type Way } from './compare'

/** One color per option, light and dark steps of the same hues (validated as a set). */
export const WAY_COLORS = ['var(--way-1)', 'var(--way-2)', 'var(--way-3)', 'var(--way-4)']
export const WAY_STYLE = `.way-colors{--way-1:#2a78d6;--way-2:#eb6834;--way-3:#1baf7a;--way-4:#eda100}
.dark .way-colors{--way-1:#3987e5;--way-2:#d95926;--way-3:#199e70;--way-4:#c98500}`

function nice(v: number) {
  if (v <= 1000) return 1000
  const p = Math.pow(10, Math.floor(Math.log10(v))), f = v / p
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p
}

/** Each option's savings (with what you own) as a solid line and its debt as a dashed one, over the months a..b. Before the split the ways are one, drawn gray. */
export default function CompareChart({ ways, projs, a, b, split }: { ways: Way[]; projs: Record<string, Projection>; a: number; b: number; split: number }) {
  const [hover, setHover] = React.useState<number | null>(null)
  const plot = React.useRef<HTMLDivElement>(null)
  const N = Math.max(1, b - a), H = 220, top = 10, bot = H - 6
  const vals = ways.map((w) => Array.from({ length: N + 1 }, (_, i) => moneyAt(w, projs[w.id], a + i)))
  const hi = nice(Math.max(1000, ...vals.flat().flatMap((v) => (v ? [v.saved, v.owed] : []))) * 1.05)
  const X = (i: number) => (i / N) * 100, Y = (v: number) => top + (1 - Math.max(0, v) / hi) * (bot - top)
  const line = (k: 'saved' | 'owed', w: number, from: number, to: number) => {
    const pts: string[] = []
    for (let i = from; i <= to; i++) { const v = vals[w][i]; if (v) pts.push(`${X(i).toFixed(3)},${Y(v[k]).toFixed(1)}`) }
    return pts.length > 1 ? pts.join(' ') : null
  }
  const s = Math.max(0, Math.min(N, split - a))
  const owes = vals.some((vs) => vs.some((v) => v && v.owed > 0.5))
  const years: [number, string][] = []
  for (let i = 0; i <= N; i++) if ((a + i) % 12 === 0) years.push([i, String((a + i) / 12)])
  const every = Math.max(1, Math.ceil(years.length / 6))
  const onMove = (e: React.PointerEvent) => {
    const r = plot.current?.getBoundingClientRect(); if (!r) return
    setHover(Math.max(0, Math.min(N, Math.round(((e.clientX - r.left) / r.width) * N))))
  }
  const stroke = (k: 'saved' | 'owed', color: string, from: number, to: number, w: number) => {
    if (k === 'owed' && !vals[w].slice(from, to + 1).some((v) => v && v.owed > 0.5)) return null
    const p = line(k, w, from, to)
    return p && <polyline key={`${k}${w}${from}`} points={p} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeDasharray={k === 'owed' ? '5 4' : undefined} vectorEffect="non-scaling-stroke" />
  }
  return (
    <div>
      <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs font-semibold text-muted-foreground">
        {ways.map((w, i) => <span key={w.id} className="inline-flex items-center gap-1.5"><i className="inline-block size-2.5 rounded-sm" style={{ background: WAY_COLORS[i] }} />{w.title}</span>)}
        <span className="inline-flex items-center gap-1.5"><i className="inline-block h-[2px] w-4 bg-muted-foreground" />Saved, with what you own</span>
        {owes && <span className="inline-flex items-center gap-1.5"><i className="inline-block w-4 border-t-2 border-dashed border-muted-foreground" />Owed</span>}
      </div>
      <div className="relative pl-10">
        <div className="pointer-events-none absolute inset-y-0 left-0 w-9">
          {[0, hi / 2, hi].map((t) => <span key={t} className="absolute right-1 -translate-y-1/2 text-[11px] font-semibold tabular-nums text-muted-foreground" style={{ top: Y(t) }}>{t ? short(t) : '$0'}</span>)}
        </div>
        <div ref={plot} className="relative touch-pan-y" style={{ height: H }} onPointerMove={onMove} onPointerDown={onMove} onPointerLeave={() => setHover(null)}>
          <svg viewBox={`0 0 100 ${H}`} preserveAspectRatio="none" width="100%" height={H} className="pointer-events-none block overflow-visible" role="img" aria-label="Savings and debt for each option over time; the table below has the numbers">
            {[0, hi / 2, hi].map((t) => <line key={t} x1="0" x2="100" y1={Y(t)} y2={Y(t)} stroke="hsl(var(--border))" strokeWidth="1" vectorEffect="non-scaling-stroke" />)}
            {s > 0 && <><line x1={X(s)} x2={X(s)} y1={top} y2={bot} stroke="hsl(var(--border))" strokeWidth="1.5" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />{stroke('owed', 'hsl(var(--muted-foreground))', 0, s, 0)}{stroke('saved', 'hsl(var(--muted-foreground))', 0, s, 0)}</>}
            {ways.map((w, i) => stroke('owed', WAY_COLORS[i], s, N, i))}
            {ways.map((w, i) => stroke('saved', WAY_COLORS[i], s, N, i))}
            {hover !== null && <line x1={X(hover)} x2={X(hover)} y1={top} y2={bot} stroke="hsl(var(--foreground))" strokeOpacity="0.35" strokeWidth="1" vectorEffect="non-scaling-stroke" />}
          </svg>
          {/* Where each way's plan ends, when that's inside the chart. */}
          {ways.map((w, i) => { const e = w.last - a, v = vals[i][Math.min(N, e)]; return e > 0 && e < N && v ? <span key={w.id} className="pointer-events-none absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-card" style={{ left: `${X(e)}%`, top: Y(v.saved), background: WAY_COLORS[i] }} /> : null })}
          {hover !== null && ways.map((w, i) => { const v = vals[i][hover]; return v ? <span key={w.id} className="pointer-events-none absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-card" style={{ left: `${X(hover)}%`, top: Y(v.saved), background: WAY_COLORS[i] }} /> : null })}
          {hover !== null && (
            <div className={`pointer-events-none absolute top-1 z-10 w-max max-w-[240px] rounded-xl bg-popover p-2.5 text-xs shadow-lg ring-1 ring-border ${X(hover) > 50 ? '-translate-x-[calc(100%+10px)]' : 'translate-x-[10px]'}`} style={{ left: `${X(hover)}%` }}>
              <p className="mb-1 font-extrabold">{monthText(a + hover)}</p>
              {ways.map((w, i) => { const v = vals[i][hover], ph = phaseAt(w, a + hover); return (
                <div key={w.id} className="flex items-start gap-1.5 py-0.5">
                  <i className="mt-1 inline-block size-2 shrink-0 rounded-sm" style={{ background: WAY_COLORS[i] }} />
                  <span>{v ? <><b className="font-bold">{ph?.title || w.title}</b><br /><span className="tabular-nums text-muted-foreground">{short(v.saved)} saved{v.owed > 0.5 ? ` · ${short(v.owed)} owed` : ''}</span></> : <span className="text-muted-foreground">{w.title}: plan ends</span>}</span>
                </div>
              ) })}
            </div>
          )}
        </div>
        <div className="relative mt-1 h-4">
          {years.filter((_, i) => i % every === 0).map(([i, y]) => <span key={i} className="absolute -translate-x-1/2 text-[11px] font-semibold tabular-nums text-muted-foreground" style={{ left: `${X(i)}%` }}>{y}</span>)}
        </div>
      </div>
    </div>
  )
}
