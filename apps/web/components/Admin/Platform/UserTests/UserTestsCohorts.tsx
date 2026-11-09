'use client'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import useSWR from 'swr'
import { Button } from '@components/ui/button'
import { Input } from '@components/ui/input'
import { Label } from '@components/ui/label'
import { Textarea } from '@components/ui/textarea'
import { createCohort, fetchUserTests, userTestsKey, type TestCohort } from '@services/userTests/userTests'
import UserTestsShell, { StatusPill, formatWhen, useUserTestsHref } from './UserTestsShell'

function NewCohortForm({ onCreated }: { onCreated: React.Dispatch<TestCohort> }) {
  const [name, setName] = useState('')
  const [days, setDays] = useState('7')
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError('')
    try { onCreated(await createCohort({ name: name.trim(), days: Number(days) || 7, notes: notes.trim() })) }
    catch (failure) { setError((failure as Error).message); setBusy(false) }
  }

  return <form onSubmit={submit} className="space-y-4 rounded-xl border bg-card p-5">
    <div><h2 className="text-lg font-semibold">New cohort</h2><p className="text-sm text-muted-foreground">A cohort is one test run. Its personas can only be opened while it is open, and closing it signs them all out.</p></div>
    <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
      <div className="space-y-1.5"><Label htmlFor="cohort-name">Name</Label><Input id="cohort-name" required maxLength={120} value={name} onChange={(event) => setName(event.target.value)} placeholder="Riverside onboarding, Nov 12" /></div>
      <div className="space-y-1.5"><Label htmlFor="cohort-days">Open for (days)</Label><Input id="cohort-days" type="number" min={1} max={30} value={days} onChange={(event) => setDays(event.target.value)} /></div>
    </div>
    <div className="space-y-1.5"><Label htmlFor="cohort-notes">Notes (optional)</Label><Textarea id="cohort-notes" maxLength={2000} rows={2} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="What this run is checking" /></div>
    {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
    <Button type="submit" disabled={busy || !name.trim()}>{busy ? 'Creating…' : 'Create cohort'}</Button>
  </form>
}

export default function UserTestsCohorts() {
  const router = useRouter()
  const href = useUserTestsHref()
  const { data, error } = useSWR(userTestsKey('cohorts'), () => fetchUserTests<{ cohorts: TestCohort[] }>('cohorts'))
  const cohorts = data?.cohorts || []

  return <UserTestsShell>
    <div><h1 className="text-2xl font-semibold tracking-tight">User tests</h1><p className="text-sm text-muted-foreground">Test personas are real accounts on a test email domain. Their email is caught here instead of sent, and you open them with a one-time login link instead of a password.</p></div>
    {error ? <p role="alert" className="text-sm text-destructive">{(error as Error).message}</p> : null}
    {!data && !error ? <p role="status" className="text-sm text-muted-foreground">Loading cohorts…</p> : null}
    {data ? <section className="space-y-3">
      <h2 className="text-lg font-semibold">Cohorts</h2>
      {cohorts.length ? <div className="overflow-x-auto rounded-xl border bg-card"><table className="w-full text-sm">
        <thead><tr className="border-b text-left text-[11px] uppercase tracking-wider text-muted-foreground"><th className="px-4 py-2.5 font-bold">Cohort</th><th className="px-4 py-2.5 font-bold">Personas</th><th className="px-4 py-2.5 font-bold">Status</th><th className="px-4 py-2.5 font-bold">Closes</th></tr></thead>
        <tbody>{cohorts.map((cohort) => <tr key={cohort.cohort_uuid} className="cursor-pointer border-b last:border-0 hover:bg-muted/50" onClick={() => router.push(href(cohort.cohort_uuid))}>
          <td className="px-4 py-3"><Link href={href(cohort.cohort_uuid)} onClick={(event) => event.stopPropagation()} className="font-semibold">{cohort.name}</Link>{cohort.notes ? <span className="block truncate text-xs text-muted-foreground">{cohort.notes}</span> : null}</td>
          <td className="px-4 py-3 tabular-nums">{cohort.persona_count}</td>
          <td className="px-4 py-3"><StatusPill status={cohort.status} /></td>
          <td className="px-4 py-3 text-xs text-muted-foreground">{formatWhen(cohort.expires_at)}</td>
        </tr>)}</tbody>
      </table></div> : <div className="rounded-xl border border-dashed bg-card p-6 text-sm text-muted-foreground">No cohorts yet. Create one below to add personas.</div>}
    </section> : null}
    {data ? <NewCohortForm onCreated={(cohort) => router.push(href(cohort.cohort_uuid))} /> : null}
  </UserTestsShell>
}
