import React from 'react'
import { useOrg } from '@components/Contexts/OrgContext'
import { ReadOnlyNote } from '@components/Plans/shared/OwnershipChip'
import { useCanEditPlans } from '@components/Plans/shared/useCanEditPlans'

const READ_ONLY_TABS = ['analytics', 'routes', 'definition', 'marketing']

/**
 * Who owns a badge and what this viewer may do on its admin page. Owned by this organization: editable only by
 * its admins (the API says so with `can_edit`). Staff and other organizations running it see every detail read-only.
 */
export function useBadgeOwnership(badge: any) {
  const org = useOrg() as any
  const viewerIsEditor = useCanEditPlans() === true
  const owned = Number(org?.id) === Number(badge.org_id)
  const canEdit = owned && badge.can_edit !== false
  const ownerName: string | undefined = owned ? org?.name : badge.creator_org?.name
  // Owners' admins: every tab. Staff of the owner: everything but Issuers and Settings. Another organization
  // running it: what it does, its ways to earn and its definition, plus its own issuer settings for admins.
  const showsTab = (key: string) => canEdit || READ_ONLY_TABS.includes(key) || (!owned && key === 'settings' && viewerIsEditor)
  return { org, owned, canEdit, ownerName, viewerIsEditor, showsTab }
}

export function BadgeReadOnlyNote({ owned, ownerName }: { owned: boolean; ownerName?: string }) {
  return <ReadOnlyNote className="mb-4">{owned
    ? 'You can see everything about this badge here. Your organization’s admins change, publish and share it.'
    : `${ownerName || 'Another organization'} owns this badge. You award it through the templates under Ways to earn; only ${ownerName || 'its owner'} can change it.`}</ReadOnlyNote>
}
