'use client'

import React from 'react'
import { cn } from '@/lib/utils'
import ChatPane from '@components/Connect/ChatPane'
import ChatReports from '@components/Admin/Users/ChatReports'
import WaitingOnYou from '@components/Admin/Users/WaitingOnYou'
import { getUriWithOrg, routePaths } from '@services/config/config'
import type { GroupView } from '@services/routing/paths'
import PeopleList from './PeopleList'
import PersonProfile, { type PersonTab } from './PersonProfile'
import GroupPane from './GroupPane'
import { usePeopleContext, useRefreshPeople } from './usePeople'

/** What's open beside the list: nothing yet, a chat, someone (their conversation or their plans), or a group. */
export type PeopleSelection = { kind: 'none' } | { kind: 'chat'; uuid: string } | { kind: 'person'; username: string; tab?: PersonTab } | { kind: 'group'; id: number; view?: GroupView }

/**
 * People: the organization's people and groups in one list, with whoever has something new for
 * you on top, and the open person or group beside it. Both open the same way: a header (with
 * Manage for admins), their conversation with you (Message), where approvals and steps turned in
 * show as cards, and their plans (Plans). It's also where staff and admins manage people.
 */
export default function PeopleView({ orgslug, selection }: { orgslug: string; selection: PeopleSelection }) {
  const { orgId, token, isAdmin } = usePeopleContext()
  const refreshList = useRefreshPeople()
  const open = selection.kind !== 'none'
  const listHref = getUriWithOrg(orgslug, routePaths.org.admin.people.root())
  const personHref = React.useCallback((person: { username: string }) => getUriWithOrg(orgslug, routePaths.org.admin.people.user(person.username)), [orgslug])
  const onChanged = React.useCallback(() => { void refreshList() }, [refreshList])

  return <div className="flex h-[calc(100dvh-4rem)] w-full overflow-hidden bg-background md:h-[100dvh]" data-people>
    <section aria-label="People and groups" className={cn('flex min-h-0 w-full flex-col md:w-[360px] md:shrink-0 md:border-r md:border-border', open && 'hidden md:flex')}>
      <PeopleList orgslug={orgslug} selection={selection} />
    </section>
    <section aria-label={selection.kind === 'person' ? 'Person' : selection.kind === 'group' ? 'Group' : 'Chat'} className={cn('min-h-0 min-w-0 flex-1 flex-col overflow-hidden', open ? 'flex' : 'hidden md:flex')}>
      {selection.kind === 'chat' ? <ChatPane key={selection.uuid} orgslug={orgslug} chatUuid={selection.uuid} listHref={listHref} personHref={personHref} onChanged={onChanged} />
        : selection.kind === 'person' ? <PersonProfile key={selection.username} orgslug={orgslug} username={selection.username} tab={selection.tab} />
        : selection.kind === 'group' ? <GroupPane key={selection.id} orgslug={orgslug} groupId={selection.id} view={selection.view} />
        : <div className="min-h-0 flex-1 space-y-5 overflow-y-auto bg-[#f8f8f8] p-6 dark:bg-background">
          {/* Admins keep their oversight here: chat reports, and every student waiting on staff (not just theirs). */}
          {isAdmin && orgId ? <>
            <ChatReports orgId={orgId} orgslug={orgslug} token={token} />
            <WaitingOnYou orgId={orgId} orgslug={orgslug} token={token} everyone />
          </> : null}
          <p className="mx-auto max-w-sm pt-6 text-center text-sm text-muted-foreground">Pick a person or a group. New activity floats to the top of the list, and approvals and turned-in steps wait in that person&rsquo;s conversation.</p>
        </div>}
    </section>
  </div>
}
