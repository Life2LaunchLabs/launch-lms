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
import { ROLE_LABELS, peopleKeys, type DirectoryPerson, type OrgRole, type PeopleChat } from '@services/school/people'
import PendingInvites from './PendingInvites'
import type { PeopleSelection } from './PeopleView'
import { useDirectory, useOrgGroups, usePeopleChats, usePeopleContext } from './usePeople'

type Filter = 'all' | 'groups' | 'direct'

const people = routePaths.org.admin.people

/** The left side of People: your group and direct chats, then everyone in the organization, one search over both. */
export default function PeopleList({ orgslug, selection }: { orgslug: string; selection: PeopleSelection }) {
  const { isAdmin, orgId } = usePeopleContext()
  const { mutate: mutateAll } = useSWRConfig()
  const { data, isLoading, error, mutate } = usePeopleChats()
  const [query, setQuery] = React.useState('')
  const [filter, setFilter] = React.useState<Filter>('all')
  const [inviting, setInviting] = React.useState(false)
  const [creatingGroup, setCreatingGroup] = React.useState(false)
  const groupsEnabled = Boolean(data?.groups_enabled)
  const needle = query.trim().replace(/^@/, '').toLowerCase()
  const chats = (data?.chats || []).filter((chat) => {
    if (filter === 'groups' && chat.kind !== 'group') return false
    if (filter === 'direct' && chat.kind !== 'direct') return false
    return !needle || chat.title.toLowerCase().includes(needle) || chat.people.some((person) => person.username?.toLowerCase().includes(needle))
  })
  const { data: groups } = useOrgGroups(groupsEnabled)
  const withChat = new Set((data?.chats || []).map((chat) => chat.group_id).filter(Boolean))
  const otherGroups = filter === 'direct' ? [] : (groups || []).filter((group) => !withChat.has(group.id) && (!needle || group.name.toLowerCase().includes(needle)))
  const filters: Array<{ id: Filter; label: string }> = [{ id: 'all', label: 'All' }, ...(groupsEnabled ? [{ id: 'groups' as Filter, label: 'Groups' }] : []), { id: 'direct', label: 'Direct' }]

  return <>
    <div className="flex h-16 shrink-0 items-center justify-between gap-2 px-4 md:border-b md:border-border md:px-5">
      <h1 className="text-2xl font-black tracking-tight md:text-xl">People</h1>
      <div className="flex items-center gap-1">
        {isAdmin && groupsEnabled ? <Modal isDialogOpen={creatingGroup} onOpenChange={setCreatingGroup} minHeight="no-min" dialogTitle="New group"
          dialogDescription="A group shares plans and a chat with the staff you add to it."
          dialogContent={<AddUserGroup setCreateUserGroupModal={(open: boolean) => { setCreatingGroup(open); if (!open) void mutate() }} />}
          dialogTrigger={<button type="button" aria-label="New group" title="New group" className="flex h-10 w-10 items-center justify-center rounded-xl text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground"><Plus size={19} /></button>} /> : null}
        <button type="button" onClick={() => setInviting(true)} aria-label="Add people" title="Add people" className="flex h-10 w-10 items-center justify-center rounded-xl text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground"><UserPlus size={19} /></button>
      </div>
    </div>
    <label className="relative mx-3 mb-2 mt-1 block md:mt-3">
      <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
      <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search people and chats" aria-label="Search people and chats by name or @handle"
        className="h-11 w-full rounded-xl border border-transparent bg-muted/60 pl-10 pr-10 text-sm outline-none focus:border-border focus:ring-2 focus:ring-[var(--org-primary-color)]" />
      {query ? <button type="button" onClick={() => setQuery('')} aria-label="Clear search" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"><X size={16} /></button> : null}
    </label>
    <div role="tablist" aria-label="Show" className="mx-3 mb-2 flex gap-1.5">
      {filters.map((item) => <button key={item.id} type="button" role="tab" aria-selected={filter === item.id} onClick={() => setFilter(item.id)}
        className={cn('h-8 rounded-full px-3.5 text-sm font-semibold transition-colors', filter === item.id ? 'bg-foreground text-background' : 'bg-muted/60 text-muted-foreground hover:text-foreground')}>{item.label}</button>)}
    </div>
    <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
      {isLoading ? <ListSkeleton />
        : error ? <p className="px-2 py-8 text-center text-sm text-muted-foreground">People didn&rsquo;t load. <button type="button" className="font-semibold underline" onClick={() => mutate()}>Try again</button></p>
        : <>
          {chats.length ? <ul aria-label="Chats" className="flex flex-col gap-0.5">{chats.map((chat) => <ChatRow key={chat.conversation_uuid} chat={chat} orgslug={orgslug} selection={selection} />)}</ul>
            : filter !== 'all' && !otherGroups.length ? <p className="px-3 py-8 text-center text-sm text-muted-foreground">{filter === 'groups' ? 'No group chats yet. A group’s chat appears once you’re one of its members or staff.' : 'No direct chats yet. Open someone’s profile to message them.'}</p> : null}
          {otherGroups.length ? <>
            <h2 className="mt-4 px-2.5 pb-1 text-xs font-bold uppercase tracking-wide text-muted-foreground">Groups you&rsquo;re not in</h2>
            <ul className="flex flex-col gap-0.5">{otherGroups.map((group) => {
              const active = selection.kind === 'group' && selection.id === group.id
              return <li key={group.id}>
                <Link href={getUriWithOrg(orgslug, people.group(group.id))} aria-current={active ? 'page' : undefined}
                  className={cn('flex items-center gap-3 rounded-2xl px-2.5 py-2 transition-colors hover:bg-foreground/[0.05]', active && 'bg-[var(--org-primary-color)]/15')}>
                  <GroupMark /><span className="min-w-0 flex-1 truncate text-[15px] font-semibold">{group.name}</span>
                </Link>
              </li>
            })}</ul>
          </> : null}
          {filter === 'all' ? <>
            <h2 className="mt-4 px-2.5 pb-1 text-xs font-bold uppercase tracking-wide text-muted-foreground">Everyone</h2>
            <DirectoryPage orgslug={orgslug} query={needle} offset={0} selection={selection} />
            {isAdmin && !needle ? <PendingInvites /> : null}
          </> : null}
        </>}
    </div>
    <InviteUsersDialog open={inviting} onOpenChange={setInviting} onInvited={() => void mutateAll((key) => typeof key === 'string' && key.startsWith(peopleKeys.directory(orgId).split('?')[0]))} />
  </>
}

function ChatRow({ chat, orgslug, selection }: { chat: PeopleChat; orgslug: string; selection: PeopleSelection }) {
  const group = chat.kind === 'group' && chat.group_id
  const href = getUriWithOrg(orgslug, group ? people.group(chat.group_id as number) : people.chat(chat.conversation_uuid))
  const active = group ? selection.kind === 'group' && selection.id === chat.group_id : selection.kind === 'chat' && selection.uuid === chat.conversation_uuid
  const unread = chat.unread > 0 || chat.status === 'request'
  const last = chat.last_message
  const subtitle = last ? `${last.mine ? 'You: ' : ''}${last.preview || last.body}` : group ? `${chat.member_count} ${chat.member_count === 1 ? 'person' : 'people'}` : ''
  return <li>
    <Link href={href} aria-current={active ? 'page' : undefined}
      className={cn('flex items-center gap-3 rounded-2xl px-2.5 py-2.5 transition-colors hover:bg-foreground/[0.05]', active && 'bg-[var(--org-primary-color)]/15 hover:bg-[var(--org-primary-color)]/20')}>
      {chat.kind === 'group' ? <GroupMark /> : <PersonAvatar user={chat.people[0] as any} size="md" />}
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-2">
          <span className={cn('truncate text-[15px]', unread ? 'font-black' : 'font-semibold')}>{chat.title}</span>
          {chat.role ? <RoleTag role={chat.role} /> : null}
          <span className={cn('ml-auto shrink-0 text-xs', unread ? 'font-bold text-foreground' : 'text-muted-foreground')}>{chatTime(chat.last_message_at)}</span>
        </span>
        <span className="flex items-center gap-2">
          <span className={cn('truncate text-sm', unread ? 'text-foreground' : 'text-muted-foreground')}>{subtitle}</span>
          {chat.unread ? <span className="ml-auto flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-[var(--org-primary-color)] px-1.5 text-[11px] font-black text-white">{chat.unread}</span> : null}
        </span>
      </span>
    </Link>
  </li>
}

/** One page of the organization's people; the last page offers the next. */
function DirectoryPage({ orgslug, query, offset, selection }: { orgslug: string; query: string; offset: number; selection: PeopleSelection }) {
  const { data, isLoading, error } = useDirectory(query, offset)
  const [more, setMore] = React.useState(false)
  if (isLoading && !data) return <ListSkeleton />
  if (error) return <p className="px-3 py-4 text-sm text-muted-foreground">{error?.message || 'People didn’t load.'}</p>
  if (!data?.people.length) return offset ? null : <p className="px-3 py-6 text-center text-sm text-muted-foreground">{query ? 'Nobody matches that.' : 'Nobody here yet. Add people to get started.'}</p>
  const next = data.offset + data.people.length
  return <>
    <ul aria-label={offset ? undefined : 'Everyone'} className="flex flex-col gap-0.5">{data.people.map((person) => <PersonRow key={`${person.role}-${person.user.id}`} person={person} orgslug={orgslug} selection={selection} />)}</ul>
    {next < data.total ? more ? <DirectoryPage orgslug={orgslug} query={query} offset={next} selection={selection} />
      : <button type="button" onClick={() => setMore(true)} className="mx-2.5 mt-1 text-sm font-semibold text-muted-foreground hover:text-foreground">Show more ({data.total - next})</button> : null}
  </>
}

function PersonRow({ person, orgslug, selection }: { person: DirectoryPerson; orgslug: string; selection: PeopleSelection }) {
  const active = selection.kind === 'person' && selection.username === person.user.username
  const detail = person.role === 'helper'
    ? `Helping ${(person.helping_on || []).map((item) => item.learner?.name).filter(Boolean).join(', ') || 'on a plan'}`
    : [person.role_name && person.role_name !== ROLE_LABELS[person.role] ? person.role_name : '', ...person.groups.map((group) => group.name)].filter(Boolean).join(' · ') || `@${person.user.username}`
  return <li>
    <Link href={getUriWithOrg(orgslug, people.user(person.user.username))} aria-current={active ? 'page' : undefined}
      className={cn('flex items-center gap-3 rounded-2xl px-2.5 py-2 transition-colors hover:bg-foreground/[0.05]', active && 'bg-[var(--org-primary-color)]/15 hover:bg-[var(--org-primary-color)]/20')}>
      <PersonAvatar user={person.user as any} size="md" />
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-2"><span className="truncate text-[15px] font-semibold">{person.user.name}</span><RoleTag role={person.role} /></span>
        <span className="block truncate text-sm text-muted-foreground">{detail}</span>
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
