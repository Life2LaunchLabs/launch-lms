'use client'

import React from 'react'
import toast from 'react-hot-toast'
import useSWR from 'swr'
import { Loader2, RotateCcw, Send, Undo2 } from 'lucide-react'
import { Button } from '@components/ui/button'
import { Textarea } from '@components/ui/textarea'
import { formatDateTime } from '@components/Admin/Platform/shared'
import { COACH_POLICY_PATH, coachAdminApi, type CoachRelease, type CoachReleases as Releases } from '@services/coach/admin'
import { Panel, errorMessage, useCoachPolicy } from './CoachShell'
import { RunBadge, RunScores } from './CoachTestResults'

export default function CoachReleases() {
  const { mutate: mutatePolicy, token } = useCoachPolicy()
  const { data, error, mutate } = useSWR<Releases>(token ? [`${COACH_POLICY_PATH}/releases`, token] : null, () => coachAdminApi.releases(token))
  const [note, setNote] = React.useState('')
  const [busy, setBusy] = React.useState<string | null>(null)

  async function run(key: string, action: () => Promise<Releases>, done: string, failed: string) {
    setBusy(key)
    try {
      await mutate(await action(), { revalidate: false })
      await mutatePolicy()
      toast.success(done)
      return true
    } catch (reason) {
      toast.error(errorMessage(reason, failed))
      return false
    } finally {
      setBusy(null)
    }
  }

  async function release() {
    const next = (data?.releases[0]?.number ?? 0) + 1
    if (await run('release', () => coachAdminApi.release(note, token), `Release ${next} is live.`, 'Could not release the draft.')) setNote('')
  }

  function discard() {
    if (!data?.live_number || !window.confirm(`Put the draft back to release ${data.live_number}? Every change in the draft is lost.`)) return
    void run('discard', () => coachAdminApi.discardDraft(token), `The draft is back to release ${data.live_number}.`, 'Could not discard the draft.')
  }

  function rollBack(item: CoachRelease) {
    if (!window.confirm(`Make release ${item.number} live again? Learners get it from their next conversation. The draft stays as it is.`)) return
    void run(item.release_uuid, () => coachAdminApi.rollBack(item.release_uuid, token), `Release ${item.number} is live again.`, 'Could not roll back.')
  }

  if (error) return <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">The releases could not be loaded. {(error as Error).message}</p>
  if (!data) return <p role="status" className="text-sm text-gray-500">Loading the releases…</p>

  const changes = data.draft_changes
  return (
    <div className="space-y-4">
      <p className="text-sm leading-6 text-gray-600">Edits on every tab change the draft. Releasing freezes the draft&apos;s knowledge, routines, abilities and models into a numbered release, and learners get the live one from their next conversation. Turning Coach on or off, keys and conversation starters apply at once.</p>
      <Panel
        title="Draft"
        description={changes.length ? `What changes for learners when you release it${data.live_number ? `, compared with release ${data.live_number}` : ''}.` : `The draft is the same as release ${data.live_number}.`}
        actions={changes.length && data.live_number ? <Button type="button" variant="outline" size="sm" onClick={discard} disabled={busy !== null}><Undo2 size={14} />Discard draft changes</Button> : null}
      >
        {changes.length ? (
          <div className="space-y-4">
            <ChangeList changes={changes} />
            {data.draft_tests ? <div><p className="mb-2 text-sm font-bold text-gray-950">Tests on this draft</p><RunScores run={data.draft_tests} /></div> : <p className="text-xs text-gray-500">No test run on this exact draft yet. You can run the tests on the Tests tab first.</p>}
            <div>
              <label htmlFor="coach-release-note" className="text-sm font-bold text-gray-950">Release note</label>
              <Textarea id="coach-release-note" className="mt-2" rows={2} maxLength={2000} value={note} onChange={(event) => setNote(event.target.value)} placeholder="What this release is for, in a sentence (optional)" />
            </div>
            <Button type="button" onClick={() => void release()} disabled={busy !== null}>
              {busy === 'release' ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}Release to learners
            </Button>
          </div>
        ) : null}
      </Panel>
      <Panel title="Releases" description="Newest first. Rolling back releases an earlier version again under a new number.">
        <ol className="space-y-3">
          {data.releases.map((item) => (
            <li key={item.release_uuid} className="rounded-xl border border-black/10 p-4">
              <div className="flex flex-wrap items-start gap-2">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-bold text-gray-950">
                    Release {item.number}
                    {item.live ? <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-800">Live</span> : null}
                    {item.tests ? <RunBadge run={item.tests} /> : null}
                  </p>
                  <p className="mt-0.5 text-xs text-gray-500">{formatDateTime(item.released_at)}{item.released_by ? ` · ${item.released_by}` : ''}</p>
                  {item.note ? <p className="mt-2 text-sm text-gray-800">{item.note}</p> : null}
                </div>
                {!item.live ? (
                  <Button type="button" variant="outline" size="sm" onClick={() => rollBack(item)} disabled={busy !== null}>
                    {busy === item.release_uuid ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />}Roll back to this
                  </Button>
                ) : null}
              </div>
              {item.changes.length ? <details className="mt-2 text-sm"><summary className="cursor-pointer text-xs font-semibold text-gray-600">{item.changes.length === 1 ? '1 change' : `${item.changes.length} changes`}</summary><ChangeList changes={item.changes} /></details> : null}
            </li>
          ))}
        </ol>
      </Panel>
    </div>
  )
}

function ChangeList({ changes }: { changes: string[] }) {
  return (
    <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-gray-800">
      {changes.map((change, index) => <li key={`${index}-${change}`}>{change}</li>)}
    </ul>
  )
}
