'use client'

import React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, PanelRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useHub } from '@components/Hub/HubContext'
import ThreadView, { type ThreadTarget } from '@components/Threads/ThreadView'
import ChatPane from '@components/Connect/ChatPane'
import ChatReports from '@components/Admin/Users/ChatReports'
import WaitingOnYou from '@components/Admin/Users/WaitingOnYou'
import { getUriWithOrg, routePaths } from '@services/config/config'
import { profileHref } from '@components/Threads/profiles/ProfileFrame'
import PeopleList, { threadHref } from './PeopleList'
import { usePeopleContext, useRefreshPeople } from './usePeople'

/** What's open beside the list: nothing yet, a thread, or an old chat link. Profiles have their own pages. */
export type PeopleSelection = { kind: 'none' } | { kind: 'thread'; target: ThreadTarget } | { kind: 'chat'; uuid: string }

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
  const listHref = getUriWithOrg(orgslug, routePaths.org.admin.threads.root())
  const personHref = React.useCallback((person: { username: string }) => getUriWithOrg(orgslug, routePaths.org.admin.people.user(person.username)), [orgslug])
  const onChanged = React.useCallback(() => { void refreshList() }, [refreshList])

  return <div className="flex h-[calc(100dvh-4rem)] w-full overflow-hidden bg-background md:h-[100dvh]" data-people>
    <section aria-label="People and groups" className={cn('flex min-h-0 w-full flex-col md:w-[360px] md:shrink-0 md:border-r md:border-border', open && 'hidden md:flex')}>
      <PeopleList orgslug={orgslug} selection={selection} />
    </section>
    <section aria-label={selection.kind === 'thread' ? 'Thread' : 'Chat'} className={cn('min-h-0 min-w-0 flex-1 flex-col overflow-hidden', open ? 'flex' : 'hidden md:flex')}>
      {selection.kind === 'thread' ? <OpenThread key={JSON.stringify(selection.target)} orgslug={orgslug} target={selection.target} listHref={listHref} />
        : selection.kind === 'chat' ? <ChatPane key={selection.uuid} orgslug={orgslug} chatUuid={selection.uuid} listHref={listHref} personHref={personHref} onChanged={onChanged} />
        : <div className="min-h-0 flex-1 space-y-5 overflow-y-auto bg-[#f8f8f8] p-6 dark:bg-background">
          {/* Admins keep their oversight here: chat reports, and every student waiting on staff (not just theirs). */}
          {isAdmin && orgId ? <>
            <ChatReports orgId={orgId} orgslug={orgslug} token={token} />
            <WaitingOnYou orgId={orgId} orgslug={orgslug} token={token} everyone />
          </> : null}
          <p className="mx-auto max-w-sm pt-6 text-center text-sm text-muted-foreground">Pick a thread. New activity floats to the top of the list, and work to review, questions and helpers to approve wait in each thread.</p>
        </div>}
    </section>
  </div>
}

const icon = 'grid h-9 w-9 place-items-center rounded-full text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground'

/** The open thread on the Threads page: back to the list on a phone, beside the page, and its profile. */
function OpenThread({ orgslug, target, listHref }: { orgslug: string; target: ThreadTarget; listHref: string }) {
  const { orgId, token } = usePeopleContext()
  const router = useRouter()
  // On wide screens the thread stays beside the profile; on a phone the profile gets the screen.
  const hub = useHub()
  return <ThreadView target={target} orgId={orgId} orgslug={orgslug} token={token}
    onProfile={(who) => { if (hub?.hasThreads && !window.matchMedia('(max-width: 767px)').matches) hub.openThreads(target); router.push(profileHref(orgslug, who)) }}
    onOpen={(next) => router.push(threadHref(orgslug, next))}
    actions={<>
      <Link href={listHref} aria-label="All threads" title="All threads" className={cn(icon, 'md:hidden')}><ArrowLeft size={18} /></Link>
      {hub?.hasThreads ? <button type="button" onClick={() => { hub.openThreads(target); router.push(listHref) }} aria-label="Show beside the page" title="Show beside the page" className={cn(icon, 'hidden md:grid')}><PanelRight size={17} /></button> : null}
    </>} />
}
