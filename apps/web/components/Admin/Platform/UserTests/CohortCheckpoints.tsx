'use client'
import { useState } from 'react'
import useSWR from 'swr'
import { Button } from '@components/ui/button'
import { useAsk } from '@components/ui/ask-dialog'
import {
  captureCheckpoint, fetchUserTests, publishCheckpoint, userTestsKey,
  type TestCheckpoint, type TestStage,
} from '@services/userTests/userTests'
import { formatWhen } from './UserTestsShell'

/** The run's world after each stage, ready to become the demo. */
export default function CohortCheckpoints({ cohortUuid, stages, canCapture, demoHref }: { cohortUuid: string; stages: TestStage[]; canCapture: boolean; demoHref: string }) {
  const key = `cohorts/${cohortUuid}/checkpoints`
  const { data, mutate } = useSWR(userTestsKey(key), () => fetchUserTests<{ checkpoints: TestCheckpoint[] }>(key), { refreshInterval: 15000 })
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const ask = useAsk()
  const titles = new Map(stages.map((stage) => [stage.key, stage.title]))

  async function run(id: string, action: () => Promise<void>) {
    setBusy(id); setError(''); setNotice('')
    try { await action(); await mutate() } catch (failure) { setError((failure as Error).message) } finally { setBusy('') }
  }
  const capture = () => run('capture', async () => { await captureCheckpoint(cohortUuid) })
  async function publish(checkpoint: TestCheckpoint) {
    const yes = await ask.confirm({
      title: 'Make this the demo?',
      body: `New demo visits start from "${checkpoint.label}", and visitors can pick any of this run's personas. Visits already running keep their copy. You can switch back to an earlier version in Demo Studio.`,
      action: 'Publish as demo',
    })
    if (!yes) return
    await run(checkpoint.id, async () => {
      const result = await publishCheckpoint(checkpoint.id)
      setNotice(result.demo_enabled ? 'Published. New demo visits start here.' : 'Published, but the demo is turned off in Demo Studio, so visitors can\'t start it yet.')
    })
  }

  const items = data?.checkpoints ?? []
  return <section className="space-y-3" aria-labelledby="checkpoints-heading">
    {ask.dialog}
    <div className="flex flex-wrap items-end gap-3">
      <div className="min-w-0 flex-1"><h2 id="checkpoints-heading" className="text-lg font-semibold">Checkpoints</h2>
        <p className="text-sm text-muted-foreground">When every persona finishes a stage, the run is captured: its personas, their orgs and the main org, exactly as a demo copy gets them. Publish one to make it the demo. <a className="underline" href={demoHref}>Demo Studio</a> lists the personas as demo users, where you can write their picker cards.</p></div>
      {canCapture ? <Button type="button" size="sm" variant="outline" onClick={() => void capture()} disabled={!!busy}>{busy === 'capture' ? 'Capturing…' : 'Capture now'}</Button> : null}
    </div>
    {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
    {notice ? <p role="status" className="text-sm text-emerald-700 dark:text-emerald-400">{notice}</p> : null}
    {!data ? <p className="text-sm text-muted-foreground">Loading…</p> : !items.length
      ? <p className="rounded-xl border border-dashed bg-card p-4 text-sm text-muted-foreground">No checkpoints yet. The first is captured when every persona finishes a stage.</p>
      : <ul className="divide-y rounded-xl border bg-card">{items.map((checkpoint) => <li key={checkpoint.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
        <div className="min-w-0 flex-1">
          <p className="font-semibold">{checkpoint.label}{checkpoint.published ? <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-800">Live demo</span> : null}</p>
          <p className="text-xs text-muted-foreground">{checkpoint.stage_key ? `Stage: ${titles.get(checkpoint.stage_key) ?? checkpoint.stage_key} · ` : ''}{checkpoint.automatic ? 'Captured when the last persona finished' : 'Captured by hand'} · {formatWhen(checkpoint.created_at)} · {checkpoint.records.toLocaleString()} records, {checkpoint.files} files{checkpoint.warnings ? ` · ${checkpoint.warnings} warning${checkpoint.warnings === 1 ? '' : 's'}` : ''}</p>
          {!checkpoint.current ? <p className="text-xs text-amber-700">Captured before a product update, so it can no longer be published. Capture again.</p> : null}
        </div>
        <Button type="button" size="sm" variant={checkpoint.published ? 'outline' : 'default'} disabled={!!busy || !checkpoint.current} onClick={() => void publish(checkpoint)}>{busy === checkpoint.id ? 'Publishing…' : checkpoint.published ? 'Publish again' : 'Publish as demo'}</Button>
      </li>)}</ul>}
  </section>
}
