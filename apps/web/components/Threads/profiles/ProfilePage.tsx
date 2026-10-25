'use client'

import type { GroupView, OrgTab, PersonTab } from '@services/routing/paths'
import GroupProfile from './GroupProfile'
import OrgProfile from './OrgProfile'
import PersonProfile from './PersonProfile'

/** Whose profile a page or the side panel shows, and on which tab. */
export type ProfileSelection =
  | { kind: 'person'; username: string; tab?: PersonTab }
  | { kind: 'group'; groupId: number; view?: GroupView }
  | { kind: 'org'; tab?: OrgTab }

/** A profile, full width on its page, or compact in the side panel. */
export function Profile({ orgslug, selection, compact }: { orgslug: string; selection: ProfileSelection; compact?: boolean }) {
  if (selection.kind === 'person') return <PersonProfile key={selection.username} orgslug={orgslug} username={selection.username} tab={selection.tab} compact={compact} />
  if (selection.kind === 'group') return <GroupProfile key={selection.groupId} orgslug={orgslug} groupId={selection.groupId} view={selection.view} compact={compact} />
  return <OrgProfile orgslug={orgslug} tab={selection.tab} compact={compact} />
}

export default function ProfilePage({ orgslug, selection }: { orgslug: string; selection: ProfileSelection }) {
  return <div className="flex h-[calc(100dvh-4rem)] w-full flex-col overflow-hidden bg-background md:h-[100dvh]" data-profile>
    <Profile orgslug={orgslug} selection={selection} />
  </div>
}
