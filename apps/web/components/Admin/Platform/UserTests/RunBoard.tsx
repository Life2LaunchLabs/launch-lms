'use client'
import { useState } from 'react'
import useSWR from 'swr'
import { Button } from '@components/ui/button'
import { Label } from '@components/ui/label'
import { Textarea } from '@components/ui/textarea'
import {
  fetchReport, fetchUserTests, parseStageLines, setPersonaProgress, setStages, stageLines, userTestsKey,
  type StageStatus, type TestBoard, type TestEvent, type TestPersona, type TestStage,
} from '@services/userTests/userTests'
import { formatWhen } from './UserTestsShell'

const STATUS: Record<StageStatus, { label: string; tone: string }> = {
  not_started: { label: 'Not started', tone: 'bg-muted text-muted-foreground' },
  waiting: { label: 'Waiting', tone: 'bg-sky-100 text-sky-800' },
  in_progress: { label: 'In progress', tone: 'bg-indigo-100 text-indigo-800' },
  done: { label: 'Done', tone: 'bg-emerald-100 text-emerald-800' },
  stuck: { label: 'Stuck', tone: 'bg-red-100 text-red-800' },
}
const KINDS: Record<string, string> = { bug: 'Bug', confusion: 'Confusing', wish: 'Wish', blocked: 'Refused' }

