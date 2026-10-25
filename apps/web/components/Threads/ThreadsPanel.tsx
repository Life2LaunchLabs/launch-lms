'use client'

import React from 'react'
import Link from 'next/link'
import { ArrowLeft, Maximize2, X } from 'lucide-react'
import PeopleList, { threadHref } from '@components/Admin/People/PeopleList'
import { usePeopleContext } from '@components/Admin/People/usePeople'
import { getUriWithOrg, routePaths } from '@services/config/config'
import ThreadView, { type ThreadTarget } from './ThreadView'

const icon = 'grid h-8 w-8 place-items-center rounded-full text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground'

/**
 * Threads beside any admin page, in the panel Coach shares: the list, or one thread with a way
 * back to the list, to the Threads page (full screen), and to put the panel away.
 */
export default function ThreadsPanel({ active, target, setTarget, close }: { active: boolean; target: unknown; setTarget: (target: unknown) => void; close: () => void }) { // eslint-disable-line no-unused-vars
  const { orgId, orgslug, token } = usePeopleContext()
  const open = target as ThreadTarget | null
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
  return <div className="flex h-full min-h-0 flex-col pt-1">
    <ThreadView key={JSON.stringify(open)} target={open} orgId={orgId} orgslug={orgslug} token={token} onOpen={setTarget}
      actions={<>
        <button type="button" onClick={() => setTarget(null)} aria-label="All threads" title="All threads" className={icon}><ArrowLeft size={17} /></button>
        <Link href={threadHref(orgslug, open)} aria-label="Open full screen" title="Full screen" className={icon}><Maximize2 size={15} /></Link>
        {closeButton}
      </>} />
  </div>
}
