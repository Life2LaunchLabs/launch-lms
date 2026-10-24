'use client'

import React from 'react'
import Link from 'next/link'
import { Check, CircleHelp, ClipboardCheck, Clock, MessageSquareText } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@components/ui/tooltip'
import type { Needs } from '@services/assignments/assignments'
import { needTotal, needsText, plural } from '@services/assignments/status'

/**
 * What waits on staff, and its three kinds: questions from learners (purple), work to review
 * (brand) and past due (red). Questions clear once read; review stays until reviewed.
 */
const KINDS = [
  { key: 'questions', icon: CircleHelp, color: 'text-ask', chip: 'bg-ask-soft text-ask', title: (n: number) => plural(n, 'question') },
  { key: 'review', icon: ClipboardCheck, color: 'text-brand', chip: 'bg-brand-soft text-brand-ink', title: (n: number) => `${n} to review` },
  { key: 'behind', icon: Clock, color: 'text-late', chip: 'bg-late-soft text-late', title: (n: number) => `${n} past due` },
] as const

const NEEDS_BUTTON = 'inline-flex h-[34px] items-center gap-1.5 whitespace-nowrap rounded-full bg-brand pl-2.5 pr-3 text-[13px] font-semibold text-white hover:brightness-110'

/** The list's "3 need you" button, with what they are on hover; "All clear" when nothing does. */
export function NeedsButton({ needs, onClick, href }: { needs: Needs; onClick?: () => void; href?: string }) {
  const total = needTotal(needs)
  if (!total) return <span className="inline-flex h-[34px] items-center gap-1.5 whitespace-nowrap px-2.5 text-[13px] font-semibold text-muted-foreground"><Check size={16} className="text-good" aria-hidden="true" />All clear</span>
  return <TooltipProvider delayDuration={80}><Tooltip>
    <TooltipTrigger asChild>
      {href ? <Link href={href} aria-label={`${total} need you: ${needsText(needs)}`} className={NEEDS_BUTTON}>
        <MessageSquareText size={16} aria-hidden="true" /><b className="text-sm">{total}</b><span>need you</span>
      </Link> : <button type="button" onClick={onClick} aria-label={`${total} need you: ${needsText(needs)}`} className={NEEDS_BUTTON}>
        <MessageSquareText size={16} aria-hidden="true" /><b className="text-sm">{total}</b><span>need you</span>
      </button>}
    </TooltipTrigger>
    <TooltipContent side="top" className="text-xs">{needsText(needs)}</TooltipContent>
  </Tooltip></TooltipProvider>
}

/** A row's needs as icons and counts, leaving out what's zero (People rows, learner lists). */
export function CountIcons({ needs, className }: { needs: Needs; className?: string }) {
  return <span className={cn('inline-flex items-center gap-2.5 text-[13px] font-bold tabular-nums', className)}>
    {KINDS.map(({ key, icon: Icon, color, title }) => needs[key] ? <span key={key} title={title(needs[key])} className={cn('inline-flex items-center gap-0.5', color)}>
      <Icon size={14} aria-hidden="true" />{needs[key]}<span className="sr-only"> {title(needs[key])}</span>
    </span> : null)}
  </span>
}

/** A step card's needs as small chips: its messages, work to review and who's past due. */
export function NeedChips({ messages, review, behind, className }: { messages: number; review: number; behind: number; className?: string }) {
  const values = { questions: messages, review, behind }
  return <span className={cn('inline-flex items-center gap-1', className)}>
    {KINDS.map(({ key, icon: Icon, chip, title }) => {
      const value = values[key]
      if (!value) return null
      const text = key === 'questions' ? plural(value, 'message') : title(value)
      const Shown = key === 'questions' ? MessageSquareText : Icon
      return <span key={key} title={text} className={cn('inline-flex h-5 items-center gap-0.5 rounded-full pl-1.5 pr-[7px] text-[11.5px] font-bold', chip)}>
        <Shown size={13} aria-hidden="true" />{value}<span className="sr-only"> {text}</span>
      </span>
    })}
  </span>
}

/** A learner's Message button: their needs in place of the label when they have any. */
export function MessageButton({ needs, onClick, label = 'Message', className }: { needs?: Needs; onClick: () => void; label?: string; className?: string }) {
  const has = needs ? needTotal(needs) > 0 : false
  return <button type="button" onClick={onClick} aria-label={has && needs ? `${label} · ${needsText(needs)}` : label}
    className={cn('inline-flex h-[34px] min-w-28 items-center justify-center gap-2 rounded-full border px-3 text-[13px] font-semibold text-foreground',
      has ? 'border-transparent bg-muted' : 'border-border bg-card hover:border-foreground', className)}>
    {has && needs ? <CountIcons needs={needs} /> : <><MessageSquareText size={15} aria-hidden="true" /><span>{label}</span></>}
  </button>
}
