'use client'
/* eslint-disable no-unused-vars -- parameter names in function types */

import React from 'react'
import { cn } from '@/lib/utils'

/*
 * The map's timeline down the left: a dot for each phase, a diamond where it splits, and through a split
 * up to three bars that slide across as the options are swiped. What's already happened is drawn in the
 * accent color, up to the bigger "you're here" dot; everything ahead is muted.
 */

export const RAIL = 44
const C = 18
const ACCENT = 'var(--org-primary-color)'
const AHEAD = 'hsl(var(--muted-foreground) / 0.75)'
const OTHER = 'hsl(var(--muted-foreground) / 0.4)'

export type When = 'done' | 'now' | 'next' | 'later'
export const lit = (w?: string) => w === 'done' || w === 'now'

function Dot({ when, x, y }: { when?: string; x: number | string; y: number | string }) {
  const at = { left: x, top: y }
  if (when === 'now') return <>
    <span className="absolute size-[26px] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-25" style={{ ...at, background: ACCENT }} />
    <span className="absolute size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full" style={{ ...at, background: ACCENT }} />
  </>
  if (when === 'done') return <span className="absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full" style={{ ...at, background: ACCENT }} />
  return <span className="absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 bg-background" style={{ ...at, borderColor: AHEAD }} />
}

/**
 * One row of the stack with its piece of the timeline: the line above and below its middle (lit when
 * that stretch has happened), and a dot for a phase or a diamond where the way splits.
 */
export function RailRow({ top, bottom, mark, when, children }: { top: boolean | null; bottom: boolean | null; mark?: 'dot' | 'diamond'; when?: string; children: React.ReactNode }) {
  return <div className="relative" style={{ paddingLeft: RAIL }}>
    <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-0" style={{ width: RAIL }}>
      {top !== null ? <span className="absolute top-0 h-1/2 w-[2px] -translate-x-1/2" style={{ left: C, background: top ? ACCENT : AHEAD }} /> : null}
      {bottom !== null ? <span className="absolute bottom-0 h-1/2 w-[2px] -translate-x-1/2" style={{ left: C, background: bottom ? ACCENT : AHEAD }} /> : null}
      {mark === 'dot' ? <Dot when={when} x={C} y="50%" /> : null}
      {mark === 'diamond' ? <span className="absolute size-3 -translate-x-1/2 -translate-y-1/2 rotate-45 rounded-[3px] border-[2.5px] bg-background" style={{ left: C, top: '50%', borderColor: top ? ACCENT : AHEAD }} /> : null}
    </span>
    {children}
  </div>
}

type Mark = { y: number; when: string }
type Measured = { w: number; h: number[]; marks: Mark[][] }
const same = (a: Measured, b: Measured) => a.w === b.w && a.h.join() === b.h.join() && JSON.stringify(a.marks) === JSON.stringify(b.marks)

/**
 * A split's options side by side, one screen wide each: swipe between them (they snap), or pick one
 * from the chips, which scrolls here. The height follows the option in view. Beside it, the split's
 * stretch of timeline: up to three bars, the shown option's one solid with its phases' dots.
 */
export function Carousel({ trayKey, panes, index, onIndex, rejoin, gutter, inset, moving, rail = true }: {
  trayKey: string; panes: { id: string; node: React.ReactNode }[]; index: number; onIndex: (j: number) => void
  rejoin: boolean; gutter: number; inset: number; moving: boolean; rail?: boolean
}) {
  const box = React.useRef<HTMLDivElement>(null)
  const n = panes.length, i = Math.min(index, n - 1)
  const [p, setP] = React.useState(i)
  const [m, setM] = React.useState<Measured>({ w: 0, h: [], marks: [] })
  const settle = React.useRef<ReturnType<typeof setTimeout>>(undefined)
  const first = React.useRef(true)

  const measure = React.useCallback(() => {
    const el = box.current
    if (!el) return
    const kids = [...el.children] as HTMLElement[]
    const next: Measured = {
      w: el.clientWidth,
      h: kids.map((k) => k.offsetHeight),
      marks: kids.map((k) => {
        const top = k.getBoundingClientRect().top
        return [...k.querySelectorAll<HTMLElement>('[data-card]')].map((c) => { const r = c.getBoundingClientRect(); return { y: Math.round(r.top - top + r.height / 2), when: c.dataset.when || 'later' } })
      }),
    }
    setM((old) => (same(old, next) ? old : next))
  }, [])
  React.useLayoutEffect(measure)
  React.useEffect(() => {
    const el = box.current
    if (!el) return
    const ro = new ResizeObserver(measure)
    ro.observe(el);[...el.children].forEach((k) => ro.observe(k))
    return () => ro.disconnect()
  }, [measure, n])

  // Shown from elsewhere (a chip, a drag flipping options, the way to a phase): slide there. When the
  // options themselves change (one dropped in, one taken out), jump: the browser would otherwise keep
  // the old option in view, and settling there would show it again.
  const ids = panes.map((q) => q.id).join(',')
  const was = React.useRef(ids)
  React.useLayoutEffect(() => {
    const el = box.current
    if (!el || !el.clientWidth) return
    const jump = first.current || was.current !== ids
    was.current = ids
    if (Math.round(el.scrollLeft / el.clientWidth) !== i) {
      if (jump) { clearTimeout(settle.current); el.scrollLeft = i * el.clientWidth; setP(i) } else el.scrollTo({ left: i * el.clientWidth, behavior: 'smooth' })
    }
    first.current = false
  }, [i, m.w, ids])
  React.useEffect(() => () => clearTimeout(settle.current), [])

  const onScroll = () => {
    const el = box.current
    if (!el || !el.clientWidth) return
    setP(el.scrollLeft / el.clientWidth)
    clearTimeout(settle.current)
    settle.current = setTimeout(() => {
      const j = Math.max(0, Math.min(n - 1, Math.round(el.scrollLeft / el.clientWidth)))
      if (j !== i) onIndex(j)
    }, 110)
  }

  const a = Math.max(0, Math.min(n - 1, Math.floor(p))), b = Math.min(n - 1, a + 1), f = Math.max(0, Math.min(1, p - a))
  const shown = m.h.length ? (m.h[a] ?? 0) * (1 - f) + (m.h[b] ?? 0) * f : undefined
  // While a phase is carried, the split never gets shorter, so the page doesn't jump under the finger.
  const [hold, setHold] = React.useState(0)
  if (!moving && hold) setHold(0)
  if (moving && shown != null && shown > hold) setHold(shown)
  const H = moving && shown != null ? Math.max(hold, shown) : shown

  return <div className="relative" data-tray={trayKey} data-opts={ids} data-index={i}>
    {H != null && rail ? <BandRail n={n} p={p} active={i} H={H} marks={m.marks} rejoin={rejoin} left={gutter} /> : null}
    <div ref={box} onScroll={onScroll}
      className={cn('flex items-start overflow-x-auto overflow-y-hidden overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden', !moving && 'snap-x snap-mandatory')}
      style={{ height: H, marginLeft: inset }}>
      {panes.map((pane, j) => <div key={pane.id} aria-hidden={j !== i || undefined} className="w-full min-w-0 shrink-0 snap-start snap-always">{pane.node}</div>)}
    </div>
  </div>
}

