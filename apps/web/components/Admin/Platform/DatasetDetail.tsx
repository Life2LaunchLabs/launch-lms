'use client'
import React from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import useSWR from 'swr'
import toast from 'react-hot-toast'
import { ArrowLeft, DownloadSimple, Info, Table as TableIcon } from '@phosphor-icons/react'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { useOrg } from '@components/Contexts/OrgContext'
import { Tabs, TabsList, TabsTrigger } from '@components/ui/tabs'
import { getUriWithOrg } from '@services/config/config'
import { routePaths } from '@services/routing/paths'
import { lifeAdminApi, lifeUrl, type Dataset, type DatasetRelease, type DatasetTableName } from '@services/life/life'
import { EmptyState, FilterSelect, LoadingRows, Pagination, SearchInput, useDebounced, useListParams } from './shared'
import { StatusCounts } from './Datasets'

const PER_PAGE = 50
const FILTER_LABELS: Record<string, string> = { metric: 'Metric', level: 'Place level', status: 'Status', job_zone: 'Job zone', state: 'State', control: 'Control' }
const FILTER_KEYS = Object.keys(FILTER_LABELS)
const DEFAULTS: Record<string, string> = { release: '', table: '', q: '', page: '1', ...Object.fromEntries(FILTER_KEYS.map((key) => [key, ''])) }

function cell(value: string | number | null | undefined, numeric: boolean) {
  if (value === null || value === undefined || value === '') return <span className="text-gray-300">–</span>
  if (numeric && typeof value === 'number') return value.toLocaleString('en-US', { maximumFractionDigits: 2 })
  return String(value)
}

/** What the dataset is, where it comes from and how we use it, folded away until asked for. */
function About({ dataset, release }: { dataset: Dataset; release?: DatasetRelease }) {
  const rows: Array<[string, React.ReactNode]> = [
    ['What it is', dataset.description],
    ['How we use it', dataset.used_for],
    ['Publisher', dataset.publisher],
    ['License', dataset.license],
    ['File to import', dataset.file],
    ['Published at', dataset.url ? <a href={dataset.url} target="_blank" rel="noreferrer" className="text-blue-600 underline">{dataset.url}</a> : null],
  ]
  if (release) rows.push(
    ['This release', [release.title, release.released ? `released ${release.released}` : '', release.retrieved ? `loaded ${release.retrieved}` : ''].filter(Boolean).join(' · ')],
    ['Source key', <code key="key" className="text-xs">{release.key}</code>],
  )
  if (release?.notes) rows.push(['Notes', release.notes])
  return <details className="group bg-white border border-gray-100 rounded-xl nice-shadow">
    <summary className="flex cursor-pointer list-none items-center gap-2 px-5 py-3 text-sm font-semibold text-gray-800"><Info size={16} aria-hidden="true" />About this dataset<span className="ml-auto text-xs font-normal text-gray-500 group-open:hidden">Source, license and how we use it</span></summary>
    <dl className="grid gap-x-6 gap-y-2 border-t border-gray-100 px-5 py-4 text-sm sm:grid-cols-[10rem_minmax(0,1fr)]">
      {rows.filter(([, value]) => value).map(([label, value]) => <React.Fragment key={label}><dt className="text-gray-500">{label}</dt><dd className="text-gray-800">{value}</dd></React.Fragment>)}
    </dl>
  </details>
}

