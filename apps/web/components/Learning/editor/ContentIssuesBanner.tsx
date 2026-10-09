'use client'

import React from 'react'
import toast from 'react-hot-toast'
import { Wrench } from 'lucide-react'
import { type ActivityContentIssues, getActivityContentIssues, repairActivityContent } from '@services/learning/activityDocuments'

// Version notices for the editor: published versions are read-only, and
// content saved before the current content models is listed (it keeps working for
// learners and stays editable) and offers a reviewed one-click repair of the
// mechanical problems. Whatever needs a decision stays listed.
export function ContentIssuesBanner({ activityUuid, pages, editable, accessToken, refreshKey, beforeRepair, onRepaired }: {
  activityUuid: string
  pages: any[]
  editable: boolean
  accessToken?: string
  refreshKey: unknown
  beforeRepair: () => Promise<void>
  // eslint-disable-next-line no-unused-vars
  onRepaired: (activity: any) => void
}) {
  const [issues, setIssues] = React.useState<ActivityContentIssues | null>(null)
  const [busy, setBusy] = React.useState(false)

  React.useEffect(() => {
    if (!accessToken || !activityUuid) return
    let cancelled = false
    getActivityContentIssues(activityUuid, accessToken).then((next) => !cancelled && setIssues(next)).catch(() => null)
    return () => { cancelled = true }
  }, [activityUuid, accessToken, refreshKey])

  const entries = [
    ...Object.entries(issues?.pages || {}).map(([pageUuid, list]) => ({ where: pages.find((page) => page.page_uuid === pageUuid)?.title || 'A page', list })),
    ...(issues?.flow?.length ? [{ where: 'Flow', list: issues.flow }] : []),
  ]
  const immutable = !editable ? <div className="shrink-0 border-b border-amber-200 bg-amber-50 px-5 py-2 text-center text-xs font-semibold text-amber-900">Published versions are immutable. Create a draft from this version to edit the activity.</div> : null
  if (!entries.length) return immutable

  const runRepair = async () => {
    setBusy(true)
    try {
      await beforeRepair()
      const preview = await repairActivityContent(activityUuid, false, accessToken)
      const planned = [...Object.values(preview.changes.pages).flat(), ...preview.changes.flow]
      if (!planned.length) {
        toast('Nothing here can be fixed automatically. Edit or remove the listed blocks.')
        return
      }
      if (!window.confirm(`Apply these ${planned.length} fixes?\n\n${planned.join('\n')}`)) return
      const applied = await repairActivityContent(activityUuid, true, accessToken)
      setIssues(applied.remaining)
      if (applied.activity) onRepaired(applied.activity)
      toast.success(`Repaired ${planned.length} issue${planned.length === 1 ? '' : 's'}`)
    } catch (error: any) {
      toast.error(error?.message || 'Could not repair this activity')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
    {immutable}
    <div className="shrink-0 border-b border-amber-200 bg-amber-50 px-5 py-2 text-xs text-amber-900">
      <div className="flex items-start justify-between gap-4">
        <details>
          <summary className="cursor-pointer font-semibold">
            Some content was saved in an older format ({entries.reduce((total, entry) => total + entry.list.length, 0)} issue{entries.length === 1 && entries[0].list.length === 1 ? '' : 's'}). It still works for learners and you can keep editing.
          </summary>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {entries.flatMap((entry) => entry.list.map((issue) => <li key={`${entry.where}:${issue}`}><span className="font-semibold">{entry.where}:</span> {issue}</li>))}
          </ul>
        </details>
        {editable && (
          <button type="button" disabled={busy} onClick={runRepair} className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-amber-300 bg-white px-3 py-1.5 font-bold text-amber-900 hover:bg-amber-100 disabled:opacity-60">
            <Wrench size={14} /> Repair
          </button>
        )}
      </div>
    </div>
    </>
  )
}
