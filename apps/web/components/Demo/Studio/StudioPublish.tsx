'use client'
import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, CheckCircle2, RefreshCw } from 'lucide-react'
import { Button } from '@components/ui/button'
import { announceDemoSetupChange, demoRequest, type DemoPreflight, type DemoVersion, type DemoWarning } from '@services/demo/demo'
import StudioShell, { PublishStrip, useDemoStudio } from './StudioShell'

const WARNING_TITLES: Record<string, string> = {
  outside_owner: 'Files from accounts outside the demo',
  outside_org: 'Files from other organizations',
  missing_file: 'Missing files',
  unsafe_path: 'Skipped paths',
  not_in_main_org: 'Not a member of the main organization',
}

const count = (value: number, one: string, many = `${one}s`) => `${value} ${value === 1 ? one : many}`

function size(bytes = 0) {
  return bytes > 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`
}

export default function StudioPublish() {
  const { data, mutate } = useDemoStudio()
  const [report, setReport] = useState<DemoPreflight | null>(null)
  const [versions, setVersions] = useState<DemoVersion[]>([])
  const [checking, setChecking] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const check = useCallback(async () => {
    setChecking(true); setError('')
    try { setReport(await demoRequest<DemoPreflight>('preflight')) } catch (failure) { setError((failure as Error).message) }
    finally { setChecking(false) }
  }, [])
  const loadVersions = useCallback(async () => {
    try { setVersions(await demoRequest<DemoVersion[]>('checkpoints')) } catch { setVersions([]) }
  }, [])
  useEffect(() => { void check(); void loadVersions() }, [check, loadVersions])

  async function publish() {
    setBusy(true); setError(''); setNotice('')
    try {
      await demoRequest('checkpoints', 'POST', { revision: data?.settings?.revision })
      setNotice('Published. New visitors start from this version.')
      announceDemoSetupChange(); await mutate(); await loadVersions()
    } catch (failure) { setError((failure as Error).message) }
    finally { setBusy(false) }
  }
  async function restore(version: DemoVersion) {
    setBusy(true); setError(''); setNotice('')
    try {
      await demoRequest(`checkpoints/${version.id}/restore`, 'POST', { revision: data?.settings?.revision })
      setNotice('Restored. New visitors start from that version.')
      announceDemoSetupChange(); await mutate(); await loadVersions()
    } catch (failure) { setError((failure as Error).message) }
    finally { setBusy(false) }
  }

  const groups = (report?.warnings || []).reduce<Record<string, DemoWarning[]>>((result, item) => ({ ...result, [item.kind]: [...(result[item.kind] || []), item] }), {})

  return <StudioShell active="publish">
    {data ? <div className="space-y-6">
      <PublishStrip status={data} onPublishPage />
      <section className="rounded-xl border bg-card">
        <div className="flex flex-wrap items-center gap-3 border-b px-5 py-3"><h2 className="font-semibold">Before you publish</h2><span className="text-xs text-muted-foreground">{checking ? 'Checking…' : report ? 'Checked just now' : ''}</span><span className="flex-1" /><Button variant="ghost" size="sm" disabled={checking} onClick={() => void check()}><RefreshCw className="mr-1.5 h-3.5 w-3.5" />Check again</Button></div>
        <div className="divide-y px-5">
          {report && !report.ok ? <div className="flex gap-3 py-4"><AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" /><div><p className="font-semibold">Publishing is blocked</p><p className="text-sm text-muted-foreground">{report.error}</p></div></div> : null}
          {report?.users.map((person) => <div key={person.user_id} className="flex gap-3 py-3"><CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" /><div className="min-w-0"><p className="font-semibold">{person.name}</p><p className="text-sm text-muted-foreground">{[count(person.badges, 'badge earned', 'badges earned'), count(person.badge_runs, 'badge pathway started', 'badge pathways started'), count(person.projects, 'portfolio project'), count(person.plans, 'plan'), ...(person.conversations ? [count(person.conversations, 'coach conversation')] : [])].join(' · ')}</p></div></div>)}
          {report?.ok ? <div className="py-3 text-sm text-muted-foreground">Includes {report.organizations?.join(', ')}: {report.records?.toLocaleString()} records and {report.files} files ({size(report.bytes)}).</div> : null}
          {Object.entries(groups).map(([kind, items]) => <details key={kind} className="py-3"><summary className="flex cursor-pointer items-start gap-3"><AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" /><span className="min-w-0"><span className="font-semibold">{WARNING_TITLES[kind] || kind} ({items.length})</span><span className="block text-sm text-muted-foreground">{items[0].message}</span></span></summary>
            <ul className="mt-2 space-y-1 pl-8 text-xs text-muted-foreground">{items.slice(0, 50).map((item, index) => <li key={`${item.path}-${index}`} className="break-all">{item.path ? <code>{item.path}</code> : item.message}{item.table ? <> · used in {item.table}</> : null}</li>)}{items.length > 50 ? <li>…and {items.length - 50} more</li> : null}</ul>
          </details>)}
        </div>
      </section>
      <div className="flex flex-wrap items-center gap-3"><Button disabled={busy || checking || !report?.ok} onClick={() => void publish()}>{busy ? 'Publishing…' : 'Publish to new visitors'}</Button><p className="text-sm text-muted-foreground">People already exploring keep their current copy.</p></div>
      {notice ? <p role="status" className="text-sm text-emerald-700">{notice}</p> : null}
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      <section className="space-y-2"><h2 className="font-semibold">Published versions</h2>
        {versions.length ? <div className="overflow-x-auto rounded-xl border bg-card"><table className="w-full text-sm"><thead><tr className="border-b text-left text-[11px] uppercase tracking-wider text-muted-foreground"><th className="px-4 py-2.5 font-bold">Published</th><th className="px-4 py-2.5 font-bold">By</th><th className="px-4 py-2.5" /></tr></thead>
          <tbody>{versions.map((version) => <tr key={version.id} className="border-b last:border-0"><td className="px-4 py-2.5 tabular-nums">{new Date(version.published_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</td><td className="px-4 py-2.5">{version.published_by}</td><td className="px-4 py-2.5 text-right">{version.current ? <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-800">Current</span> : version.compatible ? <Button variant="ghost" size="sm" disabled={busy} onClick={() => void restore(version)}>Restore</Button> : <span className="text-xs text-muted-foreground">Before a product update</span>}</td></tr>)}</tbody></table></div>
          : <p className="text-sm text-muted-foreground">Nothing published yet.</p>}
      </section>
    </div> : null}
  </StudioShell>
}
