'use client'
import React from 'react'
import Link from 'next/link'
import { Building2, ChevronRight, Library, ListChecks, MessageSquareText, Users, X } from 'lucide-react'
import { chatTime } from '@components/Connect/ConnectView'
import { PersonAvatar } from '@components/Goals/share/PersonAvatar'
import { rowTarget, threadHref } from '@components/Admin/People/PeopleList'
import StatusBar, { StatusLegend } from '@components/Assignments/StatusBar'
import { NeedsButton } from '@components/Assignments/Needs'
import { PlanTile, TargetTile } from '@components/Assignments/Pair'
import { getUriWithOrg, routePaths } from '@services/config/config'
import { rowDates, rowSubtitle } from '@services/assignments/list'
import type { AdminHome, ContinueItem, HomeAssignmentRow, NeedsRow } from '@services/goals/adminHome'
import { cn } from '@/lib/utils'
import { Chip, WidgetCard, WidgetEmpty, plural } from './WidgetCard'

const admin = routePaths.org.admin
const NEEDS_SHOWN = 5
export const ROLE_LABEL = { lead: 'Lead', review: 'Review', comment: 'Comment' } as const

/** What waits in a thread: "2 messages · 1 hand-in · 1 request". */
function waitingText(row: NeedsRow) {
  const { messages, turn_ins, approvals } = row.counts
  return [messages && plural(messages, 'message'), turn_ins && plural(turn_ins, 'hand-in'), approvals && plural(approvals, 'request')].filter(Boolean).join(' · ')
}

