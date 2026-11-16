'use client'

import React from 'react'
import useSWR from 'swr'
import toast from 'react-hot-toast'
import { AlertCircle, CheckCircle2, FileSpreadsheet, Lock, MailPlus, Upload } from 'lucide-react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@components/ui/select'
import { listCisSent, previewCisExport, sendCisInvitations, withdrawCisWork, type CisPreview, type CisSendResult } from '@services/organizations/cisImports'
import { inOrgWords } from '@/lib/people'

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const plural = (count: number, one: string, many = `${one}s`) => `${count} ${count === 1 ? one : many}`

const RESULT_LABELS: Record<string, string> = {
  invited: 'Invited',
  waiting_member: 'Already a member · CIS work waiting',
  waiting_invited: 'Invitation pending · CIS work added',
  invalid: 'Email not valid',
  duplicate: 'Duplicate email',
  missing: 'Not in the file',
}

const SENT_LABELS: Record<string, string> = { held: 'Waiting', imported: 'Brought in', declined: 'Declined', withdrawn: 'Withdrawn', expired: 'Expired' }

/** Invite learners from an Oregon CIS bulk export or one learner's download; their CIS work waits for them until they accept. */
export default function CisImportPanel({ org, accessToken, usergroups, groupsEnabled, onSent }: { org: any; accessToken: string; usergroups: any[]; groupsEnabled: boolean; onSent?: () => void }) {
  const [file, setFile] = React.useState<File | null>(null)
  const [preview, setPreview] = React.useState<CisPreview | null>(null)
  const [emails, setEmails] = React.useState<Record<string, string>>({})
  const [picked, setPicked] = React.useState<Set<string>>(new Set())
  const [groupId, setGroupId] = React.useState('none')
  const [note, setNote] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [result, setResult] = React.useState<CisSendResult | null>(null)
  const input = React.useRef<HTMLInputElement>(null)
  const sentKey = org && accessToken ? `cis-sent:${org.id}` : null
  const { data: sent, mutate: refreshSent } = useSWR(sentKey, () => listCisSent(org.id, accessToken), { revalidateOnFocus: false })

  const emailOf = (key: string) => (emails[key] ?? '').trim()
  const ready = (preview?.learners || []).filter((learner) => learner.items > 0 && picked.has(learner.key) && emailPattern.test(emailOf(learner.key)))

  const choose = async (chosen?: File) => {
    if (!chosen) return
    setBusy(true)
    try {
      const found = await previewCisExport(org.id, chosen, accessToken)
      setFile(chosen)
      setPreview(found)
      setResult(null)
      setEmails(Object.fromEntries(found.learners.map((learner) => [learner.key, learner.email])))
      setPicked(new Set(found.learners.filter((learner) => !learner.problem && learner.items > 0).map((learner) => learner.key)))
    } catch (error: any) {
      toast.error(error?.message || 'Could not read this file')
    } finally {
      setBusy(false)
    }
  }

  const toggle = (key: string) => setPicked((current) => { const next = new Set(current); if (next.has(key)) next.delete(key); else next.add(key); return next })
  const start = () => { setFile(null); setPreview(null); setResult(null) }

  const send = async () => {
    if (!file || !ready.length) return
    setBusy(true)
    try {
      const outcome = await sendCisInvitations(org.id, file, ready.map((learner) => ({ key: learner.key, email: emailOf(learner.key) })), { note: note.trim(), usergroupId: groupId !== 'none' ? Number(groupId) : undefined }, accessToken)
      setResult(outcome)
      await refreshSent()
      onSent?.()
      const unsent = outcome.results.filter((row) => row.email_sent === false).length
      if (unsent) toast.error(inOrgWords(`${plural(outcome.sent, 'learner')} sent, but ${plural(unsent, 'email')} didn't go out. You can resend from the invitations list.`), { duration: 10000 })
      else toast.success(inOrgWords(`${plural(outcome.sent, 'learner')} sent their CIS work`))
    } catch (error: any) {
      toast.error(error?.message || 'Could not send invitations')
    } finally {
      setBusy(false)
    }
  }

  const withdraw = async (heldUuid: string) => {
    try {
      await withdrawCisWork(org.id, heldUuid, accessToken)
      await refreshSent()
      toast.success('Their CIS work was deleted. Revoke the invitation too if they shouldn’t join.')
    } catch (error: any) {
      toast.error(error?.message || 'Could not withdraw it')
    }
  }

  const unmatched = preview ? Object.values(preview.unmatched).reduce((sum, value) => sum + value, 0) : 0
  const waiting = (sent || []).filter((row) => row.status === 'held')

  return <div className="space-y-5">
    {result ? <div className="space-y-3">
      <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50/50 p-4"><CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" /><p className="text-sm text-gray-800">{inOrgWords(`${plural(result.sent, 'learner')} will find their CIS work in their portfolio once they accept.`)}</p></div>
      <ResultList rows={result.results} names={Object.fromEntries((preview?.learners || []).map((learner) => [learner.key, learner.name]))} />
      <button type="button" onClick={start} className="inline-flex items-center gap-2 rounded-lg border bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"><Upload className="h-4 w-4" />Upload another export</button>
    </div>

    : preview ? <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm text-gray-700"><b className="font-semibold text-gray-900">{file?.name}</b> · {inOrgWords(preview.kind === 'single' ? 'one learner’s download' : plural(preview.learners.length, 'learner'))}</p><button type="button" onClick={start} className="text-xs font-medium text-indigo-700 hover:text-indigo-900">Choose another file</button></div>
      {unmatched > 0 && <Notice>{inOrgWords(`${plural(unmatched, 'row')} in the file didn’t match a learner on its Profile sheet and won’t come over.`)}</Notice>}
      {preview.skipped_files > 0 && <Notice>{inOrgWords(`${plural(preview.skipped_files, 'saved file')} in this zip can’t be matched to learners yet, so only their workbook rows come over.`)}</Notice>}
      <div className="overflow-hidden rounded-xl border border-gray-200">
        <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50 px-4 py-3"><span className="text-sm font-semibold text-gray-800">{inOrgWords('Learners')}</span><span className="text-xs text-gray-500">{ready.length} ready to invite</span></div>
        <ul className="max-h-80 divide-y divide-gray-100 overflow-y-auto">{preview.learners.map((learner) => {
          const email = emailOf(learner.key)
          const valid = emailPattern.test(email)
          return <li key={learner.key} className="flex items-start gap-3 px-4 py-3">
            <input type="checkbox" aria-label={`Invite ${learner.name || email || 'this learner'}`} className="mt-1 h-4 w-4 shrink-0 accent-gray-900" checked={learner.items > 0 && picked.has(learner.key)} disabled={!learner.items} onChange={() => toggle(learner.key)} />
            <div className="min-w-0 flex-1 space-y-1.5">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3"><span className="truncate text-sm font-semibold text-gray-900">{learner.name || 'No name in the export'}</span><span className="text-xs text-gray-500">{learner.items ? `${plural(learner.items, 'item')} to bring over` : 'Nothing from CIS to bring over'}</span></div>
              {learner.items ? <input type="email" value={emails[learner.key] ?? ''} onChange={(event) => { const value = event.target.value; setEmails((current) => ({ ...current, [learner.key]: value })); if (learner.items && emailPattern.test(value.trim())) setPicked((current) => new Set(current).add(learner.key)) }} placeholder="Add their email" aria-label={`Email for ${learner.name || 'this learner'}`} className={`h-9 w-full rounded-lg border px-3 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 ${email && !valid ? 'border-rose-300' : 'border-gray-200'}`} /> : null}
              {learner.problem && !valid && learner.items ? <p className="flex items-center gap-1.5 text-xs text-amber-700"><AlertCircle className="h-3.5 w-3.5 shrink-0" />{learner.problem}</p> : null}
            </div>
          </li>
        })}</ul>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {groupsEnabled && <label className="space-y-2 text-sm font-medium text-gray-800"><span>Group <span className="font-normal text-gray-400">optional</span></span><Select value={groupId} onValueChange={setGroupId}><SelectTrigger className="h-11"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">No group</SelectItem>{usergroups.map((group) => <SelectItem key={group.id} value={String(group.id)}>{group.name}</SelectItem>)}</SelectContent></Select></label>}
        <label className={`space-y-2 text-sm font-medium text-gray-800 ${groupsEnabled ? '' : 'sm:col-span-2'}`}><span>Note <span className="font-normal text-gray-400">optional, in the email</span></span><input value={note} onChange={(event) => setNote(event.target.value)} maxLength={1000} placeholder="Your CIS work is coming with you" className="h-11 w-full rounded-lg border border-gray-200 px-3 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100" /></label>
      </div>
      <p className="flex items-start gap-2 text-xs leading-5 text-gray-500"><Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" />{inOrgWords('Each learner’s CIS work is held privately until they accept.')} Only they and you can see it, and it’s deleted if you withdraw it or the invitation is revoked or expires.</p>
      <button type="button" disabled={busy || !ready.length} onClick={() => void send()} className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-gray-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"><MailPlus className="h-4 w-4" />{busy ? 'Sending…' : inOrgWords(`Invite ${plural(ready.length, 'learner')}`)}</button>
    </div>

    : <div className="space-y-4">
      <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-5">
        <div className="flex items-start gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-white text-gray-600 shadow-sm"><FileSpreadsheet className="h-5 w-5" /></span><div className="min-w-0 space-y-1"><p className="text-sm font-semibold text-gray-900">{inOrgWords('Bring learners’ work over from Oregon CIS')}</p><p className="text-sm leading-6 text-gray-600">{inOrgWords('Upload a CIS bulk export of your learners, or one learner’s “Download my data” zip. Each learner gets an invitation saying their CIS work is waiting, and it comes into their portfolio when they accept.')}</p></div></div>
        <input ref={input} type="file" accept=".zip,.xlsx" className="sr-only" aria-label="Oregon CIS export" onChange={(event) => { void choose(event.target.files?.[0]); event.target.value = '' }} />
        <button type="button" disabled={busy} onClick={() => input.current?.click()} className="mt-4 inline-flex items-center gap-2 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"><Upload className="h-4 w-4" />{busy ? 'Reading…' : 'Choose CIS export'}</button>
        <p className="mt-2 text-xs text-gray-500">{inOrgWords('Nothing is saved or sent until you review the learners.')}</p>
      </div>
    </div>}

    {waiting.length > 0 && (!preview || result) && <div className="overflow-hidden rounded-xl border"><div className="bg-gray-50 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-gray-500">CIS work waiting</div><ul className="max-h-44 divide-y overflow-y-auto">{waiting.map((row) => <li key={row.held_uuid} className="flex items-center gap-3 px-4 py-3"><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium text-gray-800">{row.learner_name || row.email}</p><p className="truncate text-xs text-gray-400">{row.email} · {SENT_LABELS[row.status]} · until {new Date(row.expires_at).toLocaleDateString()}</p></div><button type="button" onClick={() => void withdraw(row.held_uuid)} className="rounded-md px-2 py-1 text-xs font-medium text-rose-600 hover:bg-rose-50">Withdraw</button></li>)}</ul></div>}
  </div>
}

function Notice({ children }: { children: React.ReactNode }) {
  return <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800"><AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" /><span>{children}</span></div>
}

function ResultList({ rows, names }: { rows: CisSendResult['results']; names: Record<string, string> }) {
  return <ul className="max-h-60 divide-y divide-gray-100 overflow-y-auto rounded-xl border border-gray-200">{rows.map((row, index) => {
    const good = ['invited', 'waiting_member', 'waiting_invited'].includes(row.status)
    return <li key={`${row.key}-${index}`} className={`flex items-start gap-3 px-4 py-3 ${good ? '' : 'bg-amber-50/40'}`}>{good ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /> : <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />}<div className="min-w-0 flex-1"><p className="truncate text-sm text-gray-800">{names[row.key] || row.email}</p><p className="truncate text-xs text-gray-500">{row.email} · {RESULT_LABELS[row.status] || row.status}{row.detail ? ` · ${row.detail}` : ''}</p></div></li>
  })}</ul>
}
