'use client'

import React, { type Dispatch } from 'react'
import { useSWRConfig } from 'swr'
import toast from 'react-hot-toast'
import { Loader2, Plus, Search, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { PersonAvatar } from '@components/Goals/share/PersonAvatar'
import { SELECT, StaffRow, useGroupStaff } from '@components/Admin/Users/GroupStaffPanel'
import { linkUsersToUserGroup, unlinkUsersFromUserGroup } from '@services/usergroups/usergroups'
import { peopleKeys, type DirectoryPerson, type GroupPerson, type OrgRole } from '@services/school/people'
import type { PersonSummary } from '@services/goals/types'
import { RoleTag } from './RoleTag'
import { useDirectory, useGroupDetail, usePeopleContext } from './usePeople'

/** What someone is in a group: staff (who work with its learners) or one of its learners. */
export type GroupRole = 'staff' | 'learner'
export interface PersonToAdd { user: PersonSummary; role: OrgRole; as: GroupRole }

const SHOWN = 8
const canStaff = (role: OrgRole) => role === 'staff' || role === 'admin'

/**
 * Who to add: one search over the organization's people not in the group yet. Each joins as staff or
 * as a learner, staff by default for staff and admins (only staff can be staff).
 */
export function PeoplePicker({ exclude, busy, onAdd }: { exclude: Set<number>; busy?: boolean; onAdd: Dispatch<PersonToAdd> }) {
  const [query, setQuery] = React.useState('')
  const needle = query.trim().replace(/^@/, '')
  const { data, isLoading } = useDirectory(needle)
  const [more, setMore] = React.useState(false)
  const found = (data?.people || []).filter((item) => item.role !== 'helper' && !exclude.has(item.user.id))
  const shown = more ? found : found.slice(0, SHOWN)
  return <div className="space-y-2">
    <label className="relative block">
      <span className="sr-only">Add people</span>
      <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
      <input value={query} onChange={(event) => { setQuery(event.target.value); setMore(false) }} placeholder="Add people: search by name or @handle"
        className="h-10 w-full rounded-lg border border-gray-200 bg-white pl-9 pr-3 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-[var(--org-primary-color)]" />
    </label>
    {isLoading && !data ? <div className="flex justify-center py-3"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
      : shown.length ? <ul aria-label="People you can add" className="max-h-64 divide-y divide-border overflow-y-auto rounded-lg border border-gray-200">
        {shown.map((item) => <PickRow key={item.user.id} person={item} busy={busy} onAdd={onAdd} />)}
        {found.length > shown.length ? <li><button type="button" onClick={() => setMore(true)} className="w-full px-3 py-2 text-left text-xs font-semibold text-muted-foreground hover:text-foreground">Show {found.length - shown.length} more</button></li> : null}
      </ul>
      : <p className="px-1 text-xs text-muted-foreground">{needle ? 'Nobody else matches that.' : 'Everyone is already in this group.'}</p>}
  </div>
}

function PickRow({ person, busy, onAdd }: { person: DirectoryPerson; busy?: boolean; onAdd: Dispatch<PersonToAdd> }) {
  const staffable = canStaff(person.role)
  const [as, setAs] = React.useState<GroupRole>(staffable ? 'staff' : 'learner')
  return <li className="flex items-center gap-2 px-3 py-2">
    <PersonAvatar user={person.user as any} size="sm" />
    <span className="min-w-0 flex-1">
      <span className="block truncate text-sm font-semibold">{person.user.name}</span>
      <span className="block truncate text-xs text-muted-foreground">@{person.user.username}</span>
    </span>
    {staffable ? <select aria-label={`Add ${person.user.name} as`} value={as} onChange={(event) => setAs(event.target.value as GroupRole)} className={cn(SELECT, 'h-8')}>
      <option value="staff">Staff</option><option value="learner">Learner</option>
    </select> : <RoleTag role="learner" />}
    <button type="button" disabled={busy} onClick={() => onAdd({ user: person.user, role: person.role, as })} aria-label={`Add ${person.user.name}`}
      className="inline-flex h-8 shrink-0 items-center gap-1 rounded-lg bg-gray-900 px-2.5 text-xs font-bold text-white disabled:opacity-50"><Plus size={13} />Add</button>
  </li>
}

/** A learner in the group (or anyone added before the group exists), with a tag and remove. */
export function PersonLine({ user, tag, detail, busy, onRemove, children }: { user: PersonSummary; tag: React.ReactNode; detail?: string; busy?: boolean; onRemove: () => void; children?: React.ReactNode }) {
  return <li className="flex flex-wrap items-center gap-3 py-3">
    <PersonAvatar user={user as any} size="md" />
    <div className="min-w-0 flex-1">
      <p className="flex items-center gap-2"><span className="truncate text-sm font-semibold">{user.name}</span>{tag}</p>
      <p className="truncate text-xs text-muted-foreground">@{user.username}{detail ? ` · ${detail}` : ''}</p>
    </div>
    {children}
    <button type="button" onClick={onRemove} disabled={busy} aria-label={`Remove ${user.name}`} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground sm:h-9 sm:w-9">{busy ? <Loader2 size={16} className="animate-spin" /> : <X size={16} />}</button>
  </li>
}

function Heading({ count }: { count: number }) {
  return <div>
    <h3 className="text-sm font-bold">People{count ? ` · ${count}` : ''}</h3>
    <p className="mt-0.5 text-xs text-muted-foreground">Staff are listed first. They join each learner&rsquo;s school chat and the plans they cover.</p>
  </div>
}

const memberTag = (item: GroupPerson) => item.role === 'learner' ? <RoleTag role="learner" /> : <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-muted-foreground">Member</span>

/** A group's people in one list, staff first, with one search to add more. Admins only. */
export function GroupPeople({ groupId, onChanged }: { groupId: number; onChanged: () => Promise<unknown> }) {
  const { orgId, token } = usePeopleContext()
  const { mutate } = useSWRConfig()
  const staff = useGroupStaff(orgId, groupId, token)
  const { data: group } = useGroupDetail(groupId)
  const [busy, setBusy] = React.useState<number | null>(null)
  if (staff.error) return <section><Heading count={0} /><p className="mt-2 text-sm text-muted-foreground">Only admins can change a group&rsquo;s people.</p></section>
  if (!staff.data || !group) return <section><Heading count={0} /><div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div></section>

  const members = group.people.filter((item) => item.as === 'member')
  const exclude = new Set([...staff.data.staff.map((item) => item.user.id), ...members.map((item) => item.user.id)])
  const changed = async () => {
    await Promise.all([onChanged(), mutate(peopleKeys.group(orgId, groupId))])
  }
  const learners = async (userId: number, add: boolean) => {
    if (!token) return false
    setBusy(userId)
    const response = await (add ? linkUsersToUserGroup : unlinkUsersFromUserGroup)(groupId, [userId], orgId, token)
    setBusy(null)
    if (response.status !== 200) {
      toast.error(response.data?.detail || (add ? 'They weren’t added' : 'They weren’t removed'))
      return false
    }
    return true
  }
  const add = async (person: PersonToAdd) => {
    const done = person.as === 'staff' ? await staff.save(person.user.id, 'commenter', []) : await learners(person.user.id, true)
    if (done) await changed()
  }
  const removeMember = async (item: GroupPerson) => {
    if (!confirm(`Remove ${item.user.name} from this group? They leave its chat.`)) return
    if (await learners(item.user.id, false)) await changed()
  }
  const removeStaff = async (...args: Parameters<typeof staff.remove>) => {
    if (await staff.remove(...args)) await changed()
  }
  const saveStaff = async (...args: Parameters<typeof staff.save>) => {
    if (await staff.save(...args)) await changed()
  }

  return <section className="space-y-3">
    <Heading count={exclude.size} />
    <PeoplePicker exclude={exclude} busy={busy !== null || staff.busy !== null} onAdd={(person) => void add(person)} />
    {exclude.size ? <ul aria-label="People in this group, staff first" className="divide-y divide-border">
      {staff.data.staff.map((member) => <StaffRow key={`staff-${member.user.id}`} member={member} data={staff.data!} busy={staff.busy === member.user.id} save={saveStaff} remove={removeStaff} />)}
      {members.map((item) => <PersonLine key={`member-${item.user.id}`} user={item.user} tag={memberTag(item)} detail={item.status === 'alumni' ? 'Alumni' : undefined}
        busy={busy === item.user.id} onRemove={() => void removeMember(item)} />)}
    </ul> : <p className="rounded-lg border border-dashed border-gray-200 p-5 text-center text-sm text-muted-foreground">Nobody in this group yet. Add a teacher or counselor as staff, then its learners.</p>}
  </section>
}

/** The same list for a group that doesn't exist yet: who to add when it's created, staff first. */
export function DraftPeople({ value, onChange }: { value: PersonToAdd[]; onChange: Dispatch<PersonToAdd[]> }) {
  const exclude = new Set(value.map((item) => item.user.id))
  const ordered = [...value.filter((item) => item.as === 'staff'), ...value.filter((item) => item.as === 'learner')]
  const set = (userId: number, as: GroupRole) => onChange(value.map((item) => item.user.id === userId ? { ...item, as } : item))
  return <section className="space-y-3">
    <Heading count={value.length} />
    <PeoplePicker exclude={exclude} onAdd={(person) => onChange([...value, person])} />
    {ordered.length ? <ul aria-label="People to add, staff first" className="divide-y divide-border">
      {ordered.map((item) => <PersonLine key={item.user.id} user={item.user} tag={<RoleTag role={item.as === 'staff' ? 'staff' : 'learner'} />}
        detail={item.as === 'staff' ? 'Commenter on all plans' : undefined} onRemove={() => onChange(value.filter((other) => other.user.id !== item.user.id))}>
        {canStaff(item.role) ? <select aria-label={`${item.user.name} joins as`} value={item.as} onChange={(event) => set(item.user.id, event.target.value as GroupRole)} className={SELECT}>
          <option value="staff">Staff</option><option value="learner">Learner</option>
        </select> : null}
      </PersonLine>)}
    </ul> : null}
  </section>
}
