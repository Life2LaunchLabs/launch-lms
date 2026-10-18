'use client'

import React from 'react'
import toast from 'react-hot-toast'
import useSWR from 'swr'
import { ChevronDown, FlaskConical, Loader2, Plus } from 'lucide-react'
import { Button } from '@components/ui/button'
import { formatDateTime } from '@components/Admin/Platform/shared'
import { COACH_POLICY_PATH, coachAdminApi, type CoachPolicy, type CoachTests as Tests } from '@services/coach/admin'
import CoachTestEditor, { blankTest } from './CoachTestEditor'
import { RunDetails, RunScores } from './CoachTestResults'
import { Panel, errorMessage, useCoachPolicy } from './CoachShell'

export default function CoachTests({ policy }: { policy: CoachPolicy }) {
  const { token } = useCoachPolicy()
  const { data, error, mutate } = useSWR<Tests>(token ? [`${COACH_POLICY_PATH}/tests`, token] : null, () => coachAdminApi.tests(token), {
    refreshInterval: (latest) => (latest?.latest_run?.status === 'running' ? 2000 : 0),
  })
  const [open, setOpen] = React.useState<string | null>(null)
  const [adding, setAdding] = React.useState(false)
  const [starting, setStarting] = React.useState(false)

  async function run() {
    setStarting(true)
    try {
      await coachAdminApi.runTests(token)
      await mutate()
    } catch (reason) {
      toast.error(errorMessage(reason, 'Could not start the tests.'))
    } finally {
      setStarting(false)
    }
  }

  if (error) return <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">The tests could not be loaded. {(error as Error).message}</p>
  if (!data) return <p role="status" className="text-sm text-gray-500">Loading the tests…</p>

  const latest = data.latest_run
  const running = latest?.status === 'running'
  const enabled = data.tests.filter((test) => test.enabled).length
  const live = policy.release.live_number
  const comparing = policy.release.draft_changes.length > 0 && live
  return (
    <div className="space-y-4">
      <p className="text-sm leading-6 text-gray-600">
        Each test is one moment with a made-up learner and what a good response must and should do. A run sends every test through Coach exactly as a real learner&apos;s message would go, {data.runs_per_test} times on the draft{comparing ? ` and on live release ${live}` : ''}, and a separate model grades each response line by line without knowing which version wrote it. Results guide you; they never block a release.
      </p>
      <Panel
        title="Run"
        description={enabled ? `About ${data.estimate} model calls on your keys: a response and a grade for each run of each test${comparing ? ', on both versions' : ''}.` : 'Add a test to run.'}
        actions={<Button type="button" onClick={() => void run()} disabled={starting || running || !enabled}>{starting || running ? <Loader2 size={14} className="animate-spin" /> : <FlaskConical size={14} />}Run tests on the draft</Button>}
      >
        {latest ? (
          <div className="space-y-3">
            <p className="text-xs text-gray-500">
              {running ? 'Running' : latest.status === 'failed' ? 'Failed' : 'Finished'} · started {formatDateTime(latest.started_at)}
              {!data.latest_run_is_on_draft && !running ? ' · the draft has changed since this run' : ''}
            </p>
            {running ? (
              <div role="status" aria-label="Test run progress">
                <div className="h-2 overflow-hidden rounded-full bg-gray-100"><div className="h-full bg-gray-900 transition-all" style={{ width: `${latest.calls ? Math.round((latest.done_calls / latest.calls) * 100) : 0}%` }} /></div>
                <p className="mt-1 text-xs text-gray-600">{latest.done_calls} of {latest.calls} model calls done. You can leave this page; the run keeps going.</p>
              </div>
            ) : latest.status === 'failed' ? (
              <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">The run failed: {latest.error}</p>
            ) : null}
            {latest.status !== 'running' && latest.summary.draft ? <><RunScores run={latest} /><RunDetails run={latest} /></> : null}
          </div>
        ) : enabled ? <p className="text-sm text-gray-500">No runs yet.</p> : null}
      </Panel>
      <Panel
        title="Tests"
        description="Write learners and their words the way real learners do. Never mention testing in them: models answer differently when they can tell."
        actions={<Button type="button" variant="outline" onClick={() => { setAdding(true); setOpen(null) }} disabled={adding}><Plus size={15} />New test</Button>}
      >
        <ol className="space-y-3">
          {adding ? <li><CoachTestEditor initial={blankTest} token={token} onSaved={mutate} onDone={() => setAdding(false)} /></li> : null}
          {data.tests.map((test) => (
            <li key={test.test_uuid} className="rounded-xl border border-black/10">
              <button type="button" onClick={() => setOpen(open === test.test_uuid ? null : test.test_uuid)} aria-expanded={open === test.test_uuid} className="flex w-full min-w-0 items-center gap-3 p-3 text-left">
                <ChevronDown size={16} className={`shrink-0 text-gray-400 transition-transform ${open === test.test_uuid ? 'rotate-180' : ''}`} />
                <span className="min-w-0">
                  <span className="flex flex-wrap items-center gap-2 text-sm font-bold text-gray-950">
                    {test.title}
                    {!test.enabled ? <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-bold text-gray-600">Off</span> : null}
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-gray-500">
                    {test.moment === 'goal_created' ? `Creates a goal: ${test.goal.title}` : `Says: “${test.message}”`} · {test.rubric.filter((line) => line.kind === 'must').length} must, {test.rubric.filter((line) => line.kind === 'should').length} should
                  </span>
                </span>
              </button>
              {open === test.test_uuid ? <div className="border-t border-black/10 p-4"><CoachTestEditor key={test.updated_at} uuid={test.test_uuid} initial={test} token={token} onSaved={mutate} onDone={() => setOpen(null)} /></div> : null}
            </li>
          ))}
        </ol>
        {!data.tests.length && !adding ? <p className="text-sm text-gray-500">No tests yet. Start with the moments you care most about getting right, like a learner who wants to give up.</p> : null}
      </Panel>
    </div>
  )
}
