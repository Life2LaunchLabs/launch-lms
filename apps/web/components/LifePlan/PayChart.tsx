'use client'

import React from 'react'
import { RotateCcw } from 'lucide-react'
import type { Estimate, Unit } from '@services/life/life'
import SourceInfo from './SourceInfo'
import { curve, domain, ordinal, pctOf, rankText, snap, valueAt, type Pt } from './payDist'
import { money, short } from './model'

import { tr } from '@/lib/tr'

const UNIT_SHORT: Record<Unit, string> = { hr: 'hr', wk: 'wk', mo: 'mo', yr: 'yr' }
export const roundFor = (v: number, unit: Unit) => (unit === 'hr' ? Math.round(v * 4) / 4 : unit === 'yr' ? Math.round(v / 500) * 500 : Math.round(v / 5) * 5)
const fmtAt = (v: number, unit: Unit, brief = false) => `${unit === 'hr' ? (brief ? money(Math.round(v)) : money(v, { cents: v % 1 > 0.001 })) : brief ? short(v) : money(v)}/${UNIT_SHORT[unit]}`

/**
 * A published distribution drawn as a curve, with the learner's number on it. Dragging the line (or the
 * arrow keys) moves it: inside the published range it snaps to every 5th percentile (interpolated between
 * published ones); outside it goes anywhere. The range stays put while dragging and fits the number after.
 */
