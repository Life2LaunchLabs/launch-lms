'use client'

import React from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useSWRConfig } from 'swr'
import { Building2, Plus, Search, UserPlus, Users, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Skeleton } from '@components/ui/skeleton'
import { PersonAvatar } from '@components/Goals/share/PersonAvatar'
import { GroupMark } from '@components/Connect/ChatPane'
import { chatTime } from '@components/Connect/ConnectView'
import InviteUsersDialog from '@components/Dashboard/Pages/Users/OrgUsersAdd/InviteUsersDialog'
import { getUriWithOrg, routePaths } from '@services/config/config'
import { ROLE_LABELS, peopleKeys, type FeedRow, type PeopleStatusFilter, type PinnedRow, type ThreadKind } from '@services/school/people'
import type { ThreadTarget } from '@components/Threads/ThreadView'
import NewGroup from './NewGroup'
import PageWelcome from '@components/Admin/PageWelcome'
import { PeopleBanners } from '@components/Admin/Upgrade/PlanBanners'
import { primaryActionClass, secondaryActionClass } from '@components/Plans/shared/actions'
import PendingInvites from './PendingInvites'
import { RoleTag } from './RoleTag'
import type { PeopleSelection } from './PeopleView'
import { usePeopleContext, usePeopleFeed, useRefreshPeople } from './usePeople'

const threads = routePaths.org.admin.threads

/** The thread a row of the list opens. */
export function rowTarget(row: FeedRow | PinnedRow): ThreadTarget {
  if (row.kind === 'staff_room') return { kind: 'staff_room' }
  if (row.kind === 'org') return { kind: 'org' }
  const feed = row as FeedRow
  return feed.kind === 'group' && feed.group ? { kind: 'group', groupId: feed.group.id } : { kind: 'person', userId: feed.person?.id || 0 }
}

/** Where a thread lives on the Threads page. */
export function threadHref(orgslug: string, target: ThreadTarget) {
  const path = target.kind === 'person' ? threads.person(target.userId, target.plan, target.step) : target.kind === 'group' ? threads.group(target.groupId, target.plan, target.step)
    : target.kind === 'staff_room' ? threads.staff() : threads.org()
  return getUriWithOrg(orgslug, path)
}

export const rowHref = (orgslug: string, row: FeedRow) => threadHref(orgslug, rowTarget(row))

function isOpen(row: FeedRow | PinnedRow, selection: PeopleSelection) {
  if (selection.kind === 'thread') {
    const target = rowTarget(row)
    const open = selection.target
    return target.kind === open.kind && (target.kind !== 'person' || (open.kind === 'person' && target.userId === open.userId))
      && (target.kind !== 'group' || (open.kind === 'group' && target.groupId === open.groupId))
  }
  return false
}

/** Opens a row: a link on the Threads page, a button in the side panel. */
const OpenContext = React.createContext<{ orgslug: string; onOpen?: (target: ThreadTarget) => void }>({ orgslug: '' }) // eslint-disable-line no-unused-vars

function RowLink({ row, active, className, children }: { row: FeedRow | PinnedRow; active: boolean; className: string; children: React.ReactNode }) {
  const { orgslug, onOpen } = React.useContext(OpenContext)
  const target = rowTarget(row)
  if (onOpen) return <button type="button" onClick={() => onOpen(target)} aria-current={active ? 'true' : undefined} className={cn('w-full text-left', className)}>{children}</button>
  return <Link href={threadHref(orgslug, target)} aria-current={active ? 'page' : undefined} className={className}>{children}</Link>
}

/**
 * The left side of People: one list of the organization's people and groups. Anyone with something
 * new for you (messages, steps turned in, helpers to approve) is on top with a count and a line
 * saying what; everyone else follows A to Z, a page at a time. One search covers both.
 */
