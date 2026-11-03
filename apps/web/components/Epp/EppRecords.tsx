'use client'

import React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import useSWR from 'swr'
import toast from 'react-hot-toast'
import { Loader2 } from 'lucide-react'
import { usePeopleContext } from '@components/Admin/People/usePeople'
import { getUriWithOrg } from '@services/config/config'
import { RECORD_KIND_LABELS, recordKey, recordsApi, recordsKey, type RecordCreate } from '@services/epp/records'
import { routePaths } from '@services/routing/paths'
import { ReportFrame } from './EppReportPrint'

const field = 'w-full rounded-lg border border-[#D8DDE6] bg-[#fff] px-3 py-2 text-sm text-[#1C2433]'
const label = 'mb-1 block text-xs font-semibold text-[#3C4656]'
const longDate = (value: string) => new Date(value).toLocaleDateString(undefined, { dateStyle: 'medium' })

/** Save the live report as reviewed with the learner. The saved copy never changes. */
export function ReviewPanel({ orgslug, userId, first, onCancel }: { orgslug: string; userId: number; first: string; onCancel: () => void }) {
  const { orgId, token } = usePeopleContext()
  const router = useRouter()
  const [value, setValue] = React.useState<RecordCreate>({ kind: 'annual', outcome: '', staff_comment: '', learner_comment: '' })
  const [busy, setBusy] = React.useState(false)
  const set = (patch: Partial<RecordCreate>) => setValue((current) => ({ ...current, ...patch }))
  const save = async () => {
    setBusy(true)
    try {
      const saved = await recordsApi.review(orgId, userId, value, token)
      toast.success('Saved as a record')
      router.push(getUriWithOrg(orgslug, routePaths.org.admin.people.eppRecord(saved.record_uuid)))
    } catch (error: any) {
      toast.error(error?.message || 'That didn’t save')
      setBusy(false)
    }
  }
  return <form className="mb-5 space-y-3 rounded-xl border border-[#1C2433] p-4 text-[#1C2433]" onSubmit={(event) => { event.preventDefault(); void save() }}>
    <div>
      <h2 className="font-bold">Review and save</h2>
      <p className="text-sm text-[#3C4656]">Saves this report as it is now, with what you agreed. It won’t change later; a correction makes a new version.</p>
    </div>
    <label className="block"><span className={label}>Kind of review</span>
      <select className={field} value={value.kind} onChange={(event) => set({ kind: event.target.value as RecordCreate['kind'] })}>
        {(['annual', 'final', 'transfer'] as const).map((kind) => <option key={kind} value={kind}>{RECORD_KIND_LABELS[kind]}</option>)}
      </select>
    </label>
    <label className="block"><span className={label}>Outcome</span>
      <textarea className={field} rows={2} maxLength={2000} placeholder="What you decided together" value={value.outcome} onChange={(event) => set({ outcome: event.target.value })} />
    </label>
    <label className="block"><span className={label}>Your comment (optional)</span>
      <textarea className={field} rows={2} maxLength={4000} value={value.staff_comment} onChange={(event) => set({ staff_comment: event.target.value })} />
    </label>
    <label className="block"><span className={label}>{first}’s comment (optional)</span>
      <textarea className={field} rows={2} maxLength={4000} value={value.learner_comment} onChange={(event) => set({ learner_comment: event.target.value })} />
    </label>
    <div className="flex justify-end gap-2">
      <button type="button" onClick={onCancel} className="h-9 rounded-full px-4 text-sm font-bold hover:bg-[#F4F6F9]">Cancel</button>
      <button type="submit" disabled={busy || !value.outcome.trim()} className="inline-flex h-9 items-center gap-1.5 rounded-full bg-[#1C2433] px-4 text-sm font-bold text-[#fff] disabled:opacity-40">
        {busy ? <Loader2 size={14} className="animate-spin" /> : null}Save record
      </button>
    </div>
  </form>
}

/** The learner's saved records, newest first. */
export function SavedRecords({ orgslug, userId }: { orgslug: string; userId: number }) {
  const { orgId, token } = usePeopleContext()
  const { data } = useSWR(orgId && token ? recordsKey(orgId, userId) : null, () => recordsApi.list(orgId, userId, token), { revalidateOnFocus: false })
  if (!data?.records.length) return null
  return <div className="mb-2 rounded-xl bg-[#F4F6F9] px-4 py-3 text-sm text-[#1C2433]">
    <p className="mb-1 font-bold">Saved records</p>
    <ul className="space-y-0.5">{data.records.map((record) => <li key={record.record_uuid}>
      <Link href={getUriWithOrg(orgslug, routePaths.org.admin.people.eppRecord(record.record_uuid))} className="font-semibold underline">{RECORD_KIND_LABELS[record.kind]}, {longDate(record.reviewed_at)}</Link>
      <span className="text-[#3C4656]"> · {record.school_year}{record.version > 1 ? ` · version ${record.version}` : ''}{record.reviewed_by ? ` · ${record.reviewed_by}` : ''}</span>
    </li>)}</ul>
  </div>
}

