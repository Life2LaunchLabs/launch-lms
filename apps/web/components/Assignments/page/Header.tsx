'use client'

import React from 'react'
import Link from 'next/link'
import { CalendarDays, ChevronRight, Medal, MessageSquareText, MoreVertical, Pause, Play, Repeat, Square, Users } from 'lucide-react'
import { cn } from '@/lib/utils'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@components/ui/dropdown-menu'
import { coverPalette } from '@components/Plans/shared/PlanCover'
import { AssignmentStory, PersonTile } from '@components/Assignments/Pair'
import { AwardBadgeButton } from '@components/Badges/award/AwardFlow'
import type { AssignmentDetail, AssignmentPerson } from '@services/assignments/assignments'
import { dateRange, statusPill, type PillTone } from '@services/assignments/page'
import { firstName, personLabel, plural } from '@services/assignments/status'

const PILL: Record<PillTone, string> = {
  running: 'bg-good-soft text-good',
  soon: 'bg-brand-soft text-brand-ink',
  paused: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  ended: 'bg-muted text-muted-foreground',
}

export type AssignmentTab = 'steps' | 'people'

export interface HeaderActions {
  onMessage?: () => void
  onSchedule: () => void
  onVersion?: () => void
  onPause: () => void
  onResume: () => void
  onEnd: () => void
}

const awardee = (person: AssignmentPerson) => ({ id: person.id, name: personLabel(person), username: person.username || '', avatar_image: person.avatar_image, user_uuid: person.user_uuid })

/** A plan's color, faintly, behind the assignment's header. */
export const heroTint = (detail: AssignmentDetail) => ({ background: `color-mix(in srgb, ${coverPalette(detail.plan).deep} 9%, hsl(var(--background)))` })

/**
 * The assignment's header: where it sits, who is working on which plan, its facts, Message and the
 * settings menu, and the Steps and People tabs.
 */
export default function Header({ detail, tab, links, invited, people, unread, actions }: {
  detail: AssignmentDetail
  tab: AssignmentTab
  links: { list: string; plan: string; tab: (tab: AssignmentTab) => string } // eslint-disable-line no-unused-vars
  invited: number
  /** The People tab's count. */
  people: number
  unread: number
  actions: HeaderActions
}) {
  const pill = statusPill(detail)
  const group = detail.target.type === 'group'
  const leads = detail.staff.filter((member) => member.person)
  const messageLabel = group ? 'Message group' : detail.learner_count ? `Message ${firstName(detail.target.type === 'person' ? detail.target.person : null)}` : ''
  return <header className="border-b border-border" style={heroTint(detail)}>
    <div className="mx-auto max-w-[1180px] px-4 pt-6 sm:px-8">
      <nav aria-label="Breadcrumb" className="flex min-w-0 flex-wrap items-center gap-1.5 text-[13px] font-semibold text-muted-foreground">
        <Link href={links.list} className="hover:text-foreground">Assignments</Link><ChevronRight size={13} aria-hidden="true" />
        <Link href={links.plan} className="min-w-0 truncate hover:text-foreground">{detail.plan.title}</Link><ChevronRight size={13} aria-hidden="true" />
        <span aria-current="page" className="min-w-0 truncate text-foreground">{detail.target.name || 'Invitation'}</span>
      </nav>
      <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
        <AssignmentStory target={detail.target} plan={detail.plan} ended={detail.status === 'ended'} planHref={links.plan} className="min-w-0" />
        <div className="flex items-center gap-2">
          {messageLabel && actions.onMessage ? <button type="button" onClick={actions.onMessage}
            className="inline-flex h-10 items-center gap-2 rounded-full border border-border bg-card px-4 text-sm font-semibold hover:bg-muted">
            <MessageSquareText size={16} aria-hidden="true" />{messageLabel}
            {unread ? <span className="grid h-5 min-w-5 place-items-center rounded-full bg-good px-1.5 text-[11px] font-bold text-white">{unread}</span> : null}
          </button> : null}
          {detail.can_manage && detail.status !== 'ended' ? <Menu detail={detail} actions={actions} /> : null}
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-[13.5px] text-muted-foreground">
        <span className={cn('inline-flex h-[30px] items-center gap-2 rounded-full px-3 text-[12.5px] font-bold', PILL[pill.tone])}><i className="h-[7px] w-[7px] rounded-full bg-current" />{pill.text}</span>
        <span className="inline-flex items-center gap-1.5"><CalendarDays size={16} aria-hidden="true" />{dateRange(detail)}</span>
        <span className="inline-flex items-center gap-1.5"><Users size={16} aria-hidden="true" />{group ? plural(detail.learner_count, 'learner') : detail.learner_count ? 'One learner' : 'Invited'}{group && invited ? ` · ${invited} invited` : ''}</span>
        {leads.length ? <span className="inline-flex items-center gap-2">
          <span className="flex -space-x-1.5">{leads.slice(0, 3).map((member) => <span key={member.person!.id} className="rounded-full ring-2 ring-background"><PersonTile person={member.person} size="sm" /></span>)}</span>
          {leads.map((member) => firstName(member.person)).join(', ')}
        </span> : null}
        <span>{detail.plan.version ? `v${detail.plan.version}` : ''}{detail.plan.badge ? ` · earns ${detail.plan.badge.name}` : ''}</span>
        {detail.plan.badge ? <AwardBadgeButton templateUuid={detail.plan.template_uuid} people={detail.target.type === 'person' && detail.target.person ? [awardee(detail.target.person)] : undefined}
          className="inline-flex h-[30px] items-center gap-1.5 rounded-full border border-border bg-card px-3 text-[12.5px] font-bold text-foreground hover:bg-muted"><Medal size={14} aria-hidden="true" />Award directly</AwardBadgeButton> : null}
      </div>
      <nav aria-label="Assignment" className="mt-5 flex gap-1">
        {([['steps', 'Steps'], ['people', 'People']] as const).map(([id, label]) => <Link key={id} href={links.tab(id)} aria-current={tab === id ? 'page' : undefined}
          className={cn('-mb-px inline-flex items-center gap-1.5 border-b-[3px] px-3.5 py-2.5 text-sm font-bold', tab === id ? 'border-foreground text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground')}>
          {label}{id === 'people' && people ? <span className="text-[11px] text-muted-foreground">{people}</span> : null}
        </Link>)}
      </nav>
    </div>
  </header>
}

function Menu({ detail, actions }: { detail: AssignmentDetail; actions: HeaderActions }) {
  const paused = detail.status === 'paused'
  return <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <button type="button" aria-label="Assignment settings" className="grid h-10 w-10 place-items-center rounded-full border border-border bg-card hover:bg-muted"><MoreVertical size={18} /></button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" className="min-w-52">
      <DropdownMenuItem onSelect={actions.onSchedule}><CalendarDays size={15} className="mr-2" />Edit schedule</DropdownMenuItem>
      {actions.onVersion ? <DropdownMenuItem onSelect={actions.onVersion}><Repeat size={15} className="mr-2" />Change version (v{detail.plan.version})</DropdownMenuItem> : null}
      {paused ? <DropdownMenuItem onSelect={actions.onResume}><Play size={15} className="mr-2" />Resume</DropdownMenuItem>
        : <DropdownMenuItem onSelect={actions.onPause}><Pause size={15} className="mr-2" />Pause</DropdownMenuItem>}
      <DropdownMenuItem onSelect={actions.onEnd} className="text-late"><Square size={15} className="mr-2" />End assignment</DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
}
