'use client'

import React from 'react'
import Link from 'next/link'
import { useSWRConfig } from 'swr'
import { Check, ChevronDown, ChevronRight, ChevronUp, Target, X } from 'lucide-react'
import { getUriWithOrg } from '@services/config/config'
import { exploreKey, type MatchQuest, type QuestItem } from '@services/life/careers'
import { cn } from '@/lib/utils'
import HomeBaseSheet from './HomeBaseSheet'

import { tr } from '@/lib/tr'
// "Unlock your matches": five things from the learner's portfolio, each turning on part of Explore's matching.
// On Discover it stays out of the way: a small "Match accuracy" gauge on the Career swipe billboard drops the list
// down. On the Explore home it's one compact bar that opens to the same list, built like the portfolio's quests.
// Each row opens the place it's done (the interest quiz, the skills picker, the home base sheet, the timeline).

const PATHS: Record<Exclude<QuestItem['key'], 'home'>, string> = {
  interests: '/portfolio/interests',
  skills: '/portfolio/results?open=skills-values',
  styles: '/portfolio/results?open=skills-values',
  school: '/portfolio/timeline/new?type=education',
}

/** How far along the quest is, as a ring. `color` fills it; the middle takes the card's background. */
export function MatchGauge({ quest, color = 'var(--org-primary-color)', size = 'h-6 w-6', inner = 'bg-card' }: { quest: MatchQuest; color?: string; size?: string; inner?: string }) {
  const percent = quest.total ? Math.round((quest.done / quest.total) * 100) : 0
  return <span aria-hidden="true" className={cn('grid shrink-0 place-items-center rounded-full', size)} style={{ background: `conic-gradient(${color} ${percent}%, color-mix(in srgb, ${color} 25%, transparent) 0)` }}>
    <span className={cn('grid h-[calc(100%-6px)] w-[calc(100%-6px)] place-items-center rounded-full', inner)} style={{ color }}><Target className="h-[55%] w-[55%]" /></span>
  </span>
}

/** The accuracy indicator on the Career swipe billboard. It opens and closes the list below the billboard. */
export function MatchAccuracyButton({ quest, open, onToggle, controls }: { quest: MatchQuest; open: boolean; onToggle: () => void; controls: string }) {
  return <button type="button" data-match-accuracy onClick={onToggle} aria-expanded={open} aria-controls={controls}
    aria-label={tr('careers.unlock_matches.match_accuracy_done_of_total', 'Match accuracy: {{done}} of {{total}} done', { done: quest.done, total: quest.total })}
    className={cn('inline-flex min-h-10 items-center gap-2 rounded-[14px] px-3 text-[13px] font-extrabold text-[var(--org-on-primary-color)]', open ? 'bg-black/25' : 'bg-black/15 hover:bg-black/20')}>
    <MatchGauge quest={quest} color="var(--org-on-primary-color)" inner="bg-[var(--org-primary-color)]" />
    {tr('careers.unlock_matches.match_accuracy', 'Match accuracy')}
    <span className="tabular-nums opacity-80">{quest.done}/{quest.total}</span>
    {open ? <ChevronUp size={14} aria-hidden="true" /> : <ChevronDown size={14} aria-hidden="true" />}
  </button>
}

function Row({ item, orgslug, onHome }: { item: QuestItem; orgslug: string; onHome: () => void }) {
  const body = <>
    <span aria-hidden="true" className={cn('grid h-6 w-6 shrink-0 place-items-center rounded-full border-2', item.done ? 'border-[var(--org-primary-color)] bg-[var(--org-primary-color)] text-[var(--org-on-primary-color)]' : 'border-border')}>
      {item.done ? <Check size={13} strokeWidth={3} /> : null}
    </span>
    <span className="min-w-0 flex-1">
      <span className={cn('block font-bold', item.done && 'text-muted-foreground line-through decoration-2')}>{item.title}{item.done ? <span className="sr-only">{' '}{tr('careers.unlock_matches.done', '(done)')}</span> : null}</span>
      {item.done ? null : <small className="block text-[12.5px] font-semibold text-muted-foreground">{item.unlocks}</small>}
    </span>
    {item.done ? null : item.need ? <small className="shrink-0 font-bold tabular-nums text-muted-foreground">{tr('careers.unlock_matches.have_of_need', '{{have}} of {{need}}', { have: item.have || 0, need: item.need })}</small> : <ChevronRight size={16} className="shrink-0 text-muted-foreground" aria-hidden="true" />}
  </>
  const className = 'flex min-h-11 w-full items-center gap-3 rounded-xl px-2 py-1.5 text-left text-[14.5px] text-foreground no-underline'
  if (item.done) return <li className={className}>{body}</li>
  return <li>{item.key === 'home'
    ? <button type="button" onClick={onHome} className={cn(className, 'hover:bg-muted')}>{body}</button>
    : <Link href={getUriWithOrg(orgslug, PATHS[item.key])} className={cn(className, 'hover:bg-muted')}>{body}</Link>}</li>
}

