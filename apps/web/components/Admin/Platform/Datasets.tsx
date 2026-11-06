'use client'
import React from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import toast from 'react-hot-toast'
import { CaretRight, Database } from '@phosphor-icons/react'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { useOrg } from '@components/Contexts/OrgContext'
import { getUriWithOrg } from '@services/config/config'
import { routePaths } from '@services/routing/paths'
import { lifeAdminApi, lifeUrl, type Dataset, type EstimateFileKind } from '@services/life/life'
import { EmptyState, LoadingRows, StatusBadge } from './shared'

// Platform › Datasets: the published files behind life plan estimates, careers and schools.
// A file loads as drafts; learners see a release only once it is approved on its dataset's page.

// Only these files load; the server tells which one it got, and its year, from the file itself.
const ALLOWED = 'HUD county Fair Market Rents (like FY27_FMRs.xlsx), BLS OEWS all-data (like oesm25all.zip), the O*NET text database (like db_31_0_text.zip) or the College Scorecard institution file (Most-Recent-Cohorts-Institution.csv, or the zip that holds it), as the publisher gives them'
const KIND_LABEL: Record<EstimateFileKind, string> = { hud_fmr: 'HUD Fair Market Rents', bls_oews: 'BLS wages', onet: 'O*NET', scorecard: 'College Scorecard' }

export function StatusCounts({ byStatus }: { byStatus: Record<string, number> }) {
  const reviewed = byStatus.reviewed || 0, drafts = byStatus.draft || 0, retired = byStatus.retired || 0
  return <div className="flex flex-wrap gap-1">
    {reviewed ? <StatusBadge tone="green">{reviewed.toLocaleString()} in use</StatusBadge> : null}
    {drafts ? <StatusBadge tone="amber">{drafts.toLocaleString()} draft</StatusBadge> : null}
    {retired ? <StatusBadge>{retired.toLocaleString()} retired</StatusBadge> : null}
  </div>
}

function ImportForm({ token, onDone }: { token?: string; onDone: () => void }) {
  const [file, setFile] = React.useState<File | null>(null)
  const [busy, setBusy] = React.useState<string | false>(false)
  const input = React.useRef<HTMLInputElement>(null)
  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!file) return
    setBusy('Loading…')
    try {
      let result = await lifeAdminApi.importFile(file, token)
      // A big file (the BLS all-data workbook) keeps loading on the server; check back until it's done.
      for (let tries = 0; result.status === 'running' && tries < 200; tries++) {
        setBusy('Still loading… big files take a minute or two')
        await new Promise((resolve) => setTimeout(resolve, 3000))
        result = await lifeAdminApi.importStatus(result.job, token)
      }
      if (result.status === 'running') throw new Error('Still loading after 10 minutes. Refresh this page later to see it.')
      const what = [result.careers ? `${result.careers.toLocaleString()} careers` : '', result.schools ? `${result.schools.toLocaleString()} schools` : '', result.facts || !(result.careers || result.schools) ? `${(result.facts || 0).toLocaleString()} facts` : ''].filter(Boolean).join(' and ')
      toast.success(`Loaded ${result.kind ? KIND_LABEL[result.kind] : ''} ${result.year || ''}: ${what} as drafts. Approve them on the dataset's page.`.replace(/\s+/g, ' '))
      if (result.unmatched?.length) toast(`No place found for: ${result.unmatched.slice(0, 5).join(', ')}`)
      setFile(null); if (input.current) input.current.value = ''; onDone()
    } catch (error: any) {
      toast.error(error?.message || 'That file could not be loaded')
    } finally { setBusy(false) }
  }
  return <form onSubmit={submit} className="bg-white border border-gray-100 rounded-xl nice-shadow p-5 grid gap-4" aria-label="Import a file">
    <div><h2 className="font-semibold">Import a file</h2><p className="text-sm text-gray-500">Upload {ALLOWED}. A new year becomes a new release; loading the same release again replaces its rows, as drafts.</p></div>
    <label className="text-sm font-medium">File<input ref={input} className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm" type="file" required accept=".csv,.xlsx,.zip" onChange={(event) => setFile(event.target.files?.[0] || null)} /></label>
    <div><button type="submit" disabled={!!busy || !file} className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy || 'Import as drafts'}</button></div>
  </form>
}

function DatasetCard({ dataset, href }: { dataset: Dataset; href: string }) {
  const latest = dataset.releases[0]
  const rows = latest ? latest.tables.reduce((sum, table) => sum + table.rows, 0) : 0
  return <Link href={href} className="group bg-white border border-gray-100 rounded-xl nice-shadow p-5 flex flex-col gap-3 hover:border-gray-300 transition-colors">
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0"><h2 className="font-semibold text-gray-900">{dataset.title}</h2><p className="text-xs text-gray-500">{dataset.publisher}</p></div>
      <CaretRight size={16} className="mt-1 shrink-0 text-gray-400 group-hover:text-gray-700" aria-hidden="true" />
    </div>
    <p className="text-sm text-gray-600">{dataset.used_for || dataset.description}</p>
    {latest ? <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
      <span className="font-semibold text-gray-800">{latest.label}</span>
      <span>{rows.toLocaleString()} rows</span>
      {dataset.releases.length > 1 ? <span>{dataset.releases.length} releases</span> : null}
      <StatusCounts byStatus={latest.by_status} />
    </div> : <p className="text-xs font-semibold text-amber-700">Not loaded yet. Import its file below.</p>}
  </Link>
}

/** Platform › Datasets: every dataset we expect, its latest release, and importing new files. */
export default function Datasets() {
  const session = useLHSession() as any
  const token = session?.data?.tokens?.access_token
  const org = useOrg() as any
  const { data, error, isLoading, mutate } = useSWR(token ? lifeUrl('/admin/datasets') : null, () => lifeAdminApi.datasets(token))
  const datasets = data?.datasets || []
  const href = (kind: string) => org?.slug ? getUriWithOrg(org.slug, routePaths.owner.platform.dataset(kind)) : routePaths.owner.platform.dataset(kind)
  return <div className="flex flex-col gap-6">
    <p className="max-w-3xl text-sm text-gray-600">The published files behind life plan estimates, careers and schools. Open one to browse its rows by year, see where it comes from and how we use it, and export it. Learners only see a release once you approve it.</p>
    {isLoading ? <LoadingRows /> : error ? <p className="p-5 text-sm text-red-700" role="alert">The datasets could not load.</p>
      : !datasets.length ? <EmptyState icon={<Database size={32} />} message="No datasets yet." />
      : <div className="grid gap-4 md:grid-cols-2">{datasets.map((dataset) => <DatasetCard key={dataset.kind} dataset={dataset} href={href(dataset.kind)} />)}</div>}
    <ImportForm token={token} onDone={() => void mutate()} />
  </div>
}
