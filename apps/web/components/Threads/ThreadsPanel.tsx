'use client'

import React from 'react'
import Link from 'next/link'
import { ArrowLeft, Maximize2, X } from 'lucide-react'
import PeopleList, { threadHref } from '@components/Admin/People/PeopleList'
import { usePeopleContext } from '@components/Admin/People/usePeople'
import { getUriWithOrg, routePaths } from '@services/config/config'
import ThreadView, { type ProfileOf, type ThreadTarget } from './ThreadView'
import { profileHref } from './profiles/ProfileFrame'
import { Profile, type ProfileSelection } from './profiles/ProfilePage'

const icon = 'grid h-8 w-8 place-items-center rounded-full text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground'

/** A profile opened from a thread's header in the panel, with the thread to go back to. */
type PanelProfile = { kind: 'profile'; who: ProfileOf; back: ThreadTarget }

const selectionOf = (who: ProfileOf): ProfileSelection => 'username' in who ? { kind: 'person', username: who.username } : 'groupId' in who ? { kind: 'group', groupId: who.groupId } : { kind: 'org' }

/**
 * Threads beside any admin page, in the panel Coach shares: the list, one thread, or the profile
 * of whoever a thread is with (so you stay on the page you're on), each with a way back, to its
 * full page, and to put the panel away.
 */
export default function ThreadsPanel({ active, target, setTarget, close }: { active: boolean; target: unknown; setTarget: (target: unknown) => void; close: () => void }) { // eslint-disable-line no-unused-vars
  const { orgId, orgslug, token } = usePeopleContext()
  const open = target as ThreadTarget | PanelProfile | null
  if (!active && !open) return null
  if (!orgId || !orgslug) return null
  const closeButton = <button type="button" onClick={close} aria-label="Close" title="Close" className={icon}><X size={17} /></button>
  if (!open) return <div className="flex h-full min-h-0 flex-col pt-2">
    <div className="flex shrink-0 items-center justify-between px-4 pb-2">
      <h2 className="text-base font-bold">Threads</h2>
      <span className="flex items-center gap-1">
        <Link href={getUriWithOrg(orgslug, routePaths.org.admin.threads.root())} aria-label="Open Threads full screen" title="Full screen" className={icon}><Maximize2 size={15} /></Link>
        {closeButton}
      </span>
    </div>
    <PeopleList orgslug={orgslug} selection={{ kind: 'none' }} onOpen={setTarget} panel />
  </div>
  if (open.kind === 'profile') return <div className="flex h-full min-h-0 flex-col pt-1">
    <div className="flex shrink-0 items-center justify-between px-3 pb-1">
      <button type="button" onClick={() => setTarget(open.back)} aria-label="Back to the thread" title="Back to the thread" className={icon}><ArrowLeft size={17} /></button>
      <span className="flex items-center gap-1">
        <Link href={profileHref(orgslug, open.who)} aria-label="Open the profile full screen" title="Full screen" className={icon}><Maximize2 size={15} /></Link>
        {closeButton}
      </span>
    </div>
    <Profile orgslug={orgslug} selection={selectionOf(open.who)} compact />
  </div>
  return <div className="flex h-full min-h-0 flex-col pt-1">
    <ThreadView onProfile={(who) => setTarget({ kind: 'profile', who, back: open } satisfies PanelProfile)} key={JSON.stringify(open)} target={open} orgId={orgId} orgslug={orgslug} token={token} onOpen={setTarget}
      actions={<>
        <button type="button" onClick={() => setTarget(null)} aria-label="All threads" title="All threads" className={icon}><ArrowLeft size={17} /></button>
        <Link href={threadHref(orgslug, open)} aria-label="Open full screen" title="Full screen" className={icon}><Maximize2 size={15} /></Link>
        {closeButton}
      </>} />
  </div>
}