/**
 * The quest's list. `variant="drop"` is the panel under the billboard (always open, with a tail up to the accuracy
 * button and a close button); `variant="bar"` is the Explore home's bar, whose header opens and closes the list.
 */
export default function UnlockMatches({ quest, orgslug, orgId, token, variant = 'bar', id, tail, onClose, defaultOpen = true }: {
  quest: MatchQuest; orgslug: string; orgId?: number; token: string; variant?: 'bar' | 'drop'; id?: string; tail?: number | null; onClose?: () => void; defaultOpen?: boolean
}) {
  const [homeOpen, setHomeOpen] = React.useState(false)
  const [listOpen, setListOpen] = React.useState(defaultOpen)
  const { mutate } = useSWRConfig()
  const saved = () => mutate((key) => Array.isArray(key) && (key[0] === 'career-profile' || key[0] === 'life-home' || (key[0] === exploreKey(orgId)[0])))
  const drop = variant === 'drop'
  const open = drop || listOpen
  const edge = 'color-mix(in srgb, var(--org-primary-color) 55%, hsl(var(--card)))'
  const title = tr('careers.unlock_matches.unlock_your_matches_done_of', 'Unlock your matches · {{done}} of {{total}}', { done: quest.done, total: quest.total })
  const why = tr('careers.unlock_matches.each_one_sharpens_your_matches', 'Each one makes your career matches more about you.')
  const head = <>
    <MatchGauge quest={quest} size="h-10 w-10" />
    <span className="min-w-0 flex-1">
      <b className="block text-[15px] font-extrabold leading-tight">{title}</b>
      <small className="block text-[13px] font-semibold text-muted-foreground">{why}</small>
    </span>
  </>

  return <section id={id} aria-label={tr('careers.unlock_matches.unlock_your_matches', 'Unlock your matches')} data-unlock-matches={variant} className="relative rounded-2xl border-2 bg-card p-2 shadow-[0_4px_0_hsl(var(--border))]" style={{ borderColor: edge }}>
    {drop && tail != null ? <span aria-hidden="true" className="absolute -top-[9px] h-4 w-4 -translate-x-1/2 rotate-45 rounded-[3px] border-l-2 border-t-2 bg-card" style={{ left: tail, borderColor: edge }} /> : null}
    <div className="flex items-center gap-1">
      {drop
        ? <div className="flex min-w-0 flex-1 items-center gap-3 px-2 py-1.5">{head}</div>
        : <button type="button" onClick={() => setListOpen(!listOpen)} aria-expanded={listOpen} className="flex min-w-0 flex-1 items-center gap-3 rounded-xl px-2 py-1.5 text-left hover:bg-muted">
          {head}{listOpen ? <ChevronUp size={16} className="shrink-0" aria-hidden="true" /> : <ChevronDown size={16} className="shrink-0" aria-hidden="true" />}
        </button>}
      {drop && onClose ? <button type="button" onClick={onClose} aria-label={tr('careers.unlock_matches.close', 'Close')} className="grid h-8 w-8 shrink-0 place-items-center self-start rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"><X size={16} /></button> : null}
    </div>
    {open ? <ul className="m-0 mt-1 grid list-none gap-0.5 border-t border-border px-1 pb-0 pt-2">
      {quest.items.map((item) => <Row key={item.key} item={item} orgslug={orgslug} onHome={() => setHomeOpen(true)} />)}
    </ul> : null}
    {open && drop ? <p className="m-0 px-3 pb-1.5 pt-1 text-[12.5px] font-semibold text-muted-foreground">
      {tr('careers.unlock_matches.finish_all_total_for_your', 'Finish all {{total}} for your own Explore home.', { total: quest.total })}{' '}
      <Link href={getUriWithOrg(orgslug, '/discover/explore')} className="font-extrabold text-[var(--org-primary-color)] no-underline hover:underline">{tr('careers.unlock_matches.preview_it', 'Preview it')}</Link>
    </p> : null}
    {homeOpen ? <HomeBaseSheet token={token} onClose={() => setHomeOpen(false)} onSaved={saved} /> : null}
  </section>
}
