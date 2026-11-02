'use client'

import { useLayoutEffect, useState, type ReactNode } from 'react'
import Confetti from 'react-confetti'
import { Check, ChevronDown, ChevronRight, ChevronUp, Lock, LockOpen, Rocket, X } from 'lucide-react'
import { Button } from '@components/ui/button'
import { QuestMark } from './parts'
import type { Quest, QuestItem, Stage } from './progress'

// The quest pieces of the front page: the locked action in the action row (a gauge and "2/5"), the
// banner that drops from it with the quest's list, and the gold unlock moment.

const AMBER = '#F5A524'
const BLUE = '#2F66D6'

function Gauge({ percent, color, children, size = 'h-6 w-6' }: { percent: number; color: string; children: ReactNode; size?: string }) {
  return <span aria-hidden="true" className={`grid shrink-0 place-items-center rounded-full ${size}`} style={{ background: `conic-gradient(${color} ${percent}%, color-mix(in srgb, ${color} 22%, transparent) 0)` }}>
    <span className="grid h-[calc(100%-6px)] w-[calc(100%-6px)] place-items-center rounded-full bg-card [&_svg]:h-3 [&_svg]:w-3" style={{ color }}>{children}</span>
  </span>
}

const LOCKED_LABEL = { 1: 'Share', 2: 'Résumé', 3: 'Mastery' } as const

/** The action a quest unlocks, while it's locked or just unlocked. It opens and closes the quest banner. */
export function QuestButton({ stage, open, onToggle }: { stage: Stage; open: boolean; onToggle: () => void }) {
  if (stage.kind === 'mastered') return null
  const { quest } = stage
  const label = LOCKED_LABEL[quest.n]
  if (stage.kind === 'unlocked') return <button type="button" data-quest-button onClick={onToggle} aria-expanded={open} className="week-gold [&>*]:relative [&>*]:z-[1] inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-xl px-3 text-sm font-extrabold text-[#5a3600] shadow-[0_3px_0_var(--week-gold-edge)] sm:flex-none sm:px-4">
    {quest.n === 3 ? <Rocket className="h-4 w-4" /> : <LockOpen className="h-4 w-4" />}<span>{label}</span>
  </button>
  const color = quest.n === 3 ? AMBER : BLUE
  return <button type="button" data-quest-button onClick={onToggle} aria-expanded={open} aria-label={`${label}: ${quest.title}, ${quest.done} of ${quest.total} done`} className={`inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-xl border-2 bg-card px-3 text-sm font-extrabold shadow-[0_3px_0_hsl(var(--border))] sm:flex-none sm:px-4 ${open ? 'border-foreground/40' : 'border-border'}`}>
    <Gauge percent={Math.round((quest.done / quest.total) * 100)} color={color}>{quest.n === 3 ? <Rocket /> : <Lock />}</Gauge>
    {label}<span className="hidden text-xs font-bold tabular-nums text-muted-foreground sm:inline">{quest.done}/{quest.total}</span>
  </button>
}

const UNLOCKS = {
  1: { title: 'Sharing unlocked!', body: 'Your portfolio is private until you make it public.', action: 'Make it public' },
  2: { title: 'Résumé unlocked!', body: 'It builds itself from everything in your portfolio.', action: 'Open my résumé' },
  3: { title: 'You earned the mastery badge!', body: 'It shows next to your name for anyone who sees your portfolio.', action: 'Nice' },
} as const

