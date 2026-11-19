'use client'

import React from 'react'
import toast from 'react-hot-toast'
import { Loader2, RefreshCw } from 'lucide-react'
import { usePeopleContext } from '@components/Admin/People/usePeople'
import { CanvasTag } from '@components/Admin/People/CanvasTag'
import { UpgradeAction, useCanUpgrade } from '@components/Admin/Upgrade/UpgradeBanner'
import { pullCanvasClassList, type CanvasClassList as ClassList } from '@services/canvas/canvas'
import { inOrgWords } from '@/lib/people'

function when(iso: string | null): string {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

/** What going over a limit means, in a sentence: the invitations stay, the extra people wait for a seat. */
function overLimit(seats: ClassList['seats']): string {
  const parts = [
    seats.learners?.over ? inOrgWords(`${seats.learners.used} learners for ${seats.learners.limit} learner seats`) : '',
    seats.staff_seats?.over ? `${seats.staff_seats.used} staff for ${seats.staff_seats.limit} staff seats` : '',
  ].filter(Boolean)
  if (!parts.length) return ''
  return `With its Canvas class lists your school has ${parts.join(' and ')}. Everyone stays invited, and people past the limit can join once there’s room.`
}

const notice = 'rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2.5 text-sm text-foreground'

/**
 * A Canvas course's group (DEV-193): one line saying so and when its class list last came in, Update from Canvas
 * for staff who manage learners, and a notice when the pull failed or the class goes over the school's limits.
 * The people it invited are in the group's Invited list like any invitation, tagged Canvas.
 */
export function CanvasCourseBar({ groupId, canvas, onChanged }: { groupId: number; canvas: ClassList; onChanged: () => Promise<unknown> }) {
  const { orgId, token } = usePeopleContext()
  const canUpgrade = useCanUpgrade()
  const [busy, setBusy] = React.useState(false)
  const over = overLimit(canvas.seats || {})

  const pull = async () => {
    if (!token || busy) return
    setBusy(true)
    try {
      const result = await pullCanvasClassList(orgId, groupId, token)
      const changes = [
        result.invited ? `${result.invited} invited` : '',
        result.joined ? `${result.joined} joined the group` : '',
        result.withdrawn ? `${result.withdrawn} ${result.withdrawn === 1 ? 'invitation' : 'invitations'} withdrawn` : '',
      ].filter(Boolean)
      toast.success(changes.length ? `Updated from Canvas: ${changes.join(', ')}` : 'Up to date with Canvas')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Canvas didn’t answer. Try again in a moment.')
    } finally {
      await onChanged()
      setBusy(false)
    }
  }

  const line = !canvas.offered
    ? 'The class list comes in when a teacher opens Life2Launch from this course.'
    : canvas.pulled_at ? `Class list updated ${when(canvas.pulled_at)}` : 'The class list comes in shortly after a teacher opens Life2Launch from this course.'

  return <section aria-label="Canvas course" className="flex flex-col gap-2">
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-1">
      <CanvasTag />
      <span className="min-w-0 flex-1 text-sm text-muted-foreground">{line}</span>
      {canvas.can_pull && canvas.offered ? <button type="button" onClick={() => void pull()} disabled={busy}
        className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-border px-3 text-xs font-semibold hover:bg-muted disabled:opacity-50">
        {busy ? <Loader2 size={13} className="animate-spin" aria-hidden="true" /> : <RefreshCw size={13} aria-hidden="true" />}Update from Canvas
      </button> : null}
    </div>
    {canvas.error ? <p role="status" className={notice}>{canvas.error}</p> : null}
    {over ? <div role="status" className={`${notice} flex flex-col gap-2.5 sm:flex-row sm:items-center`}>
      <p className="flex-1">{over}</p>
      {canUpgrade ? <UpgradeAction className="self-start sm:self-auto" /> : null}
    </div> : null}
  </section>
}
