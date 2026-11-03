'use client'
import React from 'react'
import useSWR from 'swr'
import toast from 'react-hot-toast'
import { Coins } from '@phosphor-icons/react'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { lifeAdminApi, lifeUrl, type EstimateFileKind, type SourceCoverage } from '@services/life/life'
import { EmptyState, LoadingRows, StatusBadge } from './shared'

// The published data behind life plan estimates: HUD Fair Market Rents and BLS wages for now.
// A file loads as draft facts; learners see a source's numbers only once it is approved here.

const KINDS: { value: EstimateFileKind; label: string; hint: string; url: string }[] = [
  { value: 'hud_fmr', label: 'HUD Fair Market Rents', hint: 'The county-level FMR file (fmr_0 to fmr_4), for Oregon counties.', url: 'https://www.huduser.gov/portal/datasets/fmr.html' },
  { value: 'bls_oews', label: 'BLS wages (OEWS)', hint: 'The all-data OEWS file: national, state and Oregon areas by occupation.', url: 'https://www.bls.gov/oes/tables.htm' },
]
const LEVELS = ['city', 'county', 'area', 'state', 'us']

function UploadForm({ token, onDone }: { token?: string; onDone: () => void }) {
  const [kind, setKind] = React.useState<EstimateFileKind>('hud_fmr')
  const [year, setYear] = React.useState(new Date().getFullYear())
  const [url, setUrl] = React.useState(KINDS[0].url)
  const [file, setFile] = React.useState<File | null>(null)
  const [busy, setBusy] = React.useState<string | false>(false)
  const chosen = KINDS.find((item) => item.value === kind)!
  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!file) return
    setBusy('Loading…')
    try {
      let result = await lifeAdminApi.importFile(kind, year, url, file, token)
      // A big file (the BLS all-data workbook) keeps loading on the server; check back until it's done.
      for (let tries = 0; result.status === 'running' && tries < 200; tries++) {
        setBusy('Still loading… big files take a minute or two')
        await new Promise((resolve) => setTimeout(resolve, 3000))
        result = await lifeAdminApi.importStatus(result.job, token)
      }
      if (result.status === 'running') throw new Error('Still loading after 10 minutes. Refresh this page later to see it.')
      toast.success(`Loaded ${(result.facts || 0).toLocaleString()} facts as drafts. Approve them to use them.`)
      if (result.unmatched?.length) toast(`No place found for: ${result.unmatched.slice(0, 5).join(', ')}`)
      setFile(null); onDone()
    } catch (error: any) {
      toast.error(error?.message || 'That file could not be loaded')
    } finally { setBusy(false) }
  }
  const field = 'mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm'
  return <form onSubmit={submit} className="bg-white border border-gray-100 rounded-xl nice-shadow p-5 grid gap-4 md:grid-cols-2" aria-label="Load a file">
    <div className="md:col-span-2"><h2 className="font-semibold">Load a file</h2><p className="text-sm text-gray-500">Loading a newer file from the same source replaces its numbers, as drafts.</p></div>
    <label className="text-sm font-medium">Source<select className={field} value={kind} onChange={(event) => { const next = event.target.value as EstimateFileKind; setKind(next); setUrl(KINDS.find((item) => item.value === next)!.url) }}>{KINDS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select><span className="mt-1 block text-xs font-normal text-gray-500">{chosen.hint}</span></label>
    <label className="text-sm font-medium">{kind === 'hud_fmr' ? 'Fiscal year' : 'Data year'}<input className={field} type="number" min={2000} max={2100} value={year} onChange={(event) => setYear(Number(event.target.value))} /></label>
    <label className="text-sm font-medium md:col-span-2">Where it was published<input className={field} type="url" required maxLength={500} value={url} onChange={(event) => setUrl(event.target.value)} /></label>
    <label className="text-sm font-medium md:col-span-2">File (CSV, Excel, or the publisher&rsquo;s zip)<input className={field} type="file" required accept=".csv,.xlsx,.xls,.zip" onChange={(event) => setFile(event.target.files?.[0] || null)} /></label>
    <div className="md:col-span-2"><button type="submit" disabled={!!busy || !file} className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy || 'Load as drafts'}</button></div>
  </form>
}

