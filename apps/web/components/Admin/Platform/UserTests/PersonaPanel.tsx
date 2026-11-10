'use client'
import { useState } from 'react'
import useSWR from 'swr'
import { Button } from '@components/ui/button'
import { Label } from '@components/ui/label'
import { Textarea } from '@components/ui/textarea'
import StepForm from './StepForm'
import {
  fetchMyMail, fetchMyRun, logMyFinding, readMyMail, reportMyProgress,
  type MyRun, type NewFinding, type StageStatus, type TestMail,
} from '@services/userTests/userTests'

const STATUS_LABEL: Record<StageStatus, string> = { not_started: 'Not started', waiting: 'Waiting', in_progress: 'In progress', done: 'Done', stuck: 'Stuck' }
type Tab = 'stages' | 'step' | 'mail' | 'finding'

function Stages({ run, onChanged }: { run: MyRun; onChanged: () => void }) {
  const [error, setError] = useState('')
  async function set(key: string, status: StageStatus) {
    setError('')
    try { await reportMyProgress(key, status); onChanged() } catch (failure) { setError((failure as Error).message) }
  }
  if (!run.stages.length) return <p className="text-sm text-muted-foreground">This run has no stages yet. Explore freely.</p>
  return <ol className="space-y-3">
    {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
    {run.stages.map((stage, index) => <li key={stage.key} className="rounded-lg border p-3">
      <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Stage {index + 1} · {STATUS_LABEL[stage.status]}</p>
      <p className="font-semibold">{stage.title}</p>
      {stage.goal ? <p className="text-sm">{stage.goal}</p> : null}
      {stage.waiting_on ? <p className="mt-1 text-xs text-muted-foreground">Waiting on {stage.waiting_on}.</p> : null}
      {stage.status !== 'waiting' ? <div className="mt-2 flex flex-wrap gap-2">
        {stage.status !== 'in_progress' && stage.status !== 'done' ? <Button size="sm" variant="outline" onClick={() => void set(stage.key, 'in_progress')}>Start</Button> : null}
        {stage.status !== 'done' ? <Button size="sm" onClick={() => void set(stage.key, 'done')}>Done</Button> : null}
        {stage.status !== 'stuck' && stage.status !== 'done' ? <Button size="sm" variant="ghost" onClick={() => void set(stage.key, 'stuck')}>I&apos;m stuck</Button> : null}
      </div> : null}
    </li>)}
  </ol>
}

function Mail() {
  const { data } = useSWR('user_tests/me/mail', fetchMyMail, { refreshInterval: 15000 })
  const [open, setOpen] = useState<TestMail | null>(null)
  if (open) return <div className="space-y-2">
    <button type="button" className="text-xs underline" onClick={() => setOpen(null)}>Back to inbox</button>
    <p className="font-semibold">{open.subject}</p>
    {open.links.length ? <ul className="space-y-1 text-xs">{open.links.map((link) => <li key={link.url}>
      {link.path ? <a className="underline" href={link.path}>{link.path}</a> : <span className="break-all">{link.url}</span>}
    </li>)}</ul> : null}
    <iframe title={`Email: ${open.subject}`} sandbox="" srcDoc={open.html || ''} className="h-80 w-full rounded-lg border bg-white" />
  </div>
  if (!data) return <p className="text-sm text-muted-foreground">Loading…</p>
  if (!data.mail.length) return <p className="text-sm text-muted-foreground">No email yet. Anything the site sends you shows up here.</p>
  return <ul className="divide-y rounded-lg border">{data.mail.map((mail) => <li key={mail.id}>
    <button type="button" className="block w-full px-3 py-2 text-left text-sm hover:bg-muted" onClick={() => void readMyMail(mail.id).then(setOpen)}>
      <span className={mail.opened_at ? '' : 'font-semibold'}>{mail.subject}</span>
      <span className="block text-xs text-muted-foreground">{new Date(mail.captured_at).toLocaleString()}</span>
    </button>
  </li>)}</ul>
}

function FindingForm({ run }: { run: MyRun }) {
  const [finding, setFinding] = useState<NewFinding>({ kind: 'confusion', severity: 'medium', what_happened: '', what_wanted: '' })
  const [state, setState] = useState<'idle' | 'busy' | 'sent'>('idle')
  const [error, setError] = useState('')
  async function send(event: React.FormEvent) {
    event.preventDefault(); setState('busy'); setError('')
    try {
      await logMyFinding({ ...finding, page: window.location.pathname + window.location.search })
      setFinding({ ...finding, what_happened: '', what_wanted: '' }); setState('sent')
    } catch (failure) { setError((failure as Error).message); setState('idle') }
  }
  const field = 'w-full rounded-md border bg-background px-2 py-1.5 text-sm'
  return <form onSubmit={send} className="space-y-3">
    <div className="grid grid-cols-2 gap-2">
      <Label className="space-y-1 text-xs">What kind<select className={field} value={finding.kind} onChange={(e) => setFinding({ ...finding, kind: e.target.value as NewFinding['kind'] })}><option value="bug">Something broke</option><option value="confusion">Something was confusing</option><option value="wish">I wished I could…</option></select></Label>
      <Label className="space-y-1 text-xs">How bad<select className={field} value={finding.severity} onChange={(e) => setFinding({ ...finding, severity: e.target.value as NewFinding['severity'] })}><option value="low">Minor</option><option value="medium">Got in the way</option><option value="high">Couldn&apos;t go on</option></select></Label>
    </div>
    {run.stages.length ? <Label className="block space-y-1 text-xs">During<select className={field} value={finding.stage_key ?? ''} onChange={(e) => setFinding({ ...finding, stage_key: e.target.value || null })}><option value="">No particular stage</option>{run.stages.map((stage) => <option key={stage.key} value={stage.key}>{stage.title}</option>)}</select></Label> : null}
    <Label className="block space-y-1 text-xs">What happened<Textarea required rows={3} value={finding.what_happened} onChange={(e) => { setFinding({ ...finding, what_happened: e.target.value }); setState('idle') }} /></Label>
    <Label className="block space-y-1 text-xs">What you expected or wanted<Textarea rows={2} value={finding.what_wanted} onChange={(e) => setFinding({ ...finding, what_wanted: e.target.value })} /></Label>
    <p className="text-xs text-muted-foreground">This page&apos;s address is saved with it.</p>
    {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
    <Button type="submit" size="sm" disabled={state === 'busy' || !finding.what_happened.trim()}>{state === 'sent' ? 'Saved. Add another?' : state === 'busy' ? 'Saving…' : 'Save finding'}</Button>
  </form>
}

/** The persona's own side of a run: its stages, the email the site sent it, and a place to note what went wrong. */
export default function PersonaPanel({ onClose }: { onClose: () => void }) {
  const { data: run, error, mutate } = useSWR('user_tests/me', fetchMyRun, { refreshInterval: 15000 })
  const [tab, setTab] = useState<Tab>('stages')
  const tabs: [Tab, string][] = [['stages', 'My stages'], ['step', 'Log a step'], ['mail', `Email${run?.unread_mail ? ` (${run.unread_mail})` : ''}`], ['finding', 'Note a problem']]
  return <div role="dialog" aria-label="Test run" className="absolute right-2 top-full mt-1 max-h-[80vh] w-[min(26rem,calc(100vw-1rem))] overflow-y-auto rounded-xl border bg-card p-4 text-left text-sm text-foreground shadow-xl">
    <div className="mb-3 flex items-center gap-2">
      <div role="tablist" className="flex flex-1 flex-wrap gap-1">{tabs.map(([key, label]) => <button key={key} type="button" role="tab" aria-selected={tab === key} onClick={() => setTab(key)} className={`rounded-full px-3 py-1 text-xs font-semibold ${tab === key ? 'bg-foreground text-background' : 'bg-muted'}`}>{label}</button>)}</div>
      <button type="button" aria-label="Close" className="text-lg leading-none text-muted-foreground" onClick={onClose}>×</button>
    </div>
    {error ? <p role="alert" className="text-sm text-destructive">{(error as Error).message}</p>
      : !run ? <p className="text-sm text-muted-foreground">Loading…</p>
        : tab === 'stages' ? <Stages run={run} onChanged={() => void mutate()} />
          : tab === 'step' ? <StepForm run={run} /> : tab === 'mail' ? <Mail /> : <FindingForm run={run} />}
  </div>
}
