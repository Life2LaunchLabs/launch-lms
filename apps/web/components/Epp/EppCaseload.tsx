'use client'

import React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import useSWR from 'swr'
import toast from 'react-hot-toast'
import { Download, Loader2 } from 'lucide-react'
import { usePeopleContext } from '@components/Admin/People/usePeople'
import { EmptyState, PageLoader } from '@components/Goals/admin/live/ui'
import { getUriWithOrg } from '@services/config/config'
import { caseloadKey, downloadCaseloadExport, getCaseload, type CaseloadLearner, type CaseloadState, type ComponentKey } from '@services/epp/caseload'
import { routePaths } from '@services/routing/paths'
import { cn } from '@/lib/utils'
import { inOrgWords } from '@/lib/people'

const COLUMNS: { key: ComponentKey; label: string }[] = [
  { key: 'interests', label: 'Interests' }, { key: 'goals', label: 'Goals' }, { key: 'courses', label: 'Courses' }, { key: 'progress', label: 'Progress' }, { key: 'accomplishments', label: 'Evidence' },
]
const FILTERS: { key: CaseloadState | 'all'; label: string }[] = [
  { key: 'all', label: 'Students' }, { key: 'reviewed', label: 'Reviewed this year' }, { key: 'ready', label: 'Ready for review' }, { key: 'missing', label: 'Missing something' }, { key: 'waiting', label: 'Waiting to say yes' },
]
const shortDate = (value: string) => new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
const ATTENTION = 'text-[#A84300] dark:text-[#FFB27A]'

function Mark({ status, label }: { status?: string; label: string }) {
  if (!status) return <span className="text-muted-foreground" aria-label={`${label}: not shared`}>–</span>
  const ok = status !== 'needs_attention'
  return <span className={cn('font-bold', ok ? 'text-foreground' : ATTENTION)} title={`${label}: ${ok ? 'complete' : 'needs attention'}`}>
    <span aria-hidden="true">{ok ? '✓' : '!'}</span><span className="sr-only">{label}: {ok ? 'complete' : 'needs attention'}</span>
  </span>
}

function LastReview({ row }: { row: CaseloadLearner }) {
  if (row.state === 'waiting') return <span className="text-muted-foreground">–</span>
  if (!row.last_review) return <span className={ATTENTION}>Never</span>
  return <span>{shortDate(row.last_review)}{row.due ? <span className={ATTENTION}>, due</span> : null}</span>
}

function Action({ row, orgslug }: { row: CaseloadLearner; orgslug: string }) {
  if (row.state === 'waiting' || !row.username) {
    return row.username ? <Link href={getUriWithOrg(orgslug, routePaths.org.admin.people.user(row.username))} className="text-sm font-semibold underline">Profile</Link> : null
  }
  const ready = row.state === 'ready'
  return <Link href={getUriWithOrg(orgslug, routePaths.org.admin.people.epp(row.username))}
    className={cn('inline-flex h-8 items-center rounded-full px-3 text-sm font-semibold', ready ? 'bg-foreground text-background' : 'border border-border hover:bg-muted')}>{ready ? 'Review' : 'Open'}</Link>
}

function Facts({ row }: { row: CaseloadLearner }) {
  const facts = [row.grade ? `Grade ${row.grade}` : null, row.student_id ? `ID ${row.student_id}` : null].filter(Boolean).join(' · ')
  return facts ? <span className="block text-xs text-muted-foreground">{facts}</span> : null
}

/**
 * Staff: every learner the school supports and where their Education Plan and Profile stands (the five
 * components, evidence, last review, what's open), with a class export of the reviewed records as PDFs.
 */