function ReviewActions({ release, token, onDone }: { release: DatasetRelease; token?: string; onDone: () => void }) {
  const [busy, setBusy] = React.useState(false)
  const set = async (status: 'reviewed' | 'draft' | 'retired') => {
    if (status === 'retired' && !window.confirm(`Stop using every row from ${release.title || release.key}?`)) return
    setBusy(true)
    try { await lifeAdminApi.review(release.key, status, token); onDone() } catch (error: any) { toast.error(error?.message || 'Could not change this release') } finally { setBusy(false) }
  }
  const { reviewed = 0, draft = 0, retired = 0 } = release.by_status
  return <div className="flex flex-wrap gap-2">
    {draft || retired ? <button type="button" disabled={busy} onClick={() => void set('reviewed')} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">Approve for learners</button> : null}
    {reviewed ? <button type="button" disabled={busy} onClick={() => void set('draft')} className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold disabled:opacity-50">Back to draft</button> : null}
    {reviewed || draft ? <button type="button" disabled={busy} onClick={() => void set('retired')} className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 disabled:opacity-50">Retire</button> : null}
  </div>
}

function Rows({ release, table, token }: { release: DatasetRelease; table: DatasetTableName; token?: string }) {
  const params = useListParams(DEFAULTS)
  const [search, setSearch] = React.useState(params.get('q'))
  const q = useDebounced(search)
  const page = Math.max(1, Number(params.get('page')) || 1)
  const filters = Object.fromEntries(FILTER_KEYS.map((key) => [key, params.get(key)]))
  React.useEffect(() => { if (q !== params.get('q')) params.update({ q, page: 1 }) }, [q]) // eslint-disable-line react-hooks/exhaustive-deps
  const query = { table, q: params.get('q'), page, per_page: PER_PAGE, filters }
  const { data, error, isLoading } = useSWR(token ? ['dataset-rows', release.key, JSON.stringify(query)] : null, () => lifeAdminApi.datasetRows(release.key, query, token), { keepPreviousData: true })
  const [exporting, setExporting] = React.useState(false)
  const exportCsv = async () => {
    setExporting(true)
    try {
      const { blob, name } = await lifeAdminApi.exportDataset(release.key, { table, q: params.get('q'), filters }, token)
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url; link.download = name; link.click()
      URL.revokeObjectURL(url)
    } catch (err: any) { toast.error(err?.message || 'The export could not be made') } finally { setExporting(false) }
  }
  const options = data?.filters || {}
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.per_page)) : 1
  return <div className="bg-white border border-gray-100 rounded-xl nice-shadow overflow-hidden">
    <div className="flex flex-wrap items-center gap-3 border-b border-gray-100 px-4 py-3">
      <SearchInput value={search} onChange={setSearch} placeholder="Search rows" />
      {Object.entries(options).filter(([key, values]) => values.length > 1 || filters[key]).map(([key, values]) => <FilterSelect key={key} label={FILTER_LABELS[key] || key} value={filters[key] || ''} onChange={(value) => params.update({ [key]: value, page: 1 })} options={[{ value: '', label: 'All' }, ...values.map((value) => ({ value: String(value), label: String(value) }))]} />)}
      <span className="ml-auto text-xs text-gray-500" aria-live="polite">{data ? `${data.total.toLocaleString()} rows` : ''}</span>
      <button type="button" onClick={() => void exportCsv()} disabled={exporting || !data?.total} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-800 hover:bg-gray-50 disabled:opacity-50"><DownloadSimple size={14} aria-hidden="true" />{exporting ? 'Exporting…' : 'Export CSV'}</button>
    </div>
    {isLoading && !data ? <LoadingRows /> : error ? <p className="p-5 text-sm text-red-700" role="alert">These rows could not load.</p>
      : !data?.rows.length ? <EmptyState icon={<TableIcon size={32} />} message="No rows match." />
      : <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-50 text-xs uppercase tracking-wider text-gray-500"><tr>{data.columns.map((column) => <th key={column.key} scope="col" className={`whitespace-nowrap px-3 py-2 font-semibold ${column.numeric ? 'text-right' : ''}`}>{column.label}</th>)}</tr></thead>
          <tbody>{data.rows.map((row, index) => <tr key={index} className="border-t border-gray-100 align-top">
            {data.columns.map((column) => <td key={column.key} className={`px-3 py-2 ${column.numeric ? 'text-right tabular-nums whitespace-nowrap' : 'max-w-[28rem]'} ${column.key === 'description' ? 'truncate' : ''}`} title={column.key === 'description' ? String(row[column.key] || '') : undefined}>{cell(row[column.key], column.numeric)}</td>)}
          </tr>)}</tbody>
        </table>
      </div>}
    <Pagination page={page} totalPages={totalPages} onPageChange={(next) => params.update({ page: next })} />
  </div>
}

/** One dataset: what it is, its releases as tabs, and each release's rows to search, filter and export. */
export default function DatasetDetail() {
  const { kind } = useParams<{ kind: string }>()
  const session = useLHSession() as any
  const token = session?.data?.tokens?.access_token
  const org = useOrg() as any
  const params = useListParams(DEFAULTS)
  const { data, error, isLoading, mutate } = useSWR(token ? lifeUrl('/admin/datasets') : null, () => lifeAdminApi.datasets(token))
  const dataset = data?.datasets.find((item) => item.kind === kind)
  const back = org?.slug ? getUriWithOrg(org.slug, routePaths.owner.platform.datasets()) : routePaths.owner.platform.datasets()
  const release = dataset?.releases.find((item) => item.key === params.get('release')) || dataset?.releases[0]
  const table = (release?.tables.find((item) => item.name === params.get('table')) || release?.tables[0])?.name
  const clear = Object.fromEntries(Object.keys(DEFAULTS).map((key) => [key, '']))

  return <div className="flex flex-col gap-5">
    <Link href={back} className="inline-flex items-center gap-1.5 self-start text-sm font-semibold text-gray-600 hover:text-gray-900"><ArrowLeft size={14} aria-hidden="true" />All datasets</Link>
    {isLoading ? <LoadingRows /> : error ? <p className="text-sm text-red-700" role="alert">The dataset could not load.</p>
      : !dataset ? <p className="text-sm text-gray-600">There's no dataset called {kind}.</p>
      : <>
        <div><h1 className="text-xl font-semibold text-gray-900">{dataset.title}</h1><p className="text-sm text-gray-500">{dataset.publisher}</p></div>
        <About dataset={dataset} release={release} />
        {!release ? <div className="bg-white border border-gray-100 rounded-xl nice-shadow"><EmptyState icon={<TableIcon size={32} />} message={`Not loaded yet. Import ${dataset.file || 'its file'} on the Datasets page.`} /></div>
          : <>
            <div className="flex flex-wrap items-center gap-3">
              {dataset.releases.length > 1 ? <Tabs value={release.key} onValueChange={(key) => params.update({ ...clear, release: key })}>
                <TabsList aria-label="Release">{dataset.releases.map((item) => <TabsTrigger key={item.key} value={item.key}>{item.label}</TabsTrigger>)}</TabsList>
              </Tabs> : <span className="text-sm font-semibold text-gray-800">{release.label}</span>}
              <StatusCounts byStatus={release.by_status} />
              <div className="ml-auto"><ReviewActions release={release} token={token} onDone={() => void mutate()} /></div>
            </div>
            {release.tables.length > 1 ? <Tabs value={table} onValueChange={(name) => params.update({ ...clear, release: release.key, table: name })}>
              <TabsList aria-label="Table">{release.tables.map((item) => <TabsTrigger key={item.name} value={item.name}>{item.title} <span className="ml-1.5 text-xs text-gray-400">{item.rows.toLocaleString()}</span></TabsTrigger>)}</TabsList>
            </Tabs> : null}
            {table ? <Rows key={`${release.key}:${table}`} release={release} table={table} token={token} /> : null}
          </>}
      </>}
  </div>
}