function ItemRow({ item, onItem }: { item: QuestItem; onItem: (key: string) => void }) { // eslint-disable-line no-unused-vars
  const body = <>
    <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full border-2 ${item.done ? 'border-[#22c55e] bg-[#22c55e] text-white' : 'border-border'}`}>{item.done ? <Check className="h-3.5 w-3.5" /> : null}</span>
    <span className="min-w-0 flex-1"><span className={`block font-bold ${item.done ? 'text-muted-foreground line-through decoration-2' : ''}`}>{item.label}</span>{item.detail ? <small className="block text-[12.5px] font-semibold text-muted-foreground">{item.detail}</small> : null}</span>
    {item.done ? null : item.need ? <small className="font-bold tabular-nums text-muted-foreground">{item.have} of {item.need}</small> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
  </>
  const className = 'flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left text-[14.5px]'
  return item.done ? <div className={className}>{body}</div> : <button type="button" onClick={() => onItem(item.key)} className={`${className} hover:bg-muted`}>{body}</button>
}

/** Confetti for an unlock plays once in this browser, not on every reload until it's acknowledged. */
// What this page load already decided, so a second render (or React's strict mode) gives the same answer.
const firstTimes = new Map<string, boolean>()

function useFirstTime(key: string) {
  // Read when the banner mounts, which only happens in the browser once the portfolio has loaded.
  const [first] = useState(() => {
    if (typeof window === 'undefined') return false
    if (!firstTimes.has(key)) {
      let seen = false
      try { seen = Boolean(window.localStorage.getItem(key)); window.localStorage.setItem(key, '1') } catch { /* storage may be off; then it plays each time */ }
      firstTimes.set(key, !seen)
    }
    return firstTimes.get(key)!
  })
  return first
}

function UnlockConfetti({ quest }: { quest: Quest }) {
  return useFirstTime(`portfolio-unlock-confetti-${quest.n}`) ? <Confetti recycle={false} numberOfPieces={160} gravity={0.25} className="!fixed !inset-0 pointer-events-none" /> : null
}

/** Where the banner's tail points: the middle of the quest's button in the action row, so it's clear what it drops from. */
function useTail() {
  const [banner, setBanner] = useState<HTMLElement | null>(null)
  const [left, setLeft] = useState<number | null>(null)
  useLayoutEffect(() => {
    const place = () => {
      const button = document.querySelector<HTMLElement>('[data-quest-button]')
      const box = banner?.getBoundingClientRect()
      if (!button || !box) return setLeft(null)
      const at = button.getBoundingClientRect()
      setLeft(Math.min(Math.max(at.left + at.width / 2 - box.left, 24), box.width - 24))
    }
    place()
    window.addEventListener('resize', place)
    return () => window.removeEventListener('resize', place)
  }, [banner])
  return [setBanner, left] as const
}

function Tail({ left, color }: { left: number | null; color: string }) {
  if (left === null) return null
  return <span aria-hidden="true" className="absolute -top-[9px] h-4 w-4 -translate-x-1/2 rotate-45 rounded-[3px] border-l-2 border-t-2 bg-card" style={{ left, borderColor: color }} />
}

/** What the open quest asks for, or the unlock moment once it's finished. */
export function QuestBanner({ stage, list, onList, onClose, onItem, onUnlock, busy }: { stage: Stage; list: boolean; onList: () => void; onClose: () => void; onItem: (key: string) => void; onUnlock: (quest: Quest) => void; busy?: boolean }) { // eslint-disable-line no-unused-vars
  const [placeBanner, tailLeft] = useTail()
  if (stage.kind === 'mastered') return null
  const { quest } = stage
  if (stage.kind === 'unlocked') {
    const unlock = UNLOCKS[quest.n]
    return <section aria-label={unlock.title} className="week-gold [&>*]:relative [&>*]:z-[1] relative mt-4 flex items-center gap-3 overflow-hidden rounded-2xl px-4 py-3 text-[#5a3600] shadow-[0_4px_0_var(--week-gold-edge)]">
      <UnlockConfetti quest={quest} />
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/50">{quest.n === 3 ? <Rocket className="h-5 w-5" /> : <LockOpen className="h-5 w-5" />}</span>
      <div className="min-w-0 flex-1"><b className="block text-[15.5px] font-extrabold">{unlock.title}</b><small className="block text-[13px] font-semibold opacity-80">{unlock.body}</small></div>
      <Button type="button" size="sm" disabled={busy} onClick={() => onUnlock(quest)} className="shrink-0 bg-[#5a3600] text-white hover:bg-[#5a3600]/90">{unlock.action}</Button>
      <button type="button" onClick={onClose} aria-label="Dismiss" className="grid h-8 w-8 shrink-0 place-items-center rounded-full hover:bg-white/40"><X className="h-4 w-4" /></button>
    </section>
  }
  const color = quest.n === 3 ? AMBER : BLUE
  const edge = `color-mix(in srgb, ${color} 55%, hsl(var(--card)))`
  return <section ref={placeBanner} aria-label={quest.title} className="relative mt-4 rounded-2xl border-2 bg-card p-2 shadow-[0_4px_0_hsl(var(--border))]" style={{ borderColor: edge }}>
    <Tail left={tailLeft} color={edge} />
    <div className="flex items-center gap-1">
      <button type="button" onClick={onList} aria-expanded={list} className="flex min-w-0 flex-1 items-center gap-3 rounded-xl px-2 py-1.5 text-left hover:bg-muted">
        <Gauge percent={Math.round((quest.done / quest.total) * 100)} color={color} size="h-10 w-10">{quest.n === 3 ? <Rocket className="!h-4 !w-4" /> : <Lock className="!h-4 !w-4" />}</Gauge>
        <span className="min-w-0 flex-1"><b className="block text-[15px] font-extrabold">{quest.title} · {quest.done} of {quest.total}</b>
          <small className="flex flex-wrap items-center gap-1 text-[13px] font-semibold text-muted-foreground">{quest.why} Look for <QuestMark className="h-4 w-4" /> on your portfolio.</small></span>
        {list ? <ChevronUp className="h-4 w-4 shrink-0" /> : <ChevronDown className="h-4 w-4 shrink-0" />}
      </button>
      <button type="button" onClick={onClose} aria-label="Hide for now" title="Hide for now" className="grid h-8 w-8 shrink-0 place-items-center self-start rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"><X className="h-4 w-4" /></button>
    </div>
    {list ? <div className="mt-1 grid gap-0.5 border-t border-border px-1 pt-2">{quest.items.map((item) => <ItemRow key={item.key} item={item} onItem={onItem} />)}</div> : null}
  </section>
}

/** Our mastery badge, shown by the name once the learner earns it. */
export function MasteryBadge() {
  return <span role="img" aria-label="Portfolio mastery badge" title="Portfolio mastery: fully built" className="grid h-8 w-8 shrink-0 place-items-center text-white" style={{ background: AMBER, clipPath: 'polygon(50% 0, 93% 25%, 93% 75%, 50% 100%, 7% 75%, 7% 25%)' }}><Rocket className="h-4 w-4" /></span>
}