export default function EppCaseload({ orgslug, mine }: { orgslug: string; mine: boolean }) {
  const { org, orgId, token } = usePeopleContext()
  const router = useRouter()
  const { data, error } = useSWR(orgId && token ? caseloadKey(orgId, mine) : null, () => getCaseload(orgId, mine, token), { revalidateOnFocus: false, shouldRetryOnError: false })
  const [filter, setFilter] = React.useState<CaseloadState | 'all'>('all')
  const [exporting, setExporting] = React.useState(false)
  const rows = (data?.learners || []).filter((row) => filter === 'all' || row.state === filter)
  const exportPdfs = async () => {
    setExporting(true)
    try {
      await downloadCaseloadExport(orgId, mine, token)
    } catch (failure: any) {
      toast.error(failure?.message || 'That download didn’t work')
    }
    setExporting(false)
  }
  const tabs = 'h-8 rounded-full px-3 text-sm font-semibold'

  return <div className="mx-auto w-full max-w-[1120px] space-y-5 px-4 py-6 sm:px-6">
    <header className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{org?.name}{data ? ` · ${data.school_year}` : ''}</p>
        <h1 className="mt-1 text-2xl font-extrabold">Education plans</h1>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-full border border-border p-0.5" role="group" aria-label="Whose plans">
          {[false, true].map((value) => <button key={String(value)} type="button" aria-pressed={mine === value} onClick={() => router.replace(getUriWithOrg(orgslug, routePaths.org.admin.people.eppCaseload(value)))}
            className={cn(tabs, mine === value ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground')}>{value ? 'I counsel' : 'Everyone'}</button>)}
        </div>
        <button type="button" disabled={!data?.exportable || exporting} onClick={() => void exportPdfs()}
          className="inline-flex h-9 items-center gap-1.5 rounded-full bg-foreground px-4 text-sm font-semibold text-background disabled:opacity-40">
          {exporting ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : <Download size={15} aria-hidden="true" />}Export reviewed PDFs{data ? ` (${data.exportable})` : ''}
        </button>
      </div>
    </header>

    {error && !data ? <EmptyState title="Education plans aren’t available" detail={error?.message} />
      : !data ? <PageLoader />
      : <>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {FILTERS.filter((item) => item.key !== 'waiting' || data.counts.waiting).map((item) => {
            const count = item.key === 'all' ? data.counts.total : data.counts[item.key]
            return <button key={item.key} type="button" aria-pressed={filter === item.key} onClick={() => setFilter(item.key)}
              className={cn('rounded-xl border px-4 py-3 text-left transition-colors', filter === item.key ? 'border-foreground bg-muted' : 'border-border hover:bg-muted/60')}>
              <span className="block text-2xl font-extrabold tabular-nums">{count}</span>
              <span className="text-xs font-semibold text-muted-foreground">{item.label}</span>
            </button>
          })}
        </div>

        {!data.learners.length ? <EmptyState title={mine ? 'You don’t counsel anyone yet' : inOrgWords('No supported learners yet')}
          detail={mine ? inOrgWords('On a learner’s School record, choose Make me their counselor.') : inOrgWords('Ask a learner to share their plan from their profile’s School record. They say yes in their chat with you.')} />
          : !rows.length ? <p className="py-6 text-center text-sm text-muted-foreground">Nobody here right now.</p>
          : <>
            <div className="hidden overflow-hidden rounded-xl border border-border md:block">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                  <tr><th className="px-4 py-2 font-semibold">Student</th>{COLUMNS.slice(0, 4).map((column) => <th key={column.key} className="px-2 py-2 text-center font-semibold">{column.label}</th>)}
                    <th className="px-2 py-2 font-semibold">Evidence</th><th className="px-2 py-2 font-semibold">Last review</th><th className="px-2 py-2 font-semibold">What’s open</th><th className="px-4 py-2" /></tr>
                </thead>
                <tbody className="divide-y divide-border">{rows.map((row) => <tr key={row.user_id}>
                  <td className="px-4 py-2.5"><span className="font-semibold">{row.name}</span><Facts row={row} /></td>
                  {COLUMNS.slice(0, 4).map((column) => <td key={column.key} className="px-2 py-2.5 text-center"><Mark status={row.components[column.key]} label={column.label} /></td>)}
                  <td className="px-2 py-2.5">{row.state === 'waiting' ? '–' : row.evidence ? `${row.evidence} item${row.evidence === 1 ? '' : 's'}` : <span className="text-muted-foreground">None</span>}</td>
                  <td className="px-2 py-2.5"><LastReview row={row} /></td>
                  <td className="px-2 py-2.5 text-muted-foreground">{row.open}</td>
                  <td className="px-4 py-2.5 text-right"><Action row={row} orgslug={orgslug} /></td>
                </tr>)}</tbody>
              </table>
            </div>
            <ul className="space-y-2 md:hidden">{rows.map((row) => <li key={row.user_id} className="rounded-xl border border-border px-4 py-3">
              <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="font-semibold">{row.name}</p><Facts row={row} /></div><Action row={row} orgslug={orgslug} /></div>
              {row.state !== 'waiting' ? <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs">{COLUMNS.map((column) => <span key={column.key}><Mark status={row.components[column.key]} label={column.label} /> {column.label}</span>)}</p> : null}
              <p className="mt-1.5 text-sm text-muted-foreground">{row.open}</p>
              {row.state !== 'waiting' ? <p className="mt-0.5 text-xs text-muted-foreground">Last review: <LastReview row={row} /></p> : null}
            </li>)}</ul>
          </>}
        <p className="text-xs text-muted-foreground">✓ complete, ! needs attention. Only learners who said yes to sharing their plan with {org?.name || 'the school'} are counted. The export has each one’s newest reviewed record this school year, one PDF each.</p>
      </>}
  </div>
}