function SourceRow({ source, token, onDone }: { source: SourceCoverage; token?: string; onDone: () => void }) {
  const [busy, setBusy] = React.useState(false)
  const set = async (status: 'reviewed' | 'draft' | 'retired') => {
    if (status === 'retired' && !window.confirm(`Stop using every number from ${source.title || source.key}?`)) return
    setBusy(true)
    try { await lifeAdminApi.review(source.key, status, token); onDone() } catch (error: any) { toast.error(error?.message || 'Could not change this source') } finally { setBusy(false) }
  }
  const reviewed = source.by_status.reviewed || 0, drafts = source.by_status.draft || 0, retired = source.by_status.retired || 0
  return <tr className="border-t border-gray-100 align-top">
    <td className="px-4 py-3"><b className="block">{source.title || source.key}</b><span className="text-xs text-gray-500">{source.publisher}{source.released ? ` · released ${source.released}` : ''}{source.retrieved ? ` · loaded ${source.retrieved}` : ''}</span>{source.url ? <a href={source.url} target="_blank" rel="noreferrer" className="block text-xs text-blue-600 underline">Published here</a> : null}</td>
    <td className="px-4 py-3 tabular-nums">{source.facts.toLocaleString()}<span className="block text-xs text-gray-500">{source.metrics.join(', ')}</span></td>
    <td className="px-4 py-3 text-xs text-gray-600">{LEVELS.filter((level) => source.levels[level]).map((level) => `${level} ${source.levels[level]}`).join(' · ')}</td>
    <td className="px-4 py-3"><div className="flex flex-wrap gap-1">{reviewed ? <StatusBadge tone="green">{reviewed} in use</StatusBadge> : null}{drafts ? <StatusBadge tone="amber">{drafts} draft</StatusBadge> : null}{retired ? <StatusBadge>{retired} retired</StatusBadge> : null}</div></td>
    <td className="px-4 py-3"><div className="flex flex-wrap justify-end gap-2">
      {drafts || retired ? <button type="button" disabled={busy} onClick={() => void set('reviewed')} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">Approve for learners</button> : null}
      {reviewed ? <button type="button" disabled={busy} onClick={() => void set('draft')} className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold disabled:opacity-50">Back to draft</button> : null}
      {reviewed || drafts ? <button type="button" disabled={busy} onClick={() => void set('retired')} className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-700 disabled:opacity-50">Retire</button> : null}
    </div></td>
  </tr>
}

/** Platform › Estimates: the sources behind life plan estimates, loading new files and approving them. */
export default function EstimateSources() {
  const session = useLHSession() as any
  const token = session?.data?.tokens?.access_token
  const { data, error, isLoading, mutate } = useSWR(token ? lifeUrl('/admin/sources') : null, () => lifeAdminApi.sources(token))
  const sources = data?.sources || []
  return <div className="flex flex-col gap-6">
    <p className="max-w-3xl text-sm text-gray-600">Life plans only show an estimate when it comes from a published source that you&rsquo;ve approved here. Learners can always put in their own numbers.</p>
    <div className="bg-white border border-gray-100 rounded-xl nice-shadow overflow-hidden">
      {isLoading ? <LoadingRows /> : error ? <p className="p-5 text-sm text-red-700" role="alert">The sources could not load.</p>
        : !sources.length ? <EmptyState icon={<Coins size={32} />} message="No sources yet. Load a HUD or BLS file below." />
        : <table className="w-full text-left text-sm">
          <thead className="bg-gray-50 text-xs uppercase tracking-wider text-gray-500"><tr><th className="px-4 py-2">Source</th><th className="px-4 py-2">Numbers</th><th className="px-4 py-2">Places</th><th className="px-4 py-2">Status</th><th className="px-4 py-2 sr-only">Actions</th></tr></thead>
          <tbody>{sources.map((source) => <SourceRow key={source.key} source={source} token={token} onDone={() => void mutate()} />)}</tbody>
        </table>}
    </div>
    <UploadForm token={token} onDone={() => void mutate()} />
  </div>
}