export default function PeopleList({ orgslug, selection, onOpen, panel = false }: {
  orgslug: string
  selection: PeopleSelection
  /** In the side panel: open threads there instead of going to the page. */
  onOpen?: (target: ThreadTarget) => void // eslint-disable-line no-unused-vars
  /** The side panel's list: no title or invite tools. */
  panel?: boolean
}) {
  const { isAdmin, orgId } = usePeopleContext()
  const { mutate: mutateAll } = useSWRConfig()
  const refresh = useRefreshPeople()
  const [query, setQuery] = React.useState('')
  const needle = query.trim().replace(/^@/, '').toLowerCase()
  const [status, setStatus] = React.useState<PeopleStatusFilter>('active')
  const [kind, setKind] = React.useState<ThreadKind>('all')
  const { data, isLoading, error, mutate } = usePeopleFeed(needle, 0, status, kind)
  // Home's getting started links here with ?invite=learner or ?invite=staff to open the dialog.
  const inviteParam = useSearchParams().get('invite')
  const [inviting, setInviting] = React.useState(Boolean(inviteParam))
  const [inviteRole, setInviteRole] = React.useState<'learner' | 'staff'>(inviteParam === 'staff' ? 'staff' : 'learner')
  const [creatingGroup, setCreatingGroup] = React.useState(false)
  const groupsEnabled = Boolean(data?.groups_enabled)
  const active = data?.active || []

  const pinned = data?.pinned || []

  return <OpenContext.Provider value={{ orgslug, onOpen }}>
    {panel ? null : <div className="flex h-16 shrink-0 items-center justify-between gap-2 px-4 md:border-b md:border-border md:px-5">
      <h1 className="text-2xl font-black tracking-tight md:text-xl">Threads</h1>
      <div className="flex items-center gap-1">
        {isAdmin && groupsEnabled ? <>
          <button type="button" onClick={() => setCreatingGroup(true)} aria-haspopup="dialog" aria-label="New group" title="New group" className="flex h-10 w-10 items-center justify-center rounded-xl text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground"><Plus size={19} /></button>
          <NewGroup orgslug={orgslug} open={creatingGroup} onOpenChange={setCreatingGroup} />
        </> : null}
        <button type="button" onClick={() => setInviting(true)} aria-label="Add people" title="Add people" className="flex h-10 w-10 items-center justify-center rounded-xl text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground"><UserPlus size={19} /></button>
      </div>
    </div>}
    <label className="relative mx-3 mb-2 mt-1 block md:mt-3">
      <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
      <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search threads" aria-label="Search people and groups by name or @handle"
        className="h-11 w-full rounded-xl border border-transparent bg-muted/60 pl-10 pr-10 text-sm outline-none focus:border-border focus:ring-2 focus:ring-[var(--org-primary-color)]" />
      {query ? <button type="button" onClick={() => setQuery('')} aria-label="Clear search" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"><X size={16} /></button> : null}
    </label>
    <KindFilter value={kind} onChange={setKind} groups={groupsEnabled || Boolean(data?.groups_read_only)} />
    {kind === 'all' || kind === 'learners' ? <StatusFilter value={status} onChange={setStatus} /> : null}
    {panel ? null : <PeopleBanners className="mx-3 mb-2" />}
    <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
      {isLoading && !data ? <ListSkeleton />
        : error && !data ? <p className="px-2 py-8 text-center text-sm text-muted-foreground">People didn&rsquo;t load. <button type="button" className="font-semibold underline" onClick={() => mutate()}>Try again</button></p>
        : data ? <>
          {pinned.length ? <ul aria-label="Everyone" className="mb-1 flex flex-col gap-0.5">{pinned.map((row) => <PinnedThread key={row.key} row={row} selection={selection} />)}</ul> : null}
          {active.length ? <ul aria-label="New for you" className="flex flex-col gap-0.5">{active.map((row) => <ActiveRow key={row.key} row={row} orgslug={orgslug} selection={selection} />)}</ul> : null}
          {data.rest.length ? <>
            <h2 className={cn('px-2.5 pb-1 text-xs font-bold uppercase tracking-wide text-muted-foreground', active.length ? 'mt-4' : 'mt-1')}>{active.length ? 'Everyone else · A–Z' : 'Everyone · A–Z'}</h2>
            <RestRows rows={data.rest} orgslug={orgslug} selection={selection} label={active.length ? 'Everyone else' : 'Everyone'} />
            <MoreRows orgslug={orgslug} query={needle} status={status} next={data.offset + data.rest.length} total={data.total} selection={selection} />
          </> : active.length ? null
            : needle || status === 'alumni' || !isAdmin || panel || kind !== 'all' ? <p className="px-3 py-6 text-center text-sm text-muted-foreground">{needle ? 'Nobody matches that.' : kind !== 'all' ? 'Nobody here yet.' : status === 'alumni' ? 'No alumni yet. Mark learners who have moved on as alumni from their page or their group.' : 'Nobody here yet.'}</p>
            : <PageWelcome className="mx-1 mt-2 px-4 py-8 sm:px-5 sm:py-8" icon={<Users size={26} />} title="People: your learners and staff"
              body="Everyone in your organization, with their chats and anything waiting on you."
              how="Learners use their own accounts and join by email invite or a join link. Staff help run plans and review work.">
              <button type="button" onClick={() => { setInviteRole('learner'); setInviting(true) }} className={primaryActionClass}>Invite learners</button>
              <button type="button" onClick={() => { setInviteRole('staff'); setInviting(true) }} className={secondaryActionClass}>Add staff</button>
            </PageWelcome>}
          {isAdmin && !needle && !panel ? <PendingInvites /> : null}
        </> : null}
    </div>
    <InviteUsersDialog open={inviting} onOpenChange={setInviting} initialRole={inviteRole} onInvited={() => {
      void refresh()
      void mutateAll((key) => typeof key === 'string' && key.startsWith(peopleKeys.directory(orgId).split('?')[0]))
    }} />
  </OpenContext.Provider>
}

/** The all-staff room and the organization's own thread, on top of everyone's list. */
function PinnedThread({ row, selection }: { row: PinnedRow; selection: PeopleSelection }) {
  const active = isOpen(row, selection)
  const fresh = (row.unread || 0) > 0
  return <li>
    <RowLink row={row} active={active} className={cn('flex items-center gap-3 rounded-2xl px-2.5 py-2 transition-colors hover:bg-foreground/[0.05]', active && 'bg-[var(--org-primary-color)]/15 hover:bg-[var(--org-primary-color)]/20')}>
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-muted text-foreground">{row.kind === 'org' ? <Building2 size={17} aria-hidden="true" /> : <Users size={17} aria-hidden="true" />}</span>
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-2">
          <span className={cn('truncate text-[15px]', fresh ? 'font-black' : 'font-semibold')}>{row.title}</span>
          {row.at ? <span className="ml-auto shrink-0 text-xs text-muted-foreground">{chatTime(row.at)}</span> : null}
        </span>
        <span className="flex items-center gap-2">
          <span className="truncate text-sm text-muted-foreground">{row.preview}</span>
          {fresh ? <span aria-label={`${row.unread} new`} className="ml-auto flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-[var(--org-primary-color)] px-1.5 text-[11px] font-black text-white">{row.unread}</span> : null}
        </span>
      </span>
    </RowLink>
  </li>
}

const KINDS: Array<{ value: ThreadKind; label: string }> = [{ value: 'all', label: 'All' }, { value: 'learners', label: 'Learners' }, { value: 'staff', label: 'Staff' }, { value: 'groups', label: 'Groups' }]

/** One kind of thread at a time: learners, staff or groups. */
function KindFilter({ value, onChange, groups }: { value: ThreadKind; onChange: React.Dispatch<React.SetStateAction<ThreadKind>>; groups: boolean }) {
  return <div role="radiogroup" aria-label="Threads with" className="mx-3 mb-2 flex rounded-xl bg-muted/70 p-[3px]">
    {KINDS.filter((item) => item.value !== 'groups' || groups).map((item) => <button key={item.value} type="button" role="radio" aria-checked={value === item.value} onClick={() => onChange(item.value)}
      className={cn('flex-1 rounded-[9px] px-2 py-1.5 text-[13px] font-semibold', value === item.value ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}>{item.label}</button>)}
  </div>
}

/** Someone, or a group, with something new for you: how much, and a line saying what. */
function ActiveRow({ row, selection }: { row: FeedRow; orgslug: string; selection: PeopleSelection }) {
  const active = isOpen(row, selection)
  const fresh = (row.total || 0) > 0
  const name = row.kind === 'group' ? row.group?.name || 'Group' : row.person?.name || 'Someone'
  return <li>
    <RowLink row={row} active={active}
      className={cn('flex items-center gap-3 rounded-2xl px-2.5 py-2.5 transition-colors hover:bg-foreground/[0.05]', active && 'bg-[var(--org-primary-color)]/15 hover:bg-[var(--org-primary-color)]/20')}>
      {row.kind === 'group' ? <GroupMark /> : <PersonAvatar user={row.person as any} size="md" />}
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-2">
          <span className={cn('truncate text-[15px]', fresh ? 'font-black' : 'font-semibold')}>{name}</span>
          {/* Most people are learners, so only the other roles get a tag. */}
          {row.role && row.role !== 'learner' ? <RoleTag role={row.role} /> : null}
          {row.at ? <span className={cn('ml-auto shrink-0 text-xs', fresh ? 'font-bold text-foreground' : 'text-muted-foreground')}>{chatTime(row.at)}</span> : null}
        </span>
        <span className="flex items-center gap-2">
          <span className={cn('truncate text-sm', fresh ? 'text-foreground' : 'text-muted-foreground')}>{row.preview || (row.kind === 'group' ? groupLine(row) : `@${row.person?.username}`)}</span>
          {fresh ? <span aria-label={`${row.total} new`} className="ml-auto flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-[var(--org-primary-color)] px-1.5 text-[11px] font-black text-white">{row.total}</span> : null}
        </span>
      </span>
    </RowLink>
  </li>
}

function groupLine(row: FeedRow) {
  const count = row.group?.member_count || 0
  return `Group · ${count} ${count === 1 ? 'person' : 'people'}`
}

function RestRows({ rows, orgslug, selection, label }: { rows: FeedRow[]; orgslug: string; selection: PeopleSelection; label?: string }) {
  return <ul aria-label={label} className="flex flex-col gap-0.5">{rows.map((row) => row.kind === 'group'
    ? <GroupRow key={row.key} row={row} orgslug={orgslug} selection={selection} />
    : <PersonRow key={row.key} row={row} orgslug={orgslug} selection={selection} />)}</ul>
}

/** The next page of everyone else, once asked for; its last page offers the one after. */
function MoreRows({ orgslug, query, status, next, total, selection }: { orgslug: string; query: string; status: PeopleStatusFilter; next: number; total: number; selection: PeopleSelection }) {
  const [open, setOpen] = React.useState(false)
  React.useEffect(() => setOpen(false), [query, status])
  if (next >= total) return null
  if (!open) return <button type="button" onClick={() => setOpen(true)} className="mx-2.5 mt-1 text-sm font-semibold text-muted-foreground hover:text-foreground">Show more ({total - next})</button>
  return <RestPage orgslug={orgslug} query={query} status={status} offset={next} selection={selection} />
}

function RestPage({ orgslug, query, status, offset, selection }: { orgslug: string; query: string; status: PeopleStatusFilter; offset: number; selection: PeopleSelection }) {
  const { data, isLoading, error } = usePeopleFeed(query, offset, status)
  if (isLoading && !data) return <ListSkeleton />
  if (error || !data) return <p className="px-3 py-4 text-sm text-muted-foreground">{error?.message || 'People didn’t load.'}</p>
  return <>
    <RestRows rows={data.rest} orgslug={orgslug} selection={selection} />
    <MoreRows orgslug={orgslug} query={query} status={status} next={data.offset + data.rest.length} total={data.total} selection={selection} />
  </>
}

const STATUS_FILTERS: Array<{ value: PeopleStatusFilter; label: string }> = [{ value: 'active', label: 'Active' }, { value: 'alumni', label: 'Alumni' }, { value: 'all', label: 'All' }]

/** People hides alumni (learners who have moved on) unless asked. */
function StatusFilter({ value, onChange }: { value: PeopleStatusFilter; onChange: React.Dispatch<React.SetStateAction<PeopleStatusFilter>> }) {
  return <div role="group" aria-label="Show" className="mx-3 mb-2 flex gap-1">
    {STATUS_FILTERS.map((item) => <button key={item.value} type="button" aria-pressed={value === item.value} onClick={() => onChange(item.value)}
      className={cn('rounded-full px-3 py-1 text-xs font-bold', value === item.value ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-foreground/[0.06]')}>{item.label}</button>)}
  </div>
}

function PersonRow({ row, selection }: { row: FeedRow; orgslug: string; selection: PeopleSelection }) {
  const active = isOpen(row, selection)
  const role = row.role || 'learner'
  const detail = role === 'helper'
    ? `Helping ${(row.helping_on || []).map((item) => item.learner?.name).filter(Boolean).join(', ') || 'on a plan'}`
    : [row.status === 'alumni' ? 'Alumni' : '', row.role_name && row.role_name !== ROLE_LABELS[role] ? row.role_name : '', ...(row.groups || []).map((group) => group.name)].filter(Boolean).join(' · ') || `@${row.person?.username}`
  return <li>
    <RowLink row={row} active={active}
      className={cn('flex items-center gap-3 rounded-2xl px-2.5 py-2 transition-colors hover:bg-foreground/[0.05]', active && 'bg-[var(--org-primary-color)]/15 hover:bg-[var(--org-primary-color)]/20')}>
      <PersonAvatar user={row.person as any} size="md" />
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-2"><span className="truncate text-[15px] font-semibold">{row.person?.name}</span>{role !== 'learner' ? <RoleTag role={role} /> : null}</span>
        <span className="block truncate text-sm text-muted-foreground">{detail}</span>
      </span>
    </RowLink>
  </li>
}

function GroupRow({ row, selection }: { row: FeedRow; orgslug: string; selection: PeopleSelection }) {
  const active = isOpen(row, selection)
  return <li>
    <RowLink row={row} active={active}
      className={cn('flex items-center gap-3 rounded-2xl px-2.5 py-2 transition-colors hover:bg-foreground/[0.05]', active && 'bg-[var(--org-primary-color)]/15 hover:bg-[var(--org-primary-color)]/20')}>
      <GroupMark />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-semibold">{row.group?.name}</span>
        <span className="block truncate text-sm text-muted-foreground">{groupLine(row)}</span>
      </span>
    </RowLink>
  </li>
}

function ListSkeleton() {
  return <div className="flex flex-col gap-3 px-2.5 py-2">{[0, 1, 2].map((item) => <div key={item} className="flex items-center gap-3"><Skeleton className="h-9 w-9 rounded-full" /><div className="flex-1 space-y-2"><Skeleton className="h-3.5 w-1/2" /><Skeleton className="h-3 w-3/4" /></div></div>)}</div>
}
