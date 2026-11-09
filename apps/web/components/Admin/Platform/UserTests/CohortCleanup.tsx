'use client'
import { useState } from 'react'
import { Button } from '@components/ui/button'
import { auditCohort, purgeCohort, type TestAudit, type TestPurge } from '@services/userTests/userTests'
import { formatWhen } from './UserTestsShell'

const TABLES: Record<string, string> = {
  usergroupuser: 'A group with real members',
  conversationmember: 'A conversation with real members',
  plancollaborator: 'A shared plan with real collaborators',
  portfolioperson: 'A portfolio shared with real people',
  userorganization: 'A membership in a real org',
}

function AuditResult({ audit }: { audit: TestAudit }) {
  if (audit.clean) return <p className="text-sm text-emerald-700 dark:text-emerald-400">Nothing ties this cohort to a real person or org. Checked {formatWhen(audit.checked_at)}.</p>
  return <div className="space-y-2">
    <p className="text-sm font-semibold text-destructive">{audit.count} link{audit.count === 1 ? '' : 's'} to real people or orgs. Remove them before purging.</p>
    <ul className="space-y-1 text-xs">{audit.leaks.map((leak) => <li key={`${leak.table}:${JSON.stringify(leak.key)}`} className="rounded bg-muted px-2 py-1">
      <b>{TABLES[leak.table] ?? leak.table}</b> <code>{Object.entries(leak.key).map(([key, value]) => `${key} ${value}`).join(', ')}</code> · mixes {leak.worlds.join(' and ')}
    </li>)}</ul>
  </div>
}

/** On a closed cohort: check for leaks, preview what purge deletes, then purge. */
export default function CohortCleanup({ cohortUuid, cohortName, onPurged }: { cohortUuid: string; cohortName: string; onPurged: () => void }) {
  const [audit, setAudit] = useState<TestAudit | null>(null)
  const [preview, setPreview] = useState<TestPurge | null>(null)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')

  async function run(step: string, work: () => Promise<void>) {
    setBusy(step); setError('')
    try { await work() } catch (failure) {
      const detail = (failure as { detail?: { audit?: TestAudit } }).detail
      if (detail?.audit) setAudit(detail.audit)
      setError((failure as Error).message)
    } finally { setBusy('') }
  }
  const check = () => run('audit', async () => { setAudit(await auditCohort(cohortUuid)); setPreview(null) })
  const dryRun = () => run('preview', async () => { const result = await purgeCohort(cohortUuid, true); setPreview(result); setAudit(result.audit) })
  const purge = () => {
    if (!window.confirm(`Purge "${cohortName}"? Its personas and test orgs are deleted for good. Captured mail stays.`)) return
    void run('purge', async () => { await purgeCohort(cohortUuid, false); onPurged() })
  }

  return <section className="space-y-3 rounded-xl border bg-card p-5" aria-labelledby="cleanup-heading">
    <div><h2 id="cleanup-heading" className="text-lg font-semibold">Leak audit and purge</h2>
      <p className="text-sm text-muted-foreground">The audit looks for anything tying this cohort to a real person or org. Purge deletes the personas and test orgs, and only runs when the audit is clean.</p></div>
    {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
    {audit ? <AuditResult audit={audit} /> : null}
    {preview && preview.audit.clean ? <p className="text-sm">Purge will delete <b>{preview.counts.personas}</b> persona{preview.counts.personas === 1 ? '' : 's'} and <b>{preview.counts.orgs}</b> test org{preview.counts.orgs === 1 ? '' : 's'}, with everything they made. {preview.counts.mail_kept} captured email{preview.counts.mail_kept === 1 ? '' : 's'} stay.</p> : null}
    <div className="flex flex-wrap gap-2">
      <Button type="button" size="sm" variant="outline" onClick={() => void check()} disabled={!!busy}>{busy === 'audit' ? 'Checking…' : 'Run leak audit'}</Button>
      {preview && preview.audit.clean
        ? <Button type="button" size="sm" variant="destructive" onClick={purge} disabled={!!busy}>{busy === 'purge' ? 'Purging…' : 'Purge cohort'}</Button>
        : <Button type="button" size="sm" variant="outline" onClick={() => void dryRun()} disabled={!!busy}>{busy === 'preview' ? 'Counting…' : 'Preview purge'}</Button>}
    </div>
  </section>
}
