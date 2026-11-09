'use client'
import Link from 'next/link'
import { useState } from 'react'
import useSWR from 'swr'
import { Button } from '@components/ui/button'
import { Label } from '@components/ui/label'
import { Textarea } from '@components/ui/textarea'
import { addPersonas, closeCohort, fetchUserTests, parsePersonaLines, personaName, userTestsKey, type TestCohortDetail, type TestPersona } from '@services/userTests/userTests'
import CohortCleanup from './CohortCleanup'
import LoginLinkPanel, { useLoginLink } from './LoginLinkPanel'
import RunBoard from './RunBoard'
import UserTestsInbox from './UserTestsInbox'
import UserTestsShell, { StatusPill, formatWhen, useUserTestsHref } from './UserTestsShell'

function AddPersonasForm({ cohort, onAdded }: { cohort: TestCohortDetail; onAdded: () => void }) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const parsed = parsePersonaLines(text)

  async function submit(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError('')
    try { await addPersonas(cohort.cohort_uuid, parsed); setText(''); onAdded() }
    catch (failure) { setError((failure as Error).message) }
    finally { setBusy(false) }
  }

  return <form onSubmit={submit} className="space-y-3 rounded-xl border bg-card p-5">
    <div><h2 className="text-lg font-semibold">Add personas</h2><p className="text-sm text-muted-foreground">One per line: a name, then <code>|</code> and a short brief. Start a line with <code>owner:</code> to also give them a new test org they run. Everyone joins the main org as a learner.</p></div>
    <Label htmlFor="persona-lines" className="sr-only">Personas, one per line</Label>
    <Textarea id="persona-lines" rows={5} value={text} onChange={(event) => setText(event.target.value)} placeholder={'Maya Lopez | 9th grader, new to the app, uses a phone\nowner: Dana Rivera | High school counselor setting up her school'} />
    {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
    <div className="flex items-center gap-3">
      <Button type="submit" disabled={busy || !parsed.length}>{busy ? 'Creating…' : parsed.length ? `Create ${parsed.length} persona${parsed.length === 1 ? '' : 's'}` : 'Create personas'}</Button>
      <span className="text-xs text-muted-foreground">{cohort.persona_count} of {cohort.max_personas} used</span>
    </div>
  </form>
}

export default function UserTestsCohort({ cohortUuid }: { cohortUuid: string }) {
  const href = useUserTestsHref()
  const key = `cohorts/${cohortUuid}`
  const { data, error, mutate } = useSWR(userTestsKey(key), () => fetchUserTests<TestCohortDetail>(key), { refreshInterval: 15000 })
  const login = useLoginLink()
  const [closing, setClosing] = useState(false)
  const [closeError, setCloseError] = useState('')
  const isOpen = data?.status === 'open'

  async function close() {
    if (!window.confirm('Close this cohort? Every persona in it is signed out, and no new login links can be made. Personas and mail stay for review.')) return
    setClosing(true); setCloseError('')
    try { await closeCohort(cohortUuid); await mutate() } catch (failure) { setCloseError((failure as Error).message) }
    finally { setClosing(false) }
  }
  const openAs = (persona: TestPersona, path = '/') => void login.make(persona.user_id, personaName(persona), path)

  return <UserTestsShell actions={isOpen ? <Button size="sm" variant="outline" onClick={close} disabled={closing}>{closing ? 'Closing…' : 'Close cohort'}</Button> : null}>
    <Link href={href()} className="text-sm text-muted-foreground hover:text-foreground">← All cohorts</Link>
    {error ? <p role="alert" className="text-sm text-destructive">{(error as Error).message}</p> : null}
    {!data && !error ? <p role="status" className="text-sm text-muted-foreground">Loading cohort…</p> : null}
    {data ? <>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="min-w-0 flex-1 truncate text-2xl font-semibold tracking-tight">{data.name}</h1>
        <StatusPill status={data.status} />
        <span className="text-xs text-muted-foreground">{isOpen ? `Closes ${formatWhen(data.expires_at)}` : data.status === 'purged' ? 'Personas and test orgs are deleted; mail is kept' : 'Personas are signed out'}</span>
      </div>
      {data.notes ? <p className="text-sm text-muted-foreground">{data.notes}</p> : null}
      {closeError ? <p role="alert" className="text-sm text-destructive">{closeError}</p> : null}
      <LoginLinkPanel link={login.link} error={login.error} onClose={login.clear} />
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Personas</h2>
        {data.personas.length ? <div className="overflow-x-auto rounded-xl border bg-card"><table className="w-full text-sm">
          <thead><tr className="border-b text-left text-[11px] uppercase tracking-wider text-muted-foreground"><th className="px-4 py-2.5 font-bold">Persona</th><th className="px-4 py-2.5 font-bold">Brief</th><th className="px-4 py-2.5 font-bold">Mail</th><th className="px-4 py-2.5 font-bold">Last active</th><th className="px-4 py-2.5"><span className="sr-only">Actions</span></th></tr></thead>
          <tbody>{data.personas.map((persona) => <tr key={persona.user_id} className="border-b last:border-0 align-top">
            <td className="px-4 py-3"><span className="block font-semibold">{personaName(persona)}</span><span className="block break-all text-xs text-muted-foreground">{persona.email}</span>{persona.start_state === 'org_owner' ? <span className="mt-1 inline-block rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-bold text-indigo-800">Runs a test org</span> : null}</td>
            <td className="max-w-80 px-4 py-3 text-xs text-muted-foreground">{persona.brief || '—'}</td>
            <td className="px-4 py-3 text-xs tabular-nums">{persona.unread_mail ? <b>{persona.unread_mail} unread</b> : '—'}</td>
            <td className="px-4 py-3 text-xs text-muted-foreground">{formatWhen(persona.last_active_at)}</td>
            <td className="px-4 py-3 text-right"><Button size="sm" variant="outline" disabled={!isOpen || login.busy} onClick={() => openAs(persona)}>Open as {persona.first_name}</Button></td>
          </tr>)}</tbody>
        </table></div> : <div className="rounded-xl border border-dashed bg-card p-6 text-sm text-muted-foreground">No personas yet.</div>}
      </section>
      {isOpen ? <AddPersonasForm cohort={data} onAdded={() => void mutate()} /> : null}
      <RunBoard cohortUuid={cohortUuid} personas={data.personas} stages={data.stages} isOpen={isOpen} onChanged={() => void mutate()} />
      {!isOpen && data.status !== 'purged' ? <CohortCleanup cohortUuid={cohortUuid} cohortName={data.name} onPurged={() => void mutate()} /> : null}
      <UserTestsInbox cohortUuid={cohortUuid} personas={data.personas} onOpenAs={({ persona, path }) => { if (isOpen) openAs(persona, path) }} />
    </> : null}
  </UserTestsShell>
}
