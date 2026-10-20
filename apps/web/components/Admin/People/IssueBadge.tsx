'use client'

import React from 'react'
import toast from 'react-hot-toast'
import { Award, Loader2 } from 'lucide-react'
import Modal from '@components/Objects/StyledElements/Modal/Modal'
import { conferLearningBadge, getLearningBadgeCollections } from '@services/learning/learning'

/** Give someone a badge from the organization's collections, when the badge allows giving it directly. */
export default function IssueBadge({ user, orgId, token }: { user: { id: number; username: string }; orgId: number; token?: string }) {
  const [open, setOpen] = React.useState(false)
  const [loading, setLoading] = React.useState(false)
  const [issuing, setIssuing] = React.useState(false)
  const [badges, setBadges] = React.useState<any[]>([])
  const [badgeUuid, setBadgeUuid] = React.useState('')

  React.useEffect(() => {
    if (!open || !token) return
    let live = true
    setLoading(true)
    getLearningBadgeCollections(orgId, token, true).then((response: any) => {
      const collections = response?.success ? response.data : response
      const available = (Array.isArray(collections) ? collections : [])
        .flatMap((collection: any) => collection.badges || [])
        .filter((badge: any) => badge.status === 'published' && badge.direct_conferral_enabled === true)
      if (!live) return
      setBadges(available)
      setBadgeUuid((current) => current || available[0]?.badge_uuid || '')
    }).catch((error: any) => toast.error(error?.message || 'Badges didn’t load.')).finally(() => live && setLoading(false))
    return () => { live = false }
  }, [open, orgId, token])

  const issue = async () => {
    if (!badgeUuid || issuing) return
    setIssuing(true)
    try {
      await conferLearningBadge({ badge_uuid: badgeUuid, user_id: user.id, issuing_org_id: orgId }, token)
      toast.success(`Badge issued to ${user.username}.`)
      setOpen(false)
    } catch (error: any) {
      toast.error(error?.message || 'The badge wasn’t issued.')
    } finally {
      setIssuing(false)
    }
  }

  return <Modal isDialogOpen={open} onOpenChange={setOpen} minHeight="no-min" minWidth="md" dialogTitle={`Issue a badge to ${user.username}`}
    dialogDescription="Only published badges that can be given directly are shown."
    dialogContent={<div className="space-y-4 p-2">
      {loading ? <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin" /></div> : badges.length ? (
        <label className="block text-xs font-bold uppercase tracking-wide text-gray-500">
          Badge
          <select value={badgeUuid} onChange={(event) => setBadgeUuid(event.target.value)} className="mt-2 h-11 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm font-medium normal-case text-gray-900">
            {badges.map((badge) => <option key={badge.badge_uuid} value={badge.badge_uuid}>{badge.name}</option>)}
          </select>
        </label>
      ) : <p className="rounded-lg border border-dashed border-gray-200 p-8 text-center text-sm text-gray-500">No badges can be given directly right now.</p>}
      <button type="button" onClick={() => void issue()} disabled={!badgeUuid || issuing || loading} className="ml-auto flex items-center gap-2 rounded-lg bg-black px-5 py-2 text-xs font-bold text-white disabled:opacity-50">
        {issuing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Award className="h-4 w-4" />}Issue badge
      </button>
    </div>}
    dialogTrigger={<button type="button" className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-bold text-gray-800"><Award className="h-4 w-4" />Issue badge</button>} />
}