/**
 * The bars of a split. With the option at `p` (fractional while swiping), the bars in view are the
 * options from p-1 to p+1: two at either end, three in the middle, sliding as one; one coming into
 * view fades in, one leaving fades out. The shown option's bar is solid and carries its phases' dots.
 */
function BandRail({ n, p, active, H, marks, rejoin, left }: { n: number; p: number; active: number; H: number; marks: Mark[][]; rejoin: boolean; left: number }) {
  const S = 12, top = 22, bot = rejoin ? 22 : 0
  const lo = Math.max(0, p - 1), hi = Math.min(n - 1, p + 1), mid = (lo + hi) / 2
  const xOf = (j: number) => C + (j - mid) * S
  const opOf = (j: number) => Math.max(0, Math.min(1, 1 - Math.max(0, Math.abs(j - p) - 1)))
  const d = (x: number) => `M${C} 0 C${C} ${top * 0.55} ${x} ${top * 0.45} ${x} ${top} L${x} ${H - bot}${rejoin ? ` C${x} ${H - bot * 0.45} ${C} ${H - bot * 0.55} ${C} ${H}` : ''}`
  const litTo = (j: number) => {
    const ms = marks[j] || []
    if (!ms.length || !lit(ms[0].when)) return 0
    if (ms.every((q) => q.when === 'done')) return H
    let y = 0
    for (const q of ms) if (lit(q.when)) y = q.y
    return y
  }
  const bars = Array.from({ length: n }, (_, j) => j).filter((j) => opOf(j) > 0.01)
  return <svg aria-hidden="true" className="pointer-events-none absolute top-0 z-[1] overflow-visible" style={{ left }} width={RAIL} height={H}>
    <defs>{bars.map((j) => <clipPath key={j} id={`lit-${j}-${n}`}><rect x="-20" y="-1" width={RAIL + 40} height={litTo(j) + 1} /></clipPath>)}</defs>
    {bars.map((j) => {
      const on = j === active, path = d(xOf(j))
      return <g key={j} opacity={opOf(j)}>
        <path d={path} fill="none" strokeLinecap="round" strokeWidth={on ? 2.5 : 2} strokeDasharray={on ? undefined : '4 5'} style={{ stroke: on ? AHEAD : OTHER, transition: 'stroke .25s ease, stroke-width .25s ease' }} />
        {litTo(j) > 0 ? <path d={path} fill="none" strokeLinecap="round" strokeWidth={2.5} clipPath={`url(#lit-${j}-${n})`} style={{ stroke: ACCENT }} /> : null}
      </g>
    })}
    {bars.includes(active) ? <g opacity={opOf(active)}>{(marks[active] || []).map((q, k) => {
      const x = xOf(active)
      if (q.when === 'now') return <g key={k}><circle cx={x} cy={q.y} r={13} style={{ fill: ACCENT }} opacity={0.25} /><circle cx={x} cy={q.y} r={7} style={{ fill: ACCENT }} /></g>
      if (q.when === 'done') return <circle key={k} cx={x} cy={q.y} r={5} style={{ fill: ACCENT }} />
      return <circle key={k} cx={x} cy={q.y} r={5} strokeWidth={2} style={{ fill: 'hsl(var(--background))', stroke: AHEAD }} />
    })}</g> : null}
  </svg>
}
