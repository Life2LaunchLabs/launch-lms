'use client'

import React from 'react'
import { Mail, Users } from 'lucide-react'
import { cn } from '@/lib/utils'
import { PersonAvatar } from '@components/Goals/share/PersonAvatar'
import { PlanCover } from '@components/Plans/shared/PlanCover'
import type { AssignmentPerson, AssignmentPlan, AssignmentTarget } from '@services/assignments/assignments'
import { personLabel } from '@services/assignments/status'

type Size = 'sm' | 'md' | 'lg'
const BOX: Record<Size, string> = { sm: 'h-6 w-6', md: 'h-8 w-8', lg: 'h-11 w-11' }
const ICON: Record<Size, number> = { sm: 13, md: 17, lg: 22 }

/** A person's avatar on the assignments screens. */
export function PersonTile({ person, size = 'md' }: { person: AssignmentPerson | null | undefined; size?: Size }) {
  return <PersonAvatar user={person ? { ...person, name: personLabel(person) } as any : null} size={size === 'lg' ? 'lg' : size === 'md' ? 'md' : 'sm'} />
}

/** Who an assignment went to, as a tile: a group, a person, or an email invitation not yet taken up. */
export function TargetTile({ target, size = 'md' }: { target: AssignmentTarget; size?: Size }) {
  if (target.type === 'group') return <span className={cn('grid shrink-0 place-items-center bg-muted text-foreground', BOX[size], size === 'lg' ? 'rounded-[14px]' : 'rounded-[10px]')}><Users size={ICON[size]} aria-hidden="true" /></span>
  if (target.type === 'person' && target.person) return <PersonTile person={target.person} size={size} />
  return <span title={target.name || undefined} className={cn('grid shrink-0 place-items-center rounded-full border-[1.5px] border-dashed border-border bg-muted text-muted-foreground', BOX[size])}><Mail size={14} aria-hidden="true" /></span>
}

/** A plan's cover as a tile. */
export function PlanTile({ plan, size = 'md', round }: { plan: AssignmentPlan; size?: Size; round?: boolean }) {
  return <PlanCover plan={plan} iconSize={Math.round(ICON[size] * 0.9)} className={cn('shrink-0', BOX[size], round ? 'rounded-full' : size === 'lg' ? 'rounded-xl' : 'rounded-lg')} />
}

/** A tile and its name, side by side; a link or button when it opens something. */
export function Pair({ tile, name, onClick, href, className }: { tile: React.ReactNode; name: React.ReactNode; onClick?: () => void; href?: string; className?: string }) {
  const classes = cn('inline-flex max-w-full items-center gap-3 text-left text-foreground', (onClick || href) && 'group', className)
  const body = <>{tile}<span className={cn('min-w-0 truncate', (onClick || href) && 'decoration-2 underline-offset-4 group-hover:underline')}>{name}</span></>
  if (href) return <a href={href} className={classes}>{body}</a>
  if (onClick) return <button type="button" onClick={onClick} className={classes}>{body}</button>
  return <span className={classes}>{body}</span>
}

/**
 * The assignment page's title: who, "working on", and the plan, stacked. The plan opens its page.
 */
export function AssignmentStory({ target, plan, ended, planHref, className }: { target: AssignmentTarget; plan: AssignmentPlan; ended?: boolean; planHref?: string; className?: string }) {
  return <h1 className={cn('mt-1.5 flex flex-col items-start gap-1.5 text-[clamp(26px,2.8vw,34px)] font-extrabold tracking-tight', className)}>
    <Pair tile={<TargetTile target={target} size="lg" />} name={target.name || 'Invitation'} />
    <span className="pl-0 font-sans text-sm font-semibold tracking-normal text-muted-foreground sm:pl-14">{ended ? 'worked on' : 'working on'}</span>
    <Pair tile={<PlanTile plan={plan} size="lg" />} name={plan.title} href={planHref} />
  </h1>
}
