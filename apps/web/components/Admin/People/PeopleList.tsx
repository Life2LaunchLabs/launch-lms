'use client'

import React from 'react'
import Link from 'next/link'
import { useSWRConfig } from 'swr'
import { Plus, Search, UserPlus, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Skeleton } from '@components/ui/skeleton'
import { PersonAvatar } from '@components/Goals/share/PersonAvatar'
import { GroupMark } from '@components/Connect/ChatPane'
import { chatTime } from '@components/Connect/ConnectView'
import Modal from '@components/Objects/StyledElements/Modal/Modal'
import AddUserGroup from '@components/Objects/Modals/Dash/OrgUserGroups/AddUserGroup'
import InviteUsersDialog from '@components/Dashboard/Pages/Users/OrgUsersAdd/InviteUsersDialog'
import { getUriWithOrg, routePaths } from '@services/config/config'
import { ROLE_LABELS, peopleKeys, type FeedRow, type OrgRole, type PeopleStatusFilter } from '@services/school/people'
import PendingInvites from './PendingInvites'
import type { PeopleSelection } from './PeopleView'
import { usePeopleContext, usePeopleFeed, useRefreshPeople } from './usePeople'

const people = routePaths.org.admin.people

/** Where a row of the list opens: the person's or the group's page, each with its conversation first. */
export function rowHref(orgslug: string, row: FeedRow) {
  return getUriWithOrg(orgslug, row.kind === 'group' && row.group ? people.group(row.group.id) : people.user(row.person?.username || ''))
}

function isOpen(row: FeedRow, selection: PeopleSelection) {
  if (selection.kind === 'group') return row.kind === 'group' && row.group?.id === selection.id
  if (selection.kind === 'person') return row.kind === 'person' && row.person?.username === selection.username
  if (selection.kind === 'chat') return Boolean(row.chat_uuid) && row.chat_uuid === selection.uuid
  return false
}

/**
 * The left side of People: one list of the organization's people and groups. Anyone with something
 * new for you (messages, steps turned in, helpers to approve) is on top with a count and a line
 * saying what; everyone else follows A to Z, a page at a time. One search covers both.
 */