// eslint-disable-next-line no-unused-vars -- parameter names in a function type
export default function PayChart({ title, pts, unit, value, est, own, onPick, onReset }: { title: string; pts: Pt[]; unit: Unit; value: number | null; est: Estimate; own: boolean; onPick: (v: number) => void; onReset?: () => void }) {
  const [drag, setDrag] = React.useState<{ v: number; dom: [number, number] } | null>(null)
  const plot = React.useRef<HTMLDivElement>(null)
  const [lo, hi] = drag?.dom ?? domain(pts, value)
  const shown = drag ? drag.v : value
  const first = pts[0], last = pts[pts.length - 1]
  const inside = (v: number) => v >= first[1] - 1e-9 && v <= last[1] + 1e-9
  const q = shown == null ? null : pctOf(shown, pts)
  const X = (v: number) => Math.max(0, Math.min(1, (v - lo) / (hi - lo)))
  const H = 60, top = 6
  const line = curve(pts, 64, [lo, hi]).map(([x, y]) => `${(x * 100).toFixed(2)},${(top + (1 - y) * (H - top)).toFixed(1)}`).join(' ')
  const x = shown == null ? null : X(shown) * 100
  const where = shown == null || q == null ? null : rankText(q, pts, shown)
  const at = (clientX: number, dom: [number, number]) => {
    const r = plot.current?.getBoundingClientRect(); if (!r) return null
    const v = dom[0] + Math.max(0, Math.min(1, (clientX - r.left) / r.width)) * (dom[1] - dom[0])
    return inside(v) ? valueAt(snap(pctOf(v, pts), pts), pts) : roundFor(v, unit)
  }
  const commit = (v: number) => onPick(roundFor(v, unit))
  const step = (d: number) => {
    if (shown == null) return commit(valueAt(50, pts))
    if (inside(shown)) { const p = snap(pctOf(shown, pts) + d, pts); commit(valueAt(p, pts)); return }
    commit(d > 0 ? (shown < first[1] ? first[1] : shown * 1.05) : (shown > last[1] ? last[1] : shown * 0.95))
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold text-muted-foreground">{title}</span>
        <span className="flex items-center gap-0.5">
          {where && <span className="text-xs font-bold text-[var(--org-primary-color)] dark:text-[color-mix(in_srgb,var(--org-primary-color)_45%,white)]">{where}</span>}
          {own && onReset && <button type="button" onClick={onReset} className="rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label={tr('budget.pay_chart.use_the_median', 'Use the median')} title={tr('budget.pay_chart.use_the_median', 'Use the median')}><RotateCcw className="size-3.5" /></button>}
          <SourceInfo est={est} extra={<p>{tr('budget.pay_chart.published_percentiles', 'Published at the {{list}} percentiles; in between we fill in a straight line.', { list: pts.map((p) => ordinal(p[0])).join(', ') })}{unit === 'yr' && est.period === 'hr' ? tr('budget.pay_chart.yearly_is_full_time', ' Yearly pay is hourly pay × 2,080 hours (full time).') : unit === 'hr' && est.period === 'yr' ? tr('budget.pay_chart.hourly_is_full_time', ' Hourly pay is yearly pay ÷ 2,080 hours (full time).') : ''}</p>} />
        </span>
      </div>
      <div ref={plot} role="slider" tabIndex={0} aria-label={title} aria-valuemin={Math.round(lo)} aria-valuemax={Math.round(hi)} aria-valuenow={shown == null ? undefined : Math.round(shown)} aria-valuetext={shown == null ? undefined : `${fmtAt(shown, unit)}, ${where}`}
        className="relative mt-1 cursor-ew-resize touch-none select-none outline-none focus-visible:ring-2 focus-visible:ring-[var(--org-primary-color)]" style={{ height: H }}
        onPointerDown={(e) => { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); const dom: [number, number] = [lo, hi]; const v = at(e.clientX, dom); if (v != null) setDrag({ v, dom }) }}
        onPointerMove={(e) => { if (!drag) return; const v = at(e.clientX, drag.dom); if (v != null && v !== drag.v) setDrag({ ...drag, v }) }}
        onPointerUp={() => { if (drag) commit(drag.v); setDrag(null) }}
        onPointerCancel={() => setDrag(null)}
        onKeyDown={(e) => { const d = e.key === 'ArrowRight' || e.key === 'ArrowUp' ? 5 : e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -5 : 0; if (!d) return; e.preventDefault(); step(d) }}>
        <svg viewBox={`0 0 100 ${H}`} preserveAspectRatio="none" width="100%" height={H} className="block overflow-visible" aria-hidden="true">
          <defs><linearGradient id="pay-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" style={{ stopColor: 'var(--org-primary-color)', stopOpacity: 0.35 }} /><stop offset="100%" style={{ stopColor: 'var(--org-primary-color)', stopOpacity: 0.02 }} /></linearGradient></defs>
          <polygon points={`0,${H} ${line} 100,${H}`} fill="url(#pay-fill)" />
          <polyline points={line} fill="none" stroke="var(--org-primary-color)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
          <line x1="0" x2="100" y1={H - 0.5} y2={H - 0.5} stroke="hsl(var(--border))" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        </svg>
        {x != null && <>
          <span className="pointer-events-none absolute bottom-0 w-0.5 -translate-x-1/2 bg-[var(--org-primary-color)]" style={{ left: `${x}%`, top: 5 }} />
          <span className="pointer-events-none absolute size-3.5 -translate-x-1/2 rounded-full border-[3px] border-[var(--org-primary-color)] bg-card shadow" style={{ left: `${x}%`, top: 0 }} />
        </>}
      </div>
      <div className="relative mt-1 h-6 text-[11px] font-semibold tabular-nums text-muted-foreground">
        {(x == null || x > 28) && <span className="absolute left-0 top-1">{fmtAt(lo, unit, true)}</span>}
        {(x == null || x < 72) && <span className="absolute right-0 top-1">{fmtAt(hi, unit, true)}</span>}
        {shown != null && x != null && (
          <span className="absolute top-0 whitespace-nowrap rounded-full border border-[var(--org-primary-color)] bg-card px-2 py-0.5 text-xs text-[var(--org-primary-color)] dark:text-[color-mix(in_srgb,var(--org-primary-color)_45%,white)]"
            style={{ left: `clamp(0px, calc(${x}% - 2.75rem), calc(100% - 5.5rem))` }}>{fmtAt(shown, unit)}</span>
        )}
      </div>
    </div>
  )
}