function StagesEditor({ cohortUuid, stages, personas, onSaved }: { cohortUuid: string; stages: TestStage[]; personas: TestPersona[]; onSaved: () => void }) {
  const [text, setText] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const value = text ?? stageLines(stages)

  async function save(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError('')
    try { await setStages(cohortUuid, parseStageLines(value)); setText(null); onSaved() } catch (failure) { setError((failure as Error).message) } finally { setBusy(false) }
  }
  return <form onSubmit={save} className="space-y-3 rounded-xl border bg-card p-5">
    <div><h2 className="text-lg font-semibold">Stages</h2>
      <p className="text-sm text-muted-foreground">One per line: a title, then <code>|</code> and the goal written for the persona. A stage is for everyone unless you add <code>| for handle, handle</code>. To make a stage wait for someone, add <code>| after handle/stage-key</code>. A stage&apos;s key is its title in lowercase with dashes. Handles: {personas.map((persona) => persona.handle).join(', ') || 'none yet'}.</p></div>
    <Label htmlFor="stage-lines" className="sr-only">Stages, one per line</Label>
    <Textarea id="stage-lines" rows={4} value={value} onChange={(event) => setText(event.target.value)} placeholder={'Invite your students | Invite Maya to your school. | for dana\nJoin your school | Join from the invite and find your first plan. | for maya | after dana/invite-your-students'} />
    {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
    <Button type="submit" size="sm" disabled={busy || text === null}>{busy ? 'Saving…' : 'Save stages'}</Button>
  </form>
}

function Findings({ cohortUuid, names }: { cohortUuid: string; names: Map<number, string> }) {
  const key = `cohorts/${cohortUuid}/events`
  const { data } = useSWR(userTestsKey(key), () => fetchUserTests<{ events: TestEvent[] }>(key), { refreshInterval: 15000 })
  const [copied, setCopied] = useState(false)
  const items = (data?.events ?? []).filter((event) => event.kind !== 'progress' && event.kind !== 'step')
  const steps = (data?.events ?? []).filter((event) => event.kind === 'step').length

  async function copy() {
    try { await navigator.clipboard.writeText((await fetchReport(cohortUuid)).markdown); setCopied(true) } catch { setCopied(false) }
  }
  return <section className="space-y-3" aria-labelledby="findings-heading">
    <div className="flex flex-wrap items-end gap-3">
      <div className="min-w-0 flex-1"><h2 id="findings-heading" className="text-lg font-semibold">Findings</h2><p className="text-sm text-muted-foreground">What personas reported from their own session, and anything the test seal refused.{steps ? ` ${steps} step${steps === 1 ? '' : 's'} logged for the story map, listed at the end of the report.` : ''}</p></div>
      <Button type="button" size="sm" variant="outline" onClick={() => void copy()} disabled={!items.length && !steps}>{copied ? 'Copied' : 'Copy report (Markdown)'}</Button>
    </div>
    {!data ? <p className="text-sm text-muted-foreground">Loading…</p> : !items.length ? <p className="rounded-xl border border-dashed bg-card p-4 text-sm text-muted-foreground">No findings yet.</p>
      : <ul className="divide-y rounded-xl border bg-card">{items.map((event) => {
        const kind = event.kind === 'blocked' ? 'blocked' : event.payload.kind
        return <li key={event.id} className="space-y-1 px-4 py-3 text-sm">
          <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground"><span className="rounded-full bg-muted px-2 py-0.5 font-bold text-foreground">{KINDS[kind] ?? kind}</span>{event.payload.severity ? <span>{event.payload.severity}</span> : null}<span>{names.get(event.persona_user_id ?? 0) ?? 'Someone'}</span>{event.payload.page ? <code>{event.payload.page}</code> : null}<span>{formatWhen(event.created_at)}</span></p>
          <p>{event.payload.what_happened || event.payload.message}</p>
          {event.payload.what_wanted ? <p className="text-xs text-muted-foreground">Wanted: {event.payload.what_wanted}</p> : null}
        </li>
      })}</ul>}
  </section>
}

/** The story: stages, every persona against every stage, and what the run found. */
export default function RunBoard({ cohortUuid, personas, stages, isOpen, onChanged }: { cohortUuid: string; personas: TestPersona[]; stages: TestStage[]; isOpen: boolean; onChanged: () => void }) {
  const key = `cohorts/${cohortUuid}/board`
  const { data, mutate } = useSWR(userTestsKey(key), () => fetchUserTests<TestBoard>(key), { refreshInterval: 10000 })
  const [error, setError] = useState('')
  const names = new Map(personas.map((persona) => [persona.user_id, `${persona.first_name} ${persona.last_name}`.trim()]))

  async function move(userId: number, stageKey: string, status: StageStatus) {
    setError('')
    try { await setPersonaProgress(userId, stageKey, status, 'Set from the run board'); void mutate() } catch (failure) { setError((failure as Error).message) }
  }
  return <>
    {isOpen ? <StagesEditor cohortUuid={cohortUuid} stages={stages} personas={personas} onSaved={() => { onChanged(); void mutate() }} /> : null}
    {data && data.stages.length ? <section className="space-y-3" aria-labelledby="board-heading">
      <h2 id="board-heading" className="text-lg font-semibold">Run board</h2>
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      <div className="overflow-x-auto rounded-xl border bg-card"><table className="w-full text-sm">
        <thead><tr className="border-b text-left text-[11px] uppercase tracking-wider text-muted-foreground"><th className="px-4 py-2.5 font-bold">Persona</th>{data.stages.map((stage) => <th key={stage.key} className="px-4 py-2.5 font-bold" title={stage.goal}>{stage.title}</th>)}</tr></thead>
        <tbody>{data.personas.map((row) => <tr key={row.user_id} className="border-b align-top last:border-0">
          <td className="px-4 py-3"><span className="block font-semibold">{row.name}</span><span className="block text-xs text-muted-foreground">@{row.handle}</span></td>
          {row.cells.map((cell) => cell.status === 'not_assigned' ? <td key={cell.stage_key} className="min-w-40 px-4 py-3 text-muted-foreground"><span aria-label="Not this persona's stage">—</span></td> : <td key={cell.stage_key} className="min-w-40 px-4 py-3">
            <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-bold ${STATUS[cell.status].tone}`}>{STATUS[cell.status].label}</span>
            {cell.waiting_on ? <span className="mt-1 block text-xs text-muted-foreground">on {cell.waiting_on}</span> : null}
            {cell.note ? <span className="mt-1 block text-xs">{cell.note}</span> : null}
            {isOpen && cell.status !== 'not_started' && cell.status !== 'waiting' ? <button type="button" className="mt-1 block text-xs text-muted-foreground underline" onClick={() => void move(row.user_id, cell.stage_key, 'not_started')}>Reopen</button> : null}
          </td>)}
        </tr>)}</tbody>
      </table></div>
    </section> : null}
    <Findings cohortUuid={cohortUuid} names={names} />
  </>
}