/** Threads with something waiting on the viewer: Threads' own rows, filtered to what needs them. */
export function NeedsYou({ data, orgslug, onDismissIntro }: { data: NonNullable<AdminHome['needs']>; orgslug: string; onDismissIntro: () => void }) {
  const shown = data.rows.slice(0, NEEDS_SHOWN)
  return (
    <WidgetCard title="Needs you" count={data.total} more={{ href: getUriWithOrg(orgslug, admin.threads.root()), label: 'All threads' }}>
      {data.intro ? <div className="flex items-start gap-3 border-b border-gray-100 bg-violet-50/60 px-5 py-3 text-[13px] text-gray-700">
        <MessageSquareText size={17} className="mt-0.5 shrink-0 text-violet-700" aria-hidden="true" />
        <span className="min-w-0 flex-1"><b className="font-semibold text-gray-900">This is Threads, filtered to you.</b> Hand-ins, questions and messages from staff land here when something waits on you. Everything else is in Threads.</span>
        <button type="button" onClick={onDismissIntro} aria-label="Hide this tip" className="rounded-md p-1 text-gray-400 hover:bg-white hover:text-gray-700"><X size={15} /></button>
      </div> : null}
      {shown.length ? <ul className="divide-y divide-gray-100">
        {shown.map((row) => {
          const name = row.title || (row.kind === 'group' ? row.group?.name : row.person?.name) || 'Someone'
          return <li key={row.key}>
            <Link href={threadHref(orgslug, rowTarget(row as any))} className="flex items-center gap-3 px-5 py-3 transition hover:bg-gray-50">
              {row.kind === 'person' && row.person ? <PersonAvatar user={row.person as any} size="md" />
                : <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-muted text-foreground">{row.kind === 'org' ? <Building2 size={17} aria-hidden="true" /> : <Users size={17} aria-hidden="true" />}</span>}
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline gap-2">
                  <span className="truncate text-sm font-bold text-gray-900">{name}</span>
                  {row.at ? <span className="ml-auto shrink-0 text-xs text-gray-500">{chatTime(row.at)}</span> : null}
                </span>
                <span className="block truncate text-xs text-gray-500">{row.preview || waitingText(row)}</span>
              </span>
              <Chip tone={row.counts.turn_ins ? 'green' : row.counts.approvals ? 'amber' : 'blue'}>{waitingText(row)}</Chip>
            </Link>
          </li>
        })}
        {data.total > shown.length ? <li><Link href={getUriWithOrg(orgslug, admin.threads.root())} className="block px-5 py-2.5 text-xs font-semibold text-gray-500 hover:text-gray-900">{data.total - shown.length} more in Threads</Link></li> : null}
      </ul> : <WidgetEmpty>Nothing waiting on you.</WidgetEmpty>}
    </WidgetCard>
  )
}

/** The assignments the viewer is on (admins can switch to all of them): who, their role, where learners are, and what needs them. A row opens the brief. */
export function YourAssignments({ data, admin: isAdmin, canRun, orgslug, onOpen }: {
  data: NonNullable<AdminHome['assignments']>
  admin: boolean
  canRun: boolean
  orgslug: string
  onOpen: (row: HomeAssignmentRow) => void // eslint-disable-line no-unused-vars
}) {
  const [scope, setScope] = React.useState<'mine' | 'all'>(data.mine.length || !data.all ? 'mine' : 'all')
  const rows = (scope === 'all' && data.all ? data.all : data.mine).filter((row) => row.status !== 'ended')
  const title = isAdmin ? 'Assignments' : 'Your assignments'
  return (
    <WidgetCard title={title} more={{ href: getUriWithOrg(orgslug, admin.assignments()), label: 'Assignments' }}>
      {data.all ? <div role="radiogroup" aria-label="Show" className="mx-5 mt-3 inline-flex rounded-xl bg-gray-100 p-[3px]">
        {(['mine', 'all'] as const).map((value) => <button key={value} type="button" role="radio" aria-checked={scope === value} onClick={() => setScope(value)}
          className={cn('rounded-[9px] px-3 py-1 text-[13px] font-semibold', scope === value ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-900')}>{value === 'mine' ? 'Mine' : 'All'}</button>)}
      </div> : null}
      {rows.length ? <ul className="divide-y divide-gray-100">
        {rows.map((row) => {
          const [start, end] = rowDates(row)
          return <li key={row.assignment_uuid} className="relative grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2.5 px-5 py-3.5 hover:bg-gray-50 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
            <span className="flex min-w-0 items-center gap-3">
              <TargetTile target={row.target} />
              <span className="min-w-0">
                <button type="button" onClick={() => onOpen(row)} className="block max-w-full truncate text-left text-sm font-bold text-gray-900 after:absolute after:inset-0 focus-visible:outline-none">
                  {row.target.name || 'Invitation'} · {row.plan.title}
                </button>
                <span className="block truncate text-xs text-gray-500">{[row.my_role ? `You: ${ROLE_LABEL[row.my_role]}` : '', rowSubtitle(row)].filter(Boolean).join(' · ')}</span>
              </span>
            </span>
            <span className="col-span-2 row-start-2 min-w-0 md:col-span-1 md:row-start-auto">
              <StatusBar counts={row.counts} unit={row.learner_count > 1 ? 'steps across the group' : 'steps'} label={`${row.target.name} on ${row.plan.title}`} className="relative z-10" />
              <span className="mt-1 flex justify-between text-[11px] text-gray-500"><span>{start}</span><span>{end}</span></span>
            </span>
            <span className="relative z-10 col-start-2 row-start-1 flex justify-end md:col-start-auto md:row-start-auto">
              {row.my_role === 'comment' ? <Chip>Commenting</Chip> : <NeedsButton needs={row.needs} href={getUriWithOrg(orgslug, admin.planAssignment(row.assignment_uuid)) + '?tab=people&needs=1'} />}
            </span>
          </li>
        })}
      </ul> : <WidgetEmpty>{scope === 'all' ? 'No assignments are running.' : `You’re not on any assignments yet. ${canRun ? 'Start one from a plan, or ask an admin to add you.' : 'An admin can add you to one.'}`}</WidgetEmpty>}
      {rows.length ? <StatusLegend className="border-t border-gray-100 px-5 py-2.5" /> : null}
    </WidgetCard>
  )
}

const KIND_LABEL: Record<ContinueItem['kind'], string> = { plan: 'Plan', framework: 'Requirements', channel: 'Resource channel' }

function continueHref(item: ContinueItem) {
  if (item.kind === 'plan') return admin.template(item.uuid)
  if (item.kind === 'framework') return admin.requirementFrameworkPlans(item.uuid)
  return admin.resources.channel(item.uuid)
}

/** What the org built or edited last: plans, requirement frameworks and resource channels, newest first. */
export function Continue({ items, orgslug }: { items: ContinueItem[]; orgslug: string }) {
  return (
    <WidgetCard title="Continue" more={{ href: getUriWithOrg(orgslug, admin.plans()), label: 'Plans' }}>
      {items.length ? <ul className="divide-y divide-gray-100">
        {items.map((item) => <li key={`${item.kind}:${item.uuid}`}>
          <Link href={getUriWithOrg(orgslug, continueHref(item))} className="flex items-center gap-3 px-5 py-3 transition hover:bg-gray-50">
            {item.kind === 'plan' ? <PlanTile plan={{ template_uuid: item.uuid, title: item.title, icon: item.icon, color: item.color, thumbnail_image: item.thumbnail_image, version: null }} />
              : <span className={cn('grid h-8 w-8 shrink-0 place-items-center rounded-lg text-white', item.kind === 'framework' ? 'bg-[#5E9A14]' : 'bg-[#C8327D]')}>
                {item.kind === 'framework' ? <ListChecks size={16} aria-hidden="true" /> : <Library size={16} aria-hidden="true" />}</span>}
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-bold text-gray-900">{item.title}</span>
              <span className="block truncate text-xs text-gray-500">{KIND_LABEL[item.kind]}{item.update_date ? ` · edited ${chatTime(item.update_date)}` : ''}{item.running ? ' · learners on it' : ''}</span>
            </span>
            <Chip tone={item.state === 'live' ? 'green' : 'amber'}>{item.state === 'live' ? 'Live' : 'Draft'}</Chip>
            <ChevronRight size={16} className="hidden shrink-0 text-gray-400 sm:block" aria-hidden="true" />
          </Link>
        </li>)}
      </ul> : <WidgetEmpty>Plans, requirements and resources you work on show up here, newest first.</WidgetEmpty>}
    </WidgetCard>
  )
}