/** One frozen record, to read, print or correct. It opens even after the learner's account is gone. */
export default function EppRecordView({ orgslug, recordUuid }: { orgslug: string; recordUuid: string }) {
  const { orgId, token } = usePeopleContext()
  const router = useRouter()
  const { data: record, error } = useSWR(orgId && token ? recordKey(orgId, recordUuid) : null, () => recordsApi.open(orgId, recordUuid, token), { revalidateOnFocus: false, shouldRetryOnError: false })
  const [correcting, setCorrecting] = React.useState(false)
  const [fix, setFix] = React.useState({ reason: '', outcome: '', staff_comment: '', student_id: '' })
  const [busy, setBusy] = React.useState(false)
  React.useEffect(() => { if (record) setFix({ reason: '', outcome: record.outcome, staff_comment: record.staff_comment, student_id: record.student_id || '' }) }, [record])
  const back = record?.user_id ? routePaths.org.admin.threads.person(record.user_id) : routePaths.org.admin.threads.root()
  const save = async () => {
    setBusy(true)
    try {
      const saved = await recordsApi.correct(orgId, recordUuid, { reason: fix.reason, outcome: fix.outcome, staff_comment: fix.staff_comment, student_id: fix.student_id || null }, token)
      toast.success(`Saved version ${saved.version}`)
      router.push(getUriWithOrg(orgslug, routePaths.org.admin.people.eppRecord(saved.record_uuid)))
    } catch (failure: any) {
      toast.error(failure?.message || 'That didn’t save')
      setBusy(false)
    }
  }
  return <ReportFrame back={getUriWithOrg(orgslug, back)} backLabel="Back" report={record?.report} error={error}
    actions={record && !record.superseded && !correcting ? <button type="button" onClick={() => setCorrecting(true)} className="inline-flex h-9 items-center rounded-full border border-[#1C2433] px-4 text-sm font-bold text-[#1C2433] hover:bg-[#F4F6F9]">Correct</button> : null}>
    {record ? <div className="mb-2 space-y-3 text-sm text-[#1C2433]">
      <p className="rounded-xl bg-[#F4F6F9] px-4 py-3"><b>{RECORD_KIND_LABELS[record.kind]}</b> for {record.learner_name}, saved {longDate(record.reviewed_at)}{record.reviewed_by ? ` by ${record.reviewed_by}` : ''}. Record ID {record.record_id}.
        {record.superseded ? ' A newer version corrects this one.' : ''}{record.user_id ? '' : ' Their account no longer exists; the school keeps this record.'}</p>
      {correcting ? <form className="space-y-3 rounded-xl border border-[#1C2433] p-4" onSubmit={(event) => { event.preventDefault(); void save() }}>
        <p className="text-[#3C4656]">A correction saves a new version. This one stays as it is.</p>
        <label className="block"><span className={label}>What’s being corrected</span><input className={field} maxLength={500} value={fix.reason} onChange={(event) => setFix({ ...fix, reason: event.target.value })} /></label>
        <label className="block"><span className={label}>Student ID</span><input className={field} maxLength={64} value={fix.student_id} onChange={(event) => setFix({ ...fix, student_id: event.target.value })} /></label>
        <label className="block"><span className={label}>Outcome</span><textarea className={field} rows={2} maxLength={2000} value={fix.outcome} onChange={(event) => setFix({ ...fix, outcome: event.target.value })} /></label>
        <label className="block"><span className={label}>Staff comment</span><textarea className={field} rows={2} maxLength={4000} value={fix.staff_comment} onChange={(event) => setFix({ ...fix, staff_comment: event.target.value })} /></label>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={() => setCorrecting(false)} className="h-9 rounded-full px-4 text-sm font-bold hover:bg-[#F4F6F9]">Cancel</button>
          <button type="submit" disabled={busy || !fix.reason.trim()} className="inline-flex h-9 items-center gap-1.5 rounded-full bg-[#1C2433] px-4 text-sm font-bold text-[#fff] disabled:opacity-40">{busy ? <Loader2 size={14} className="animate-spin" /> : null}Save correction</button>
        </div>
      </form> : null}
    </div> : null}
  </ReportFrame>
}
