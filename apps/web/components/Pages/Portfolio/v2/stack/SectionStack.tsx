'use client'

import { type ReactNode, createContext, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { LookId, SectionType } from '@services/portfolio/records'
import { type Row, type Slot, copyRows, lift, place, rangeOf, resizeGap } from './model'

// The section stack, laid out and edited in place. Every section sits in one CSS grid of six columns, placed
// by row and column, so moving one never remounts it. In edit mode: drag a section to move it (drop it on
// another to share its row), drag the gap between two to resize them, drag the bottom edge for height.
// On a phone it's one column in the same order, with heights of its own.

/** What a section needs to know from the stack it's in. */
// eslint-disable-next-line no-unused-vars
export type SectionCtx = { editing: boolean; fixed: boolean; look: LookId; title: string; rename?: (title: string) => void; controls?: ReactNode }
const Ctx = createContext<Partial<Record<SectionType, SectionCtx>>>({})
export const useSection = (type?: SectionType): SectionCtx | undefined => {
  const all = useContext(Ctx)
  return type ? all[type] : undefined
}
export const SectionProvider = Ctx.Provider

type Drag =
  | { kind: 'pending'; type: SectionType; x: number; y: number }
  | { kind: 'move'; type: SectionType; item: Row[number]; rows: Row[]; home: Slot; slot: Slot; ghost: HTMLElement; ox: number; oy: number; h: number }
  | { kind: 'gap'; base: Row[]; r: number; g: number; left: number; width: number; rows: Row[] }
  | { kind: 'height'; types: SectionType[]; lo: number; hi: number; y: number; h0: number; h: number }

const PHONE = 640
const sameSlot = (a?: Slot, b?: Slot) => JSON.stringify(a) === JSON.stringify(b)
const reduced = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

export function SectionStack({ rows, editing, render, context, heightOf, onMove, onHeight }: {
  rows: Row[]; editing: boolean; render: (type: SectionType) => ReactNode // eslint-disable-line no-unused-vars
  context: (type: SectionType) => Omit<SectionCtx, 'fixed'> // eslint-disable-line no-unused-vars
  heightOf: (type: SectionType, phone: boolean) => number | null // eslint-disable-line no-unused-vars
  onMove: (rows: Row[]) => void // eslint-disable-line no-unused-vars
  onHeight: (types: SectionType[], px: number, phone: boolean) => void // eslint-disable-line no-unused-vars
}) {
  const box = useRef<HTMLDivElement>(null)
  const [phone, setPhone] = useState(false)
  const [view, setView] = useState<{ rows: Row[]; slot?: Slot; lifted?: SectionType } | null>(null)
  const [live, setLive] = useState<{ types: SectionType[]; h: number } | null>(null)
  const drag = useRef<Drag | null>(null)
  const rects = useRef<Record<string, DOMRect>>({})
  const arranged = useRef('')
  const shown = view?.rows || rows

  useEffect(() => {
    const el = box.current
    if (!el) return
    const watch = new ResizeObserver(() => setPhone(el.clientWidth < PHONE))
    watch.observe(el)
    return () => watch.disconnect()
  }, [])

  // Where each section goes: its grid row and columns, the placeholder, and the gaps you can drag.
  type Cell = { key: string; type?: SectionType; r: number; row: number; col: string; ph?: boolean; gut?: number; u?: number }
  const cells: Cell[] = []
  let gridRow = 1
  const slot = view?.slot
  const phRow = (r: number) => cells.push({ key: '__ph', r, row: gridRow++, col: '1 / -1', ph: true })
  shown.forEach((row, r) => {
    if (slot?.newRow && slot.r === r) phRow(r)
    const items: Array<Row[number] & { ph?: boolean }> = row.map((item) => ({ ...item }))
    if (slot && !slot.newRow && slot.r === r) { items.splice(slot.i, 0, { type: 'about', u: 0, ph: true }); const n = items.length; items.forEach((item) => { if (n === 3) item.u = 2; else if (n === 2) item.u = 3 }) }
    let at = 1
    items.forEach((item, k) => {
      const col = phone ? '1 / -1' : `${at} / span ${item.u}`
      if (item.ph) cells.push({ key: '__ph', r, row: gridRow, col, ph: true })
      else cells.push({ key: item.type, type: item.type, r, row: gridRow, col, u: item.u })
      if (phone) gridRow++
      at += item.u
      if (!phone && editing && !view?.lifted && k < items.length - 1) cells.push({ key: `gut-${r}-${k}`, r, row: gridRow, col: `${at} / span 1`, gut: k })
    })
    if (!phone) gridRow++
  })
  if (slot?.newRow && slot.r >= shown.length) phRow(shown.length)
  // Sections lifted off the stack stay mounted, hidden, so nothing inside them resets.
  if (view?.lifted) cells.push({ key: view.lifted, type: view.lifted, r: -1, row: 1, col: '1 / -1' })

  // Heights: a row shares one (the tallest asked for, kept inside what every member allows).
  const heights: Partial<Record<SectionType, number>> = {}
  shown.forEach((row) => {
    const types = row.map((item) => item.type)
    if (phone) types.forEach((type) => { const h = live?.types.includes(type) ? live.h : heightOf(type, true); if (h) { const [lo, hi] = rangeOf([type]); heights[type] = Math.max(lo, Math.min(hi, h)) } })
    else {
      const asked = types.map((type) => live?.types.includes(type) ? live.h : heightOf(type, false)).filter((h): h is number => Boolean(h))
      if (asked.length) { const [lo, hi] = rangeOf(types); const h = Math.max(lo, Math.min(hi, Math.max(...asked))); types.forEach((type) => { heights[type] = h }) }
    }
  })

  // After each layout: show as many items as fit in a section with a set height, and glide moved sections
  // from where they were (FLIP), except while a height is being dragged.
  useLayoutEffect(() => {
    const el = box.current
    if (!el) return
    el.querySelectorAll<HTMLElement>('[data-sec]').forEach((sec) => {
      const items = Array.from(sec.querySelectorAll<HTMLElement>('[data-item]'))
      items.forEach((item) => item.removeAttribute('data-fit-hidden'))
      if (!sec.hasAttribute('data-fixed')) return
      const area = (sec.querySelector('[data-fit-box]') as HTMLElement | null) || sec
      const bottom = area.getBoundingClientRect().bottom + 1
      items.map((item) => [item, item.getBoundingClientRect().bottom > bottom] as const).forEach(([item, out], k) => { if (out && k > 0) item.setAttribute('data-fit-hidden', '') })
    })
    // Glide only when the arrangement changed: not on the first layout, a resize or the switch to one column.
    const key = `${phone}:${JSON.stringify(shown)}`
    const moved = Boolean(arranged.current) && arranged.current !== key && arranged.current.startsWith(`${phone}:`)
    arranged.current = key
    const next: Record<string, DOMRect> = {}
    el.querySelectorAll<HTMLElement>('[data-sec]:not([hidden])').forEach((sec) => {
      const rect = sec.getBoundingClientRect()
      const key = sec.dataset.sec || ''
      next[key] = new DOMRect(rect.x, rect.y + window.scrollY, rect.width, rect.height)
      const was = rects.current[key]
      if (!was || !moved || live || reduced() || !sec.animate) return
      const dx = was.x - rect.x, dy = was.y - (rect.y + window.scrollY)
      if (Math.abs(dx) > 1 || Math.abs(dy) > 1 || Math.abs(was.width - rect.width) > 1) {
        const sx = was.width / Math.max(rect.width, 1)
        sec.animate([{ transform: `translate(${dx}px, ${dy}px)`, opacity: Math.abs(sx - 1) > 0.02 ? 0.6 : 1 }, { transform: 'none', opacity: 1 }], { duration: 260, easing: 'cubic-bezier(.2,.8,.2,1)' })
      }
    })
    rects.current = next
  })

  // ── Dragging ──
  function rowsOnScreen() {
    // Each grid row on screen: its rect, and whether it's the placeholder's own row or which stack row it is.
    const el = box.current!
    const byRow = new Map<number, { rect: DOMRect; r: number; ph: boolean; secs: HTMLElement[] }>()
    el.querySelectorAll<HTMLElement>('[data-sec]:not([hidden]), [data-ph]').forEach((node) => {
      const gr = Number(node.dataset.gr), rect = node.getBoundingClientRect()
      const entry = byRow.get(gr)
      const ph = node.hasAttribute('data-ph')
      if (!entry) byRow.set(gr, { rect, r: Number(node.dataset.r), ph, secs: ph ? [] : [node] })
      else {
        entry.rect = new DOMRect(Math.min(entry.rect.left, rect.left), Math.min(entry.rect.top, rect.top), Math.max(entry.rect.right, rect.right) - Math.min(entry.rect.left, rect.left), Math.max(entry.rect.bottom, rect.bottom) - Math.min(entry.rect.top, rect.top))
        if (!ph) { entry.secs.push(node); entry.ph = false }
      }
    })
    return Array.from(byRow.entries()).sort(([a], [b]) => a - b).map(([, value]) => value)
  }

  // Desktop: the top or bottom of a row makes a new full row; the middle joins it, left or right of the section you're over.
  function hitDesktop(d: Extract<Drag, { kind: 'move' }>, x: number, y: number): Slot {
    for (const row of rowsOnScreen()) {
      if (y < row.rect.top) return row.ph && row.secs.length === 0 ? d.slot : { newRow: true, r: row.r }
      if (y > row.rect.bottom) continue
      if (row.ph && !row.secs.length) return d.slot
      const r = row.r, n = d.rows[r]?.length || 0, fy = (y - row.rect.top) / row.rect.height
      if (fy < 0.28 || (n >= 3 && fy < 0.5)) return { newRow: true, r }
      if (fy > 0.72 || n >= 3) return { newRow: true, r: r + 1 }
      let i = row.secs.length
      for (let k = 0; k < row.secs.length; k++) { const m = row.secs[k].getBoundingClientRect(); if (x < m.left + m.width / 2) { i = k; break } }
      return { newRow: false, r, i }
    }
    return { newRow: true, r: d.rows.length }
  }
  // Phone: one column. Dropping between two sections that share a row on desktop keeps it in that row;
  // anywhere else it gets a row of its own. So a phone keeps or breaks a split, but never makes one.
  function hitPhone(d: Extract<Drag, { kind: 'move' }>, y: number): Slot {
    const secs = Array.from(box.current!.querySelectorAll<HTMLElement>('[data-sec]:not([hidden])')).sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top)
    const at = secs.find((sec) => { const m = sec.getBoundingClientRect(); return y < m.top + m.height / 2 })
    if (!at) return { newRow: true, r: d.rows.length }
    const r = Number(at.dataset.r), i = d.rows[r].findIndex((item) => item.type === at.dataset.sec)
    if (i > 0 && d.rows[r].length < 3) return { newRow: false, r, i }
    return { newRow: true, r: i > 0 ? r + 1 : r }
  }

  function startMove(d: Extract<Drag, { kind: 'pending' }>, x: number, y: number) {
    const sec = box.current?.querySelector<HTMLElement>(`[data-sec="${d.type}"]`)
    const lifted = lift(rows, d.type)
    if (!sec || !lifted) return
    const rect = sec.getBoundingClientRect()
    const ghost = sec.cloneNode(true) as HTMLElement
    const w = Math.min(rect.width, 460)
    Object.assign(ghost.style, { position: 'fixed', left: '0px', top: '0px', width: `${w}px`, height: `${Math.min(rect.height, 280)}px`, overflow: 'hidden', pointerEvents: 'none', zIndex: '80', opacity: '0.92', transform: 'rotate(1.5deg) scale(.97)', boxShadow: '0 24px 60px rgba(0,0,0,.28)', borderRadius: '24px', transition: 'none', gridRow: '', gridColumn: '' })
    ghost.removeAttribute('data-sec');
    (sec.closest('[data-portfolio-v2]') || document.body).appendChild(ghost)
    const move: Drag = { kind: 'move', type: d.type, item: lifted.item, rows: lifted.rows, home: lifted.home, slot: lifted.home, ghost, ox: Math.min(x - rect.left, w - 30), oy: Math.min(y - rect.top, 40), h: Math.max(100, Math.min(rect.height, 260)) }
    drag.current = move
    setView({ rows: lifted.rows, slot: lifted.home, lifted: d.type })
    moveTo(move, x, y)
  }
  function moveTo(d: Extract<Drag, { kind: 'move' }>, x: number, y: number) {
    d.ghost.style.left = `${x - d.ox}px`; d.ghost.style.top = `${y - d.oy}px`
    if (y < 70) window.scrollBy(0, -14); else if (y > window.innerHeight - 70) window.scrollBy(0, 14)
    const ph = box.current?.querySelector('[data-ph]')?.getBoundingClientRect()
    if (ph && x >= ph.left && x <= ph.right && y >= ph.top && y <= ph.bottom) return
    const next = phone ? hitPhone(d, y) : hitDesktop(d, x, y)
    if (!sameSlot(next, d.slot)) { d.slot = next; setView({ rows: d.rows, slot: next, lifted: d.type }) }
  }

  useEffect(() => {
    function onMovePointer(event: PointerEvent) {
      const d = drag.current
      if (!d) return
      if (d.kind === 'pending') { if (Math.hypot(event.clientX - d.x, event.clientY - d.y) > 5) startMove(d, event.clientX, event.clientY); return }
      if (d.kind === 'move') moveTo(d, event.clientX, event.clientY)
      else if (d.kind === 'gap') {
        const f = Math.max(0, Math.min(6, ((event.clientX - d.left) / d.width) * 6))
        const next = resizeGap(d.base, d.r, d.g, f)
        if (JSON.stringify(next) !== JSON.stringify(d.rows)) { d.rows = next; setView({ rows: next }) }
      } else if (d.kind === 'height') {
        d.h = Math.round(Math.max(d.lo, Math.min(d.hi, d.h0 + event.clientY - d.y)))
        setLive({ types: d.types, h: d.h })
      }
    }
    function onUp() {
      const d = drag.current
      drag.current = null
      document.body.classList.remove('select-none', 'cursor-grabbing')
      if (!d) return
      if (d.kind === 'move') { d.ghost.remove(); const next = place(d.rows, d.item, d.slot); setView(null); onMove(next) }
      else if (d.kind === 'gap') { setView(null); onMove(d.rows) }
      else if (d.kind === 'height') { setLive(null); onHeight(d.types, d.h, phone) }
    }
    window.addEventListener('pointermove', onMovePointer)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    return () => { window.removeEventListener('pointermove', onMovePointer); window.removeEventListener('pointerup', onUp); window.removeEventListener('pointercancel', onUp) }
  })

  function onPointerDown(event: React.PointerEvent) {
    if (!editing || event.button !== 0) return
    const target = event.target as HTMLElement
    if (target.closest('[data-edit-control], input, textarea, select, [contenteditable="true"]')) return
    const gut = target.closest<HTMLElement>('[data-gut]'), hh = target.closest<HTMLElement>('[data-hh]'), sec = target.closest<HTMLElement>('[data-sec]')
    if (gut) {
      const r = Number(gut.dataset.r)
      const members = Array.from(box.current!.querySelectorAll<HTMLElement>(`[data-sec][data-r="${r}"]:not([hidden])`)).map((node) => node.getBoundingClientRect())
      const left = Math.min(...members.map((m) => m.left)), right = Math.max(...members.map((m) => m.right))
      drag.current = { kind: 'gap', base: copyRows(rows), r, g: Number(gut.dataset.gut), left, width: right - left, rows: copyRows(rows) }
    } else if (hh && sec) {
      const type = sec.dataset.sec as SectionType
      const r = Number(sec.dataset.r)
      const types = phone ? [type] : rows[r].map((item) => item.type)
      const [lo, hi] = rangeOf(types)
      const h0 = sec.getBoundingClientRect().height
      drag.current = { kind: 'height', types, lo, hi, y: event.clientY, h0, h: Math.round(h0) }
    } else if (sec) drag.current = { kind: 'pending', type: sec.dataset.sec as SectionType, x: event.clientX, y: event.clientY }
    else return
    event.preventDefault()
    document.body.classList.add('select-none', ...(sec && !hh ? ['cursor-grabbing'] : []))
  }
  function onDoubleClick(event: React.MouseEvent) {
    const hh = (event.target as HTMLElement).closest('[data-hh]'), sec = hh?.closest<HTMLElement>('[data-sec]')
    if (!editing || !sec) return
    const type = sec.dataset.sec as SectionType
    onHeight(phone ? [type] : rows[Number(sec.dataset.r)].map((item) => item.type), 0, phone)
  }

  const provided: Partial<Record<SectionType, SectionCtx>> = {}
  shown.forEach((row) => row.forEach((item) => { provided[item.type] = { ...context(item.type), fixed: Boolean(heights[item.type]) } }))
  if (view?.lifted) provided[view.lifted] = { ...context(view.lifted), fixed: false }

  return <SectionProvider value={provided}><div ref={box} onPointerDown={onPointerDown} onDoubleClick={onDoubleClick} data-stack data-stack-editing={editing || undefined} className="relative grid grid-cols-6 items-stretch gap-4">
    {cells.map((cell) => {
      if (cell.ph) return <div key={cell.key} data-ph data-r={cell.r} data-gr={cell.row} aria-hidden="true" className="grid min-h-[110px] place-items-center rounded-3xl border-2 border-dashed border-[var(--org-primary-color)] bg-[color-mix(in_srgb,var(--org-primary-color)_10%,transparent)] text-xs font-extrabold text-[var(--org-primary-color)] transition-all" style={{ gridRow: cell.row, gridColumn: cell.col, height: slot?.newRow ? (drag.current?.kind === 'move' ? drag.current.h : 140) : undefined }}>Drop here</div>
      if (cell.gut !== undefined) return <div key={cell.key} data-gut={cell.gut} data-r={cell.r} title="Drag to resize both" className="group/gut relative z-[3] -ml-4 flex w-4 cursor-col-resize touch-none items-center justify-center self-stretch" style={{ gridRow: cell.row, gridColumn: cell.col }}>
        <span className="h-12 w-1.5 rounded-full bg-[var(--org-primary-color)] opacity-40 transition-all group-hover/gut:h-20 group-hover/gut:opacity-100" />
      </div>
      const type = cell.type!
      const h = heights[type]
      return <div key={cell.key} data-sec={type} data-r={cell.r} data-gr={cell.row} data-fixed={h ? '' : undefined} hidden={cell.r < 0} className={`group/sec relative flex min-w-0 flex-col [&>*]:flex-1 ${editing ? 'cursor-grab touch-none' : ''}`} style={{ gridRow: cell.row, gridColumn: cell.col, height: h ? `${h}px` : undefined }}>
        {render(type)}
        {editing ? <div data-hh title="Drag to set the height. Double-click to fit the content." className="absolute inset-x-0 -bottom-3 z-[3] flex h-4 cursor-ns-resize touch-none items-center justify-center opacity-0 transition group-hover/sec:opacity-100">
          <span className="h-1.5 w-14 rounded-full bg-[var(--org-primary-color)]" />
          <small className="absolute left-[calc(50%+36px)] whitespace-nowrap text-[11px] font-bold text-muted-foreground">{h ? `${h} px` : 'Fits its content'}</small>
        </div> : null}
      </div>
    })}
  </div></SectionProvider>
}
