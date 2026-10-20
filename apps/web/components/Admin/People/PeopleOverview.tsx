'use client'

import React from 'react'
import { cn } from '@/lib/utils'
import ChatReports from '@components/Admin/Users/ChatReports'
import WaitingOnYou from '@components/Admin/Users/WaitingOnYou'
import HelperRequestsPanel from './HelperRequests'
import { usePeopleContext } from './usePeople'

/**
 * What's waiting on staff, and for admins, helpers to approve and chat reports. On a wide screen it
 * fills the pane beside the list while nothing is open; on a phone it sits at the top of the list,
 * the way a learner's chat requests sit at the top of Connect. Each part hides while it's empty.
 */
export default function PeopleOverview({ orgslug, className }: { orgslug: string; className?: string }) {
  const { orgId, token } = usePeopleContext()
  if (!orgId) return null
  return <div className={cn('space-y-5', className)}>
    <HelperRequestsPanel />
    <ChatReports orgId={orgId} orgslug={orgslug} token={token} />
    <WaitingOnYou orgId={orgId} orgslug={orgslug} token={token} />
  </div>
}