export default function PeopleList({ orgslug, selection }: { orgslug: string; selection: PeopleSelection }) {
  const { isAdmin, orgId } = usePeopleContext()
  const { mutate: mutateAll } = useSWRConfig()
  const refresh = useRefreshPeople()
  const [query, setQuery] = React.useState('')
  const needle = query.trim().replace(/^@/, '').toLowerCase()
  const [status, setStatus] = React.useState<PeopleStatusFilter>('active')
  const { data, isLoading, error, mutate } = usePeopleFeed(needle, 0, status)
  const [inviting, setInviting] = React.useState(false)
  const [creatingGroup, setCreatingGroup] = React.useState(false)
  const groupsEnabled = Boolean(data?.groups_enabled)
  const active = data?.active || []

  return <>
    <div className="flex h-16 shrink-0 items-center justify-between gap-2 px-4 md:border-b md:border-border md:px-5">
      <h1 className="text-2xl font-black tracking-tight md:text-xl">People</h1>
      <div className="flex items-center gap-1">
        {isAdmin && groupsEnabled ? <Modal isDialogOpen={creatingGroup} onOpenChange={setCreatingGroup} minHeight="no-min" dialogTitle="New group"
          dialogDescription="A group shares plans and a chat with the staff you add to it."
          dialogContent={<AddUserGroup setCreateUserGroupModal={(open: boolean) => { setCreatingGroup(open); if (!open) void refresh() }} />}
          dialogTrigger={<button type="button" aria-label="New group" title="New group" className="flex h-10 w-10 items-center justify-center rounded-xl text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground"><Plus size={19} /></button>} /> : null}
        <button type="button" onClick={() => setInviting(true)} aria-label="Add people" title="Add people" className="flex h-10 w-10 items-center justify-center rounded-xl text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground"><UserPlus size={19} /></button>
      </div>
    </div>
    <label className="relative mx-3 mb-2 mt-1 block md:mt-3">
      <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
      <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search people and groups" aria-label="Search people and groups by name or @handle"
        className="h-11 w-full rounded-xl border border-transparent bg-muted/60 pl-10 pr-10 text-sm outline-none focus:border-border focus:ring-2 focus:ring-[var(--org-primary-color)]" />
      {query ? <button type="button" onClick={() => setQuery('')} aria-label="Clear search" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"><X size={16} /></button> : null}
    </label>
    <StatusFilter value={status} onChange={setStatus} />
    <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
      {isLoading && !data ? <ListSkeleton />
        : error && !data ? <p className="px-2 py-8 text-center text-sm text-muted-foreground">People didn&rsquo;t load. <button type="button" className="font-semibold underline" onClick={() => mutate()}>Try again</button></p>
        : data ? <>
          {active.length ? <ul aria-label="New for you" className="flex flex-col gap-0.5">{active.map((row) => <ActiveRow key={row.key} row={row} orgslug={orgslug} selection={selection} />)}</ul> : null}
          {data.rest.length ? <>
            <h2 className={cn('px-2.5 pb-1 text-xs font-bold uppercase tracking-wide text-muted-foreground', active.length ? 'mt-4' : 'mt-1')}>{active.length ? 'Everyone else · A–Z' : 'Everyone · A–Z'}</h2>
            <RestRows rows={data.rest} orgslug={orgslug} selection={selection} label={active.length ? 'Everyone else' : 'Everyone'} />
            <MoreRows orgslug={orgslug} query={needle} status={status} next={data.offset + data.rest.length} total={data.total} selection={selection} />
          </> : !active.length ? <p className="px-3 py-6 text-center text-sm text-muted-foreground">{needle ? 'Nobody matches that.' : status === 'alumni' ? 'No alumni yet. Mark learners who have moved on as alumni from their page or their group.' : 'Nobody here yet. Add people to get started.'}</p> : null}
          {isAdmin && !needle ? <PendingInvites /> : null}
        </> : null}
    </div>
    <InviteUsersDialog open={inviting} onOpenChange={setInviting} onInvited={() => {
      void refresh()
      void mutateAll((key) => typeof key === 'string' && key.startsWith(peopleKeys.directory(orgId).split('?')[0]))
    }} />
  </>
}

/** Someone, or a group, with something new for you: how much, and a line saying what. */
function ActiveRow({ row, orgslug, selection }: { row: FeedRow; orgslug: string; selection: PeopleSelection }) {
  const active = isOpen(row, selection)
  const fresh = (row.total || 0) > 0
  const name = row.kind === 'group' ? row.group?.name || 'Group' : row.person?.name || 'Someone'
  return <li>
    <Link href={rowHref(orgslug, row)} aria-current={active ? 'page' : undefined}
      className={cn('flex items-center gap-3 rounded-2xl px-2.5 py-2.5 transition-colors hover:bg-foreground/[0.05]', active && 'bg-[var(--org-primary-color)]/15 hover:bg-[var(--org-primary-color)]/20')}>
      {row.kind === 'group' ? <GroupMark /> : <PersonAvatar user={row.person as any} size="md" />}
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-2">
          <span className={cn('truncate text-[15px]', fresh ? 'font-black' : 'font-semibold')}>{name}</span>
          {row.role ? <RoleTag role={row.role} /> : null}
          {row.at ? <span className={cn('ml-auto shrink-0 text-xs', fresh ? 'font-bold text-foreground' : 'text-muted-foreground')}>{chatTime(row.at)}</span> : null}
        </span>
        <span className="flex items-center gap-2">
          <span className={cn('truncate text-sm', fresh ? 'text-foreground' : 'text-muted-foreground')}>{row.preview || (row.kind === 'group' ? groupLine(row) : `@${row.person?.username}`)}</span>
          {fresh ? <span aria-label={`${row.total} new`} className="ml-auto flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-[var(--org-primary-color)] px-1.5 text-[11px] font-black text-white">{row.total}</span> : null}
        </span>
      </span>
    </Link>
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

function PersonRow({ row, orgslug, selection }: { row: FeedRow; orgslug: string; selection: PeopleSelection }) {
  const active = isOpen(row, selection)
  const role = row.role || 'learner'
  const detail = role === 'helper'
    ? `Helping ${(row.helping_on || []).map((item) => item.learner?.name).filter(Boolean).join(', ') || 'on a plan'}`
    : [row.status === 'alumni' ? 'Alumni' : '', row.role_name && row.role_name !== ROLE_LABELS[role] ? row.role_name : '', ...(row.groups || []).map((group) => group.name)].filter(Boolean).join(' · ') || `@${row.person?.username}`
  return <li>
    <Link href={rowHref(orgslug, row)} aria-current={active ? 'page' : undefined}
      className={cn('flex items-center gap-3 rounded-2xl px-2.5 py-2 transition-colors hover:bg-foreground/[0.05]', active && 'bg-[var(--org-primary-color)]/15 hover:bg-[var(--org-primary-color)]/20')}>
      <PersonAvatar user={row.person as any} size="md" />
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-2"><span className="truncate text-[15px] font-semibold">{row.person?.name}</span><RoleTag role={role} /></span>
        <span className="block truncate text-sm text-muted-foreground">{detail}</span>
      </span>
    </Link>
  </li>
}

function GroupRow({ row, orgslug, selection }: { row: FeedRow; orgslug: string; selection: PeopleSelection }) {
  const active = isOpen(row, selection)
  return <li>
    <Link href={rowHref(orgslug, row)} aria-current={active ? 'page' : undefined}
      className={cn('flex items-center gap-3 rounded-2xl px-2.5 py-2 transition-colors hover:bg-foreground/[0.05]', active && 'bg-[var(--org-primary-color)]/15 hover:bg-[var(--org-primary-color)]/20')}>
      <GroupMark />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-semibold">{row.group?.name}</span>
        <span className="block truncate text-sm text-muted-foreground">{groupLine(row)}</span>
      </span>
    </Link>
  </li>
}

const ROLE_TONES: Record<OrgRole, string> = {
  admin: 'bg-foreground text-background',
  staff: 'bg-[var(--org-primary-color)]/15 text-foreground',
  learner: 'bg-muted text-muted-foreground',
  helper: 'bg-amber-100 text-amber-800',
}

export function RoleTag({ role }: { role: OrgRole }) {
  return <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wide', ROLE_TONES[role])}>{ROLE_LABELS[role]}</span>
}

function ListSkeleton() {
  return <div className="flex flex-col gap-3 px-2.5 py-2">{[0, 1, 2].map((item) => <div key={item} className="flex items-center gap-3"><Skeleton className="h-9 w-9 rounded-full" /><div className="flex-1 space-y-2"><Skeleton className="h-3.5 w-1/2" /><Skeleton className="h-3 w-3/4" /></div></div>)}</div>
}
