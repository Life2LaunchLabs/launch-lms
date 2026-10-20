'use client'

import React from 'react'
import { useSWRConfig } from 'swr'
import { cn } from '@/lib/utils'
import ChatPane from '@components/Connect/ChatPane'
import { getUriWithOrg, routePaths } from '@services/config/config'
import { peopleKeys } from '@services/school/people'
import type { GroupView } from '@services/routing/paths'
import PeopleList from './PeopleList'
import PersonProfile from './PersonProfile'
import GroupPane from './GroupPane'
import PeopleOverview from './PeopleOverview'
import { usePeopleContext } from './usePeople'

/** What's open beside the list: nothing yet, a chat, someone's profile, or a group's chat. */
export type PeopleSelection = { kind: 'none' } | { kind: 'chat'; uuid: string } | { kind: 'person'; username: string } | { kind: 'group'; id: number; view?: GroupView }

/**
 * People: the organization's people and your chats with them in one list, the way a learner's
 * Connect looks, with the open chat, profile or group beside it. It's also where staff and admins
 * manage people: invite them, change their role, take them out, and run groups.
 */
export default function PeopleView({ orgslug, selection }: { orgslug: string; selection: PeopleSelection }) {
  const { orgId } = usePeopleContext()
  const { mutate } = useSWRConfig()
  const open = selection.kind !== 'none'
  const listHref = getUriWithOrg(orgslug, routePaths.org.admin.people.root())
  const personHref = React.useCallback((person: { username: string }) => getUriWithOrg(orgslug, routePaths.org.admin.people.user(person.username)), [orgslug])
  const refreshList = React.useCallback(() => {
    if (orgId) void mutate(peopleKeys.chats(orgId))
  }, [mutate, orgId])

  return <div className="flex h-[calc(100dvh-4rem)] w-full overflow-hidden bg-background md:h-[100dvh]" data-people>
    <section aria-label="People and chats" className={cn('flex min-h-0 w-full flex-col md:w-[360px] md:shrink-0 md:border-r md:border-border', open && 'hidden md:flex')}>
      <PeopleList orgslug={orgslug} selection={selection} />
    </section>
    <section aria-label={selection.kind === 'person' ? 'Profile' : 'Chat'} className={cn('min-h-0 min-w-0 flex-1 flex-col overflow-hidden', open ? 'flex' : 'hidden md:flex')}>
      {selection.kind === 'chat' ? <ChatPane key={selection.uuid} orgslug={orgslug} chatUuid={selection.uuid} listHref={listHref} personHref={personHref} onChanged={refreshList} />
        : selection.kind === 'person' ? <PersonProfile key={selection.username} orgslug={orgslug} username={selection.username} />
        : selection.kind === 'group' ? <GroupPane key={selection.id} orgslug={orgslug} groupId={selection.id} view={selection.view} />
        : <div className="min-h-0 flex-1 space-y-5 overflow-y-auto bg-[#f8f8f8] p-6">
          <PeopleOverview orgslug={orgslug} />
          <p className="mx-auto max-w-sm pt-6 text-center text-sm text-muted-foreground">Pick a chat or a person, or search for someone by name. Learners&rsquo; plan feeds are with their plans in Assignments.</p>
        </div>}
    </section>
  </div>
}
